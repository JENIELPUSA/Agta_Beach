// Back-End/Utils/paymentNotificationHelper.js
const Notification = require("../Models/NotificationSchema");
const UserLoginSchema = require("../Models/LogInDentalSchema");
const sendEmail = require("./email");

// ============================================================
// STAFF VIEWERS CACHE (60s TTL)
// ============================================================
let _staffCache = { data: null, ts: 0 };
const STAFF_TTL = 60_000;

const getStaffViewers = async () => {
    if (_staffCache.data && Date.now() - _staffCache.ts < STAFF_TTL) {
        return _staffCache.data;
    }
    const staff = await UserLoginSchema.find({
        role: { $in: ["admin", "finance", "receptionist"] },
    })
        .select("_id")
        .lean();
    const viewers = staff.map((s) => ({ user: s._id, isRead: false }));
    _staffCache = { data: viewers, ts: Date.now() };
    return viewers;
};

// ============================================================
// CUSTOMER RESOLVER — kung UserLogin._id o Customer._id ang binigay
// ============================================================
const resolveCustomerUserLogin = async (rawId) => {
    if (!rawId) return null;
    try {
        return await UserLoginSchema.findOne({
            $or: [{ _id: rawId }, { linkedId: rawId }],
        })
            .select("_id username linkedId name role")
            .lean();
    } catch (err) {
        console.error("[PaymentNotif] resolveCustomerUserLogin failed:", err.message);
        return null;
    }
};

// ============================================================
// SOCKET EMITTER — safe, nagre-return ng boolean
// ============================================================
const emitSocket = (io, rooms, event, payload) => {
    if (!io) return false;
    try {
        const targets = Array.isArray(rooms) ? rooms : [rooms];
        targets.filter(Boolean).forEach((room) => io.to(room).emit(event, payload));
        return true;
    } catch (err) {
        console.error(`[PaymentNotif] Socket emit "${event}" failed:`, err.message);
        return false;
    }
};

// ============================================================
// EMAIL HELPER — safe, fire-and-forget na may logging
// ============================================================
const sendPaymentEmail = async ({ to, subject, text }) => {
    if (!to) return null;
    try {
        await sendEmail({ email: to, subject, text });
        return true;
    } catch (err) {
        console.error("[PaymentNotif] Email send failed:", err.message);
        return false;
    }
};

