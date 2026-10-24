const mongoose = require("mongoose");
const accommodation = require("../Models/accommodationSchema");

// ==================== STATUS TRACKING SUB-SCHEMA ====================
const StatusTrackingSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["Pending", "Confirmed", "CheckIn", "CheckedOut"],
      required: true,
    },
    changedAt: {
      type: Date,
      default: Date.now,
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserLoginSchema",
      default: null,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const ActionBookingSchema = new mongoose.Schema({
  bookingNumber: {
    type: String,
    unique: true,
    trim: true,
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "UserLoginSchema",
    required: true,
  },
  approverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "UserLoginSchema",
  },
  unitPrice: {
    type: Number,
    default: 0,
  },
  totalPrice: {
    type: Number,
    default: 0,
  },
  isWeekend: {
    type: Boolean,
    default: false,
  },
  weekdaysPrice: {
    type: Number,
    default: 0,
  },
  weekendPrice: {
    type: Number,
    default: 0,
  },
  weekdaysBreakfastPrice: {
    type: Number,
    default: 0,
  },
  weekendBreakfastPrice: {
    type: Number,
    default: 0,
  },
  setdefault: {
    type: Boolean,
    default: false,
  },

  bookingItemId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: "bookingItemModel",
  },

  bookingItemModel: {
    type: String,
    required: true,
    enum: ["Accommodation", "Service", "Activity", "Rental"],
  },
  status: {
    type: String,
    enum: ["Pending", "Confirmed", "Rejected", "Cancelled", "waiting", "Paid", "CheckedOut", "CheckIn"],
    default: "Pending",
  },

  statusTracking: {
    type: [StatusTrackingSchema],
    default: [],
  },

  isWalkin: {
    type: Boolean,
    default: false,
  },

  isDone: {
    type: Boolean,
    default: false,
  },

  checkIn: {
    type: Date,
    default: Date.now,
  },

  checkOut: {
    type: Date,
    default: null,
  },

  expected_stay: {
    type: Number,
    default: 1,
  },

  created_at: {
    type: Date,
    default: Date.now,
  },
});

// ==================== INDEX: Prevent Duplicate Bookings ====================

ActionBookingSchema.index(
  { customerId: 1, bookingItemId: 1 },
  {
    unique: true,
    name: "unique_customer_bookingItem",
    partialFilterExpression: {
      status: { $in: ["Pending", "Confirmed", "waiting", "Paid"] },
    },
  }
);

// ==================== CONSTANTS ====================

// ✅ Statuses na ise-save sa statusTracking
const TRACKABLE_STATUSES = ["Pending", "Confirmed", "CheckIn", "CheckedOut"];

// ==================== HELPER: Auto-Detect & Push Status ====================

/**
 * Awtomatikong nag-detect at nag-save ng status sa statusTracking.
 * Middleware na ang bahala — hindi mo na kailangan manually i-push.
 */
const autoTrackStatus = (doc, newStatus, changedBy = null, notes = "") => {
  if (!TRACKABLE_STATUSES.includes(newStatus)) return;

  if (!doc.statusTracking) doc.statusTracking = [];

  const lastEntry = doc.statusTracking[doc.statusTracking.length - 1];

  // Iwasan ang duplicate consecutive status
  if (lastEntry && lastEntry.status === newStatus) return;

  doc.statusTracking.push({
    status: newStatus,
    changedAt: new Date(),
    changedBy: changedBy || null,
    notes: notes || `Auto-tracked: ${newStatus}`,
  });
};

// ==================== PRE-VALIDATE HOOK ====================

ActionBookingSchema.pre("validate", function (next) {
  if (!this.bookingNumber) {
    const now = new Date();

    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");

    const random = Math.random()
      .toString(36)
      .substring(2, 7)
      .toUpperCase();

    this.bookingNumber = `BOOK-${yyyy}${mm}${dd}-${random}`;
  }

  if (this.checkIn && this.expected_stay) {
    const checkInDate = new Date(this.checkIn);
    checkInDate.setDate(checkInDate.getDate() + parseInt(this.expected_stay));
    this.checkOut = checkInDate;
  }

  next();
});

// ==================== PRE-SAVE HOOK ====================

