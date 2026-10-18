const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const UserLoginSchema = new mongoose.Schema(
  {
    avatar: {
      url: String,
      public_id: String,
    },
    first_name: { type: String, trim: true },
    middle_name: { type: String, trim: true },      // ✅ BAGO
    last_name: { type: String, trim: true },
    suffix: { type: String, trim: true },           // ✅ BAGO
    contact_number: { type: String, trim: true },   // ✅ String (para sa leading 0)

    email: {                                          // ✅ BAGO
      type: String,
      required: false,      // gawing false muna para hindi mag-break sa existing data
      unique: true,
      sparse: true,         // ✅ para hindi mag-error sa null emails
      lowercase: true,
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return true;
          return validator.isEmail(v);
        },
        message: "Please provide a valid email",
      },
    },

    username: { type: String, unique: true, sparse: true, trim: true },

    password: {
      type: String,
      required: [true, "Please provide a password"],
      minlength: 6,
      select: false,                                  // ✅ hindi lalabas sa queries by default
    },

    // ✅ FIXED: confirmPassword — walang required, === ang validator
    confirmPassword: {
      type: String,
      // ❌ TINANGGAL ang `require`/`required` — hindi na kailangan
      validate: {
        validator: function (val) {
          if (!val) return true;                      // ✅ skip kung walang value
          return val === this.password;               // ✅ === hindi =
        },
        message: "Password & Confirm Password do not match",
      },
    },

    role: {
      type: String,
      enum: ["admin", "user", "receptionist", "customer", "staff"],
      required: true,
      lowercase: true,
    },

    isdefaultlocation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Accommodation",
    },

    isVerified: { type: Boolean, default: false },

    linkedId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "role",
    },

    theme: {
      type: String,
      enum: ["light", "dark"],
      default: "light",
    },

    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetTokenExpires: Date,
  },
  { timestamps: true }   // ✅ auto createdAt + updatedAt
);

// ============================================================
// ✅ ISA LANG ANG PRE-SAVE HOOK — nagha-hash ng password
// ============================================================
UserLoginSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  this.password = await bcrypt.hash(this.password, 12);
  this.confirmPassword = undefined;

  // ✅ I-update ang passwordChangedAt
  this.passwordChangedAt = Date.now() - 1000;

  next();
});

// ❌ TANGGALIN ANG PANGALAWANG HOOK (Guest condition) — buggy at wala naman sa enum

// ============================================================
// METHODS
// ============================================================
UserLoginSchema.methods.comparePasswordInDb = async function (pswd, pswdDB) {
  return await bcrypt.compare(pswd, pswdDB);
};

UserLoginSchema.methods.isPasswordChanged = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const pswdChangedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10
    );
    return JWTTimestamp < pswdChangedTimestamp;
  }
  return false;
};

UserLoginSchema.methods.createResetTokenPassword = function () {
  const resetToken = crypto.randomBytes(32).toString("hex");

  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  this.passwordResetTokenExpires = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

module.exports = mongoose.model("UserLoginSchema", UserLoginSchema);