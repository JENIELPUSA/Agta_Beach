const BillingHistory = require("../Models/BillingHistorySchema");
const AsyncErrorHandler = require("../Utils/AsyncErrorHandler");
const Notification = require("../Models/NotificationSchema");
const UserLoginSchema = require("../Models/LogInDentalSchema");
const Customer = require("../Models/CustomerSchema");
const mongoose = require("mongoose");
const actionbooking = require("../Models/ActionBooking");
const orders = require("../Models/OrderSchema");
const Accommodation = require("../Models/ActionBooking");
const sendEmail = require("../Utils/email");

const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

// ==================== PAGINATION CONSTANTS ====================
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

// ==================== HELPER: Build Order Origin ====================
const buildOrderOrigin = async (actionBooking, customerId = null) => {
  try {
    if (!actionBooking) return null;

    const origin = {
      accommodationId: null,
      accommodationName: null,
      accommodationType: null,
      roomNumber: null,
      avatar: { url: null, public_id: null },
      actionBookingId: actionBooking._id || null,
      bookingNumber: actionBooking.bookingNumber || null,
      customerId: customerId || actionBooking.customerId || null,
    };

    if (actionBooking.bookingItemModel === "Accommodation") return null;

    if (actionBooking.origin && actionBooking.origin.accommodationId) {
      return {
        ...origin,
        accommodationId: actionBooking.origin.accommodationId,
        accommodationName: actionBooking.origin.accommodationName || null,
        accommodationType: actionBooking.origin.accommodationType || null,
        roomNumber: actionBooking.origin.roomNumber || null,
        avatar: actionBooking.origin.avatar || { url: null, public_id: null },
        actionBookingId: actionBooking.origin.actionBookingId || actionBooking._id,
        bookingNumber: actionBooking.origin.bookingNumber || actionBooking.bookingNumber,
      };
    }

    if (actionBooking.relatedAccommodationId) {
      const accommodation = await Accommodation.findById(actionBooking.relatedAccommodationId).lean();
      if (accommodation) {
        return {
          ...origin,
          accommodationId: accommodation._id,
          accommodationName: accommodation.name || null,
          accommodationType: accommodation.type || null,
          roomNumber: accommodation.roomNumber || null,
          avatar: {
            url: accommodation.avatar?.url || null,
            public_id: accommodation.avatar?.public_id || null,
          },
        };
      }
    }

    const searchCustomerId = customerId || actionBooking.customerId;
    if (searchCustomerId) {
      const activeAccommodationBooking = await actionbooking
        .findOne({
          customerId: searchCustomerId,
          bookingItemModel: "Accommodation",
          status: { $in: ["Confirmed", "Paid", "waiting"] },
        })
        .sort({ createdAt: -1 })
        .lean();

      if (activeAccommodationBooking) {
        const accommodation = await Accommodation.findById(activeAccommodationBooking.bookingItemId).lean();
        if (accommodation) {
          return {
            ...origin,
            accommodationId: accommodation._id,
            accommodationName: accommodation.name || null,
            accommodationType: accommodation.type || null,
            roomNumber: accommodation.roomNumber || null,
            avatar: {
              url: accommodation.avatar?.url || null,
              public_id: accommodation.avatar?.public_id || null,
            },
            actionBookingId: activeAccommodationBooking._id,
            bookingNumber: activeAccommodationBooking.bookingNumber,
          };
        }
      }
    }

    return null;
  } catch (error) {
    console.error("❌ [buildOrderOrigin] Error:", error);
    return null;
  }
};

// ==================== HELPERS (module-level) ====================

let _staffCache = { data: null, ts: 0 };
const STAFF_TTL = 60_000;

const getStaffViewers = async () => {
  if (_staffCache.data && Date.now() - _staffCache.ts < STAFF_TTL) return _staffCache.data;
  const staff = await UserLoginSchema.find({ role: { $in: ["admin", "finance"] } })
    .select("_id")
    .lean();
  const viewers = staff.map((s) => ({ user: s._id, isRead: false }));
  _staffCache = { data: viewers, ts: Date.now() };
  return viewers;
};

const extractRoomNumber = (doc) => {
  if (!doc) return "";
  return (
    doc.roomNumber ||
    doc.delivery?.roomNumber ||
    doc.address?.roomNumber ||
    (typeof doc.room === "string" ? doc.room : doc.room?.number || doc.room?.roomNumber) ||
    doc.location?.roomNumber ||
    doc.bookingItemId?.roomNumber ||
    doc.bookingItemId?.room?.number ||
    ""
  );
};

const resolveCustomer = async (rawCustomerId) => {
  if (!rawCustomerId || !mongoose.Types.ObjectId.isValid(rawCustomerId)) {
    return { customerId: "unknown-customer", customerDoc: null };
  }

  const userLoginDoc = await UserLoginSchema.findOne({
    $or: [{ _id: rawCustomerId }, { linkedId: rawCustomerId }],
  }).lean();

  if (userLoginDoc?.linkedId) {
    const customerDoc = await Customer.findById(userLoginDoc.linkedId).lean();
    return { customerId: userLoginDoc.linkedId, customerDoc };
  }
  if (userLoginDoc) return { customerId: userLoginDoc._id, customerDoc: null };

  const customerDoc = await Customer.findById(rawCustomerId).lean();
  return { customerId: customerDoc?._id || rawCustomerId, customerDoc };
};

const uploadAvatar = async (file) => {
  try {
    const form = new FormData();
    form.append("file", fs.createReadStream(file.path), file.originalname);

    const response = await axios.post(process.env.UPLOADAGTA_URL, form, {
      maxBodyLength: Infinity,
      headers: form.getHeaders(),
    });

    const data = response.data || {};
    let result;
    if (data.url) {
      result = { url: data.url, public_id: data.public_id || data.filename || file.filename };
    } else if (data.success && data.data) {
      result = { url: data.data.url, public_id: data.data.public_id || file.filename };
    } else if (data.file) {
      result = { url: data.file, public_id: file.filename };
    } else {
      result = { url: `/temp-uploads/${file.filename}`, public_id: file.filename };
    }

    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    return result;
  } catch (err) {
    console.error("❌ Upload Error:", err.message);
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    return { url: "", public_id: "" };
  }
};

// ==================== PAGINATION HELPERS ====================

const buildPagination = (query = {}) => {
  const rawPage = parseInt(query.page, 10);
  const rawLimit = parseInt(query.limit, 10);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, MAX_LIMIT)
    : DEFAULT_LIMIT;

  return { page, limit, skip: (page - 1) * limit };
};

const paginatedAggregate = async (model, pipeline, { page, limit }) => {
  const countRes = await model.aggregate([...pipeline, { $count: "total" }]);
  const totalCount = countRes[0]?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  if (totalCount === 0) {
    return { data: [], totalCount: 0, totalPages: 1, currentPage: 1, limit };
  }

  const safePage = Math.min(Math.max(page, 1), totalPages);
  const safeSkip = (safePage - 1) * limit;

  const data = await model.aggregate([
    ...pipeline,
    { $skip: safeSkip },
    { $limit: limit },
  ]);

  return { data, totalCount, totalPages, currentPage: safePage, limit };
};

const paginatedResponse = ({ data, totalCount, totalPages, currentPage, limit }) => ({
  success: true,
  totalCount,
  totalPages,
  currentPage,
  limit,
  hasNextPage: currentPage < totalPages,
  hasPrevPage: currentPage > 1,
  data,
});

// ==================== HELPER: Analytics Date Range ====================

const buildAnalyticsDateRange = (query = {}) => {
  const { startDate, endDate, range } = query;

  let start, end;

  if (startDate && endDate) {
    start = new Date(startDate);
    end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
  } else {
    end = new Date();
    end.setHours(23, 59, 59, 999);

    const days = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 };
    const d = days[range] || 30;

    start = new Date();
    start.setDate(start.getDate() - d);
    start.setHours(0, 0, 0, 0);
  }

  return { start, end };
};

// ==================== CREATE ====================

