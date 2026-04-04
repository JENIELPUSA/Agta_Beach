const mongoose = require("mongoose");

const AdminSchema = new mongoose.Schema({
avatar: {
    url: String,
    public_id: String,
  },
  first_name: String,
  last_name: String,
  middle_name: String,
  gender: { type: String, enum: ["Male", "Female"] },
  contact_number: String,
   email: {
    type: String,
    required: true,
    unique: true, 
    trim: true 
  },
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Admin", AdminSchema);
