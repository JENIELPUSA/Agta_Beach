const mongoose = require("mongoose");

const ApproverSchema = new mongoose.Schema({
  avatar: {
    url: String,
    public_id: String,
  },
  first_name: String,
  last_name: String,
  middle_name: String,
  email: String,
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Approver", ApproverSchema);
