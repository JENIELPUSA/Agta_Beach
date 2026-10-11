const UserLogin = require("../Models/LogInDentalSchema");
const Admin = require("../Models/AdminSchema");
const Approver = require("../Models/ApproverSchema");
const Customer = require("../Models/CustomerSchema");
const AsyncErrorHandler = require("../Utils/AsyncErrorHandler");
const axios = require("axios");
const mongoose = require("mongoose");
const CustomError = require("../Utils/CustomError");
const jwt = require("jsonwebtoken");
const util = require("util");
const fs = require("fs");
const FormData = require("form-data");
const crypto = require("crypto");
const sendEmail = require("./../Utils/email");
const ActionBooking = require("./../Models/ActionBooking")
const Cart = require("../Models/cartModel")
const signToken = (id, role, linkId) => {
  return jwt.sign({ id, role, linkId }, process.env.SECRET_STR, {
    expiresIn: "12h",
  });
};

exports.signup = AsyncErrorHandler(async (req, res) => {
  try {
    const {
      contact_number,
      first_name,
      last_name,
      middle_name,
      email,
      role,
      gender,
    } = req.body;

    console.log("RequestBody received:", req.body);

    const defaultPassword = "123456789";

    const selectedRole = role ? role.toLowerCase() : "";

    const requiredFieldsByRole = {
      customer: ["first_name", "last_name", "email", "gender"],
      receptionist: ["first_name", "last_name", "email"],
      staff: ["first_name", "last_name", "email"],
      admin: ["first_name", "last_name", "email"],
      user: ["first_name", "last_name", "email"],
    };

    const requiredFields = requiredFieldsByRole[selectedRole];

    if (!requiredFields) {
      return res.status(400).json({
        message:
          "Invalid role provided. Must be 'admin', 'customer', 'receptionist', or 'user'.",
      });
    }

    const missingFields = requiredFields.filter((field) => !req.body[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    const existingUser = await UserLogin.findOne({ username: email });

    if (existingUser) {
      return res.status(400).json({
        message: "User with this email already exists!",
      });
    }

    let avatar = { url: "", public_id: "" };

    if (req.file) {
      const fileName = req.file.filename;
      const form = new FormData();

      form.append(
        "file",
        fs.createReadStream(req.file.path),
        req.file.originalname,
      );

      try {
        const response = await axios.post(process.env.UPLOAD_URL, form, {
          maxBodyLength: Infinity,
          headers: { "Content-Type": "multipart/form-data" },
        });

        if (response.data.success) {
          avatar = {
            url: response.data.url,
            public_id: fileName,
          };

          fs.unlink(req.file.path, (err) => {
            if (err) console.error("Failed to delete temp file:", err);
          });
        }
      } catch (err) {
        console.error("❌ Upload failed:", err.message);
      }
    }

    let linkedRecord;

    if (selectedRole === "customer") {
      // 👉 Customer Schema
      linkedRecord = await Customer.create({
        avatar,
        first_name,
        last_name,
        middle_name,
        email,
        gender,
        contact_number,
      });
    } else if (selectedRole === "admin" || selectedRole === "receptionist" || selectedRole === "staff") {
      linkedRecord = await Admin.create({
        avatar,
        first_name,
        last_name,
        middle_name,
        email,
        gender,
        contact_number,
      });
    } else {
      linkedRecord = await Admin.create({
        avatar,
        first_name,
        last_name,
        middle_name,
        email,
        gender,
        contact_number,
      });
    }

    const newUserLogin = await UserLogin.create({
      avatar,
      username: email,
      contact_number,
      password: defaultPassword,
      confirmPassword: defaultPassword,
      role: selectedRole,
      linkedId: linkedRecord._id,
      isVerified: true,
    });

    try {
      await sendEmail({
        email,
        subject: "Your Account Credentials",
        text: `Welcome to the system!

Your account has been created successfully.

Username: ${email}
Default Password: ${defaultPassword}

Please change your password after logging in.`,
      });
    } catch (err) {
      console.error("❌ Failed to send signup email:", err.message);
    }

    const io = req.app.get("io");
    if (io) {
      io.emit("newUserSignup", {
        user: {
          id: newUserLogin._id,
          first_name,
          last_name,
          role: selectedRole,
        },
        profile: linkedRecord,
      });
    }

    res.status(201).json({
      status: "Success",
      message: "User created successfully",
      user: newUserLogin,
      profile: linkedRecord,
    });
  } catch (error) {
    console.error("❌ Signup failed:", error);
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
});

exports.logout = AsyncErrorHandler((req, res, next) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).send("Logout failed.");
    res.clearCookie("connect.sid");
    res.send("Logged out successfully!");
  });
});

