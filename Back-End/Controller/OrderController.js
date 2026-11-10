const mongoose = require("mongoose");
const AsyncErrorHandler = require("../Utils/AsyncErrorHandler");
const Order = require("../Models/OrderSchema");
const Cart = require("../Models/cartModel");
const ActionBooking = require("../Models/ActionBooking");
const Accommodation = require("../Models/accommodationSchema");

// ✅ FIX: destructure — ang helper ay naka-export as { sendOrderStatusNotification }
const { sendOrderStatusNotification } = require("../Utils/orderNotificationHelper");

const UserLogin = require("../Models/LogInDentalSchema");
const Customer = require("../Models/CustomerSchema");
const AuditTrail = require("../Models/AuditlogsSchema");


exports.checkout = AsyncErrorHandler(async (req, res) => {
    try {
        const {
            userId,
            cartId,
            payment,
            delivery,
            notes,
            defaultLocationId,
            items = [],
            _isReceptionist, // optional flag from frontend
        } = req.body;

        console.log("📥 req.body:", req.body);

        // ─── Basic validation ─────────────────────────────────────
        if (!userId) {
            return res.status(400).json({ status: "fail", message: "UserId is required." });
        }
        if (!cartId) {
            return res.status(400).json({ status: "fail", message: "Cart ID is required." });
        }
        if (!payment) {
            return res.status(400).json({ status: "fail", message: "Payment details are required." });
        }

        // ─── Resolve Receptionist flag ────────────────────────────
        let isReceptionist = _isReceptionist === true;

        if (!isReceptionist && userId) {
            try {
                const requester = await UserLogin.findById(userId)
                    .select("_id role")
                    .lean();
                const r = String(requester?.role || "").toLowerCase();
                if (r === "receptionist" || r === "receptionest") {
                    isReceptionist = true;
                }
            } catch (err) {
                console.error("❌ Error resolving requester role:", err.message);
            }
        }

        console.log("🧑‍💼 [CHECKOUT] Is Receptionist:", isReceptionist);

        // ─── Location requirement (skipped for Receptionist) ─────
        if (!isReceptionist && !defaultLocationId) {
            return res.status(400).json({
                status: "fail",
                message: "Default location is required.",
            });
        }

        // ─── Booking / Accommodation / Customer lookup ────────────
        let matchedBooking = null;
        let matchedAccommodation = null;
        let matchedUserLogin = null;
        let matchedCustomer = null;
        let deliveryLocationId = null;
        let bookingCustomerId = null;
        let customerProfileId = null;
        let fullName = "";

        if (!isReceptionist) {
            // ----- Original flow (guest with booking) -----
            try {
                matchedBooking = await ActionBooking.findById(defaultLocationId)
                    .select("_id customerId bookingItemId bookingNumber bookingItemModel status setdefault")
                    .lean();

                console.log("📍 [CHECKOUT] Matched ActionBooking:", matchedBooking);
            } catch (err) {
                console.error("❌ Error finding ActionBooking:", err.message);
            }

            if (!matchedBooking) {
                return res.status(404).json({
                    status: "fail",
                    message: "Default location not found in bookings.",
                });
            }

            deliveryLocationId = matchedBooking.bookingItemId;
            bookingCustomerId = matchedBooking.customerId;

            console.log("📍 [CHECKOUT] Extracted bookingItemId:", deliveryLocationId);
            console.log("📍 [CHECKOUT] Extracted bookingCustomerId:", bookingCustomerId);

            if (!deliveryLocationId) {
                return res.status(400).json({
                    status: "fail",
                    message: "Booking item ID not found for this location.",
                });
            }

            try {
                matchedAccommodation = await Accommodation.findById(deliveryLocationId)
                    .select("_id name description type minCapacity maxCapacity pricePerDay amenities status avatar")
                    .lean();

                console.log("📍 [CHECKOUT] Matched Accommodation:", matchedAccommodation);
            } catch (err) {
                console.error("❌ Error finding Accommodation:", err.message);
            }

            if (!matchedAccommodation) {
                return res.status(404).json({
                    status: "fail",
                    message: "Accommodation not found.",
                });
            }

            try {
                matchedUserLogin = await UserLogin.findById(bookingCustomerId)
                    .select("_id linkedId role")
                    .lean();

                console.log("📍 [CHECKOUT] Matched UserLogin:", matchedUserLogin);
            } catch (err) {
                console.error("❌ Error finding UserLogin:", err.message);
            }

            if (!matchedUserLogin) {
                return res.status(404).json({
                    status: "fail",
                    message: "UserLogin not found.",
                });
            }

            customerProfileId = matchedUserLogin.linkedId;

            console.log("📍 [CHECKOUT] Extracted linkedId (Customer._id):", customerProfileId);

            if (!customerProfileId) {
                return res.status(400).json({
                    status: "fail",
                    message: "Customer linkedId not found.",
                });
            }

            try {
                matchedCustomer = await Customer.findById(customerProfileId)
                    .select("_id first_name last_name middle_name suffix gender email avatar")
                    .lean();

                console.log("📍 [CHECKOUT] Matched Customer:", matchedCustomer);
            } catch (err) {
                console.error("❌ Error finding Customer:", err.message);
            }

            if (!matchedCustomer) {
                return res.status(404).json({
                    status: "fail",
                    message: "Customer profile not found.",
                });
            }

            fullName = [
                matchedCustomer.first_name,
                matchedCustomer.middle_name,
                matchedCustomer.last_name,
                matchedCustomer.suffix,
            ]
                .filter(Boolean)
                .join(" ")
                .trim();

            console.log("📍 [CHECKOUT] Full Customer Name:", fullName);
        } else {
            // ----- Receptionist flow (walk-in order) -----
            console.log("🧑‍💼 [CHECKOUT] Receptionist walk-in order — skipping booking/accommodation lookup.");

            // Optional: still try to resolve the receptionist's own profile
            // (for logging / audit trail). Failure is non-fatal.
            try {
                const requester = await UserLogin.findById(userId)
                    .select("_id linkedId role")
                    .lean();
                if (requester?.linkedId) {
                    const profile = await Customer.findById(requester.linkedId)
                        .select("_id first_name last_name middle_name suffix")
                        .lean();
                    if (profile) {
                        fullName = [
                            profile.first_name,
                            profile.middle_name,
                            profile.last_name,
                            profile.suffix,
                        ]
                            .filter(Boolean)
                            .join(" ")
                            .trim();
                    }
                }
            } catch (err) {
                console.error("⚠️ Non-fatal: failed to resolve receptionist profile:", err.message);
            }
        }

        // ─── Cart lookup ──────────────────────────────────────────
        const cart = await Cart.findOne({
            _id: cartId,
            customerId: userId,
        }).populate({
            path: "items.foodId",
            select: "name category price avatar image",
        });

        if (!cart) {
            return res.status(404).json({ status: "fail", message: "Cart not found." });
        }
        if (!cart.items || cart.items.length === 0) {
            return res.status(400).json({ status: "fail", message: "Cart is empty." });
        }

        // ─── Build order items ────────────────────────────────────
        const orderId = `ORD-${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 7)
            .toUpperCase()}`;

        const orderItems = cart.items.map((cartItem) => {
            const frontendItem = items.find(
                (i) => i.foodId?.toString() === cartItem.foodId._id.toString()
            );

            return {
                foodId: cartItem.foodId._id,
                name: cartItem.foodId.name,
                category: cartItem.foodId.category || "General",
                image:
                    frontendItem?.image ||
                    cartItem.foodId.avatar ||
                    cartItem.foodId.image ||
                    "",
                quantity: cartItem.quantity,
                price: cartItem.foodId.price,
                subtotal: cartItem.quantity * cartItem.foodId.price,
            };
        });

        const totalItems = orderItems.length;
        const totalQuantity = orderItems.reduce((sum, item) => sum + item.quantity, 0);
        const totalAmount = orderItems.reduce((sum, item) => sum + item.subtotal, 0);

        // ─── Build order payload (branch by role) ─────────────────
        let orderData;

        if (isReceptionist) {
            orderData = {
                orderId,
                userId,
                orderDate: new Date(),
                status: "pending",

                customer: {
                    id: userId,
                    name: fullName || "Walk-in Guest",
                    room: "Walk-in",
                    status: "walk-in",
                    points: 0,
                    checkOut: "",
                },

                items: orderItems,

                totals: {
                    totalItems,
                    totalQuantity,
                    totalAmount,
                },

                payment: {
                    method: payment.method || "pending",
                    status: payment.status || "pending",
                    amount: payment.amount || totalAmount,
                    currency: payment.currency || "PHP",
                },

                // No deliveryId — walk-in
                deliveryId: null,

                delivery: {
                    type: "walk-in",
                    roomNumber: "Walk-in",
                    status: "pending",
                    notes: delivery?.notes || notes || "",
                    DeliveryLocationId: null,
                    DeliveryLocationName: "Walk-in",
                    DeliveryLocationDescription: "",
                    DeliveryLocationType: "walk-in",
                    DeliveryLocationMinCapacity: 0,
                    DeliveryLocationMaxCapacity: 0,
                    DeliveryLocationPrice: 0,
                    DeliveryLocationAmenities: [],
                    DeliveryLocationStatus: "available",
                    DeliveryLocationAvatar: "",
                    DeliveryBookingId: null,
                    DeliveryBookingNumber: "",
                },

                timestamp: new Date(),
            };
        } else {
            orderData = {
                orderId,
                userId,
                orderDate: new Date(),
                status: "pending",

                customer: {
                    id: matchedUserLogin._id,
                    name: fullName || "",
                    room: matchedAccommodation.name || "",
                    status: matchedBooking.status || "",
                    points: 0,
                    checkOut: "",
                },

                items: orderItems,

                totals: {
                    totalItems,
                    totalQuantity,
                    totalAmount,
                },

                payment: {
                    method: payment.method || "pending",
                    status: payment.status || "pending",
                    amount: payment.amount || totalAmount,
                    currency: payment.currency || "PHP",
                },

                deliveryId: deliveryLocationId,

                delivery: {
                    roomNumber: matchedAccommodation.name || "",
                    status: "pending",
                    notes: delivery?.notes || notes || "",
                    DeliveryLocationId: deliveryLocationId,
                    DeliveryLocationName: matchedAccommodation.name || "",
                    DeliveryLocationDescription: matchedAccommodation.description || "",
                    DeliveryLocationType: matchedAccommodation.type || "",
                    DeliveryLocationMinCapacity: matchedAccommodation.minCapacity || 0,
                    DeliveryLocationMaxCapacity: matchedAccommodation.maxCapacity || 0,
                    DeliveryLocationPrice: matchedAccommodation.pricePerDay || 0,
                    DeliveryLocationAmenities: matchedAccommodation.amenities || [],
                    DeliveryLocationStatus: matchedAccommodation.status || "available",
                    DeliveryLocationAvatar: matchedAccommodation.avatar?.[0]?.url || "",
                    DeliveryBookingId: matchedBooking._id,
                    DeliveryBookingNumber: matchedBooking.bookingNumber || "",
                },

                timestamp: new Date(),
            };
        }

        console.log("\n========================================");
        console.log("📦 [CHECKOUT] PAYLOADS TO SAVE");
        console.log("========================================");
        console.log("🆔 orderId:", orderData.orderId);
        console.log("👤 userId:", orderData.userId);
        console.log("📅 orderDate:", orderData.orderDate);
        console.log("📌 status:", orderData.status);
        console.log("🧑‍💼 isReceptionist:", isReceptionist);
        console.log("\n👤 CUSTOMER:");
        console.log(JSON.stringify(orderData.customer, null, 2));
        console.log("\n🍔 ITEMS:", orderData.items.length, "item(s)");
        console.log("\n💰 TOTALS:", JSON.stringify(orderData.totals, null, 2));
        console.log("\n💳 PAYMENT:", JSON.stringify(orderData.payment, null, 2));
        console.log("\n🚚 DELIVERY:", JSON.stringify(orderData.delivery, null, 2));
        if (!isReceptionist) {
            console.log("\n📍 LOOKUP CHAIN:");
            console.log("  ActionBooking._id:", matchedBooking?._id);
            console.log("  → bookingItemId (Accommodation._id):", deliveryLocationId);
            console.log("  → customerId (UserLogin._id):", bookingCustomerId);
            console.log("  → linkedId (Customer._id):", customerProfileId);
            console.log("  → Customer Name:", fullName);
        } else {
            console.log("\n📍 WALK-IN ORDER (no booking lookup)");
        }
        console.log("========================================\n");

        // ─── Persist order ────────────────────────────────────────
        const newOrder = await Order.create(orderData);

        // ─── Clear cart (non-fatal if it fails) ───────────────────
        try {
            const deletedCart = await Cart.findByIdAndDelete(cartId);
            if (deletedCart) {
                console.log(`🗑️ Cart permanently deleted for user: ${userId}`);
                console.log(`📋 Deleted cart ID: ${deletedCart._id}`);
            }
        } catch (err) {
            console.error("❌ Error deleting cart:", err.message);
        }

        return res.status(201).json({
            status: "success",
            message: "Order placed successfully! Cart has been cleared.",
            data: newOrder,
        });
    } catch (err) {
        // ─── Global catch — prevents 500 without context ─────────
        console.error("\n========================================");
        console.error("❌ [CHECKOUT] UNHANDLED ERROR");
        console.error("========================================");
        console.error("Message:", err?.message);
        console.error("Name:", err?.name);
        console.error("Stack:", err?.stack);
        if (err?.errors) {
            console.error("Validation errors:", JSON.stringify(err.errors, null, 2));
        }
        console.error("========================================\n");

        // Mongoose validation error
        if (err?.name === "ValidationError") {
            return res.status(400).json({
                status: "fail",
                message: "Order validation failed.",
                errors: Object.keys(err.errors || {}).reduce((acc, key) => {
                    acc[key] = err.errors[key]?.message;
                    return acc;
                }, {}),
            });
        }

        // Mongoose duplicate key
        if (err?.code === 11000) {
            return res.status(409).json({
                status: "fail",
                message: "Duplicate order detected. Please retry.",
                keyValue: err.keyValue || null,
            });
        }

        // Mongoose cast error (invalid ObjectId)
        if (err?.name === "CastError") {
            return res.status(400).json({
                status: "fail",
                message: `Invalid ${err.path}: ${err.value}`,
            });
        }

        return res.status(500).json({
            status: "fail",
            message: err?.message || "Checkout failed. Please try again.",
        });
    }
});

