const Notification = require("../Models/NotificationSchema");
const UserLogin = require("../Models/LogInDentalSchema");

async function sendOrderStatusNotification({
    order,
    previousStatus,
    newStatus,
    note,
    actor,
    req,
    extraMessage = null,
}) {
    try {
        if (!order) return null;

        const io = req?.app?.get("socketio");

        // ============================================================
        // 1. Hanapin ang customer's UserLogin (para sa room)
        // ============================================================
        let customerLogin = null;
        try {
            customerLogin = await UserLogin.findById(order.userId)
                .select("_id username linkedId name role")
                .lean();
        } catch (err) {
            console.error("⚠️ [Notif] UserLogin lookup failed:", err.message);
        }

        const customerUserId = customerLogin?._id || order.userId;
        const customerName =
            order.customer?.name || customerLogin?.name || "Customer";
        const customerRoom =
            order.customer?.room || order.delivery?.roomNumber || "";

        // ============================================================
        // 2. Build message
        // ============================================================
        const statusLabel = String(newStatus || "")
            .replace(/[-_]/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase());

        const orderLabel = order.orderId || `Order #${order._id}`;

        const message =
            extraMessage ||
            `${orderLabel} status: ${statusLabel}${customerRoom ? ` (Room: ${customerRoom})` : ""
            }${note ? ` — ${note}` : ""}`;

        // ============================================================
        // 3. Save Notification document
        // ============================================================
        const viewers = [];
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
            FileId: order._id,
            type: "ORDER_STATUS",
            viewers,
            metadata: {
                orderId: order.orderId || null,
                previousStatus,
                newStatus,
                customerName,
                customerRoom,
                actorId: actor?._id || null,
                actorRole: actor?.role || "system",
                note: note || null,
            },
        });

        // ============================================================
        // 4. Emit sa Socket.IO
        // ============================================================
        if (io) {
            const notifPayload = {
                _id: notification._id,
                message: notification.message,
                FileId: notification.FileId,
                type: notification.type,
                previousStatus,
                newStatus,
                orderId: order.orderId || null,
                orderObjectId: order._id,
                customerName,
                customerRoom,
                createdAt: notification.createdAt,
            };

            const orderEventPayload = {
                orderId: order._id,
                orderNumber: order.orderId || null,
                previousStatus,
                newStatus,
                note: note || null,
                customerName,
                customerRoom,
                updatedAt: new Date(),
            };

            // Customer
            if (customerUserId) {
                io.to(`user-${customerUserId}`).emit(
                    "newNotification",
                    notifPayload
                );
                io.to(`user-${customerUserId}`).emit(
                    "orderStatusUpdated",
                    orderEventPayload
                );
            }

            // Receptionist
            io.to("receptionist").emit("newNotification", notifPayload);
            io.to("receptionist").emit(
                "orderStatusUpdated",
                orderEventPayload
            );

            // Admin at Finance
            io.to("admin").emit("newNotification", notifPayload);
            io.to("admin").emit("orderStatusUpdated", orderEventPayload);
            io.to("finance").emit("newNotification", notifPayload);
        }

        return notification;
    } catch (err) {
        // Non-blocking — huwag i-fail ang main request
        console.error("⚠️ [Notif] sendOrderStatusNotification failed:", err);
        return null;
    }
}

module.exports = { sendOrderStatusNotification };