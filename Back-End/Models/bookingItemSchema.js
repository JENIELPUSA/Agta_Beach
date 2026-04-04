const mongoose = require("mongoose");
const bookingItemSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
    },

    itemType: {
      type: String,
      enum: ["accommodation", "rental", "service"],
    },

    accommodation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Accommodation",
    },

    rental: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rental",
    },

    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
    },

    quantity: Number,

    price: Number,
    totalPrice: Number,
  },
  { timestamps: true },
);

module.exports = mongoose.model("BookingItem", bookingItemSchema);