exports.DisplayOrders = AsyncErrorHandler(async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const userId = req.user?._id;
        const role = req.user?.role;

        const {
            search = "",
            status = "",
            paymentStatus = "",
            deliveryStatus = "",
            startDate = "",
            endDate = "",
            sort = "new",
        } = req.query;

        console.log("Role:", role);
        console.log("Sort:", sort);
        console.log("Status Filter:", status);

        const matchStage = {};

        if (
            role === "customer" &&
            userId &&
            mongoose.Types.ObjectId.isValid(userId)
        ) {
            matchStage.userId = new mongoose.Types.ObjectId(userId);
        }

        if (search.trim()) {
            matchStage.$or = [
                { orderId: { $regex: new RegExp(search.trim(), "i") } },
                { "customer.name": { $regex: new RegExp(search.trim(), "i") } },
                { "customer.room": { $regex: new RegExp(search.trim(), "i") } },
            ];
        }

        if (status.trim()) {
            const statusList = status
                .split(",")
                .map((s) => s.trim().toLowerCase().replace(/[\s-]/g, ""))
                .filter(Boolean);

            if (statusList.length === 1) {
                matchStage.status = { $regex: new RegExp(`^${statusList[0]}$`, "i") };
            } else if (statusList.length > 1) {
                matchStage.status = {
                    $in: statusList.map((s) => new RegExp(`^${s}$`, "i")),
                };
            }
        }

        if (paymentStatus.trim()) {
            matchStage["payment.status"] = paymentStatus;
        }

        if (deliveryStatus.trim()) {
            matchStage["delivery.status"] = deliveryStatus;
        }

        if (startDate.trim() && endDate.trim()) {
            matchStage.orderDate = {
                $gte: new Date(startDate),
                $lte: new Date(endDate),
            };
        } else if (startDate.trim()) {
            matchStage.orderDate = { $gte: new Date(startDate) };
        } else if (endDate.trim()) {
            matchStage.orderDate = { $lte: new Date(endDate) };
        }

        const sortStage =
            sort === "old" ? { createdAt: 1 } : { createdAt: -1 };

        const totalMatchingOrders = await Order.countDocuments(matchStage);
        const allOrdersCount = await Order.countDocuments();

        const pipeline = [
            { $match: matchStage },
            { $sort: sortStage },
            {
                $facet: {
                    data: [
                        { $skip: skip },
                        { $limit: limit },
                        {
                            $lookup: {
                                from: "userlogins",
                                localField: "userId",
                                foreignField: "_id",
                                pipeline: [
                                    { $project: { _id: 1, name: 1, avatar: 1, image: 1 } },
                                ],
                                as: "userDetails",
                            },
                        },
                        {
                            $lookup: {
                                from: "foods",
                                localField: "items.foodId",
                                foreignField: "_id",
                                as: "foodDetails",
                            },
                        },
                    ],
                    totalCount: [{ $count: "count" }],
                },
            },
        ];

        const results = await Order.aggregate(pipeline);
        const data = results[0]?.data || [];
        const totalOrders = results[0]?.totalCount[0]?.count || 0;

        console.log(`Returning ${data.length} orders (sort: ${sort})`);

        const stats = await Order.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    totalRevenue: { $sum: "$totals.totalAmount" },
                    totalQuantity: { $sum: "$totals.totalQuantity" },
                    averageAmount: { $avg: "$totals.totalAmount" },
                },
            },
        ]);

        const statusCountsRaw = await Order.aggregate([
            { $match: matchStage },
            { $group: { _id: "$status", count: { $sum: 1 } } },
        ]);

        const statusCounts = {
            pending: 0,
            processing: 0,
            fordelivering: 0,
            completed: 0,
        };

        statusCountsRaw.forEach((item) => {
            const key = (item._id || "").toLowerCase().replace(/[\s-]/g, "");
            if (statusCounts[key] !== undefined) {
                statusCounts[key] = item.count;
            }
        });

        const paymentStatusCounts = await Order.aggregate([
            { $match: matchStage },
            { $group: { _id: "$payment.status", count: { $sum: 1 } } },
        ]);

        const statuses = await Order.distinct("status", matchStage);

        return res.status(200).json({
            success: true,
            data,
            totalOrders,
            currentPage: page,
            totalPages: Math.ceil(totalOrders / limit),
            sort,
            stats: stats[0] || {
                totalOrders: 0,
                totalRevenue: 0,
                totalQuantity: 0,
                averageAmount: 0,
            },
            statusCounts,
            paymentStatusCounts,
            statuses,
            debug: {
                role,
                userId: role === "customer" ? userId?.toString() : null,
                filterApplied: role === "customer" ? "Own Orders" : "All Orders",
                sortApplied: sort,
                statusFilterApplied: status || null,
                totalMatchingOrders,
                allOrdersCount,
                hasOrders: allOrdersCount > 0,
            },
        });
    } catch (error) {
        console.error("❌ Error fetching orders:", error);
        return res.status(500).json({
            success: false,
            message: "Something went wrong while fetching orders.",
            error: error.message,
            stack:
                process.env.NODE_ENV === "development"
                    ? error.stack
                    : undefined,
        });
    }
});