exports.createBillingHistory = AsyncErrorHandler(async (req, res) => {
  console.log("BODY________", req.body);

  try {
    const parseIfString = (v) => {
      if (v === undefined || v === null) return v;
      if (typeof v === "string") {
        try {
          return JSON.parse(v);
        } catch (e) {
          return v;
        }
      }
      return v;
    };

    const paymentDetails = parseIfString(req.body.paymentDetails);
    const bookings       = parseIfString(req.body.bookings);
    const processedBy    = parseIfString(req.body.processedBy);
    const metadata       = parseIfString(req.body.metadata);

    const selectedAccommodation        = paymentDetails?.selectedAccommodation || null;
    const selectedAccommodationDetails = paymentDetails?.selectedAccommodationDetails || null;

    if (!paymentDetails || !bookings || !Array.isArray(bookings) || bookings.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Payment details and at least one booking are required",
      });
    }
    if (!paymentDetails.paymentType) {
      return res.status(400).json({
        success: false,
        message: "Payment type (full or partial) is required",
      });
    }
    if (paymentDetails.paymentType === "partial") {
      if (!paymentDetails.paymentAmount || paymentDetails.paymentAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Payment amount is required for partial payments",
        });
      }
      if (paymentDetails.paymentAmount > paymentDetails.totalAmount) {
        return res.status(400).json({
          success: false,
          message: "Partial payment amount cannot exceed total amount",
        });
      }
    }

    const computedTotal = bookings.reduce(
      (sum, b) => sum + (Number(b.amount) || 0),
      0
    );
    const providedTotal = Number(paymentDetails.totalAmount) || 0;

    if (Math.abs(computedTotal - providedTotal) > 0.01) {
      console.warn(
        `⚠️ Total mismatch: provided=₱${providedTotal}, computed=₱${computedTotal}`
      );
      return res.status(400).json({
        success: false,
        message: `Total amount mismatch. Provided: ₱${providedTotal.toFixed(2)}, Computed: ₱${computedTotal.toFixed(2)}`,
        providedTotal,
        computedTotal,
      });
    }

    let rawCustomerId = null;
    const bookingIds = bookings.map((b) => b._id).filter(Boolean);

    {
      const fb = bookings[0];
      rawCustomerId =
        fb.customerId ||
        fb.customer?._id ||
        fb.customer?.id ||
        fb.userId ||
        fb.customer?.customerId ||
        null;
    }
    if (!rawCustomerId && req.user) rawCustomerId = req.user._id || req.user.id;

    const accommodationBooking = bookings.find(
      (b) =>
        b.bookingItemModel === "Accommodation" ||
        b.accommodationId ||
        b.accommodationType
    );

    const firstBookingId = (accommodationBooking || bookings[0])?._id;
    const validFirstBookingId =
      firstBookingId && mongoose.Types.ObjectId.isValid(firstBookingId);

    const [customerResolved, actionBookingData, avatar] = await Promise.all([
      resolveCustomer(rawCustomerId),
      validFirstBookingId
        ? actionbooking.findById(firstBookingId).populate("customerId").lean()
        : Promise.resolve(null),
      req.file
        ? uploadAvatar(req.file).catch((e) => {
            console.error("⚠️ avatar upload:", e.message);
            return { url: "", public_id: "" };
          })
        : Promise.resolve({ url: "", public_id: "" }),
    ]);

    const { customerId, customerDoc } = customerResolved;

    if (actionBookingData) {
      const ALLOWED_STATUSES = ["CheckIn", "Confirmed"];
      if (!ALLOWED_STATUSES.includes(actionBookingData.status)) {
        return res.status(400).json({
          success: false,
          message: `Cannot create billing. Booking status is "${actionBookingData.status}". Guest must be checked in first.`,
          currentStatus: actionBookingData.status,
          requiredStatus: "CheckIn",
        });
      }
    }

    let roomNumber = "";

    if (actionBookingData) {
      if (actionBookingData.bookingItemModel === "Accommodation") {
        roomNumber = extractRoomNumber(actionBookingData);
      } else {
        const related = await actionbooking
          .findOne({
            customerId:
              actionBookingData.customerId?._id || actionBookingData.customerId,
            bookingItemModel: "Accommodation",
            status: { $in: ["Confirmed", "Paid", "waiting", "CheckIn"] },
          })
          .sort({ createdAt: -1 })
          .lean();
        if (related) roomNumber = extractRoomNumber(related);
      }
    }

    if (!roomNumber && customerId !== "unknown-customer") {
      const [customerRoom, customerBookings] = await Promise.all([
        customerDoc?.roomNumber
          ? Promise.resolve(customerDoc.roomNumber)
          : Customer.findById(customerId)
              .lean()
              .then((c) => extractRoomNumber(c))
              .catch(() => ""),
        actionbooking
          .find({ customerId, bookingItemModel: "Accommodation" })
          .select("roomNumber delivery.roomNumber room.number location.roomNumber")
          .limit(5)
          .lean()
          .catch(() => []),
      ]);
      roomNumber =
        customerRoom ||
        customerBookings.map(extractRoomNumber).find(Boolean) ||
        "";
    }

    let orderOrigin = null;
    if (actionBookingData) {
      try {
        orderOrigin = await buildOrderOrigin(
          actionBookingData,
          customerId !== "unknown-customer" ? customerId : null
        );
      } catch (e) {
        console.error("⚠️ buildOrderOrigin:", e.message);
      }
    }

    const decoratedBookings = bookings.map((b) => {
      const updated = { ...b };
      if (roomNumber) {
        updated.roomNumber = roomNumber;
        updated.delivery = { ...b.delivery, roomNumber };
      }
      if (orderOrigin && b.bookingItemModel !== "Accommodation") {
        updated.origin = orderOrigin;
      }
      updated.customerId = customerId;
      return updated;
    });

    const remainingBalance =
      paymentDetails.paymentType === "partial"
        ? paymentDetails.totalAmount - paymentDetails.paymentAmount
        : 0;
    const isFullyPaid   = remainingBalance <= 0;
    const paymentStatus = isFullyPaid ? "completed" : "pending";
    const billingStatus = isFullyPaid ? "fully_paid" : "partial";

    const allOrderNumbers = bookings
      .map((b) => b.orderNumber)
      .filter((n) => n && String(n).trim() !== "")
      .map((n) => String(n).trim());

    const allBookingNumbers = bookings
      .map((b) => b.bookingNumber)
      .filter((n) => n && String(n).trim() !== "")
      .map((n) => String(n).trim());

    const allReferenceNumbers = bookings
      .map((b) => b.referenceNo)
      .filter((n) => n && String(n).trim() !== "")
      .map((n) => String(n).trim());

    let existingBilling = null;
    const ACTIVE_BILLING_STATUSES = ["pending", "verified", "completed", "fully_paid", "partial"];

    if (
      allOrderNumbers.length > 0 ||
      allBookingNumbers.length > 0 ||
      allReferenceNumbers.length > 0
    ) {
      const orConditions = [];
      if (allOrderNumbers.length > 0) {
        orConditions.push({ "bookings.orderNumber": { $in: allOrderNumbers } });
      }
      if (allBookingNumbers.length > 0) {
        orConditions.push({ "bookings.bookingNumber": { $in: allBookingNumbers } });
      }
      if (allReferenceNumbers.length > 0) {
        orConditions.push({ "bookings.referenceNo": { $in: allReferenceNumbers } });
      }

      existingBilling = await BillingHistory.findOne({
        $or: orConditions,
        status: { $in: ACTIVE_BILLING_STATUSES },
      })
        .sort({ createdAt: -1 })
        .lean();
    }

    if (existingBilling) {
      const existingStatus = existingBilling.status;

      if (existingStatus === "fully_paid" || existingStatus === "completed") {
        console.log(
          ` [Already Processing] Transaction ${existingBilling.transactionId} is ${existingStatus}`
        );

        return res.status(200).json({
          success: true,
          alreadyProcessing: true,
          alreadyFullyPaid: true,
          message: "Already Processing",
          description:
            "Ang booking/order na ito ay fully paid na. Hindi na kailangang i-process ulit.",
          existingTransaction: {
            transactionId: existingBilling.transactionId,
            status: existingStatus,
            createdAt: existingBilling.createdAt,
          },
          data: null,
        });
      }

      if (existingStatus === "partial") {
        const matchingBookings = existingBilling.bookings.filter(
          (b) =>
            allOrderNumbers.includes(b.orderNumber) ||
            allBookingNumbers.includes(b.bookingNumber) ||
            allReferenceNumbers.includes(b.referenceNo)
        );

        if (matchingBookings.length > 0) {
          const totalMatchingAmount = matchingBookings.reduce(
            (sum, b) => sum + (Number(b.amount) || 0),
            0
          );
          const newPaymentAmount = Number(paymentDetails.paymentAmount) || 0;

          const updatedBookings = existingBilling.bookings.map((booking) => {
            const isMatching = matchingBookings.some(
              (mb) => String(mb._id) === String(booking._id)
            );

            if (!isMatching) return booking;

            const proportion =
              totalMatchingAmount > 0
                ? (Number(booking.amount) || 0) / totalMatchingAmount
                : 0;
            const bookingPayment = newPaymentAmount * proportion;
            const currentRemaining = Number(booking.remainingBalance) || 0;
            const newRemaining = Math.max(0, currentRemaining - bookingPayment);
            const totalPaid = (Number(booking.amount) || 0) - newRemaining;

            return {
              ...booking,
              remainingBalance: newRemaining,
              paymentAmount: totalPaid,
              paymentStatus: newRemaining <= 0 ? "full" : "partial",
              roomNumber: roomNumber || booking.roomNumber,
              customerId: customerId || booking.customerId,
              delivery: {
                ...booking.delivery,
                roomNumber: roomNumber || booking.delivery?.roomNumber,
              },
              origin: orderOrigin || booking.origin || null,
            };
          });

          const newTotalRemaining = updatedBookings.reduce(
            (sum, b) => sum + (Number(b.remainingBalance) || 0),
            0
          );
          const newTotalPaid = updatedBookings.reduce(
            (sum, b) => sum + (Number(b.paymentAmount) || 0),
            0
          );
          const isNowFullyPaid = newTotalRemaining <= 0;

          const newPaymentStatus = isNowFullyPaid ? "completed" : "pending";
          const newBillingStatus = isNowFullyPaid ? "fully_paid" : "partial";

          const updatedBilling = await BillingHistory.findByIdAndUpdate(
            existingBilling._id,
            {
              $set: {
                "paymentDetails.remainingBalance": newTotalRemaining,
                "paymentDetails.paymentAmount": newTotalPaid,
                "paymentDetails.status": newPaymentStatus,
                "paymentDetails.paymentType": isNowFullyPaid ? "full" : "partial",
                "paymentDetails.method":
                  paymentDetails.method || existingBilling.paymentDetails.method,
                "paymentDetails.referenceNo":
                  paymentDetails.referenceNo ||
                  existingBilling.paymentDetails.referenceNo,
                "paymentDetails.processedAt": new Date(),
                status: newBillingStatus,
                bookings: updatedBookings,
                customerId: customerId || existingBilling.customerId,
                ...(selectedAccommodation && {
                  "paymentDetails.selectedAccommodation": selectedAccommodation,
                }),
                ...(selectedAccommodationDetails && {
                  "paymentDetails.selectedAccommodationDetails":
                    selectedAccommodationDetails,
                }),
                ...(avatar.url && { avatar }),
              },
              $push: {
                statusHistory: {
                  status: newBillingStatus,
                  timestamp: new Date(),
                  note: isNowFullyPaid
                    ? ` Fully Paid! Remaining balance: ₱0.00. Total paid: ₱${newTotalPaid.toFixed(2)}`
                    : `💰 Additional partial payment of ₱${newPaymentAmount.toFixed(2)}. Remaining balance: ₱${newTotalRemaining.toFixed(2)}. Total paid: ₱${newTotalPaid.toFixed(2)}`,
                  updatedBy: {
                    userId: processedBy?.userId || req.user?._id || "system",
                    userName: processedBy?.userName || req.user?.name || "System",
                  },
                },
              },
            },
            { new: true }
          );

          if (actionBookingData && actionBookingData.status !== "CheckIn") {
            try {
              await actionbooking.updateStatusWithTracking(
                actionBookingData._id,
                "CheckIn",
                processedBy?.userId || req.user?._id || null,
                `Additional billing: ${updatedBilling.transactionId}`
              );
            } catch (e) {
              console.error("⚠️ ActionBooking status update:", e.message);
            }
          }

          const io = req.app.get("socketio");
          if (io) {
            const payload = {
              billingHistory: updatedBilling,
              message: isNowFullyPaid
                ? ` Billing ${updatedBilling.transactionId} is now fully paid!`
                : `💰 Additional payment for ${updatedBilling.transactionId} - Remaining: ₱${newTotalRemaining.toFixed(2)}`,
            };
            io.to("admin").emit("updateBilling", payload);
            io.to("finance").emit("updateBilling", payload);
          }

          (async () => {
            try {
              const viewersList = await getStaffViewers();
              const newNotification = await Notification.create({
                message: isNowFullyPaid
                  ? ` ${updatedBilling.transactionId} is now fully paid! (Total: ₱${newTotalPaid.toFixed(2)})`
                  : `💰 Additional payment for ${updatedBilling.transactionId} - ₱${newPaymentAmount.toFixed(2)}. Remaining: ₱${newTotalRemaining.toFixed(2)}`,
                FileId: updatedBilling._id,
                viewers: viewersList,
              });
              if (io) {
                const notifPayload = {
                  _id: newNotification._id,
                  message: newNotification.message,
                  FileId: newNotification.FileId,
                  viewers: newNotification.viewers,
                  createdAt: newNotification.createdAt,
                };
                io.to("admin").emit("newNotification", notifPayload);
                io.to("finance").emit("newNotification", notifPayload);
              }
            } catch (e) {
              console.error("⚠️ notif:", e.message);
            }
          })();

          (async () => {
            try {
              const cid = updatedBilling.customerId;
              if (!cid) return;
              const userLogin = await UserLoginSchema.findOne({ linkedId: cid })
                .select("username linkedId")
                .lean();
              if (!userLogin?.username) return;

              const subject = isNowFullyPaid
                ? "Payment Completed - Fully Paid"
                : "Payment Received - Partially Paid";
              const text = isNowFullyPaid
                ? `Your billing ${updatedBilling.transactionId} is now FULLY PAID. Total paid: ₱${newTotalPaid.toFixed(2)}. Remaining balance: ₱0.00. Thank you!`
                : `We received your partial payment for billing ${updatedBilling.transactionId}.\n\nAmount paid: ₱${newPaymentAmount.toFixed(2)}\nTotal paid so far: ₱${newTotalPaid.toFixed(2)}\nRemaining balance: ₱${newTotalRemaining.toFixed(2)}\n\nThank you!`;

              await sendEmail({ email: userLogin.username, subject, text });
            } catch (e) {
              console.error("⚠️ email:", e.message);
            }
          })();

          return res.status(200).json({
            success: true,
            message: isNowFullyPaid
              ? "Billing fully paid!"
              : "Additional partial payment processed",
            data: updatedBilling,
            isUpdate: true,
          });
        }

        console.log(
          ` [Already Processing] Partial billing ${existingBilling.transactionId} has no matching bookings`
        );
        return res.status(200).json({
          success: true,
          alreadyProcessing: true,
          message: "Already Processing",
          description:
            "May existing partial billing na para sa booking na ito. Hindi na kailangang i-process ulit.",
          existingTransaction: {
            transactionId: existingBilling.transactionId,
            status: existingStatus,
            createdAt: existingBilling.createdAt,
          },
          data: null,
        });
      }

      if (existingStatus === "pending" || existingStatus === "verified") {
        console.log(
          ` [Already Processing] Transaction ${existingBilling.transactionId} is ${existingStatus}`
        );

        return res.status(200).json({
          success: true,
          alreadyProcessing: true,
          alreadyPending: true,
          message: "Already Processing",
          description:
            "Ang booking/order na ito ay may existing billing na naghihintay ng verification. Hindi na kailangang i-process ulit.",
          existingTransaction: {
            transactionId: existingBilling.transactionId,
            status: existingStatus,
            createdAt: existingBilling.createdAt,
          },
          data: null,
        });
      }
    }

    const transactionId = BillingHistory.getTransactionId();

    const updatedBookings = decoratedBookings.map((booking) => {
      let bookingPaymentAmount = Number(booking.amount) || 0;
      let bookingRemainingBalance = 0;

      if (paymentDetails.paymentType === "partial") {
        const proportion =
          paymentDetails.totalAmount > 0
            ? (Number(booking.amount) || 0) / paymentDetails.totalAmount
            : 0;
        bookingPaymentAmount = (Number(booking.amount) || 0) * proportion;
        if (paymentDetails.totalAmount > 0) {
          bookingPaymentAmount =
            (Number(booking.amount) || 0) *
            (paymentDetails.paymentAmount / paymentDetails.totalAmount);
        }
        bookingRemainingBalance =
          (Number(booking.amount) || 0) - bookingPaymentAmount;
      }

      const bookingRoomNumber =
        roomNumber || booking.roomNumber || booking.delivery?.roomNumber || "";

      return {
        ...booking,
        customerId,
        paymentStatus: paymentDetails.paymentType,
        paymentAmount: bookingPaymentAmount,
        remainingBalance: bookingRemainingBalance,
        status: "completed",
        roomNumber: bookingRoomNumber,
        delivery: {
          ...booking.delivery,
          roomNumber: bookingRoomNumber,
        },
        origin:
          booking.origin ||
          (booking.bookingItemModel !== "Accommodation" ? orderOrigin : null) ||
          null,
      };
    });

    const billingHistory = new BillingHistory({
      transactionId,
      customerId,
      paymentDetails: {
        ...paymentDetails,
        paymentAmount: paymentDetails.paymentAmount || paymentDetails.totalAmount,
        paymentType: paymentDetails.paymentType || "full",
        remainingBalance,
        processedAt: paymentDetails.processedAt || new Date(),
        status: paymentStatus,
        selectedAccommodation,
        selectedAccommodationDetails,
      },
      bookings: updatedBookings,
      processedBy: {
        userId: processedBy?.userId || req.user?._id || "system",
        userName: processedBy?.userName || req.user?.name || "System",
        userEmail: processedBy?.userEmail || req.user?.email || "",
        userRole: processedBy?.userRole || req.user?.role || "staff",
      },
      metadata: metadata || {},
      avatar,
      status: billingStatus,
    });

    await billingHistory.save();

    if (actionBookingData && actionBookingData.status !== "CheckIn") {
      try {
        await actionbooking.updateStatusWithTracking(
          actionBookingData._id,
          "CheckIn",
          processedBy?.userId || req.user?._id || null,
          `Billing created: ${billingHistory.transactionId}`
        );
        console.log(
          ` [ActionBooking] ${actionBookingData._id} updated to CheckIn`
        );
      } catch (e) {
        console.error("⚠️ ActionBooking status update:", e.message);
      }
    }

    const bookingIdsToUpdate = billingHistory.bookings
      .map((b) => b._id)
      .filter(Boolean);

    if (bookingIdsToUpdate.length > 0) {
      try {
        await orders.updateMany(
          { _id: { $in: bookingIdsToUpdate } },
          {
            $set: {
              status: "completed",
              paymentStatus:
                paymentDetails.paymentType === "full" ? "completed" : "partial",
              updatedAt: new Date(),
              roomNumber: roomNumber || "",
              delivery: { roomNumber: roomNumber || "" },
            },
          }
        );
      } catch (e) {
        console.error("⚠️ orders update:", e.message);
      }
    }

    const io = req.app.get("socketio");
    if (io) {
      const payload = {
        billingHistory,
        message: `New ${paymentDetails.paymentType} billing record created`,
      };
      io.to("admin").emit("newBilling", payload);
      io.to("finance").emit("newBilling", payload);
    }

    (async () => {
      try {
        const viewersList = await getStaffViewers();
        const newNotification = await Notification.create({
          message: `New ${paymentDetails.paymentType} billing: ${billingHistory.transactionId} (₱${paymentDetails.paymentAmount.toFixed(2)}) - ${billingStatus}`,
          FileId: billingHistory._id,
          viewers: viewersList,
        });
        if (io) {
          const notifPayload = {
            _id: newNotification._id,
            message: newNotification.message,
            FileId: newNotification.FileId,
            viewers: newNotification.viewers,
            createdAt: newNotification.createdAt,
          };
          io.to("admin").emit("newNotification", notifPayload);
          io.to("finance").emit("newNotification", notifPayload);
        }
      } catch (e) {
        console.error("⚠️ notif:", e.message);
      }
    })();

    (async () => {
      try {
        const cid = billingHistory.customerId;
        if (!cid) return;
        const userLogin = await UserLoginSchema.findOne({ linkedId: cid })
          .select("username linkedId")
          .lean();
        if (!userLogin?.username) return;

        const isFullyPaidNow = billingStatus === "fully_paid";
        const subject = isFullyPaidNow
          ? "Payment Completed - Fully Paid"
          : "Payment Received - Partially Paid";
        const text = isFullyPaidNow
          ? `Your billing ${billingHistory.transactionId} is FULLY PAID.\n\nTotal amount: ₱${billingHistory.paymentDetails.paymentAmount.toFixed(2)}\nRemaining balance: ₱0.00\n\nThank you!`
          : `We received your payment for billing ${billingHistory.transactionId}.\n\nAmount paid: ₱${billingHistory.paymentDetails.paymentAmount.toFixed(2)}\nRemaining balance: ₱${billingHistory.paymentDetails.remainingBalance.toFixed(2)}\n\nThank you!`;

        await sendEmail({ email: userLogin.username, subject, text });
      } catch (e) {
        console.error("⚠️ email:", e.message);
      }
    })();

    return res.status(201).json({
      success: true,
      message: "Billing history created successfully",
      data: billingHistory,
      isUpdate: false,
    });
  } catch (error) {
    console.error("CREATE BILLING HISTORY ERROR:", error);
    console.error("Error stack:", error.stack);
    return res.status(500).json({
      success: false,
      message: "Failed to create billing history",
      error: error.message,
      errorName: error.name,
      errorCode: error.code,
    });
  }
});

