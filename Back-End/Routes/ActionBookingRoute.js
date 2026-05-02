const express = require("express");
const router = express.Router();

const actionBookingController = require("../Controller/actionbookingcontroller");
const authController = require("../Controller/authController");

router
  .route("/")
  .get(authController.protect, actionBookingController.getAllBookings)
  .post(authController.protect, actionBookingController.createBooking);

router
  .route("/:id")
  .get(authController.protect, actionBookingController.getSingleBooking)
  .patch(authController.protect, actionBookingController.updateBookingStatus)
  .delete(authController.protect, actionBookingController.deleteBooking);

module.exports = router;