exports.GetTodaysOrders = AsyncErrorHandler(async (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const orders = await Order.find({
        orderDate: { $gte: today, $lt: tomorrow },
    }).sort({ createdAt: -1 });

    const stats = await Order.aggregate([
        { $match: { orderDate: { $gte: today, $lt: tomorrow } } },
        {
            $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalRevenue: { $sum: "$totals.totalAmount" },
                totalQuantity: { $sum: "$totals.totalQuantity" },
            },
        },
    ]);

    res.status(200).json({
        status: "success",
        data: orders,
        count: orders.length,
        stats: stats[0] || {
            totalOrders: 0,
            totalRevenue: 0,
            totalQuantity: 0,
        },
    });
});

exports.GetOrderStatistics = AsyncErrorHandler(async (req, res) => {
    const { startDate = "", endDate = "" } = req.query;

    const matchStage = {};

    if (startDate.trim() && endDate.trim()) {
        matchStage.orderDate = {
            $gte: new Date(startDate),
            $lte: new Date(endDate),
        };
    } else if (startDate.trim()) {
        matchStage.orderDate = { $gte: new Date(startDate) };
    } else if (endDate.trim()) {
        matchStage.orderDate = { $lte: new Date(endDate) };
    }

    const overallStats = await Order.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalRevenue: { $sum: "$totals.totalAmount" },
                totalQuantity: { $sum: "$totals.totalQuantity" },
                averageOrderAmount: { $avg: "$totals.totalAmount" },
            },
        },
    ]);

    const statusStats = await Order.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: "$status",
                count: { $sum: 1 },
                revenue: { $sum: "$totals.totalAmount" },
            },
        },
    ]);

    const paymentStats = await Order.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: "$payment.method",
                count: { $sum: 1 },
                totalAmount: { $sum: "$payment.amount" },
            },
        },
    ]);

    const dailySales = await Order.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: {
                    $dateToString: { format: "%Y-%m-%d", date: "$orderDate" },
                },
                count: { $sum: 1 },
                revenue: { $sum: "$totals.totalAmount" },
            },
        },
        { $sort: { _id: 1 } },
        { $limit: 30 },
    ]);

    res.status(200).json({
        status: "success",
        data: {
            overall: overallStats[0] || {
                totalOrders: 0,
                totalRevenue: 0,
                totalQuantity: 0,
                averageOrderAmount: 0,
            },
            byStatus: statusStats,
            byPayment: paymentStats,
            dailySales,
        },
    });
});