exports.verifyOtp = AsyncErrorHandler(async (req, res, next) => {
  const { otp, userId } = req.body;

  if (!otp || !userId) {
    return res.status(400).json({
      message: "Both OTP and userId are required.",
    });
  }

  const user = await UserLogin.findById(userId);

  if (!user) {
    return res.status(400).json({ message: "User not found" });
  }

  if (user.isVerified) {
    return res.status(400).json({ message: "User is already verified" });
  }
  if (user.otp !== otp || user.otpExpiresAt < Date.now()) {
    return res.status(400).json({ message: "Invalid or expired OTP" });
  }
  user.isVerified = true;
  user.otp = undefined;
  user.otpExpiresAt = undefined;
  await user.save();

  return res.status(200).json({
    message: "Email Verified Successfully",
    data: {
      _id: user._id,
      username: user.username,
      role: user.role,
      isVerified: user.isVerified,
    },
  });
});

exports.login = AsyncErrorHandler(async (req, res, next) => {
  const { email, password, orderData } = req.body;

  console.log("orderData", orderData);

  const user = await UserLogin.findOne({ username: email }).select("+password");

  if (!user || !(await user.comparePasswordInDb(password, user.password))) {
    return next(new CustomError("Incorrect email or password", 400));
  }

  if (!user.isVerified) {
    return res.status(401).json({
      message: "Please verify your email address before logging in.",
    });
  }

  let linkId = user.linkedId || user._id;
  let zone = user.Designatedzone;

  if (user.role === "patient") {
    const patient = await Patient.findOne({ user_id: user._id });
    if (patient) {
      linkId = patient._id;
      zone = patient.zone;
    }
  }

  const token = signToken(user._id, user.role, linkId);

  req.session.userId = user._id;
  req.session.isLoggedIn = true;
  req.session.user = {
    email: user.username,
    first_name: user.first_name,
    last_name: user.last_name,
    role: user.role,
    Designatedzone: zone,
    linkId,
  };

  // ======================
  // SAVE ORDER DATA TO CART ONLY
  // ======================
  let savedCart = null;
  let errors = [];

  if (orderData && orderData.items && orderData.items.length > 0) {
    try {
      console.log("📦 Processing cart data from login...");

      // Import models
      const Cart = require("../Models/cartModel");
      const Food = require("../Models/FoodSchema");

      // Validate food items and create cart items
      const cartItems = [];
      errors = [];

      for (const item of orderData.items) {
        try {
          const foodId = item.foodId || item.id;
          const food = await Food.findById(foodId);

          if (!food) {
            errors.push({
              foodId: foodId,
              error: `Food with ID ${foodId} not found.`,
            });
            continue;
          }

          if (food.status && food.status.toLowerCase() !== "available") {
            errors.push({
              foodId: foodId,
              name: food.name,
              error: `Food "${food.name}" is not available.`,
            });
            continue;
          }

          const quantity = item.quantity || 1;
          if (food.stock !== undefined && food.stock !== null && food.stock < quantity) {
            errors.push({
              foodId: foodId,
              name: food.name,
              error: `Insufficient stock for "${food.name}". Available: ${food.stock}`,
            });
            continue;
          }

          cartItems.push({
            foodId: food._id,
            quantity: quantity,
          });

          // Deduct stock
          if (food.stock !== undefined) {
            food.stock -= quantity;
            await food.save();
          }
        } catch (error) {
          errors.push({
            foodId: item.foodId || item.id,
            error: error.message,
          });
        }
      }

      if (cartItems.length > 0) {
        // ======================
        // SAVE TO CART (WITH DUPLICATE HANDLING)
        // ======================
        let cart;

        // Check for existing cart
        const existingCart = await Cart.findOne({ customerId: user._id });

        if (existingCart) {
          console.log(`🔄 Found existing cart, updating...`);

          // Check if existing cart has items
          if (existingCart.items && existingCart.items.length > 0) {
            // Merge items - add new items or update quantities
            for (const newItem of cartItems) {
              const existingItemIndex = existingCart.items.findIndex(
                item => item.foodId.toString() === newItem.foodId.toString()
              );

              if (existingItemIndex !== -1) {
                // Update quantity of existing item
                existingCart.items[existingItemIndex].quantity += newItem.quantity;
              } else {
                // Add new item
                existingCart.items.push(newItem);
              }
            }
          } else {
            // Replace empty items with new items
            existingCart.items = cartItems;
          }

          // Update timestamps
          existingCart.created_at = new Date();

          cart = existingCart;
          await cart.save();
          console.log(" Cart updated successfully");
        } else {
          // No existing cart - create new one
          console.log("🆕 Creating new cart for user:", user._id);
          cart = new Cart({
            customerId: user._id,
            items: cartItems,
            created_at: new Date(),
          });
          await cart.save();
          console.log(" New cart created successfully");
        }

        // Get populated cart for response
        const populatedCart = await Cart.findOne({ customerId: user._id })
          .populate('items.foodId', 'name price image category');

        savedCart = {
          _id: populatedCart._id,
          items: populatedCart.items.map(item => ({
            foodId: item.foodId._id,
            name: item.foodId.name,
            price: item.foodId.price,
            image: item.foodId.image || '',
            category: item.foodId.category || '',
            quantity: item.quantity,
          })),
          totalItems: populatedCart.items.reduce((sum, item) => sum + item.quantity, 0),
          totalPrice: populatedCart.items.reduce((sum, item) => sum + (item.foodId.price * item.quantity), 0),
        };

        console.log(" Cart saved during login:", savedCart);

        // Log any errors (non-blocking)
        if (errors.length > 0) {
          console.warn("⚠️ Cart creation warnings:", errors);
        }
      } else {
        console.warn("⚠️ No valid items in order data, cart not created.");
      }
    } catch (error) {
      console.error("❌ Failed to process cart during login:", error);
      // Don't block login, just log the error
    }
  }

  // ======================
  // RETURN RESPONSE
  // ======================
  return res.status(200).json({
    status: "Success",
    userId: user._id,
    linkId,
    role: user.role,
    token,
    email: user.username,
    Designatedzone: zone,
    first_name: user.first_name,
    last_name: user.last_name,
    // Include cart data if created
    ...(savedCart && { cart: savedCart }),
    // Include errors if any (non-blocking)
    ...(orderData && orderData.items && orderData.items.length > 0 && {
      cartWarnings: errors || []
    }),
  });
});