// ==================== GET ALL (PAGINATED) ====================

exports.getAllBillingHistory = AsyncErrorHandler(async (req, res) => {
  const {
    status,
    startDate,
    endDate,
    userId,
    paymentMethod,
    paymentType,
    search,
    customerId,
    userRole,
    transactionId,
    paymentStatus,
    referenceNo,
    minAmount,
    maxAmount,
    minRemainingBalance,
    hasRemainingBalance,
    selectedAccommodation,
    selectedAccommodationName,
    bookingType,
    bookingStatus,
    orderNumber,
    orderStatus,
    bookingNumber,
    bookingItemId,
    bookingItemModel,
    accommodationId,
    rentalId,
    serviceId,
    isCompleted,
    deliveryStatus,
    roomNumber,
    itemName,
    bookingPaymentStatus,
    originAccommodationId,
    originBookingNumber,
    originAccommodationType,
    isRefunded,
    sortBy,
    sortOrder,
    filters,
    populate,
  } = req.query;

  const pagination = buildPagination(req.query);

  const filter = {};

  if (status) {
    filter.status = Array.isArray(status) ? { $in: status } : status;
  }
  if (customerId) filter.customerId = customerId;
  if (transactionId) filter.transactionId = { $regex: transactionId, $options: "i" };
  if (userRole) filter["processedBy.userRole"] = userRole;
  if (userId) filter["processedBy.userId"] = userId;

  if (paymentMethod) filter["paymentDetails.method"] = paymentMethod;
  if (paymentType) filter["paymentDetails.paymentType"] = paymentType;
  if (paymentStatus) filter["paymentDetails.status"] = paymentStatus;
  if (referenceNo) {
    filter["paymentDetails.referenceNo"] = { $regex: referenceNo, $options: "i" };
  }
  if (selectedAccommodation) {
    filter["paymentDetails.selectedAccommodation"] = {
      $regex: selectedAccommodation,
      $options: "i",
    };
  }
  if (selectedAccommodationName) {
    filter["paymentDetails.selectedAccommodationDetails.accommodationName"] = {
      $regex: selectedAccommodationName,
      $options: "i",
    };
  }

  if (minAmount || maxAmount) {
    filter["paymentDetails.paymentAmount"] = {};
    if (minAmount) filter["paymentDetails.paymentAmount"].$gte = Number(minAmount);
    if (maxAmount) filter["paymentDetails.paymentAmount"].$lte = Number(maxAmount);
  }

  if (minRemainingBalance) {
    filter["paymentDetails.remainingBalance"] = {
      $gte: Number(minRemainingBalance),
    };
  }
  if (hasRemainingBalance === "true") {
    filter["paymentDetails.remainingBalance"] = { $gt: 0 };
  } else if (hasRemainingBalance === "false") {
    filter["paymentDetails.remainingBalance"] = { $lte: 0 };
  }

  if (startDate || endDate) {
    filter["paymentDetails.processedAt"] = {};
    if (startDate) {
      filter["paymentDetails.processedAt"].$gte = new Date(startDate);
    }
    if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      filter["paymentDetails.processedAt"].$lte = endOfDay;
    }
  }

  const bookingMatch = {};

  if (bookingType) bookingMatch.type = bookingType;
  if (bookingStatus) {
    bookingMatch.status = Array.isArray(bookingStatus)
      ? { $in: bookingStatus }
      : bookingStatus;
  }
  if (orderNumber) {
    bookingMatch.orderNumber = { $regex: orderNumber, $options: "i" };
  }
  if (orderStatus) bookingMatch.orderStatus = orderStatus;
  if (bookingNumber) {
    bookingMatch.bookingNumber = { $regex: bookingNumber, $options: "i" };
  }
  if (bookingItemId) bookingMatch.bookingItemId = bookingItemId;
  if (bookingItemModel) bookingMatch.bookingItemModel = bookingItemModel;
  if (accommodationId) bookingMatch.accommodationId = accommodationId;
  if (rentalId) bookingMatch.rentalId = rentalId;
  if (serviceId) bookingMatch.serviceId = serviceId;
  if (isCompleted !== undefined) bookingMatch.isCompleted = isCompleted === "true";
  if (itemName) {
    bookingMatch.itemName = { $regex: itemName, $options: "i" };
  }
  if (bookingPaymentStatus) {
    bookingMatch.paymentStatus = bookingPaymentStatus;
  }

  if (deliveryStatus) {
    bookingMatch["delivery.status"] = deliveryStatus;
  }
  if (roomNumber) {
    bookingMatch["delivery.roomNumber"] = { $regex: roomNumber, $options: "i" };
  }

  if (originAccommodationId) {
    bookingMatch["origin.accommodationId"] = originAccommodationId;
  }
  if (originBookingNumber) {
    bookingMatch["origin.bookingNumber"] = {
      $regex: originBookingNumber,
      $options: "i",
    };
  }
  if (originAccommodationType) {
    bookingMatch["origin.accommodationType"] = originAccommodationType;
  }

  if (Object.keys(bookingMatch).length > 0) {
    filter.bookings = { $elemMatch: bookingMatch };
  }

  if (isRefunded === "true") {
    filter["refund.isRefunded"] = true;
  } else if (isRefunded === "false") {
    filter["refund.isRefunded"] = { $ne: true };
  }

  if (filters) {
    try {
      const parsed = typeof filters === "string" ? JSON.parse(filters) : filters;
      Object.assign(filter, parsed);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: "Invalid JSON in 'filters' query param",
        error: err.message,
      });
    }
  }

  if (search && search.trim() !== "") {
    const regex = { $regex: search, $options: "i" };
    const searchConditions = [
      { transactionId: regex },
      { "paymentDetails.referenceNo": regex },
      { "bookings.orderNumber": regex },
      { "bookings.bookingNumber": regex },
      { "bookings.bookingItemId": regex },
      { "bookings.itemName": regex },
      { "bookings.customer.name": regex },
      { "bookings.origin.accommodationName": regex },
      { "bookings.origin.bookingNumber": regex },
      { "paymentDetails.selectedAccommodation": regex },
      {
        "paymentDetails.selectedAccommodationDetails.accommodationName": regex,
      },
      { "processedBy.userName": regex },
      { "processedBy.userEmail": regex },
    ];

    if (filter.$or) {
      filter.$and = [...(filter.$and || []), { $or: filter.$or }];
      delete filter.$or;
    }
    filter.$or = searchConditions;
  }

  const sortableFields = {
    processedAt: "paymentDetails.processedAt",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    amount: "paymentDetails.paymentAmount",
    totalAmount: "paymentDetails.totalAmount",
    remainingBalance: "paymentDetails.remainingBalance",
    status: "status",
  };

  const sortField = sortableFields[sortBy] || "paymentDetails.processedAt";
  const sortDir = sortOrder === "asc" ? 1 : -1;
  const sort = { [sortField]: sortDir };

  console.log("🔍 GET BILLING HISTORY FILTER:", JSON.stringify(filter, null, 2));
  console.log("🔍 SORT:", sort);

  const pipeline = [
    { $match: filter },
    { $sort: sort },

    {
      $lookup: {
        from: "customers",
        localField: "customerId",
        foreignField: "_id",
        as: "customerDetails",
      },
    },
    { $unwind: { path: "$customerDetails", preserveNullAndEmptyArrays: true } },

    {
      $lookup: {
        from: "userloginschemas",
        localField: "processedBy.userId",
        foreignField: "_id",
        as: "processedByUser",
      },
    },
    { $unwind: { path: "$processedByUser", preserveNullAndEmptyArrays: true } },

    {
      $addFields: {
        processedByName: "$processedByUser.name",
        processedByEmail: "$processedByUser.email",
        customer: {
          _id: "$customerDetails._id",
          first_name: "$customerDetails.first_name",
          last_name: "$customerDetails.last_name",
          middle_name: "$customerDetails.middle_name",
          suffix: "$customerDetails.suffix",
          email: "$customerDetails.email",
          gender: "$customerDetails.gender",
          avatar: "$customerDetails.avatar",
          full_name: {
            $concat: [
              { $ifNull: ["$customerDetails.first_name", ""] },
              " ",
              { $ifNull: ["$customerDetails.last_name", ""] },
            ],
          },
        },
        totalItems: { $size: "$bookings" },
        isPartialPayment: { $eq: ["$paymentDetails.paymentType", "partial"] },
        isFullPayment: { $eq: ["$paymentDetails.paymentType", "full"] },

        totalBookingAmount: {
          $sum: {
            $map: {
              input: "$bookings",
              as: "b",
              in: { $ifNull: ["$$b.amount", 0] },
            },
          },
        },
        bookingCount: { $size: { $ifNull: ["$bookings", []] } },
        bookingsWithBalance: {
          $size: {
            $filter: {
              input: { $ifNull: ["$bookings", []] },
              as: "b",
              cond: {
                $gt: [{ $ifNull: ["$$b.remainingBalance", 0] }, 0],
              },
            },
          },
        },
      },
    },
  ];

  if (populate) {
    const populateFields = populate.split(",").map((p) => p.trim());
    console.log("🔍 Requested populate fields:", populateFields);
  }

  const result = await paginatedAggregate(BillingHistory, pipeline, pagination);

  res.status(200).json({
    ...paginatedResponse(result),
    appliedFilters: filter,
    appliedSort: sort,
  });
});