exports.GetOrdersByUser = AsyncErrorHandler(async (req, res) => {
    const userId = req.user._id;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { status = "" } = req.query;

    const matchStage = { userId: new mongoose.Types.ObjectId(userId) };

    if (status.trim()) {
        matchStage.status = status;
    }

    const pipeline = [
        { $match: matchStage },
        { $sort: { createdAt: -1 } },
        {
            $facet: {
                data: [
                    { $skip: skip },
                    { $limit: limit },
                    {
                        $lookup: {
                            from: "foods",
                            localField: "items.foodId",
                            foreignField: "_id",
                            as: "foodDetails",
                        },
                    },
                ],
                totalCount: [{ $count: "count" }],
            },
        },
    ];

    const results = await Order.aggregate(pipeline);
    const data = results[0].data;
    const totalOrders = results[0].totalCount[0]?.count || 0;

    res.status(200).json({
        status: "success",
        data,
        totalOrders,
        currentPage: page,
        totalPages: Math.ceil(totalOrders / limit),
    });
});

exports.GetOrdersByDateRange = AsyncErrorHandler(async (req, res) => {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
        return res.status(400).json({
            status: "fail",
            message: "Start date and end date are required",
        });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const orders = await Order.find({
        orderDate: { $gte: start, $lte: end },
    }).sort({ orderDate: -1 });

    res.status(200).json({
        status: "success",
        count: orders.length,
        data: orders,
    });
});

