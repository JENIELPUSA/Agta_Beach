const mongoose = require("mongoose");

// ======================
// BILL ITEM SCHEMA
// ======================
const BillItemSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ["Order", "Booking"],
            required: true,
        },

        referenceId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },

        referenceNo: {
            type: String,
            required: true,
            trim: true,
        },

        amount: {
            type: Number,
            required: true,
            default: 0,
        },

        status: {
            type: String,
            default: "Pending",
        },
    },
    { _id: false }
);

// ======================
// BILL SCHEMA
// ======================
const BillSchema = new mongoose.Schema(
    {
        billNo: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },

        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "UserLogin",
            required: true,
        },

        customer: {
            id: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "UserLogin",
            },

            name: {
                type: String,
                required: true,
            },

            room: {
                type: String,
                default: "",
            },
        },

        // Orders & Bookings
        items: {
            type: [BillItemSchema],
            default: [],
        },

        totalOrderAmount: {
            type: Number,
            default: 0,
        },

        totalBookingAmount: {
            type: Number,
            default: 0,
        },

        grandTotal: {
            type: Number,
            default: 0,
        },

        // Payment
        paymentMethod: {
            type: String,
            enum: [
                "Cash",
                "GCash",
                "Bank Transfer",
                "Credit Card",
                "Debit Card",
                "Pending",
            ],
            default: "Pending",
        },

        paymentStatus: {
            type: String,
            enum: [
                "Pending",
                "Paid",
                "Partial",
                "Cancelled",
                "Refunded",
            ],
            default: "Pending",
        },

        referenceNumber: {
            type: String,
            default: "",
            trim: true,
        },

        receiptImage: {
            type: String,
            default: "",
        },

        remarks: {
            type: String,
            default: "",
        },

        paidAt: {
            type: Date,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

// Auto Compute Totals
BillSchema.pre("save", function (next) {
    this.grandTotal =
        Number(this.totalOrderAmount || 0) +
        Number(this.totalBookingAmount || 0);

    next();
});

module.exports = mongoose.model("Bill", BillSchema);