// ==================== GET BY ID ====================

exports.getBillingHistoryById = AsyncErrorHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: "Invalid billing ID format" });
  }

  const billingHistory = await BillingHistory.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(id) } },
    {
      $lookup: {
        from: "customers",
        localField: "customerId",
        foreignField: "_id",
        as: "customerDetails",
      },
    },
    { $unwind: { path: "$customerDetails", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "userloginschemas",
        localField: "processedBy.userId",
        foreignField: "_id",
        as: "processedByUser",
      },
    },
    { $unwind: { path: "$processedByUser", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        processedByName: "$processedByUser.name",
        processedByEmail: "$processedByUser.email",
        customer: {
          _id: "$customerDetails._id",
          first_name: "$customerDetails.first_name",
          last_name: "$customerDetails.last_name",
          middle_name: "$customerDetails.middle_name",
          suffix: "$customerDetails.suffix",
          email: "$customerDetails.email",
          gender: "$customerDetails.gender",
          avatar: "$customerDetails.avatar",
          full_name: {
            $concat: [
              { $ifNull: ["$customerDetails.first_name", ""] },
              " ",
              { $ifNull: ["$customerDetails.last_name", ""] },
            ],
          },
        },
        totalItems: { $size: "$bookings" },
        isPartialPayment: { $eq: ["$paymentDetails.paymentType", "partial"] },
        isFullPayment: { $eq: ["$paymentDetails.paymentType", "full"] },
      },
    },
  ]);

  if (!billingHistory || billingHistory.length === 0) {
    return res.status(404).json({
      success: false,
      message: "Billing history not found",
    });
  }

  res.status(200).json({
    success: true,
    data: billingHistory[0],
  });
});

// ==================== GET BY TRANSACTION ID ====================

exports.getBillingHistoryByTransactionId = AsyncErrorHandler(async (req, res) => {
  const { transactionId } = req.params;

  const billingHistory = await BillingHistory.findOne({ transactionId });

  if (!billingHistory) {
    return res.status(404).json({
      success: false,
      message: "Billing history not found",
    });
  }

  res.status(200).json({
    success: true,
    data: billingHistory,
  });
});

// ==================== GET BY USER (PAGINATED) ====================

exports.getBillingHistoryByUser = AsyncErrorHandler(async (req, res) => {
  const { userId } = req.params;
  const pagination = buildPagination(req.query);

  const pipeline = [
    { $match: { "processedBy.userId": userId } },
    { $sort: { "paymentDetails.processedAt": -1 } },
  ];

  const result = await paginatedAggregate(BillingHistory, pipeline, pagination);
  res.status(200).json(paginatedResponse(result));
});