exports.GetOrderByOrderId = AsyncErrorHandler(async (req, res) => {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId })
        .populate("userId", "username email")
        .populate("items.foodId", "name price category description");

    if (!order) {
        return res.status(404).json({
            status: "fail",
            message: "Order not found.",
        });
    }

    res.status(200).json({
        status: "success",
        data: order,
    });
});

exports.GetSingleOrder = AsyncErrorHandler(async (req, res) => {
    const order = await Order.findById(req.params.id)
        .populate("userId", "username email")
        .populate("items.foodId", "name price category");

    if (!order) {
        return res.status(404).json({
            status: "fail",
            message: "Order not found.",
        });
    }

    res.status(200).json({
        status: "success",
        data: order,
    });
});

exports.UpdateOrder = AsyncErrorHandler(async (req, res) => {
    const orderID = req.params.id;

    const existingOrder = await Order.findById(orderID);
    if (!existingOrder) {
        return res.status(404).json({
            status: "fail",
            message: "Order not found.",
        });
    }

    const updateData = { ...req.body };
    delete updateData._id;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    const changedFields = [];
    for (const key of Object.keys(updateData)) {
        const oldValue = existingOrder[key];
        const newValue = updateData[key];

        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            changedFields.push({ field: key, from: oldValue, to: newValue });
        }
    }

    if (changedFields.length === 0) {
        return res.status(200).json({
            status: "success",
            message: "No changes detected.",
            data: existingOrder,
        });
    }

    const updatedOrder = await Order.findByIdAndUpdate(
        orderID,
        updateData,
        { new: true, runValidators: true }
    );

    try {
        await AuditTrail.create({
            performedBy: req.user?._id || null,
            actorName: req.user
                ? `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim()
                : "System",
            actorRole: req.user?.role || "system",
            action: "Updated order",
            module: "Order",
            targetId: updatedOrder._id,
            targetLabel:
                updatedOrder.referenceNo ||
                updatedOrder.orderNumber ||
                updatedOrder._id.toString(),
            data: {
                changedFields,
                before: existingOrder.toObject(),
                after: updatedOrder.toObject(),
            },
        });
    } catch (auditErr) {
        console.error("Audit log failed:", auditErr.message);
    }

    res.status(200).json({
        status: "success",
        message: "Order updated successfully.",
        data: updatedOrder,
    });
});

// ======================
// 🔥 FIXED: UPDATE ORDER STATUS
// ======================
exports.UpdateOrderStatus = AsyncErrorHandler(async (req, res) => {
    try {
        const orderID = req.params.id;
        const { status, note } = req.body;
        const role = req.user?.role;

        // 1. Validate existence
        const existingOrder = await Order.findById(orderID);
        if (!existingOrder) {
            return res.status(404).json({
                status: "fail",
                message: "Order not found.",
            });
        }

        // 2. Validate input
        if (!status) {
            return res.status(400).json({
                status: "fail",
                message: "Status is required.",
            });
        }

        const validStatuses = [
            "pending",
            "preparing",
            "ready",
            "processing",
            "for delivery",
            "delivering",
            "completed",
            "cancelled",
        ];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                status: "fail",
                message: `Invalid status. Allowed values: ${validStatuses.join(", ")}`,
            });
        }

        // 3. Capture previous status BEFORE update
        const previousStatus = existingOrder.status;
        const statusChanged = previousStatus !== status;

        if (!statusChanged) {
            return res.status(200).json({
                status: "success",
                message: "Order already has this status. No changes made.",
                data: existingOrder,
            });
        }

        console.log(`🔄 Updating order status: ${previousStatus} → ${status}`);

        // 4. Use .save() so the pre-save statusTracking hook runs
        existingOrder.status = status;
        const updatedOrder = await existingOrder.save();

        // 5. Send notification — correct call signature (object argument)
        //    Wrapped in try/catch so notification failure doesn't break the response
        try {
            if (typeof sendOrderStatusNotification === "function") {
                await sendOrderStatusNotification({
                    order: updatedOrder,
                    previousStatus,
                    newStatus: status,
                    note: note || "",
                    actor: req.user,
                    req,
                });
            } else {
                console.warn(
                    "⚠️ sendOrderStatusNotification is not a function — skipping"
                );
            }
        } catch (notifErr) {
            console.error("⚠️ Notification failed:", notifErr.message);
        }

        // 6. Audit trail
        try {
            const ipAddress =
                req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
                req.socket?.remoteAddress ||
                req.ip ||
                null;

            await AuditTrail.create({
                performedBy: req.user?._id || null,
                performedByModel: role || "Admin",
                type: "STATUS_CHANGE",
                action: "UpdateOrderStatus",
                module: "Order",
                message: `Order status changed from "${previousStatus}" to "${status}"${
                    note ? ` — ${note}` : ""
                }`,
                level: status === "cancelled" ? "warning" : "info",
                targetId: updatedOrder._id,
                targetModel: "Order",
                targetLabel:
                    updatedOrder.orderId ||
                    updatedOrder.reference ||
                    `Order #${updatedOrder._id}`,
                ownerId:
                    updatedOrder.customer?.id ||
                    updatedOrder.userId ||
                    null,
                beforeChange: { status: previousStatus },
                afterChange: { status },
                changedFields: [
                    { field: "status", from: previousStatus, to: status },
                ],
                ipAddress,
                userAgent: req.headers["user-agent"] || null,
                method: req.method,
                endpoint: req.originalUrl,
                requestId: req.headers["x-request-id"] || null,
                status: "success",
                metadata: {
                    note: note || null,
                    orderType: updatedOrder.type || null,
                    totalAmount: updatedOrder.totals?.totalAmount || null,
                    previousStatus,
                    newStatus: status,
                    customerName: updatedOrder.customer?.name || null,
                    customerRoom: updatedOrder.customer?.room || null,
                },
            });
        } catch (auditError) {
            console.error("⚠️ Failed to write audit trail:", auditError);
        }

        return res.status(200).json({
            status: "success",
            message: "Order status updated successfully.",
            data: updatedOrder,
        });
    } catch (error) {
        console.error("❌ Error updating order status:", error);

        try {
            const actor = req.user || {};
            const ipAddress =
                req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
                req.socket?.remoteAddress ||
                req.ip ||
                null;

            await AuditTrail.create({
                performedBy: actor._id || actor.userId || actor.id || null,
                performedByModel: actor.role || "System",
                actorSnapshot: {
                    firstName: actor.firstName || "",
                    lastName: actor.lastName || "",
                    email: actor.email || "",
                    role: actor.role || "system",
                },
                type: "STATUS_CHANGE",
                action: "UpdateOrderStatus",
                module: "Order",
                message: `Error updating order status for ${req.params.id}`,
                level: "error",
                targetId: req.params.id || null,
                targetModel: "Order",
                ipAddress,
                userAgent: req.headers["user-agent"] || null,
                method: req.method,
                endpoint: req.originalUrl,
                status: "failure",
                errorMessage: error.message,
                metadata: { body: req.body },
            });
        } catch (auditError) {
            console.error(
                "⚠️ Failed to write failure audit trail:",
                auditError
            );
        }

        return res.status(500).json({
            status: "fail",
            message: "Something went wrong while updating order status.",
            error: error.message,
            stack:
                process.env.NODE_ENV === "development"
                    ? error.stack
                    : undefined,
        });
    }
});

