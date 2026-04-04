const mongoose = require("mongoose");
const serviceSchema = new mongoose.Schema(
  {
    avatar: {
      url: String,
      public_id: String,
    },
    name: String, // Coffee

    price: Number,

    category: {
      type: String,
      enum: ["food", "drink"],
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Service", serviceSchema);