// ============================================================
// FORMAT HELPERS
// ============================================================
const fmtPeso = (n) =>
    `₱${Number(n || 0).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;

const statusLabel = (status) =>
    String(status || "")
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

// ============================================================
// MAIN: PAYMENT STATUS NOTIFICATION
// ------------------------------------------------------------
// Ginagamit ito sa:
//   - updatePaymentStatus()        (verified / completed)
//   - addPartialPayment()          (additional partial)
//   - createBillingHistory()       (new partial, new full)
//
// Safe: kung mag-fail ang notif/email/socket, hindi mag-fail
// ang main request.
// ============================================================
async function sendPaymentStatusNotification({
    billing,
    previousStatus = null,
    newStatus,
    paymentType = "partial",   // "partial" | "full"
    isFullyPaid = false,
    remainingBalance = 0,
    amountPaid = 0,
    note = "",
    actor = null,              // req.user
    req = null,                // buong req, para makuha ang io
    extraMessage = null,
}) {
    try {
        if (!billing) return null;

        const io = req?.app?.get?.("socketio") || null;

        // ---- 1. Resolve customer ----
        const customerLogin = await resolveCustomerUserLogin(billing.customerId);
        const customerUserId = customerLogin?._id || billing.customerId || null;
        const customerEmail = customerLogin?.username || null;

        const txId = billing.transactionId || `BILL-${billing._id}`;
        const paid = amountPaid || billing?.paymentDetails?.paymentAmount || 0;
        const remaining =
            remainingBalance !== undefined && remainingBalance !== null
                ? remainingBalance
                : billing?.paymentDetails?.remainingBalance || 0;

        const statusStr = isFullyPaid ? "FULLY PAID ✅" : "PARTIALLY PAID ⏳";

        // ---- 2. Build message ----
        const message =
            extraMessage ||
            `Payment for ${txId} — ${statusLabel(newStatus)} (${statusStr})${
                note ? ` — ${note}` : ""
            }`;

        // ---- 3. Save Notification document ----
        const staffViewers = await getStaffViewers().catch(() => []);
        const viewers = [...staffViewers];

        if (customerUserId) {
            viewers.push({ user: customerUserId, isRead: false });
        }
        if (
            actor?._id &&
            customerUserId &&
            actor._id.toString() !== customerUserId.toString()
        ) {
            viewers.push({ user: actor._id, isRead: false });
        }

        const notification = await Notification.create({
            message,
            FileId: billing._id,
            type: "PAYMENT_STATUS",
            viewers,
            metadata: {
                transactionId: txId,
                previousStatus,
                newStatus,
                paymentType,
                isFullyPaid,
                amountPaid: paid,
                remainingBalance: remaining,
                note: note || null,
                actorId: actor?._id || null,
                actorRole: actor?.role || "system",
            },
        });

        // ---- 4. Socket emit ----
        const notifPayload = {
            _id: notification._id,
            message: notification.message,
            FileId: notification.FileId,
            type: notification.type,
            transactionId: txId,
            previousStatus,
            newStatus,
            paymentType,
            isFullyPaid,
            amountPaid: paid,
            remainingBalance: remaining,
            createdAt: notification.createdAt,
        };

        const billingEventPayload = {
            billingId: billing._id,
            transactionId: txId,
            previousStatus,
            newStatus,
            paymentType,
            isFullyPaid,
            amountPaid: paid,
            remainingBalance: remaining,
            note: note || null,
            updatedAt: new Date(),
        };

        // Staff rooms
        emitSocket(io, ["admin", "finance", "receptionist"], "newNotification", notifPayload);
        emitSocket(io, ["admin", "finance", "receptionist"], "updateBilling", billingEventPayload);

        // Customer room
        if (customerUserId) {
            emitSocket(io, `user-${customerUserId}`, "newNotification", notifPayload);
            emitSocket(io, `user-${customerUserId}`, "updateBilling", billingEventPayload);
        }

        // ---- 5. Email customer ----
        if (customerEmail) {
            const subject = isFullyPaid
                ? `Payment Completed (Fully Paid) - ${txId}`
                : `Payment Received (Partially Paid) - ${txId}`;

            const text = isFullyPaid
                ? `Dear Customer,\n\nYour payment for billing ${txId} has been successfully completed.\n\n` +
                  `Status: FULLY PAID ✅\n` +
                  `Amount Paid: ${fmtPeso(paid)}\n` +
                  `Remaining Balance: ${fmtPeso(0)}\n` +
                  `Payment Type: ${paymentType.toUpperCase()}\n\n` +
                  `Thank you for your full payment!\n\n— Billing Team`
                : `Dear Customer,\n\nWe have received your partial payment for billing ${txId}.\n\n` +
                  `Status: PARTIALLY PAID ⏳\n` +
                  `Amount Paid: ${fmtPeso(paid)}\n` +
                  `Remaining Balance: ${fmtPeso(remaining)}\n` +
                  `Payment Type: ${paymentType.toUpperCase()}\n\n` +
                  `Please note that your remaining balance of ${fmtPeso(remaining)} is still due.\n\n— Billing Team`;

            // fire-and-forget — hindi nagba-block ng response
            sendPaymentEmail({ to: customerEmail, subject, text }).catch(() => {});
        }

        return notification;
    } catch (err) {
        console.error("⚠️ [PaymentNotif] sendPaymentStatusNotification failed:", err);
        return null;
    }
}

// ============================================================
// CONVENIENCE: NEW BILLING CREATED
// ------------------------------------------------------------
// Para sa createBillingHistory kapag bagong record (hindi update)
// ============================================================
async function sendNewBillingNotification({
    billing,
    paymentType = "full",
    amount = 0,
    status = "partial",
    actor = null,
    req = null,
}) {
    if (!billing) return null;

    const isFullyPaid = status === "fully_paid" || paymentType === "full";
    const extra = `New ${paymentType} billing created: ${
        billing.transactionId || `BILL-${billing._id}`
    } (${fmtPeso(amount)}) — ${status}`;

    return sendPaymentStatusNotification({
        billing,
        previousStatus: null,
        newStatus: status,
        paymentType,
        isFullyPaid,
        amountPaid: amount,
        remainingBalance: isFullyPaid ? 0 : billing?.paymentDetails?.remainingBalance || 0,
        note: `New ${paymentType} payment recorded`,
        actor,
        req,
        extraMessage: extra,
    });
}

module.exports = {
    sendPaymentStatusNotification,
    sendNewBillingNotification,
    getStaffViewers,
};