exports.UpdatePayment = AsyncErrorHandler(async (req, res) => {
    const orderID = req.params.id;
    const { method, status, amount, currency } = req.body;

    const existingOrder = await Order.findById(orderID);
    if (!existingOrder) {
        return res.status(404).json({
            status: "fail",
            message: "Order not found.",
        });
    }

    const updateData = {};

    if (method) {
        const validMethods = ["pending", "cash", "gcash", "card"];
        if (!validMethods.includes(method)) {
            return res.status(400).json({
                status: "fail",
                message: `Invalid payment method. Allowed: ${validMethods.join(", ")}`,
            });
        }
        updateData["payment.method"] = method;
    }

    if (status) {
        const validStatuses = ["pending", "paid", "failed", "refunded"];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                status: "fail",
                message: `Invalid payment status. Allowed: ${validStatuses.join(", ")}`,
            });
        }
        updateData["payment.status"] = status;
    }

    if (amount !== undefined) {
        if (Number(amount) < 0) {
            return res.status(400).json({
                status: "fail",
                message: "Payment amount cannot be negative.",
            });
        }
        updateData["payment.amount"] = Number(amount);
    }

    if (currency) {
        updateData["payment.currency"] = currency;
    }

    console.log("🔄 Updating payment:", updateData);

    const updatedOrder = await Order.findByIdAndUpdate(
        orderID,
        { $set: updateData },
        { new: true, runValidators: true }
    );

    res.status(200).json({
        status: "success",
        message: "Payment details updated successfully.",
        data: updatedOrder,
    });
});

