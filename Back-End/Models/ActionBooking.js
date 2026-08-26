const mongoose = require("mongoose");
const { boolean } = require("webidl-conversions");

const ActionBookingSchema = new mongoose.Schema({
  bookingNumber: {
    type: String,
    unique: true,
    trim: true,
  },

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
    enum: ["Accommodation", "Service", "Activity", "Rental"],
  },

  status: {
    type: String,
    enum: ["Pending", "Confirmed", "Rejected", "Cancelled", "waiting","Paid"],
    default: "Pending",
  },
  isWalkin: {
    type: Boolean,
    default: false
  },
  isDone: {
    type: Boolean,
    default: false,
  },
  expected_stay: {
    type: Number,
    default: 1
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});


ActionBookingSchema.pre("validate", function (next) {
  if (!this.bookingNumber) {
    const now = new Date();

    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");

    const random = Math.random()
      .toString(36)
      .substring(2, 7)
      .toUpperCase();

    this.bookingNumber = `BOOK-${yyyy}${mm}${dd}-${random}`;
  }

  next();
});

module.exports = mongoose.model("ActionBooking", ActionBookingSchema);