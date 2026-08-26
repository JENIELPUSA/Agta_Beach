const express = require("express");
const router = express.Router();
const upload = require("../middleware/fileUploader");

const billingHistoryController = require("../Controller/BillingHistoryController");
const authController = require("../Controller/authController");

// ==================== BILLING HISTORY ROUTES ====================

router
  .route("/")
  .get(authController.protect, billingHistoryController.getAllBillingHistory)
  .post(authController.protect, upload.single("avatar"), billingHistoryController.createBillingHistory);

router
  .route("/stats")
  .get(authController.protect, billingHistoryController.getBillingStatistics);

router
  .route("/history/partial-payments")
  .get(authController.protect, billingHistoryController.getPartialPayments);

router
  .route("/history/full-payments")
  .get(authController.protect, billingHistoryController.getFullPayments);


router
  .route("/date-range")
  .get(authController.protect, billingHistoryController.getBillingHistoryByDateRange);

router
  .route("/transaction/:transactionId")
  .get(authController.protect, billingHistoryController.getBillingHistoryByTransactionId);

router
  .route("/user/:userId")
  .get(authController.protect, billingHistoryController.getBillingHistoryByUser);

router
  .route("/:id/status")
  .put(authController.protect, billingHistoryController.updateBillingStatus);

router
  .route("/:id/refund")
  .post(authController.protect, billingHistoryController.processRefund);

router
  .route("/:id/notes")
  .patch(authController.protect, upload.single("avatar"), billingHistoryController.updateBillingNotes);

router
  .route("/paymentStatus/:billingId")
  .patch(authController.protect, billingHistoryController.updatePaymentStatus);

router
  .route("/:id")
  .get(authController.protect, billingHistoryController.getBillingHistoryById)
  .delete(authController.protect, billingHistoryController.deleteBillingHistory);

router
  .route("/:id/permanent")
  .delete(authController.protect, billingHistoryController.permanentlyDeleteBillingHistory);

router
  .route("/history/verifyPayment")
  .get(authController.protect, billingHistoryController.getVerifyPayments);



module.exports = router;