exports.UpdateDelivery = AsyncErrorHandler(async (req, res) => {
    const orderID = req.params.id;
    const { status, notes, roomNumber } = req.body;

    const existingOrder = await Order.findById(orderID);
    if (!existingOrder) {
        return res.status(404).json({
            status: "fail",
            message: "Order not found.",
        });
    }

    const updateData = {};

    if (status) {
        const validStatuses = [
            "pending",
            "preparing",
            "ready",
            "delivering",
            "completed",
            "cancelled",
        ];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                status: "fail",
                message: `Invalid delivery status. Allowed: ${validStatuses.join(", ")}`,
            });
        }
        updateData["delivery.status"] = status;
    }

    if (notes !== undefined) {
        updateData["delivery.notes"] = notes;
    }

    if (roomNumber !== undefined) {
        updateData["delivery.roomNumber"] = roomNumber;
        if (!req.body.customer) {
            updateData["customer.room"] = roomNumber;
        }
    }

    console.log("🔄 Updating delivery:", updateData);

    const updatedOrder = await Order.findByIdAndUpdate(
        orderID,
        { $set: updateData },
        { new: true, runValidators: true }
    );

    res.status(200).json({
        status: "success",
        message: "Delivery details updated successfully.",
        data: updatedOrder,
    });
});

