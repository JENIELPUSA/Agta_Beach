const mongoose = require("mongoose");

const CartItemSchema = new mongoose.Schema({
  foodId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Food",
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1,
  },
});

const CartSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  items: [CartItemSchema],
  created_at: { type: Date, default: Date.now },
});

// ======================
// AUTO DELETE IF ITEMS EMPTY
// ======================
CartSchema.pre("save", async function (next) {
  try {
    // Check if items array is empty
    if (this.items.length === 0) {
      // If document already exists in DB, delete it
      if (!this.isNew) {
        await this.constructor.findByIdAndDelete(this._id);
      }

      // Stop saving
      return next(new Error("Cart deleted because it has no items."));
    }

    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model("CartFood", CartSchema);