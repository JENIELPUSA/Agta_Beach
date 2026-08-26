const express = require("express");
const router = express.Router();
const OrderController = require("../Controller/OrderController");
const authController = require("./../Controller/authController");

// ======================
// ORDER ROUTES
// ======================

// Checkout - Convert cart to order
router.post(
    "/checkout",
    authController.protect,
    OrderController.checkout
);

// Get all orders (admin)
router.get(
    "/",
    authController.protect,
    OrderController.DisplayOrders
);

// Get today's orders (admin)
router.get(
    "/today",
    authController.protect,
    OrderController.GetTodaysOrders
);

// Get order statistics (admin)
router.get(
    "/stats",
    authController.protect,
    OrderController.GetOrderStatistics
);

// Get customer's own orders
router.get(
    "/my-orders",
    authController.protect,
    OrderController.GetOrdersByUser
);

// Get orders by date range (admin)
router.get(
    "/date-range",
    authController.protect,
    OrderController.GetOrdersByDateRange
);

// ======================
// ORDER BY ORDER ID (Custom ID)
// ======================

// Get order by custom orderId
router.get(
    "/order-id/:orderId",
    authController.protect,
    OrderController.GetOrderByOrderId
);

// ======================
// SINGLE ORDER ROUTES (By MongoDB ID)
// ======================

// Get single order by ID
router.get(
    "/:id",
    authController.protect,
    OrderController.GetSingleOrder
);

// Update order (full update)
router.patch(
    "/:id",
    authController.protect,
    OrderController.UpdateOrder
);

// Update order status (admin)
router.patch(
    "/:id/status",
    authController.protect,
    OrderController.UpdateOrderStatus
);

// Update payment details
router.patch(
    "/:id/payment",
    authController.protect,
    OrderController.UpdatePayment
);

// Update delivery details
router.patch(
    "/:id/delivery",
    authController.protect,
    OrderController.UpdateDelivery
);

// Update customer details
router.patch(
    "/:id/customer",
    authController.protect,
    OrderController.UpdateCustomer
);

// Cancel order
router.patch(
    "/:id/cancel",
    authController.protect,
    OrderController.CancelOrder
);

// Delete order (admin only)
router.delete(
    "/:id",
    authController.protect,
    OrderController.deleteOrder
);

module.exports = router;