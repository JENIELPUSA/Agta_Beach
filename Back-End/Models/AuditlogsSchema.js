const mongoose = require("mongoose");

const AuditTrailSchema = new mongoose.Schema(
  {
    // ============================================================
    //  WHO — actor info
    // ============================================================
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    performedByModel: {
      type: String,
      enum: ["Admin", "Officer", "staff", "Customer", "System"],
      default: "System",
    },
    // ============================================================
    //  WHAT — action details
    // ============================================================
    type: {
      type: String,
      enum: [
        "CREATE",
        "UPDATE",
        "DELETE",
        "ARCHIVE",
        "RESTORE",
        "LOGIN",
        "LOGOUT",
        "REVIEW",
        "APPROVE",
        "REJECT",
        "STATUS_CHANGE",
        "PAYMENT",
        "REFUND",
        "VERIFY",
        "CHECK_IN",
        "CHECK_OUT",
        "UPLOAD",
        "EXPORT",
      ],
      required: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
    },
    module: {
      type: String,
      enum: [
        "Booking",
        "BillingHistory",
        "Food",
        "Accommodation",
        "Rental",
        "Service",
        "User",
        "Auth",
        "Order",
        "Cart",
        "Notification",
        "System",
      ],
      required: true,
    },
    message: {
      type: String,
      trim: true,
    },
    level: {
      type: String,
      enum: ["info", "warning", "error", "critical"],
      default: "info",
    },

    // ============================================================
    //  TARGET — affected resource
    // ============================================================
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    targetModel: {
      type: String,
      trim: true,
    },
    targetLabel: {
      type: String,
      trim: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    // ============================================================
    //  DIFF — before/after snapshots
    // ============================================================
    beforeChange: {
      type: Object,
    },
    afterChange: {
      type: Object,
    },
    changedFields: [
      {
        _id: false,
        field: { type: String },
        from: { type: mongoose.Schema.Types.Mixed },
        to: { type: mongoose.Schema.Types.Mixed },
      },
    ],

    // ============================================================
    //  CONTEXT — request metadata
    // ============================================================
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    method: {
      type: String,
      enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "SYSTEM", ""],
      default: "",
    },
    endpoint: {
      type: String,
      trim: true,
    },
    requestId: {
      type: String,
      trim: true,
    },

    // ============================================================
    //  RESULT
    // ============================================================
    status: {
      type: String,
      enum: ["success", "failure", "partial"],
      default: "success",
    },
    errorMessage: {
      type: String,
      trim: true,
    },

    // ============================================================
    //  EXTRA
    // ============================================================
    metadata: {
      type: Object,
    },

    // ============================================================
    //  RETENTION
    // ============================================================
    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    collection: "audittrails",
  }
);

// Indexes
AuditTrailSchema.index({ performedBy: 1, createdAt: -1 });
AuditTrailSchema.index({ module: 1, type: 1, createdAt: -1 });
AuditTrailSchema.index({ targetId: 1, createdAt: -1 });
AuditTrailSchema.index({ ownerId: 1, createdAt: -1 });
AuditTrailSchema.index({ level: 1, createdAt: -1 });
AuditTrailSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("AuditTrail", AuditTrailSchema);