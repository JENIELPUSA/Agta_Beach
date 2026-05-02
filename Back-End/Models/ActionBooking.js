const mongoose = require("mongoose");

const ActionBookingSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "UserLoginSchema",
    required: true,
  },

  approverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "UserLoginSchema",
  },

  bookingItemId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: "bookingItemModel",
  },

  bookingItemModel: {
    type: String,
    required: true,
    enum: ["Accommodation", "Service", "Activity","Rental"],
  },

  status: {
    type: String,
    enum: ["Pending", "Confirmed", "Rejected", "Cancelled","waiting"],
    default: "Pending",
  },
  isDone: {
    type: Boolean,
    default: false,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("ActionBooking", ActionBookingSchema);