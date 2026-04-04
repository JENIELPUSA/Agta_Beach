const express = require('express');
const router = express.Router();

const NotificationController = require('./../Controller/NotificationController');
const authController = require('./../Controller/authController');

router
  .route('/')
  .post(authController.protect, NotificationController.createNotification)
  .get(authController.protect, NotificationController.DisplayNotification);

router
  .route('/:id')
  .delete(authController.protect, NotificationController.deleteNotification);
router
  .patch('/:id/mark-read', authController.protect, NotificationController.markAsRead);
router
  .get('/getByLink/:linkId', authController.protect, NotificationController.getByLinkId);

module.exports = router;