// ==================== GET BY DATE RANGE (NOW PAGINATED) ====================

exports.getBillingHistoryByDateRange = AsyncErrorHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  const pagination = buildPagination(req.query);

  if (!startDate || !endDate) {
    return res.status(400).json({
      success: false,
      message: "Start date and end date are required",
    });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const match = { "paymentDetails.processedAt": { $gte: start, $lte: end } };

  const pipeline = [
    { $match: match },
    { $sort: { "paymentDetails.processedAt": -1 } },
  ];

  const result = await paginatedAggregate(BillingHistory, pipeline, pagination);

  const totalsAgg = await BillingHistory.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: "$paymentDetails.paymentAmount" },
        totalDue: { $sum: "$paymentDetails.totalAmount" },
        count: { $sum: 1 },
      },
    },
  ]);

  const body = paginatedResponse(result);
  body.totals = totalsAgg[0] || { totalAmount: 0, totalDue: 0, count: 0 };
  res.status(200).json(body);
});

// ==================== STATISTICS ====================

exports.getBillingStatistics = AsyncErrorHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const dateFilter = {};
  if (startDate && endDate) {
    dateFilter["paymentDetails.processedAt"] = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  }

  const stats = await BillingHistory.aggregate([
    {
      $match: {
        ...dateFilter,
        status: { $in: ["completed", "verified", "pending", "failed", "refunded", "partial"] },
      },
    },
    {
      $group: {
        _id: "$status",
        totalAmount: { $sum: "$paymentDetails.paymentAmount" },
        totalDue: { $sum: "$paymentDetails.totalAmount" },
        count: { $sum: 1 },
        avgAmount: { $avg: "$paymentDetails.paymentAmount" },
      },
    },
  ]);

  const paymentTypeStats = await BillingHistory.aggregate([
    { $match: { ...dateFilter, status: "completed" } },
    {
      $group: {
        _id: "$paymentDetails.paymentType",
        totalAmount: { $sum: "$paymentDetails.paymentAmount" },
        totalDue: { $sum: "$paymentDetails.totalAmount" },
        count: { $sum: 1 },
      },
    },
  ]);

  const dailyStats = await BillingHistory.aggregate([
    { $match: { ...dateFilter, status: "completed" } },
    {
      $group: {
        _id: {
          year: { $year: "$paymentDetails.processedAt" },
          month: { $month: "$paymentDetails.processedAt" },
          day: { $dayOfMonth: "$paymentDetails.processedAt" },
        },
        totalAmount: { $sum: "$paymentDetails.paymentAmount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    { $limit: 30 },
  ]);

  const methodStats = await BillingHistory.aggregate([
    { $match: { ...dateFilter, status: "completed" } },
    {
      $group: {
        _id: "$paymentDetails.method",
        totalAmount: { $sum: "$paymentDetails.paymentAmount" },
        count: { $sum: 1 },
      },
    },
  ]);

  const summary = await BillingHistory.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: null,
        totalRevenue: {
          $sum: {
            $cond: [
              { $in: ["$status", ["completed", "verified"]] },
              "$paymentDetails.paymentAmount",
              0,
            ],
          },
        },
        totalDue: { $sum: "$paymentDetails.totalAmount" },
        totalRefunded: {
          $sum: {
            $cond: [{ $eq: ["$status", "refunded"] }, "$refund.refundAmount", 0],
          },
        },
        totalTransactions: { $sum: 1 },
        totalBookings: { $sum: "$paymentDetails.bookingCount" },
        totalPartialPayments: {
          $sum: { $cond: [{ $eq: ["$paymentDetails.paymentType", "partial"] }, 1, 0] },
        },
        totalFullPayments: {
          $sum: { $cond: [{ $eq: ["$paymentDetails.paymentType", "full"] }, 1, 0] },
        },
      },
    },
  ]);

  res.status(200).json({
    success: true,
    data: {
      summary: summary[0] || {
        totalRevenue: 0,
        totalDue: 0,
        totalRefunded: 0,
        totalTransactions: 0,
        totalBookings: 0,
        totalPartialPayments: 0,
        totalFullPayments: 0,
      },
      statusBreakdown: stats,
      paymentTypeBreakdown: paymentTypeStats,
      dailyTrend: dailyStats,
      paymentMethodBreakdown: methodStats,
    },
  });
});

// ==================== GET PARTIAL PAYMENTS (PAGINATED) ====================

exports.getPartialPayments = AsyncErrorHandler(async (req, res) => {
  const role = req.user?.role;
  const userId = req.user?.linkId;
  const pagination = buildPagination(req.query);

  if (!role) {
    return res.status(401).json({ success: false, message: "Unauthorized: User role not found" });
  }
  if (!userId) {
    return res.status(401).json({ success: false, message: "Unauthorized: User ID not found" });
  }

  const and = [
    { "paymentDetails.paymentType": "partial" },
    { "paymentDetails.status": { $ne: "pending" } },
  ];

  if (role !== "customer") {
    console.log("🔍 Staff/Admin - Fetching ALL partial payments");
  } else {
    const user = await UserLoginSchema.findOne({ linkedId: userId }).lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found with the provided linkId" });
    }
    and.push({ $or: [{ customerId: user.linkedId }, { customerId: user._id }] });
  }

  const pipeline = [
    { $match: { $and: and } },
    { $sort: { "paymentDetails.processedAt": -1 } },
    {
      $lookup: {
        from: "customers",
        localField: "customerId",
        foreignField: "_id",
        as: "customerDetails",
      },
    },
    { $unwind: { path: "$customerDetails", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        customer: {
          _id: "$customerDetails._id",
          first_name: "$customerDetails.first_name",
          last_name: "$customerDetails.last_name",
          middle_name: "$customerDetails.middle_name",
          suffix: "$customerDetails.suffix",
          email: "$customerDetails.email",
          gender: "$customerDetails.gender",
          avatar: "$customerDetails.avatar",
          full_name: {
            $concat: [
              { $ifNull: ["$customerDetails.first_name", ""] },
              " ",
              { $ifNull: ["$customerDetails.last_name", ""] },
            ],
          },
        },
        bookings: {
          $map: {
            input: "$bookings",
            as: "booking",
            in: {
              $mergeObjects: [
                "$$booking",
                {
                  customer: {
                    _id: "$customerDetails._id",
                    first_name: "$customerDetails.first_name",
                    last_name: "$customerDetails.last_name",
                    full_name: {
                      $concat: [
                        { $ifNull: ["$customerDetails.first_name", ""] },
                        " ",
                        { $ifNull: ["$customerDetails.last_name", ""] },
                      ],
                    },
                    email: "$customerDetails.email",
                  },
                },
              ],
            },
          },
        },
      },
    },
  ];

  const result = await paginatedAggregate(BillingHistory, pipeline, pagination);
  const body = paginatedResponse(result);
  body.message = result.data.length
    ? `Successfully retrieved ${result.data.length} partial payments`
    : "No partial payments found";
  res.status(200).json(body);
});

// ==================== GET FULL PAYMENTS (PAGINATED) ====================

