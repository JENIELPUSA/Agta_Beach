const mongoose = require("mongoose");
const AsyncErrorHandler = require("../Utils/AsyncErrorHandler");
const Order = require("../Models/OrderSchema");
const Cart = require("../Models/cartModel");

// ======================
// CHECKOUT (Convert Cart to Order)
// ======================
exports.checkout = AsyncErrorHandler(async (req, res) => {
    const {
        userId,
        cartId,
        customer,
        payment,
        delivery,
        notes,
        items = [],
    } = req.body;

    console.log("req.body", req.body);
    console.log("📝 Processing checkout...");

    // ======================
    // VALIDATION
    // ======================
    if (!userId) {
        return res.status(400).json({
            status: "fail",
            message: "UserId is required.",
        });
    }

    if (!cartId) {
        return res.status(400).json({
            status: "fail",
            message: "Cart ID is required.",
        });
    }

    if (!customer || !customer.name) {
        return res.status(400).json({
            status: "fail",
            message: "Customer name is required.",
        });
    }

    if (!payment) {
        return res.status(400).json({
            status: "fail",
            message: "Payment details are required.",
        });
    }

    if (!delivery || !delivery.roomNumber) {
        return res.status(400).json({
            status: "fail",
            message: "Delivery room number is required.",
        });
    }

    // ======================
    // GET CART
    // ======================
    const cart = await Cart.findOne({
        _id: cartId,
        customerId: userId,
    }).populate({
        path: "items.foodId",
        select: "name category price avatar image",
    });

    if (!cart) {
        return res.status(404).json({
            status: "fail",
            message: "Cart not found.",
        });
    }

    if (!cart.items || cart.items.length === 0) {
        return res.status(400).json({
            status: "fail",
            message: "Cart is empty.",
        });
    }

    // ======================
    // GENERATE ORDER ID
    // ======================
    const orderId = `ORD-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 7)
        .toUpperCase()}`;

    // ======================
    // CREATE ORDER ITEMS
    // ======================
    const orderItems = cart.items.map((cartItem) => {
        const frontendItem = items.find(
            (i) => i.foodId.toString() === cartItem.foodId._id.toString()
        );

        return {
            foodId: cartItem.foodId._id,
            name: cartItem.foodId.name,
            category: cartItem.foodId.category || "General",

            // Priority:
            // 1. image from frontend
            // 2. avatar from Food model
            // 3. image from Food model
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

    // ======================
    // TOTALS
    // ======================
    const totalItems = orderItems.length;

    const totalQuantity = orderItems.reduce(
        (sum, item) => sum + item.quantity,
        0
    );

    const totalAmount = orderItems.reduce(
        (sum, item) => sum + item.subtotal,
        0
    );

    // ======================
    // ORDER DATA
    // ======================
    const orderData = {
        orderId,
        userId,
        orderDate: new Date(),
        status: "pending",

        customer: {
            id: customer.id || userId,
            name: customer.name,
            room: customer.room || delivery.roomNumber || "",
            status: customer.status || "",
            points: customer.points || 0,
            checkOut: customer.checkOut || "",
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

        delivery: {
            roomNumber: delivery.roomNumber || customer.room || "",
            status: "pending",
            notes: delivery.notes || notes || "",
        },

        timestamp: new Date(),
    };

    console.log(
        "📝 Creating order from cart:",
        JSON.stringify(orderData, null, 2)
    );

    // ======================
    // CREATE ORDER
    // ======================
    const newOrder = await Order.create(orderData);

    // ======================
    // DELETE CART
    // ======================
    try {
        const deletedCart = await Cart.findByIdAndDelete(cartId);

        if (deletedCart) {
            console.log(`🗑️ Cart permanently deleted for user: ${userId}`);
            console.log(`📋 Deleted cart ID: ${deletedCart._id}`);
        }
    } catch (err) {
        console.error("❌ Error deleting cart:", err.message);
    }

    // ======================
    // RESPONSE
    // ======================
    return res.status(201).json({
        status: "success",
        message: "Order placed successfully! Cart has been cleared.",
        data: newOrder,
    });
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
        } = req.query;

        console.log("Role:", role);

        // ============================================
        // MATCH FILTER
        // ============================================
        const matchStage = {};

        // Customer -> sariling orders lang
        // Other roles -> lahat ng orders
        if (
            role === "customer" &&
            userId &&
            mongoose.Types.ObjectId.isValid(userId)
        ) {
            matchStage.userId = new mongoose.Types.ObjectId(userId);
        }

        if (search.trim()) {
            matchStage.$or = [
                {
                    orderId: {
                        $regex: new RegExp(search.trim(), "i"),
                    },
                },
                {
                    "customer.name": {
                        $regex: new RegExp(search.trim(), "i"),
                    },
                },
            ];
        }

        if (status.trim()) {
            matchStage.status = status;
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
            matchStage.orderDate = {
                $gte: new Date(startDate),
            };
        } else if (endDate.trim()) {
            matchStage.orderDate = {
                $lte: new Date(endDate),
            };
        }

        // ============================================
        // COUNTS
        // ============================================
        const totalMatchingOrders = await Order.countDocuments(matchStage);
        const allOrdersCount = await Order.countDocuments();

        // ============================================
        // FETCH DATA
        // ============================================
        const pipeline = [
            {
                $match: matchStage,
            },
            {
                $sort: {
                    createdAt: -1,
                },
            },
            {
                $facet: {
                    data: [
                        {
                            $skip: skip,
                        },
                        {
                            $limit: limit,
                        },
                        {
                            $lookup: {
                                from: "userlogins",
                                localField: "userId",
                                foreignField: "_id",
                                pipeline: [
                                    {
                                        $project: {
                                            _id: 1,
                                            name: 1,
                                            avatar: 1,
                                            image: 1,
                                        },
                                    },
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
                    totalCount: [
                        {
                            $count: "count",
                        },
                    ],
                },
            },
        ];

        const results = await Order.aggregate(pipeline);

        const data = results[0]?.data || [];
        const totalOrders = results[0]?.totalCount[0]?.count || 0;

        console.log(`✅ Returning ${data.length} orders`);

        if (data.length === 0) {
            console.log("⚠️ No orders found.");

            if (role === "customer") {
                console.log("Customer has no orders.");
            } else {
                console.log("No orders in database.");
            }
        }

        // ============================================
        // STATISTICS
        // ============================================
        const stats = await Order.aggregate([
            {
                $match: matchStage,
            },
            {
                $group: {
                    _id: null,
                    totalOrders: {
                        $sum: 1,
                    },
                    totalRevenue: {
                        $sum: "$totals.totalAmount",
                    },
                    totalQuantity: {
                        $sum: "$totals.totalQuantity",
                    },
                    averageAmount: {
                        $avg: "$totals.totalAmount",
                    },
                },
            },
        ]);

        // ============================================
        // STATUS COUNTS
        // ============================================
        const statusCounts = await Order.aggregate([
            {
                $match: matchStage,
            },
            {
                $group: {
                    _id: "$status",
                    count: {
                        $sum: 1,
                    },
                },
            },
        ]);

        // ============================================
        // PAYMENT STATUS COUNTS
        // ============================================
        const paymentStatusCounts = await Order.aggregate([
            {
                $match: matchStage,
            },
            {
                $group: {
                    _id: "$payment.status",
                    count: {
                        $sum: 1,
                    },
                },
            },
        ]);

        // ============================================
        // UNIQUE STATUSES
        // ============================================
        const statuses = await Order.distinct("status", matchStage);

        return res.status(200).json({
            success: true,
            data,
            totalOrders,
            currentPage: page,
            totalPages: Math.ceil(totalOrders / limit),
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

// ======================
// GET TODAY'S ORDERS
// ======================
exports.GetTodaysOrders = AsyncErrorHandler(async (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const orders = await Order.find({
        orderDate: {
            $gte: today,
            $lt: tomorrow
        }
    }).sort({ createdAt: -1 });

    const stats = await Order.aggregate([
        {
            $match: {
                orderDate: {
                    $gte: today,
                    $lt: tomorrow
                }
            }
        },
        {
            $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalRevenue: { $sum: "$totals.totalAmount" },
                totalQuantity: { $sum: "$totals.totalQuantity" },
            }
        }
    ]);

    res.status(200).json({
        status: "success",
        data: orders,
        count: orders.length,
        stats: stats[0] || {
            totalOrders: 0,
            totalRevenue: 0,
            totalQuantity: 0
        }
    });
});

// ======================
// GET ORDER STATISTICS
// ======================
exports.GetOrderStatistics = AsyncErrorHandler(async (req, res) => {
    const { startDate = "", endDate = "" } = req.query;

    const matchStage = {};

    if (startDate.trim() && endDate.trim()) {
        matchStage.orderDate = {
            $gte: new Date(startDate),
            $lte: new Date(endDate),
        };
    } else if (startDate.trim()) {
        matchStage.orderDate = {
            $gte: new Date(startDate),
        };
    } else if (endDate.trim()) {
        matchStage.orderDate = {
            $lte: new Date(endDate),
        };
    }

    // Overall statistics
    const overallStats = await Order.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalRevenue: { $sum: "$totals.totalAmount" },
                totalQuantity: { $sum: "$totals.totalQuantity" },
                averageOrderAmount: { $avg: "$totals.totalAmount" },
            }
        }
    ]);

    // Statistics by status
    const statusStats = await Order.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: "$status",
                count: { $sum: 1 },
                revenue: { $sum: "$totals.totalAmount" },
            }
        }
    ]);

    // Statistics by payment method
    const paymentStats = await Order.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: "$payment.method",
                count: { $sum: 1 },
                totalAmount: { $sum: "$payment.amount" },
            }
        }
    ]);

    // Daily sales (last 7 days or date range)
    const dailySales = await Order.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: {
                    $dateToString: { format: "%Y-%m-%d", date: "$orderDate" }
                },
                count: { $sum: 1 },
                revenue: { $sum: "$totals.totalAmount" },
            }
        },
        { $sort: { _id: 1 } },
        { $limit: 30 }
    ]);

    res.status(200).json({
        status: "success",
        data: {
            overall: overallStats[0] || {
                totalOrders: 0,
                totalRevenue: 0,
                totalQuantity: 0,
                averageOrderAmount: 0
            },
            byStatus: statusStats,
            byPayment: paymentStats,
            dailySales,
        }
    });
});

