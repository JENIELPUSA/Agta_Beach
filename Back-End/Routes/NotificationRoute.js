const express = require("express");
const router = express.Router();

const NotificationController = require("./../Controller/NotificationController");
const authController = require("./../Controller/authController");

// ============================================================
// Collection routes
// ============================================================
router
  .route("/")
  .post(authController.protect, NotificationController.createNotification)
  .get(authController.protect, NotificationController.DisplayNotification);

// ============================================================
// STATIC routes  (dapat MAUNA sa /:id routes)
// ============================================================
router.patch(
  "/mark-all-read",
  authController.protect,
  NotificationController.markAllAsRead
);

router.get(
  "/getByLink/:linkId",
  authController.protect,
  NotificationController.getByLinkId
);

// ============================================================
// DYNAMIC routes  (/:id) — ilagay sa dulo
// ============================================================
router
  .route("/:id")
  .delete(authController.protect, NotificationController.deleteNotification);

router.patch(
  "/:id/mark-read",
  authController.protect,
  NotificationController.markAsRead
);

module.exports = router;