ActionBookingSchema.pre("save", async function (next) {
  try {
    // ✅ AUTO-TRACK — bagong document
    if (this.isNew && TRACKABLE_STATUSES.includes(this.status)) {
      autoTrackStatus(this, this.status, this.approverId, "Initial booking");
    }

    // ✅ AUTO-TRACK — kapag na-modify ang status
    if (!this.isNew && this.isModified("status")) {
      autoTrackStatus(
        this,
        this.status,
        this.approverId,
        `Status changed to ${this.status}`
      );
    }

    if (!this.isNew && !this.isModified("customerId") && !this.isModified("bookingItemId")) {
      return next();
    }

    const allowedRebookStatuses = ["Cancelled", "Rejected"];
    if (!this.isNew && allowedRebookStatuses.includes(this.status)) {
      return next();
    }

    if (!this.customerId || !this.bookingItemId) {
      return next();
    }

    const existingBooking = await this.constructor.findOne({
      customerId: this.customerId,
      bookingItemId: this.bookingItemId,
      status: { $in: ["Pending", "Confirmed", "waiting", "Paid"] },
      _id: { $ne: this._id },
    });

    if (existingBooking) {
      const error = new Error(
        `Duplicate booking: Customer already has an active booking for this item ` +
        `(Booking: ${existingBooking.bookingNumber}, Status: ${existingBooking.status})`
      );
      error.name = "DuplicateBookingError";
      error.code = "DUPLICATE_BOOKING";
      error.existingBooking = {
        _id: existingBooking._id,
        bookingNumber: existingBooking.bookingNumber,
        status: existingBooking.status,
        createdAt: existingBooking.created_at,
      };
      return next(error);
    }

    next();
  } catch (error) {
    console.error("❌ [ActionBooking pre-save] Duplicate check error:", error);
    next(error);
  }
});

// ==================== HELPER: Get Accommodation Model ====================

const getAccommodationModel = () => {
  try {
    return mongoose.model("Accommodation");
  } catch (e) {
    try {
      return require("./Accommodation");
    } catch (err) {
      console.warn("⚠️ [ActionBooking] Accommodation model not found");
      return null;
    }
  }
};

const getBillingHistoryModel = () => {
  try {
    return mongoose.model("BillingHistory");
  } catch (e) {
    try {
      return require("./BillingHistory");
    } catch (err) {
      console.warn("⚠️ [ActionBooking] BillingHistory model not found");
      return null;
    }
  }
};

// ==================== HELPER: Set Accommodation Available ====================

const setAccommodationAvailable = async (accommodationId, bookingNumber, status) => {
  const Accommodation = getAccommodationModel();
  if (!Accommodation) return;

  const result = await Accommodation.updateOne(
    {
      _id: accommodationId,
      status: { $nin: ["available", "maintenance"] },
    },
    { $set: { status: "available" } }
  );

  if (result.modifiedCount > 0) {
    console.log(
      `✅ [ActionBooking] Accommodation ${accommodationId} set to "available" (status: ${status})`,
      { bookingNumber }
    );
  }
};

// ==================== HELPER: Set Accommodation Not Available ====================

const setAccommodationNotAvailable = async (accommodationId, bookingNumber, transactionId = null) => {
  const Accommodation = getAccommodationModel();
  if (!Accommodation) return;

  const result = await Accommodation.updateOne(
    {
      _id: accommodationId,
      status: { $nin: ["not available", "maintenance"] },
    },
    { $set: { status: "not available" } }
  );

  if (result.modifiedCount > 0) {
    console.log(
      `✅ [ActionBooking] Accommodation ${accommodationId} set to "not available" (status: Confirmed)`,
      { bookingNumber, transactionId }
    );
  }
};

// ==================== POST-SAVE HOOK ====================

ActionBookingSchema.post("save", async function (doc, next) {
  try {
    if (doc.bookingItemModel !== "Accommodation") return next();
    if (!doc.bookingItemId) return next();

    const accommodationId = doc.bookingItemId.toString();

    const availableStatuses = ["CheckedOut", "Cancelled", "Rejected"];
    if (availableStatuses.includes(doc.status)) {
      await setAccommodationAvailable(accommodationId, doc.bookingNumber, doc.status);
      return next();
    }

    if (doc.status === "Confirmed") {
      const BillingHistory = getBillingHistoryModel();
      if (!BillingHistory) return next();

      const existingBilling = await BillingHistory.findOne({
        "bookings.bookingItemId": accommodationId,
        "bookings.bookingItemModel": "Accommodation",
      }).select("_id transactionId");

      if (existingBilling) {
        await setAccommodationNotAvailable(
          accommodationId,
          doc.bookingNumber,
          existingBilling.transactionId
        );
      }
    }

    next();
  } catch (error) {
    console.error("❌ [ActionBooking post-save] Error:", error);
    next();
  }
});

// ==================== PRE findOneAndUpdate HOOK ====================

