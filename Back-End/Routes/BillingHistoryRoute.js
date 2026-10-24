// ==================== FILE: Routes/BillingRoutes.js ====================

const express = require("express");
const router = express.Router();
const upload = require("../middleware/fileUploader");

const billingHistoryController = require("../Controller/BillingHistoryController");
const authController = require("../Controller/authController");

// ==================== BILLING HISTORY ROUTES ====================

// Base: list & create
router
  .route("/")
  .get(authController.protect, billingHistoryController.getAllBillingHistory)
  .post(
    authController.protect,
    upload.single("avatar"),
    billingHistoryController.createBillingHistory
  );

// ==================== 📊 ANALYTICS / GRAPH ROUTES ====================
// ⚠️ IMPORTANT: Ilagay ITO BAGO ang "/:id" route,
//    para hindi ma-intercept ng "/:id" ang "/analytics/..." path.

// 📈 Graph 1 — Accommodation revenue trend
router
  .route("/analytics/accommodation")
  .get(authController.protect, billingHistoryController.getAccommodationGraph);

// 🍽️ Graph 2 — Food orders revenue trend
router
  .route("/analytics/food")
  .get(authController.protect, billingHistoryController.getFoodGraph);

// ==================== OTHER ROUTES ====================

// 📊 Statistics (frontend calls: GET /billing/statistics)
router
  .route("/statistics")
  .get(authController.protect, billingHistoryController.getBillingStatistics);

// 📋 Transactions list alias (frontend calls: GET /billing/history)
router
  .route("/history")
  .get(authController.protect, billingHistoryController.getAllBillingHistory);

// 💰 Partial payments
router
  .route("/history/partial-payments")
  .get(authController.protect, billingHistoryController.getPartialPayments);

// 💳 Full payments
router
  .route("/history/full-payments")
  .get(authController.protect, billingHistoryController.getFullPayments);

// ⏳ Pending verification payments
router
  .route("/history/verifyPayment")
  .get(authController.protect, billingHistoryController.getVerifyPayments);

// 📅 Filter by date range
router
  .route("/date-range")
  .get(
    authController.protect,
    billingHistoryController.getBillingHistoryByDateRange
  );

// 🔍 By transaction ID
router
  .route("/transaction/:transactionId")
  .get(
    authController.protect,
    billingHistoryController.getBillingHistoryByTransactionId
  );

// 👤 By user
router
  .route("/user/:userId")
  .get(authController.protect, billingHistoryController.getBillingHistoryByUser);

// 🔄 Update status
router
  .route("/:id/status")
  .put(authController.protect, billingHistoryController.updateBillingStatus);

// 💸 Refund
router
  .route("/:id/refund")
  .post(authController.protect, billingHistoryController.processRefund);

// 📝 Notes
router
  .route("/:id/notes")
  .patch(
    authController.protect,
    upload.single("avatar"),
    billingHistoryController.updateBillingNotes
  );

// ✅ Update payment status
router
  .route("/paymentStatus/:billingId")
  .patch(authController.protect, billingHistoryController.updatePaymentStatus);

// 🗑️ Get by ID / soft delete
router
  .route("/:id")
  .get(authController.protect, billingHistoryController.getBillingHistoryById)
  .delete(authController.protect, billingHistoryController.deleteBillingHistory);

// ❌ Permanent delete
router
  .route("/:id/permanent")
  .delete(
    authController.protect,
    billingHistoryController.permanentlyDeleteBillingHistory
  );

module.exports = router;