exports.getFullPayments = AsyncErrorHandler(async (req, res) => {
  const role = req.user?.role;
  const userId = req.user?.linkId;
  const pagination = buildPagination(req.query);

  if (!role) {
    return res.status(401).json({ success: false, message: "Unauthorized: User role not found" });
  }
  if (!userId) {
    return res.status(401).json({ success: false, message: "Unauthorized: User ID not found" });
  }

  const and = [
    { "paymentDetails.paymentType": "full" },
    { "paymentDetails.status": { $ne: "pending" } },
  ];

  let customerActionBookings = [];

  if (role === "customer") {
    const user = await UserLoginSchema.findOne({ linkedId: userId }).lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found with the provided linkId" });
    }
    customerActionBookings = await actionbooking
      .find({ customerId: user._id.toString() })
      .lean();
    and.push({ $or: [{ customerId: user.linkedId }, { customerId: user._id }] });
  } else {
    console.log("🔍 Staff/Admin - Fetching ALL full payments");
  }

  const pipeline = [
    { $match: { $and: and } },
    { $sort: { "paymentDetails.processedAt": -1 } },
    {
      $lookup: {
        from: "customers",
        localField: "customerId",
        foreignField: "_id",
        as: "customerDetails",
      },
    },
    { $unwind: { path: "$customerDetails", preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$bookings", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "actionbookings",
        localField: "bookings._id",
        foreignField: "_id",
        as: "actionBookingDetails",
      },
    },
    { $unwind: { path: "$actionBookingDetails", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: "$_id",
        transactionId: { $first: "$transactionId" },
        customerId: { $first: "$customerId" },
        customerDetails: { $first: "$customerDetails" },
        paymentDetails: { $first: "$paymentDetails" },
        processedBy: { $first: "$processedBy" },
        metadata: { $first: "$metadata" },
        avatar: { $first: "$avatar" },
        status: { $first: "$status" },
        statusHistory: { $first: "$statusHistory" },
        refund: { $first: "$refund" },
        createdAt: { $first: "$createdAt" },
        updatedAt: { $first: "$updatedAt" },
        bookings: {
          $push: {
            $mergeObjects: [
              "$bookings",
              {
                customerInfo: {
                  _id: "$customerDetails._id",
                  first_name: "$customerDetails.first_name",
                  last_name: "$customerDetails.last_name",
                  middle_name: "$customerDetails.middle_name",
                  suffix: "$customerDetails.suffix",
                  email: "$customerDetails.email",
                  gender: "$customerDetails.gender",
                  avatar: "$customerDetails.avatar",
                },
                actionBookingDetails: {
                  _id: "$actionBookingDetails._id",
                  bookingNumber: "$actionBookingDetails.bookingNumber",
                  bookingItemId: "$actionBookingDetails.bookingItemId",
                  bookingItemModel: "$actionBookingDetails.bookingItemModel",
                  isWalkin: "$actionBookingDetails.isWalkin",
                  expected_stay: "$actionBookingDetails.expected_stay",
                  status: "$actionBookingDetails.status",
                  isDone: "$actionBookingDetails.isDone",
                  customerId: "$actionBookingDetails.customerId",
                  amount: "$actionBookingDetails.amount",
                  createdAt: "$actionBookingDetails.createdAt",
                  updatedAt: "$actionBookingDetails.updatedAt",
                },
              },
            ],
          },
        },
      },
    },
    {
      $project: {
        _id: 1,
        transactionId: 1,
        customerId: 1,
        customer: {
          _id: "$customerDetails._id",
          first_name: "$customerDetails.first_name",
          last_name: "$customerDetails.last_name",
          middle_name: "$customerDetails.middle_name",
          suffix: "$customerDetails.suffix",
          full_name: {
            $concat: [
              { $ifNull: ["$customerDetails.first_name", ""] },
              " ",
              { $ifNull: ["$customerDetails.last_name", ""] },
            ],
          },
          email: "$customerDetails.email",
          gender: "$customerDetails.gender",
          avatar: "$customerDetails.avatar",
        },
        paymentDetails: 1,
        processedBy: 1,
        metadata: 1,
        avatar: 1,
        status: 1,
        statusHistory: 1,
        refund: 1,
        createdAt: 1,
        updatedAt: 1,
        bookings: {
          $map: {
            input: "$bookings",
            as: "booking",
            in: {
              _id: "$$booking._id",
              type: "$$booking.type",
              status: "$$booking.status",
              amount: "$$booking.amount",
              createdAt: "$$booking.createdAt",
              customer: {
                _id: "$$booking.customerInfo._id",
                first_name: "$$booking.customerInfo.first_name",
                last_name: "$$booking.customerInfo.last_name",
                full_name: {
                  $concat: [
                    { $ifNull: ["$$booking.customerInfo.first_name", ""] },
                    " ",
                    { $ifNull: ["$$booking.customerInfo.last_name", ""] },
                  ],
                },
                email: "$$booking.customerInfo.email",
              },
              orderId: "$$booking.orderId",
              orderNumber: "$$booking.orderNumber",
              orderStatus: "$$booking.orderStatus",
              paymentMethod: "$$booking.paymentMethod",
              referenceNo: "$$booking.referenceNo",
              title: "$$booking.title",
              itemCount: "$$booking.itemCount",
              items: "$$booking.items",
              totals: "$$booking.totals",
              payment: "$$booking.payment",
              delivery: "$$booking.delivery",
              bookingNumber: "$$booking.bookingNumber",
              bookingItemId: "$$booking.bookingItemId",
              bookingItemModel: "$$booking.bookingItemModel",
              bookingStatus: "$$booking.bookingStatus",
              isCompleted: "$$booking.isCompleted",
              itemName: "$$booking.itemName",
              itemDescription: "$$booking.itemDescription",
              itemPrice: "$$booking.itemPrice",
              itemImage: "$$booking.itemImage",
              itemDetails: "$$booking.itemDetails",
              accommodationType: "$$booking.accommodationType",
              minCapacity: "$$booking.minCapacity",
              maxCapacity: "$$booking.maxCapacity",
              amenities: "$$booking.amenities",
              rentalUnit: "$$booking.rentalUnit",
              serviceCategory: "$$booking.serviceCategory",
              approver: "$$booking.approver",
              paymentStatus: "$$booking.paymentStatus",
              paymentAmount: "$$booking.paymentAmount",
              remainingBalance: "$$booking.remainingBalance",
              origin: "$$booking.origin",
              actionBookingDetails: "$$booking.actionBookingDetails",
            },
          },
        },
      },
    },
  ];

  const result = await paginatedAggregate(BillingHistory, pipeline, pagination);

  const body = paginatedResponse(result);
  body.message = result.data.length
    ? `Successfully retrieved ${result.data.length} full payments`
    : "No full payments found";

  if (role === "customer" && customerActionBookings.length > 0) {
    body.actionBookingsSummary = {
      count: customerActionBookings.length,
      bookings: customerActionBookings.map((ab) => ({
        _id: ab._id,
        bookingNumber: ab.bookingNumber,
        bookingItemModel: ab.bookingItemModel,
        status: ab.status,
        amount: ab.amount,
        createdAt: ab.createdAt,
        isWalkin: ab.isWalkin,
        expected_stay: ab.expected_stay,
      })),
    };
  }

  res.status(200).json(body);
});

// ==================== GET VERIFY PAYMENTS (PAGINATED) ====================

exports.getVerifyPayments = AsyncErrorHandler(async (req, res) => {
  const role = req.user?.role;
  const userId = req.user?.linkId;
  const pagination = buildPagination(req.query);

  if (!role) {
    return res.status(401).json({ success: false, message: "Unauthorized: User role not found" });
  }
  if (!userId) {
    return res.status(401).json({ success: false, message: "Unauthorized: User ID not found" });
  }

  const and = [
    { $or: [{ "paymentDetails.paymentType": "partial" }, { "paymentDetails.paymentType": "full" }] },
    { "paymentDetails.status": "pending" },
  ];

  if (role !== "customer") {
    console.log("🔍 Staff/Admin - Fetching ALL pending verify payments");
  } else {
    const user = await UserLoginSchema.findOne({ linkedId: userId }).lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found with the provided linkId" });
    }
    and.push({ $or: [{ customerId: user.linkedId }, { customerId: user._id }] });
  }

  const pipeline = [
    { $match: { $and: and } },
    { $sort: { "paymentDetails.processedAt": -1 } },
    {
      $lookup: {
        from: "customers",
        localField: "customerId",
        foreignField: "_id",
        as: "customerDetails",
      },
    },
    { $unwind: { path: "$customerDetails", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        customer: {
          _id: "$customerDetails._id",
          first_name: "$customerDetails.first_name",
          last_name: "$customerDetails.last_name",
          middle_name: "$customerDetails.middle_name",
          suffix: "$customerDetails.suffix",
          email: "$customerDetails.email",
          gender: "$customerDetails.gender",
          avatar: "$customerDetails.avatar",
          full_name: {
            $concat: [
              { $ifNull: ["$customerDetails.first_name", ""] },
              " ",
              { $ifNull: ["$customerDetails.last_name", ""] },
            ],
          },
        },
        bookings: {
          $map: {
            input: "$bookings",
            as: "booking",
            in: {
              $mergeObjects: [
                "$$booking",
                {
                  customer: {
                    _id: "$customerDetails._id",
                    first_name: "$customerDetails.first_name",
                    last_name: "$customerDetails.last_name",
                    full_name: {
                      $concat: [
                        { $ifNull: ["$customerDetails.first_name", ""] },
                        " ",
                        { $ifNull: ["$customerDetails.last_name", ""] },
                      ],
                    },
                    email: "$customerDetails.email",
                  },
                },
              ],
            },
          },
        },
      },
    },
  ];

  const result = await paginatedAggregate(BillingHistory, pipeline, pagination);
  const body = paginatedResponse(result);
  body.message = result.data.length
    ? `Successfully retrieved ${result.data.length} pending verify payments`
    : "No pending verify payments found";
  res.status(200).json(body);
});

// ==================== UPDATE STATUS ====================

exports.updateBillingStatus = AsyncErrorHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;
    const userId = req.user?._id || "system";
    const userName = req.user?.name || "System";

    if (!status) {
      return res.status(400).json({ success: false, message: "Status is required" });
    }

    const validStatuses = ["pending", "verified", "completed", "failed", "refunded", "partial", "paid"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    let billingHistory = await BillingHistory.findById(id);
    if (!billingHistory) {
      return res.status(404).json({ success: false, message: "Billing history not found" });
    }

    billingHistory.status = status;
    billingHistory.statusHistory.push({
      status,
      timestamp: new Date(),
      note: note || `Status updated to ${status}`,
      updatedBy: { userId, userName },
    });

    if (status === "completed") billingHistory.paymentDetails.status = "completed";
    if (status === "partial") {
      const totalPaid = billingHistory.paymentDetails.paymentAmount;
      const totalDue = billingHistory.paymentDetails.totalAmount;
      billingHistory.paymentDetails.remainingBalance = totalDue - totalPaid;
    }

    await billingHistory.save();

    const io = req.app.get("socketio");
    if (io) {
      const payload = { billingHistory, message: `Billing status updated to ${status}` };
      io.to("admin").emit("billingStatusUpdated", payload);
      io.to("finance").emit("billingStatusUpdated", payload);
    }

    const notification = await Notification.create({
      message: `Billing ${billingHistory.transactionId} status updated to ${status}`,
      FileId: billingHistory._id,
      viewers: [{ user: billingHistory.processedBy.userId, isRead: false }],
    });

    if (io) {
      const notifPayload = {
        _id: notification._id,
        message: notification.message,
        FileId: notification.FileId,
        createdAt: notification.createdAt,
      };
      const userRoom = `user-${billingHistory.processedBy.userId}`;
      io.to(userRoom).emit("newNotification", notifPayload);
      io.to("admin").emit("newNotification", notifPayload);
      io.to("finance").emit("newNotification", notifPayload);
    }

    if (status === "paid") {
      const customerId = billingHistory.processedBy?.userId;
      if (customerId) {
        const userLogin = await UserLoginSchema.findOne({ linkedId: customerId }).select("username linkedId");
        if (userLogin?.username) {
          await sendEmail({
            email: userLogin.username,
            subject: "Please Check your email",
            text: `Billing ${billingHistory.transactionId} status updated to ${status}`,
          });
        }
      }
    }

    res.status(200).json({
      success: true,
      message: "Billing status updated successfully",
      data: billingHistory,
    });
  } catch (error) {
    console.error("UPDATE BILLING STATUS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update billing status",
      error: error.message,
    });
  }
});

// ==================== REFUND ====================

exports.processRefund = AsyncErrorHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body;
    const userId = req.user?._id || "system";
    const userName = req.user?.name || "System";

    const billingHistory = await BillingHistory.findById(id);
    if (!billingHistory) {
      return res.status(404).json({ success: false, message: "Billing history not found" });
    }

    if (billingHistory.refund.isRefunded) {
      return res.status(400).json({ success: false, message: "This transaction has already been refunded" });
    }
    if (billingHistory.status === "refunded") {
      return res.status(400).json({ success: false, message: "This transaction has already been refunded" });
    }

    const refundAmount = amount || billingHistory.paymentDetails.paymentAmount;
    if (refundAmount > billingHistory.paymentDetails.paymentAmount) {
      return res.status(400).json({
        success: false,
        message: `Refund amount cannot exceed paid amount of ₱${billingHistory.paymentDetails.paymentAmount.toFixed(2)}`,
      });
    }

    await billingHistory.processRefund(
      userId,
      userName,
      refundAmount,
      reason || "Customer requested refund"
    );

    if (billingHistory.paymentDetails.paymentType === "partial") {
      billingHistory.paymentDetails.remainingBalance =
        billingHistory.paymentDetails.totalAmount - billingHistory.paymentDetails.paymentAmount;
    }

    await billingHistory.save();

    const io = req.app.get("socketio");
    if (io) {
      const payload = { billingHistory, message: `Refund processed for ${billingHistory.transactionId}` };
      io.to("admin").emit("billingRefunded", payload);
      io.to("finance").emit("billingRefunded", payload);
    }

    res.status(200).json({
      success: true,
      message: "Refund processed successfully",
      data: billingHistory,
    });
  } catch (error) {
    console.error("PROCESS REFUND ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process refund",
      error: error.message,
    });
  }
});

