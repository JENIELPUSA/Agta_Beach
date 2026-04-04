const mongoose = require("mongoose");
const rentalSchema = new mongoose.Schema(
  {
    avatar: {
      url: String,
      public_id: String,
    },
    name: String, // Small Boat

    price: Number,

    unit: {
      type: String,
    },

    description: String,

    status: {
      type: String,
      enum: ["available", "unavailable"],
      default: "available",
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Rental", rentalSchema);