exports.protect = AsyncErrorHandler(async (req, res, next) => {
  // 1. Check if user is logged in via session
  if (req.session && req.session.isLoggedIn && req.session.user) {
    req.user = req.session.user;
    return next();
  }

  // 2. If no session, fallback to token (JWT) authentication
  const authHeader = req.headers.authorization;
  let token;

  if (authHeader && authHeader.startsWith("Bearer")) {
    token = authHeader.split(" ")[1];
  }

  if (!token) {
    return next(new CustomError("You are not logged in!", 401));
  }

  // 3. Verify JWT token
  const decoded = await util.promisify(jwt.verify)(
    token,
    process.env.SECRET_STR
  );

  const user = await UserLogin.findById(decoded.id);
  if (!user) {
    return next(new CustomError("User no longer exists", 401));
  }

  // 4. Check if password changed after token was issued
  const isPasswordChanged = await user.isPasswordChanged(decoded.iat);
  if (isPasswordChanged) {
    return next(new CustomError("Password changed. Login again.", 401));
  }

  // 5. Set linkedId and assign user to req.user
  const linkId = user.linkedId;

  req.user = {
    _id: user._id,
    email: user.username,
    role: user.role,
    first_name: user.first_name,
    last_name: user.last_name,
    linkId,
  };

  next();
});

exports.restrict = (role) => {
  return (req, res, next) => {
    if (!req.session?.isLoggedIn || req.session.user.role !== role) {
      return res
        .status(403)
        .json({ message: `Access denied. Role required: ${role}` });
    }
    next();
  };
};