// ======================
// GET CUSTOMER'S OWN ORDERS
// ======================
exports.GetOrdersByUser = AsyncErrorHandler(async (req, res) => {
    const userId = req.user._id; // Get from auth middleware

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
                        }
                    }
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

// ======================
// GET ORDERS BY DATE RANGE
// ======================
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
        orderDate: {
            $gte: start,
            $lte: end
        }
    }).sort({ orderDate: -1 });

    res.status(200).json({
        status: "success",
        count: orders.length,
        data: orders
    });
});

// ======================
// GET ORDER BY ORDER ID (Custom ID)
// ======================
exports.GetOrderByOrderId = AsyncErrorHandler(async (req, res) => {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId })
        .populate('userId', 'username email')
        .populate('items.foodId', 'name price category description');

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

// ======================
// GET SINGLE ORDER BY ID
// ======================
exports.GetSingleOrder = AsyncErrorHandler(async (req, res) => {
    const order = await Order.findById(req.params.id)
        .populate('userId', 'username email')
        .populate('items.foodId', 'name price category');

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

// ======================
// UPDATE ORDER (FULL UPDATE)
// ======================
exports.UpdateOrder = AsyncErrorHandler(async (req, res) => {
    const orderID = req.params.id;

    // Check if order exists
    const existingOrder = await Order.findById(orderID);
    if (!existingOrder) {
        return res.status(404).json({
            status: "fail",
            message: "Order not found.",
        });
    }

    // Remove fields that shouldn't be updated
    const updateData = { ...req.body };
    delete updateData._id;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    console.log("🔄 Updating order:", updateData);

    const updatedOrder = await Order.findByIdAndUpdate(
        orderID,
        updateData,
        { new: true, runValidators: true }
    );

    res.status(200).json({
        status: "success",
        message: "Order updated successfully.",
        data: updatedOrder,
    });
});

// ======================
// UPDATE ORDER STATUS
// ======================
exports.UpdateOrderStatus = AsyncErrorHandler(async (req, res) => {
    const orderID = req.params.id;
    const { status } = req.body;

    // Check if order exists
    const existingOrder = await Order.findById(orderID);
    if (!existingOrder) {
        return res.status(404).json({
            status: "fail",
            message: "Order not found.",
        });
    }

    // Validate status
    if (!status) {
        return res.status(400).json({
            status: "fail",
            message: "Status is required.",
        });
    }

    const validStatuses = [
        "pending", "accepted", "preparing", "ready",
        "delivering", "completed", "cancelled"
    ];

    if (!validStatuses.includes(status)) {
        return res.status(400).json({
            status: "fail",
            message: `Invalid status. Allowed values: ${validStatuses.join(", ")}`,
        });
    }

    console.log(`🔄 Updating order status to: ${status}`);

    const updatedOrder = await Order.findByIdAndUpdate(
        orderID,
        { status },
        { new: true, runValidators: true }
    );

    res.status(200).json({
        status: "success",
        message: "Order status updated successfully.",
        data: updatedOrder,
    });
});

// ======================
// UPDATE PAYMENT
// ======================
exports.UpdatePayment = AsyncErrorHandler(async (req, res) => {
    const orderID = req.params.id;
    const { method, status, amount, currency } = req.body;

    // Check if order exists
    const existingOrder = await Order.findById(orderID);
    if (!existingOrder) {
        return res.status(404).json({
            status: "fail",
            message: "Order not found.",
        });
    }

    const updateData = {};

    // Validate and set payment method
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

    // Validate and set payment status
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

    // Set amount if provided
    if (amount !== undefined) {
        if (Number(amount) < 0) {
            return res.status(400).json({
                status: "fail",
                message: "Payment amount cannot be negative.",
            });
        }
        updateData["payment.amount"] = Number(amount);
    }

    // Set currency if provided
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

// ======================
// UPDATE DELIVERY
// ======================
exports.UpdateDelivery = AsyncErrorHandler(async (req, res) => {
    const orderID = req.params.id;
    const { status, notes, roomNumber } = req.body;

    // Check if order exists
    const existingOrder = await Order.findById(orderID);
    if (!existingOrder) {
        return res.status(404).json({
            status: "fail",
            message: "Order not found.",
        });
    }

    const updateData = {};

    // Validate and set delivery status
    if (status) {
        const validStatuses = [
            "pending", "preparing", "ready",
            "delivering", "completed", "cancelled"
        ];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                status: "fail",
                message: `Invalid delivery status. Allowed: ${validStatuses.join(", ")}`,
            });
        }
        updateData["delivery.status"] = status;
    }

    // Set notes if provided
    if (notes !== undefined) {
        updateData["delivery.notes"] = notes;
    }

    // Set room number if provided
    if (roomNumber !== undefined) {
        updateData["delivery.roomNumber"] = roomNumber;
        // Also update customer room if provided separately
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

// ======================
// UPDATE CUSTOMER
// ======================
exports.UpdateCustomer = AsyncErrorHandler(async (req, res) => {
    const orderID = req.params.id;
    const { name, room, status, points, checkOut } = req.body;

    // Check if order exists
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
        // Also update delivery room number
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

// ======================
// CANCEL ORDER
// ======================
exports.CancelOrder = AsyncErrorHandler(async (req, res) => {
    const orderID = req.params.id;

    const existingOrder = await Order.findById(orderID);

    if (!existingOrder) {
        return res.status(404).json({
            status: "fail",
            message: "Order not found.",
        });
    }

    // Check if order can be cancelled
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
            "payment.status": "refunded"
        },
        { new: true, runValidators: true }
    );

    res.status(200).json({
        status: "success",
        message: "Order cancelled successfully.",
        data: cancelledOrder,
    });
});

// ======================
// DELETE ORDER
// ======================
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