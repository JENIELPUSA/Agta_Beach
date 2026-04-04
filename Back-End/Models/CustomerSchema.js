const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema({
  avatar: {
    url: String,
    public_id: String,
  },
  first_name: String,
  last_name: String,
  middle_name: String,
  gender: { type: String, enum: ["Male", "Female"] },
  email: String,
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Customer", customerSchema);