exports.forgotPassword = AsyncErrorHandler(async (req, res, next) => {
  const { email } = req.body;

  // 🔁 Look for the user by username (which stores email in your case)
  const user = await UserLogin.findOne({ username: email });

  // If user doesn't exist, return 404
  if (!user) {
    return next(
      new CustomError("We could  not find the user with given email", 404),
    );
  }

  // Generate a password reset token
  const resetToken = user.createResetTokenPassword();
  await user.save({ validateBeforeSave: false });

  // Generate reset URL
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
  const message = `We have received a password reset request. Please use the below link to reset your password:\n\n${resetUrl}\n\nThis link will expire in 10 minutes.`;

  try {
    // Send password reset email
    await sendEmail({
      email: user.username, // use username field since it holds the email
      subject: "Password change request received",
      text: message,
    });

    // Respond with success
    res.status(200).json({
      status: "Success",
      message: "Password reset link sent to the user email",
    });
  } catch (err) {
    // Clean up if sending fails
    user.passwordResetToken = undefined;
    user.passwordResetTokenExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(
      new CustomError(
        "There was an error sending password reset email. Please try again later",
        500,
      ),
    );
  }
});

exports.resetPassword = AsyncErrorHandler(async (req, res, next) => {
  const hashedToken = crypto
    .createHash("sha256")
    .update(req.params.token)
    .digest("hex");

  const user = await UserLogin.findOne({
    passwordResetToken: hashedToken,
    passwordResetTokenExpires: { $gt: Date.now() },
  });

  if (!user) {
    return next(new CustomError("Invalid or expired token.", 400));
  }

  user.password = req.body.password;
  user.passwordResetToken = undefined;
  user.passwordResetTokenExpires = undefined;
  user.passwordChangedAt = Date.now();
  await user.save();

  return res.status(200).json({
    status: "Success",
  });
});

exports.updatePassword = AsyncErrorHandler(async (req, res, next) => {
  const user = await UserLogin.findById(req.user._id).select("+password");

  if (!user) {
    return next(new CustomError("User not found.", 404));
  }

  const isMatch = await user.comparePasswordInDb(
    req.body.currentPassword,
    user.password,
  );
  if (!isMatch) {
    return next(
      new CustomError("The current password you provided is wrong", 401),
    );
  }

  user.password = req.body.password;
  user.confirmPassword = req.body.confirmPassword;
  await user.save();

  const token = signToken(user._id);
  res.status(200).json({
    status: "success",
    token,
    data: {
      user,
    },
  });
});



exports.setdefaultlocation = AsyncErrorHandler(async (req, res, next) => {
  // ============================================================
  // 1. Kunin ang ActionBooking _id mula sa URL param
  // ============================================================
  const id = req.params.id;

  // ============================================================
  // 2. Kunin ang linkId mula sa context
  // ============================================================
  const linkId = req.user.linkId;

  // ============================================================
  // 3. Validate: Kailangan meron ang id
  // ============================================================
  if (!id) {
    return next(
      new CustomError("Please provide a location ID in the URL.", 400)
    );
  }

  // ============================================================
  // 4. Validate: Tamang MongoDB ObjectId ba?
  // ============================================================
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new CustomError("Invalid location ID format.", 400));
  }

  // ============================================================
  // 5. Validate: linkId
  // ============================================================
  if (!linkId) {
    return next(new CustomError("User not authenticated.", 401));
  }

  if (!mongoose.Types.ObjectId.isValid(linkId)) {
    return next(new CustomError("Invalid user link ID format.", 400));
  }

  // ============================================================
  // 6. Hanapin ang UserLogin gamit ang linkedId
  // ============================================================
  const user = await UserLogin.findOne({ linkedId: linkId });

  if (!user) {
    return next(
      new CustomError("User account not found for this link ID.", 404)
    );
  }

  // ============================================================
  // 7. Hanapin ang ActionBooking at i-validate
  // ============================================================
  const booking = await ActionBooking.findById(id);

  if (!booking) {
    return next(new CustomError("Booking not found.", 404));
  }

  // ============================================================
  // 8. Verify ownership
  // ============================================================
  if (String(booking.customerId) !== String(user._id)) {
    return next(
      new CustomError("This booking does not belong to you.", 403)
    );
  }

  // ============================================================
  // 9. Validate: Accommodation lang ang pwedeng maging default location
  // ============================================================
  if (booking.bookingItemModel !== "Accommodation") {
    return next(
      new CustomError(
        "Only Accommodation bookings can be set as default location.",
        400
      )
    );
  }

  // ============================================================
  // 10. ✅ Validate: Active status lang
  //     UPDATED: CheckIn na (dati: Confirmed)
  // ============================================================
  const activeStatuses = ["Pending", "CheckIn", "waiting", "Paid"];

  if (!activeStatuses.includes(booking.status)) {
    return next(
      new CustomError(
        `Cannot set default: booking status is "${booking.status}". ` +
        `Only active bookings can be set as default.`,
        400
      )
    );
  }

  // ============================================================
  // 11. ✅ Validate: Hindi pa tapos (isDone)
  // ============================================================
  if (booking.isDone) {
    return next(
      new CustomError("Cannot set default: booking is already done.", 400)
    );
  }

  // ============================================================
  // 12. ✅ I-UNSET ang lahat ng existing setdefault: true ng user
  //     (para isa lang ang default)
  // ============================================================
  await ActionBooking.updateMany(
    {
      customerId: user._id,
      _id: { $ne: booking._id },      // ✅ Huwag galawin ang bagong default
      setdefault: true,               // ✅ Yung may default lang
    },
    {
      $set: { setdefault: false },
    }
  );

  // ============================================================
  // 13. ✅ I-SET ang bagong default sa ActionBooking
  // ============================================================
  const updatedBooking = await ActionBooking.findByIdAndUpdate(
    booking._id,
    {
      $set: {
        setdefault: true,
        updatedAt: Date.now(),
      },
    },
    {
      new: true,
      runValidators: true,
    }
  );

  if (!updatedBooking) {
    return next(new CustomError("Failed to update booking.", 500));
  }

  console.log(
    "✅ [setdefaultlocation] Default set on booking:",
    updatedBooking.bookingNumber
  );

  // ============================================================
  // 14. Return success
  // ============================================================
  res.status(200).json({
    success: true,
    message: "Default location set successfully.",
    action: "set",
    data: {
      isdefaultlocation: {
        _id: updatedBooking._id,
        bookingNumber: updatedBooking.bookingNumber,
        bookingItemId: updatedBooking.bookingItemId,
        bookingItemModel: updatedBooking.bookingItemModel,
        status: updatedBooking.status,
        setdefault: updatedBooking.setdefault,
      },
    },
  });
});