exports.UpdateCustomer = AsyncErrorHandler(async (req, res) => {
    const orderID = req.params.id;
    const { name, room, status, points, checkOut } = req.body;

    const existingOrder = await Order.findById(orderID);
    if (!existingOrder) {
        return res.status(404).json({
            status: "fail",
            message: "Order not found.",
        });
    }

    const updateData = {};

    if (name !== undefined) updateData["customer.name"] = name;
    if (room !== undefined) {
        updateData["customer.room"] = room;
        updateData["delivery.roomNumber"] = room;
    }
    if (status !== undefined) updateData["customer.status"] = status;
    if (points !== undefined) {
        if (Number(points) < 0) {
            return res.status(400).json({
                status: "fail",
                message: "Points cannot be negative.",
            });
        }
        updateData["customer.points"] = Number(points);
    }
    if (checkOut !== undefined) updateData["customer.checkOut"] = checkOut;

    console.log("🔄 Updating customer:", updateData);

    const updatedOrder = await Order.findByIdAndUpdate(
        orderID,
        { $set: updateData },
        { new: true, runValidators: true }
    );

    res.status(200).json({
        status: "success",
        message: "Customer details updated successfully.",
        data: updatedOrder,
    });
});

exports.CancelOrder = AsyncErrorHandler(async (req, res) => {
    const orderID = req.params.id;

    const existingOrder = await Order.findById(orderID);

    if (!existingOrder) {
        return res.status(404).json({
            status: "fail",
            message: "Order not found.",
        });
    }

    const cancellableStatuses = ["pending", "accepted", "preparing"];
    if (!cancellableStatuses.includes(existingOrder.status)) {
        return res.status(400).json({
            status: "fail",
            message: `Order cannot be cancelled. Current status: ${existingOrder.status}`,
        });
    }

    console.log(`🔄 Cancelling order: ${orderID}`);

    const cancelledOrder = await Order.findByIdAndUpdate(
        orderID,
        {
            status: "cancelled",
            "delivery.status": "cancelled",
            "payment.status": "refunded",
        },
        { new: true, runValidators: true }
    );

    res.status(200).json({
        status: "success",
        message: "Order cancelled successfully.",
        data: cancelledOrder,
    });
});

exports.deleteOrder = AsyncErrorHandler(async (req, res) => {
    const orderID = req.params.id;

    const existingOrder = await Order.findById(orderID);

    if (!existingOrder) {
        return res.status(404).json({
            status: "fail",
            message: "Order not found.",
        });
    }

    console.log(`🗑️ Deleting order: ${orderID}`);

    await Order.findByIdAndDelete(orderID);

    res.status(200).json({
        status: "success",
        message: "Order deleted successfully.",
    });
});