// ==================== NOTES ====================

exports.updateBillingNotes = AsyncErrorHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    if (notes === undefined) {
      return res.status(400).json({ success: false, message: "Notes are required" });
    }

    const billingHistory = await BillingHistory.findById(id);
    if (!billingHistory) {
      return res.status(404).json({ success: false, message: "Billing history not found" });
    }

    billingHistory.paymentDetails.notes = notes;
    await billingHistory.save();

    res.status(200).json({
      success: true,
      message: "Notes updated successfully",
      data: billingHistory,
    });
  } catch (error) {
    console.error("UPDATE NOTES ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update notes",
      error: error.message,
    });
  }
});

// ==================== ADD PARTIAL PAYMENT ====================

exports.addPartialPayment = AsyncErrorHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { additionalAmount, note } = req.body;
    const userId = req.user?._id || "system";
    const userName = req.user?.name || "System";

    if (!additionalAmount || additionalAmount <= 0) {
      return res.status(400).json({ success: false, message: "Valid additional payment amount is required" });
    }

    const billingHistory = await BillingHistory.findById(id);
    if (!billingHistory) {
      return res.status(404).json({ success: false, message: "Billing history not found" });
    }

    if (billingHistory.paymentDetails.paymentType !== "partial") {
      return res.status(400).json({ success: false, message: "This is not a partial payment record" });
    }

    if (billingHistory.status === "completed" || billingHistory.status === "refunded") {
      return res.status(400).json({
        success: false,
        message: `Cannot add payment to a ${billingHistory.status} transaction`,
      });
    }

    const remainingBalance = billingHistory.paymentDetails.remainingBalance;
    if (additionalAmount > remainingBalance) {
      return res.status(400).json({
        success: false,
        message: `Additional payment cannot exceed remaining balance of ₱${remainingBalance.toFixed(2)}`,
      });
    }

    billingHistory.paymentDetails.paymentAmount += additionalAmount;
    billingHistory.paymentDetails.remainingBalance =
      billingHistory.paymentDetails.totalAmount - billingHistory.paymentDetails.paymentAmount;

    const totalPaid = billingHistory.paymentDetails.paymentAmount;
    const totalDue = billingHistory.paymentDetails.totalAmount;

    billingHistory.bookings.forEach((booking) => {
      const bookingRatio = booking.amount / totalDue;
      booking.paymentAmount = totalPaid * bookingRatio;
      booking.remainingBalance = booking.amount - booking.paymentAmount;
    });

    if (billingHistory.paymentDetails.remainingBalance === 0) {
      billingHistory.status = "completed";
      billingHistory.paymentDetails.paymentType = "full";
      billingHistory.paymentDetails.status = "completed";
      billingHistory.bookings.forEach((booking) => {
        booking.paymentStatus = "full";
        booking.remainingBalance = 0;
      });
    }

    billingHistory.statusHistory.push({
      status: billingHistory.status,
      timestamp: new Date(),
      note:
        note ||
        `Additional payment of ₱${additionalAmount.toFixed(2)} added. Remaining: ₱${billingHistory.paymentDetails.remainingBalance.toFixed(2)}`,
      updatedBy: { userId, userName },
    });

    await billingHistory.save();

    const io = req.app.get("socketio");
    if (io) {
      io.to("admin").emit("billingUpdated", { billingHistory });
      io.to("finance").emit("billingUpdated", { billingHistory });
    }

    res.status(200).json({
      success: true,
      message: "Additional payment added successfully",
      data: billingHistory,
    });
  } catch (error) {
    console.error("ADD PARTIAL PAYMENT ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to add partial payment",
      error: error.message,
    });
  }
});

// ==================== DELETE ====================

exports.deleteBillingHistory = AsyncErrorHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id || "system";
    const userName = req.user?.name || "System";

    const billingHistory = await BillingHistory.findById(id);
    if (!billingHistory) {
      return res.status(404).json({ success: false, message: "Billing history not found" });
    }

    billingHistory.status = "deleted";
    billingHistory.statusHistory.push({
      status: "deleted",
      timestamp: new Date(),
      note: "Billing record deleted",
      updatedBy: { userId, userName },
    });

    await billingHistory.save();

    res.status(200).json({ success: true, message: "Billing history deleted successfully" });
  } catch (error) {
    console.error("DELETE BILLING HISTORY ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete billing history",
      error: error.message,
    });
  }
});

exports.permanentlyDeleteBillingHistory = AsyncErrorHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const billingHistory = await BillingHistory.findByIdAndDelete(id);
    if (!billingHistory) {
      return res.status(404).json({ success: false, message: "Billing history not found" });
    }
    res.status(200).json({ success: true, message: "Billing history permanently deleted" });
  } catch (error) {
    console.error("PERMANENT DELETE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to permanently delete billing history",
      error: error.message,
    });
  }
});

// ==================== UPDATE PAYMENT STATUS ====================

