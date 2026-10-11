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
// PRE-SAVE HOOK
// ✅ HUWAG i-delete ang cart kahit empty
// ======================
CartSchema.pre("save", function (next) {
  // ✅ Walang auto-delete — hayaan lang na empty ang items
  // Ito ay para hindi mag-error sa GET /cartFood/:userId
  if (this.items.length === 0) {
    console.log(`ℹ️ [Cart] Cart ${this._id} is now empty (kept in DB)`);
  }
  next();
});

// ======================
// OPTIONAL: Static method para sa clear
// ======================
CartSchema.statics.clearCartForUser = async function (userId) {
  const cart = await this.findOne({ customerId: userId });
  if (cart) {
    cart.items = [];
    await cart.save();
  }
  return cart;
};

// ======================
// OPTIONAL: Static method para sa get or create
// ======================
CartSchema.statics.getOrCreateCart = async function (userId) {
  let cart = await this.findOne({ customerId: userId });
  if (!cart) {
    cart = await this.create({ customerId: userId, items: [] });
  }
  return cart;
};

module.exports = mongoose.model("CartFood", CartSchema);