ActionBookingSchema.pre("findOneAndUpdate", async function (next) {
  try {
    const update = this.getUpdate();
    const query = this.getQuery();

    // ✅ AUTO-TRACK — kapag may update sa status
    const newStatus = update.status || update.$set?.status;

    if (newStatus && TRACKABLE_STATUSES.includes(newStatus)) {
      const currentDoc = await this.model
        .findOne(query)
        .select("status statusTracking approverId");

      if (currentDoc) {
        const lastEntry =
          currentDoc.statusTracking?.[currentDoc.statusTracking.length - 1];

        // Iwasan ang duplicate consecutive status
        if (!lastEntry || lastEntry.status !== newStatus) {
          const trackingEntry = {
            status: newStatus,
            changedAt: new Date(),
            changedBy: update.approverId || update.$set?.approverId || null,
            notes: `Auto-tracked: ${newStatus}`,
          };

          if (!update.$push) update.$push = {};
          update.$push.statusTracking = trackingEntry;
        }
      }
    }

    const customerId = update.customerId || update.$set?.customerId;
    const bookingItemId = update.bookingItemId || update.$set?.bookingItemId;

    if (!customerId && !bookingItemId) {
      return next();
    }

    const currentDoc = await this.model.findOne(query).select("customerId bookingItemId status _id");

    if (!currentDoc) {
      return next();
    }

    const finalCustomerId = customerId || currentDoc.customerId;
    const finalBookingItemId = bookingItemId || currentDoc.bookingItemId;

    if (!finalCustomerId || !finalBookingItemId) {
      return next();
    }

    const existingBooking = await this.model.findOne({
      customerId: finalCustomerId,
      bookingItemId: finalBookingItemId,
      status: { $in: ["Pending", "Confirmed", "waiting", "Paid"] },
      _id: { $ne: currentDoc._id },
    });

    if (existingBooking) {
      const error = new Error(
        `Duplicate booking: Customer already has an active booking for this item ` +
        `(Booking: ${existingBooking.bookingNumber}, Status: ${existingBooking.status})`
      );
      error.name = "DuplicateBookingError";
      error.code = "DUPLICATE_BOOKING";
      error.existingBooking = {
        _id: existingBooking._id,
        bookingNumber: existingBooking.bookingNumber,
        status: existingBooking.status,
        createdAt: existingBooking.created_at,
      };
      return next(error);
    }

    next();
  } catch (error) {
    console.error("❌ [ActionBooking pre-findOneAndUpdate] Duplicate check error:", error);
    next(error);
  }
});

// ==================== POST findOneAndUpdate HOOK ====================

ActionBookingSchema.post("findOneAndUpdate", async function (doc, next) {
  try {
    if (!doc) return next();
    if (doc.bookingItemModel !== "Accommodation") return next();
    if (!doc.bookingItemId) return next();

    const accommodationId = doc.bookingItemId.toString();

    const availableStatuses = ["CheckedOut", "Cancelled", "Rejected"];
    if (availableStatuses.includes(doc.status)) {
      await setAccommodationAvailable(accommodationId, doc.bookingNumber, doc.status);
      return next();
    }

    if (doc.status === "Confirmed") {
      const BillingHistory = getBillingHistoryModel();
      if (!BillingHistory) return next();

      const existingBilling = await BillingHistory.findOne({
        "bookings.bookingItemId": accommodationId,
        "bookings.bookingItemModel": "Accommodation",
      }).select("_id transactionId");

      if (existingBilling) {
        await setAccommodationNotAvailable(
          accommodationId,
          doc.bookingNumber,
          existingBilling.transactionId
        );
      }
    }

    next();
  } catch (error) {
    console.error("❌ [ActionBooking findOneAndUpdate] Error:", error);
    next();
  }
});

// ==================== STATIC METHOD: Check Duplicate ====================

ActionBookingSchema.statics.checkDuplicate = async function (customerId, bookingItemId, excludeId = null) {
  try {
    if (!customerId || !bookingItemId) {
      return { isDuplicate: false, existingBooking: null };
    }

    const query = {
      customerId,
      bookingItemId,
      status: { $in: ["Pending", "Confirmed", "waiting", "Paid"] },
    };

    if (excludeId) {
      query._id = { $ne: excludeId };
    }

    const existingBooking = await this.findOne(query)
      .select("_id bookingNumber status created_at customerId bookingItemId")
      .lean();

    return {
      isDuplicate: !!existingBooking,
      existingBooking: existingBooking || null,
    };
  } catch (error) {
    console.error("❌ [checkDuplicate] Error:", error);
    throw error;
  }
};

// ==================== STATIC METHOD: Update Status with Tracking ====================

/**
 * I-update ang status at awtomatikong mag-log sa statusTracking.
 */
ActionBookingSchema.statics.updateStatusWithTracking = async function (
  bookingId,
  newStatus,
  changedBy = null,
  notes = ""
) {
  try {
    const booking = await this.findById(bookingId);
    if (!booking) {
      throw new Error("Booking not found");
    }

    booking.status = newStatus;

    if (TRACKABLE_STATUSES.includes(newStatus)) {
      booking.approverId = changedBy || booking.approverId;
      // Ang pre-save hook ay mag-a-add ng tracking entry
    }

    await booking.save();
    return booking;
  } catch (error) {
    console.error("❌ [updateStatusWithTracking] Error:", error);
    throw error;
  }
};

