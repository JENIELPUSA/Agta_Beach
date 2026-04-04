const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
    },

    amount: Number,

    method: {
      type: String,
      enum: ["gcash", "paymaya", "bank", "cash"],
    },

    status: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },

    transactionId: String,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Payment", paymentSchema);