// ======================
// GET DEFAULT LOCATION (Using $lookup)
// ======================
exports.Getdefaultlocation = AsyncErrorHandler(async (req, res, next) => {
  const linkId = req.user.linkId;

  console.log("🔍 [Getdefaultlocation] linkId:", linkId);

  if (!linkId) {
    return next(new CustomError("User not authenticated.", 401));
  }

  if (!mongoose.Types.ObjectId.isValid(linkId)) {
    return next(new CustomError("Invalid user link ID format.", 400));
  }

  // ============================================================
  // ✅ AGGREGATION with $lookup
  // ============================================================
  const result = await UserLogin.aggregate([
    // ✅ 1. Hanapin ang user via linkedId
    {
      $match: {
        linkedId: new mongoose.Types.ObjectId(linkId),
      },
    },

    // ✅ 2. $lookup — i-join ang ActionBooking via isdefaultlocation
    {
      $lookup: {
        from: "actionbookings",              // ✅ collection name (lowercase + plural)
        localField: "isdefaultlocation",     // field sa UserLogin
        foreignField: "_id",                 // field sa ActionBooking
        as: "defaultLocationData",           // output array
      },
    },

    // ✅ 3. Kunin ang unang item mula sa array (or null)
    {
      $unwind: {
        path: "$defaultLocationData",
        preserveNullAndEmptyArrays: true,   // ✅ keep user kahit walang match
      },
    },

    // ✅ 4. Project — id + locationName lang
    {
      $project: {
        _id: 0,
        isdefaultlocation: {
          $cond: {
            if: { $ifNull: ["$defaultLocationData._id", null] },
            then: {
              id: "$defaultLocationData._id",
              locationName: {
                $ifNull: [
                  "$defaultLocationData.accommodationName",
                  {
                    $ifNull: [
                      "$defaultLocationData.bookingNumber",
                      "Unknown Location",
                    ],
                  },
                ],
              },
            },
            else: null,   // ✅ null kapag walang default
          },
        },
      },
    },
  ]);

  console.log("🔍 [Getdefaultlocation] aggregation result:", result);

  // ✅ Kung walang user
  if (!result || result.length === 0) {
    return next(new CustomError("User not found.", 404));
  }

  const displayData = result[0].isdefaultlocation;

  console.log("✅ [Getdefaultlocation] Display data:", displayData);

  // ✅ 5. Return success
  res.status(200).json({
    status: "success",
    data: {
      isdefaultlocation: displayData,
    },
  });
});