exports.updatePaymentStatus = AsyncErrorHandler(async (req, res) => {
  try {
    const { status } = req.body;
    const { billingId } = req.params;

    if (!billingId) {
      return res.status(400).json({ success: false, message: "Billing ID is required" });
    }
    if (!status) {
      return res.status(400).json({ success: false, message: "Status is required" });
    }
    if (!mongoose.Types.ObjectId.isValid(billingId)) {
      return res.status(400).json({ success: false, message: "Invalid Billing ID format" });
    }

    const billing = await BillingHistory.findById(billingId);
    if (!billing) {
      return res.status(404).json({ success: false, message: "Billing record not found" });
    }

    if (billing.paymentDetails?.status === status) {
      return res.status(200).json({
        success: true,
        message: `Status is already set to "${status}"`,
        data: billing,
        noChange: true,
      });
    }

    const remainingBalance = billing.paymentDetails?.remainingBalance || 0;
    const isFullyPaid = remainingBalance <= 0;
    const paymentType = isFullyPaid ? "full" : "partial";
    const billingStatus = isFullyPaid ? "fully_paid" : "partial";

    const updateData = {
      $set: {
        "paymentDetails.status": status,
        "paymentDetails.paymentType": paymentType,
        status: billingStatus,
      },
      $push: {
        statusHistory: {
          status: billingStatus,
          timestamp: new Date(),
          note: isFullyPaid
            ? ` Payment verified and FULLY PAID! Remaining balance: ₱0.00`
            : `⏳ Payment verified but PARTIALLY PAID. Remaining balance: ₱${remainingBalance.toFixed(2)}`,
          updatedBy: {
            userId: req.user?._id || "system",
            userName: req.user?.name || req.user?.username || "System",
          },
        },
      },
    };

    const updatedBilling = await BillingHistory.findByIdAndUpdate(
      billingId,
      updateData,
      { new: true, runValidators: true }
    );

    if (isFullyPaid) {
      const bookingIds = updatedBilling.bookings.map((booking) => booking._id).filter((id) => id);

      if (bookingIds.length > 0) {
        actionbooking
          .updateMany(
            { _id: { $in: bookingIds } },
            { $set: { status: "Paid", paymentStatus: "completed", updatedAt: new Date() } }
          )
          .catch((e) => console.error("⚠️ actionbooking update:", e.message));

        orders
          .updateMany(
            { _id: { $in: bookingIds } },
            { $set: { status: "Paid", paymentStatus: "completed", updatedAt: new Date() } }
          )
          .catch((e) => console.error("⚠️ orders update:", e.message));
      }
    }

    const io = req.app.get("socketio");
    if (io) {
      const payload = {
        billingHistory: updatedBilling,
        message: isFullyPaid
          ? ` Billing ${updatedBilling.transactionId} is now FULLY PAID!`
          : `⏳ Payment status updated to "${status}" for ${updatedBilling.transactionId} (Partial)`,
        previousStatus: billing.paymentDetails?.status,
        newStatus: status,
        paymentType,
        isFullyPaid,
        remainingBalance,
      };
      io.to("admin").emit("updateBilling", payload);
      io.to("finance").emit("updateBilling", payload);
      io.to("receptionist").emit("updateBilling", payload);
    }

    const staffMembers = await UserLoginSchema.find({
      role: { $in: ["admin", "finance", "receptionist"] },
    })
      .select("_id")
      .lean();
    const viewersList = staffMembers.map((staff) => ({ user: staff._id, isRead: false }));

    const updaterName = req.user?.name || req.user?.username || "System";
    const statusDisplay = isFullyPaid ? "FULLY PAID " : "PARTIALLY PAID ⏳";

    const newNotification = await Notification.create({
      message: `${updaterName} updated payment status to "${status}" (${statusDisplay}) for ${updatedBilling.transactionId}`,
      FileId: updatedBilling._id,
      viewers: viewersList,
    });

    if (io) {
      const notifPayload = {
        _id: newNotification._id,
        message: newNotification.message,
        FileId: newNotification.FileId,
        viewers: newNotification.viewers,
        createdAt: newNotification.createdAt,
      };
      io.to("admin").emit("newNotification", notifPayload);
      io.to("finance").emit("newNotification", notifPayload);
      io.to("receptionist").emit("newNotification", notifPayload);
    }

    if (status === "completed" || (status === "verified" && !isFullyPaid)) {
      const customerId = updatedBilling.processedBy?.userId;
      if (customerId) {
        const userLogin = await UserLoginSchema.findOne({ linkedId: customerId })
          .select("username linkedId")
          .lean();
        if (userLogin?.username) {
          const paymentStatusLabel = isFullyPaid ? "Fully Paid" : "Partially Paid";
          const emailSubject = isFullyPaid
            ? `Payment Completed (Fully Paid) - ${updatedBilling.transactionId}`
            : `Partial Payment Received (Partially Paid) - ${updatedBilling.transactionId}`;
          const emailText = isFullyPaid
            ? `Dear Customer,\n\nYour payment for billing transaction ${updatedBilling.transactionId} has been successfully completed.\n\nPayment Details:\n- Status: ${paymentStatusLabel} \n- Amount Paid: ₱${(updatedBilling.paymentDetails?.amountPaid || 0).toFixed(2)}\n- Remaining Balance: ₱0.00\n- Payment Type: ${paymentType.toUpperCase()}\n\nThank you for your full payment!\n\nBest regards,\nBilling Team`
            : `Dear Customer,\n\nWe have received your partial payment for billing transaction ${updatedBilling.transactionId}.\n\nPayment Details:\n- Status: ${paymentStatusLabel} ⏳\n- Amount Paid: ₱${(updatedBilling.paymentDetails?.amountPaid || 0).toFixed(2)}\n- Remaining Balance: ₱${remainingBalance.toFixed(2)}\n- Payment Type: ${paymentType.toUpperCase()}\n\nPlease note that your remaining balance of ₱${remainingBalance.toFixed(2)} is still due.\n\nBest regards,\nBilling Team`;

          await sendEmail({ email: userLogin.username, subject: emailSubject, text: emailText });
        }
      }
    }

    res.status(200).json({
      success: true,
      message: isFullyPaid
        ? `Payment status updated to "${status}" and marked as FULLY PAID`
        : `Payment status updated to "${status}" successfully (PARTIALLY PAID)`,
      data: updatedBilling,
      audit: {
        previousStatus: billing.paymentDetails?.status,
        newStatus: status,
        paymentType,
        isFullyPaid,
        remainingBalance,
        updatedBy: updaterName,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("UPDATE PAYMENT STATUS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update payment status",
      error: error.message,
    });
  }
});

// ==================== ANALYTICS: GRAPH 1 — ACCOMMODATION ====================

/**
 * GET /api/billing/analytics/accommodation
 * Query: ?range=7d|30d|90d|1y  OR  ?startDate=&endDate=
 *        ?groupBy=day|week|month
 *
 * Returns:
 *  - summary          : total value, total bookings, total paid, total balance
 *  - trend[]          : per-period booking count + value (line chart)
 *  - byAccommodation[]: per-item booking count + value — MAY bookingItemModel
 */
exports.getAccommodationGraph = AsyncErrorHandler(async (req, res) => {
  const { start, end } = buildAnalyticsDateRange(req.query);
  const groupBy = req.query.groupBy || "day";

  const groupFormat = {
    day: "%Y-%m-%d",
    week: "%Y-W%V",
    month: "%Y-%m",
  }[groupBy] || "%Y-%m-%d";

  const match = {
    "paymentDetails.processedAt": { $gte: start, $lte: end },
    status: { $in: ["fully_paid", "completed", "partial", "verified"] },
    "bookings.bookingItemModel": "Accommodation",
  };

  const trend = await BillingHistory.aggregate([
    { $match: match },
    { $unwind: "$bookings" },
    { $match: { "bookings.bookingItemModel": "Accommodation" } },
    {
      $group: {
        _id: {
          $dateToString: {
            format: groupFormat,
            date: "$paymentDetails.processedAt",
          },
        },
        bookingCount: { $sum: 1 },
        totalValue: { $sum: { $ifNull: ["$bookings.amount", 0] } },
        totalPaid: { $sum: { $ifNull: ["$bookings.paymentAmount", 0] } },
        totalBalance: { $sum: { $ifNull: ["$bookings.remainingBalance", 0] } },
        uniqueCustomers: { $addToSet: "$customerId" },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        date: "$_id",
        bookingCount: 1,
        totalValue: { $round: ["$totalValue", 2] },
        totalPaid: { $round: ["$totalPaid", 2] },
        totalBalance: { $round: ["$totalBalance", 2] },
        uniqueCustomerCount: { $size: "$uniqueCustomers" },
      },
    },
  ]);

  const byAccommodation = await BillingHistory.aggregate([
    { $match: match },
    { $unwind: "$bookings" },
    { $match: { "bookings.bookingItemModel": "Accommodation" } },
    {
      $group: {
        _id: {
          bookingItemId: "$bookings.bookingItemId",
          itemName: "$bookings.itemName",
          bookingItemModel: "$bookings.bookingItemModel",
          accommodationType: "$bookings.accommodationType",
        },
        bookingCount: { $sum: 1 },
        totalValue: { $sum: { $ifNull: ["$bookings.amount", 0] } },
        totalPaid: { $sum: { $ifNull: ["$bookings.paymentAmount", 0] } },
        totalBalance: { $sum: { $ifNull: ["$bookings.remainingBalance", 0] } },
        uniqueCustomers: { $addToSet: "$customerId" },
        lastBookedAt: { $max: "$paymentDetails.processedAt" },
      },
    },
    {
      $project: {
        _id: 0,
        bookingItemId: "$_id.bookingItemId",
        itemName: "$_id.itemName",
        bookingItemModel: "$_id.bookingItemModel",
        accommodationType: "$_id.accommodationType",
        bookingCount: 1,
        totalValue: { $round: ["$totalValue", 2] },
        totalPaid: { $round: ["$totalPaid", 2] },
        totalBalance: { $round: ["$totalBalance", 2] },
        uniqueCustomerCount: { $size: "$uniqueCustomers" },
        lastBookedAt: 1,
      },
    },
    { $sort: { bookingCount: -1 } },
  ]);

  console.log("byAccommodation",byAccommodation)

  const summary = {
    totalBookings: byAccommodation.reduce((s, a) => s + a.bookingCount, 0),
    totalDistinctAccommodations: byAccommodation.length,
    totalValue: Number(
      byAccommodation.reduce((s, a) => s + a.totalValue, 0).toFixed(2)
    ),
    totalPaid: Number(
      byAccommodation.reduce((s, a) => s + a.totalPaid, 0).toFixed(2)
    ),
    totalBalance: Number(
      byAccommodation.reduce((s, a) => s + a.totalBalance, 0).toFixed(2)
    ),
  };

  res.status(200).json({
    success: true,
    category: "Accommodation",
    period: { start, end, groupBy },
    summary,
    trend,
    byAccommodation,
  });
});

// ==================== ANALYTICS: GRAPH 2 — FOOD ====================

/**
 * GET /api/billing/analytics/food
 * Query: ?range=7d|30d|90d|1y  OR  ?startDate=&endDate=
 *        ?groupBy=day|week|month
 *
 * Returns:
 *  - summary     : total value, total orders, total items sold, total paid, total balance
 *  - trend[]     : per-period order count + quantity + value (line chart)
 *  - byFoodItem[]: per-item times ordered + quantity + value — MAY bookingItemModel
 */
exports.getFoodGraph = AsyncErrorHandler(async (req, res) => {
  const { start, end } = buildAnalyticsDateRange(req.query);
  const groupBy = req.query.groupBy || "day";

  const groupFormat = {
    day: "%Y-%m-%d",
    week: "%Y-W%V",
    month: "%Y-%m",
  }[groupBy] || "%Y-%m-%d";

  const match = {
    "paymentDetails.processedAt": { $gte: start, $lte: end },
    status: { $in: ["fully_paid", "completed", "partial", "verified"] },
    "bookings.type": "Order",
  };

  const quantityExpr = {
    $ifNull: [
      "$bookings.itemCount",
      {
        $sum: {
          $map: {
            input: { $ifNull: ["$bookings.items", []] },
            as: "i",
            in: { $ifNull: ["$$i.quantity", 0] },
          },
        },
      },
    ],
  };

  const trend = await BillingHistory.aggregate([
    { $match: match },
    { $unwind: "$bookings" },
    { $match: { "bookings.type": "Order" } },
    {
      $group: {
        _id: {
          $dateToString: {
            format: groupFormat,
            date: "$paymentDetails.processedAt",
          },
        },
        orderCount: { $sum: 1 },
        totalQuantity: { $sum: quantityExpr },
        totalValue: { $sum: { $ifNull: ["$bookings.amount", 0] } },
        totalPaid: { $sum: { $ifNull: ["$bookings.paymentAmount", 0] } },
        totalBalance: { $sum: { $ifNull: ["$bookings.remainingBalance", 0] } },
        uniqueCustomers: { $addToSet: "$customerId" },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        date: "$_id",
        orderCount: 1,
        totalQuantity: 1,
        totalValue: { $round: ["$totalValue", 2] },
        totalPaid: { $round: ["$totalPaid", 2] },
        totalBalance: { $round: ["$totalBalance", 2] },
        uniqueCustomerCount: { $size: "$uniqueCustomers" },
      },
    },
  ]);

  const byFoodItem = await BillingHistory.aggregate([
    { $match: match },
    { $unwind: "$bookings" },
    { $match: { "bookings.type": "Order" } },
    { $unwind: { path: "$bookings.items", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: {
          itemName: {
            $ifNull: ["$bookings.items.name", "$bookings.itemName"],
          },
          bookingItemModel: "$bookings.bookingItemModel",
        },
        timesOrdered: { $sum: 1 },
        totalQuantity: { $sum: { $ifNull: ["$bookings.items.quantity", 1] } },
        totalValue: {
          $sum: {
            $ifNull: [
              {
                $multiply: [
                  { $ifNull: ["$bookings.items.quantity", 1] },
                  { $ifNull: ["$bookings.items.price", 0] },
                ],
              },
              { $ifNull: ["$bookings.amount", 0] },
            ],
          },
        },
        uniqueCustomers: { $addToSet: "$customerId" },
        lastOrderedAt: { $max: "$paymentDetails.processedAt" },
      },
    },
    {
      $project: {
        _id: 0,
        itemName: "$_id.itemName",
        bookingItemModel: "$_id.bookingItemModel",
        timesOrdered: 1,
        totalQuantity: 1,
        totalValue: { $round: ["$totalValue", 2] },
        uniqueCustomerCount: { $size: "$uniqueCustomers" },
        lastOrderedAt: 1,
      },
    },
    { $sort: { timesOrdered: -1 } },
  ]);

  const summary = {
    totalOrders: byFoodItem.reduce((s, f) => s + f.timesOrdered, 0),
    totalDistinctFoodItems: byFoodItem.length,
    totalQuantitySold: byFoodItem.reduce((s, f) => s + f.totalQuantity, 0),
    totalValue: Number(
      byFoodItem.reduce((s, f) => s + f.totalValue, 0).toFixed(2)
    ),
    totalPaid: Number(
      trend.reduce((s, t) => s + t.totalPaid, 0).toFixed(2)
    ),
    totalBalance: Number(
      trend.reduce((s, t) => s + t.totalBalance, 0).toFixed(2)
    ),
  };

  res.status(200).json({
    success: true,
    category: "Food",
    period: { start, end, groupBy },
    summary,
    trend,
    byFoodItem,
  });
});