// ==================== STATIC METHOD: Manual Sync (Confirmed → not available) ====================

ActionBookingSchema.statics.syncAccommodationStatus = async function () {
  try {
    const BillingHistory = getBillingHistoryModel();
    const Accommodation = getAccommodationModel();
    if (!BillingHistory || !Accommodation) {
      return { success: false, message: "Required models not found" };
    }

    const actionBookings = await this.find({
      bookingItemModel: "Accommodation",
      status: "Confirmed",
    }).select("bookingItemId bookingNumber status");

    const accommodationIds = new Set();
    actionBookings.forEach((b) => {
      if (b.bookingItemId) {
        accommodationIds.add(b.bookingItemId.toString());
      }
    });

    if (accommodationIds.size === 0) {
      console.log("ℹ️ [syncAccommodationStatus] No confirmed accommodations found");
      return { success: true, updatedCount: 0 };
    }

    const billings = await BillingHistory.find({
      "bookings.bookingItemId": { $in: Array.from(accommodationIds) },
      "bookings.bookingItemModel": "Accommodation",
    }).select("bookings.bookingItemId");

    const accommodationIdsInBilling = new Set();
    billings.forEach((billing) => {
      billing.bookings.forEach((b) => {
        if (
          b.bookingItemModel === "Accommodation" &&
          b.bookingItemId &&
          accommodationIds.has(b.bookingItemId.toString())
        ) {
          accommodationIdsInBilling.add(b.bookingItemId.toString());
        }
      });
    });

    if (accommodationIdsInBilling.size === 0) {
      console.log("ℹ️ [syncAccommodationStatus] No confirmed accommodations in BillingHistory");
      return { success: true, updatedCount: 0 };
    }

    const result = await Accommodation.updateMany(
      {
        _id: { $in: Array.from(accommodationIdsInBilling) },
        status: { $nin: ["not available", "maintenance"] },
      },
      { $set: { status: "not available" } }
    );

    console.log(
      `✅ [syncAccommodationStatus] Updated ${result.modifiedCount}/${accommodationIdsInBilling.size} accommodation(s)`
    );

    return {
      success: true,
      updatedCount: result.modifiedCount,
      totalFound: accommodationIdsInBilling.size,
    };
  } catch (error) {
    console.error("❌ [syncAccommodationStatus] Error:", error);
    throw error;
  }
};

// ==================== STATIC METHOD: Manual Sync (CheckedOut/Cancelled/Rejected → available) ====================

ActionBookingSchema.statics.syncAccommodationToAvailable = async function () {
  try {
    const Accommodation = getAccommodationModel();
    if (!Accommodation) {
      return { success: false, message: "Accommodation model not found" };
    }

    const statusesToSync = ["CheckedOut", "Cancelled", "Rejected"];

    const bookings = await this.find({
      bookingItemModel: "Accommodation",
      status: { $in: statusesToSync },
    }).select("bookingItemId bookingNumber status");

    const accommodationIds = new Set();
    bookings.forEach((b) => {
      if (b.bookingItemId) {
        accommodationIds.add(b.bookingItemId.toString());
      }
    });

    if (accommodationIds.size === 0) {
      console.log("ℹ️ [syncAccommodationToAvailable] No bookings found to sync");
      return { success: true, updatedCount: 0 };
    }

    const result = await Accommodation.updateMany(
      {
        _id: { $in: Array.from(accommodationIds) },
        status: { $nin: ["available", "maintenance"] },
      },
      { $set: { status: "available" } }
    );

    console.log(
      `✅ [syncAccommodationToAvailable] Updated ${result.modifiedCount}/${accommodationIds.size} accommodation(s) to "available"`
    );

    return {
      success: true,
      updatedCount: result.modifiedCount,
      totalFound: accommodationIds.size,
    };
  } catch (error) {
    console.error("❌ [syncAccommodationToAvailable] Error:", error);
    throw error;
  }
};

// ==================== STATIC METHOD: Check if in Billing ====================

ActionBookingSchema.statics.isAccommodationInBilling = async function (accommodationId) {
  try {
    if (!accommodationId) {
      return { isInBilling: false, billingInfo: null };
    }

    const BillingHistory = getBillingHistoryModel();
    if (!BillingHistory) {
      return { isInBilling: false, billingInfo: null };
    }

    const result = await BillingHistory.findOne({
      "bookings.bookingItemId": accommodationId.toString(),
      "bookings.bookingItemModel": "Accommodation",
    }).select("_id transactionId status createdAt");

    return {
      isInBilling: !!result,
      billingInfo: result || null,
    };
  } catch (error) {
    console.error("❌ [isAccommodationInBilling] Error:", error);
    throw error;
  }
};

module.exports = mongoose.model("ActionBooking", ActionBookingSchema);