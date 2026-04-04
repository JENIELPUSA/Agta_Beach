const mongoose = require("mongoose");

const accommodationSchema = new mongoose.Schema(
  {
    avatar: {
      url: String,
      public_id: String,
    },
    name: String,
    description: String,
    type: {
      type: String,
      enum: ["cottage", "table", "room", "villa"],
    },
    minCapacity: {
      type: Number,
      required: true,
    },
    maxCapacity: {
      type: Number,
      required: true,
    },
    pricePerDay: Number,
    
    // DITO MO ILALAGAY ANG MGA PROMOS O FREEBIES
    amenities: [
      {
        type: String,
      }
    ],

    status: {
      type: String,
      enum: ["available", "maintenance"],
      default: "available",
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Accommodation", accommodationSchema);