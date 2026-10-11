const mongoose = require("mongoose");

// ======================
// ORDER ITEM SCHEMA
// ======================
const OrderItemSchema = new mongoose.Schema(
    {
        foodId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Food",
            required: true,
        },

        name: {
            type: String,
            required: true,
            trim: true,
        },

        category: {
            type: String,
            required: true,
            trim: true,
        },

        image: {
            type: String,
            required: false,
            trim: true,
            validate: {
                validator: function (v) {
                    return v === "" || /^https?:\/\/.+/.test(v);
                },
                message: props => `${props.value} is not a valid URL!`
            }
        },

        quantity: {
            type: Number,
            required: true,
            min: 1,
        },

        price: {
            type: Number,
            required: true,
            min: 0,
        },

        subtotal: {
            type: Number,
            required: true,
            min: 0,
        },
    },
    { _id: false }
);

// ======================
// CUSTOMER SCHEMA
// ======================
const CustomerSchema = new mongoose.Schema(
    {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "UserLogin",
            required: true,
        },

        name: {
            type: String,
            required: true,
            trim: true,
        },

        room: {
            type: String,
            default: "",
        },

        status: {
            type: String,
            default: "",
        },

        points: {
            type: Number,
            default: 0,
        },

        checkOut: {
            type: String,
            default: "",
        },
    },
    { _id: false }
);

// ======================
// TOTALS SCHEMA
// ======================
const TotalsSchema = new mongoose.Schema(
    {
        totalItems: {
            type: Number,
            default: 0,
        },

        totalQuantity: {
            type: Number,
            default: 0,
        },

        totalAmount: {
            type: Number,
            default: 0,
        },
    },
    { _id: false }
);

// ======================
// PAYMENT SCHEMA
// ======================
const PaymentSchema = new mongoose.Schema(
    {
        method: {
            type: String,
            enum: ["pending", "cash", "gcash", "card"],
            default: "pending",
        },

        status: {
            type: String,
            enum: ["pending", "paid", "failed", "refunded"],
            default: "pending",
        },

        amount: {
            type: Number,
            default: 0,
        },

        currency: {
            type: String,
            default: "PHP",
        },
    },
    { _id: false }
);

// ======================
// STATUS TRACKING SCHEMA (SIMPLIFIED)
// ======================
//  status  → ang status value (pending, processing, for delivery, completed, cancelled)
//  action  → human-readable action (e.g., "Order Placed")
//  date    → kailan nangyari
const StatusTrackingSchema = new mongoose.Schema(
    {
        status: {
            type: String,
            enum: [
                "pending",
                "processing",
                "for delivery",
                "completed",
                "cancelled",
            ],
            required: true,
        },

        action: {
            type: String,
            required: true,
            trim: true,
        },

        date: {
            type: Date,
            default: Date.now,
        },
    },
    { _id: false }
);

// =====================
// ORDER SCHEMA
// ======================
const OrderSchema = new mongoose.Schema(
    {
        orderId: {
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

        orderDate: {
            type: Date,
            default: Date.now,
        },

        status: {
            type: String,
            enum: [
                "pending",
                "processing",
                "for delivery",
                "completed",
                "cancelled",
            ],
            default: "pending",
        },

        //  STATUS TRACKING ARRAY — status, action, date lang
        statusTracking: {
            type: [StatusTrackingSchema],
            default: [],
        },

        customer: {
            type: CustomerSchema,
            required: true,
        },

        items: {
            type: [OrderItemSchema],
            default: [],
        },

        totals: {
            type: TotalsSchema,
            required: true,
        },

        payment: {
            type: PaymentSchema,
            required: true,
        },

        deliveryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Accommodation",
            required: true,
        },

        timestamp: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

// ======================
// STATUS TRACKING MIDDLEWARE
// ======================
// Awtomatikong nag-pupush ng { status, action, date } sa `statusTracking`
OrderSchema.pre("save", function (next) {
    try {
        // CASE 1: Bagong order — i-log ang initial status
        if (this.isNew) {
            this.statusTracking = this.statusTracking || [];
            this.statusTracking.push({
                status: this.status || "pending",
                action: getStatusAction(this.status || "pending"),
                date: new Date(),
            });
            return next();
        }

        // CASE 2: Existing order — check kung nagbago ang status
        const modifiedPaths = this.modifiedPaths();

        if (modifiedPaths.includes("status")) {
            this.statusTracking = this.statusTracking || [];
            this.statusTracking.push({
                status: this.status,
                action: getStatusAction(this.status),
                date: new Date(),
            });
        }

        return next();
    } catch (err) {
        return next(err);
    }
});

// ======================
// HELPER: Human-readable action base sa status
// ======================
function getStatusAction(status) {
    switch (status?.toLowerCase()) {
        case "pending":
            return "Order Placed";
        case "processing":
            return "Order is being processed";
        case "for delivery":
            return "Order is out for delivery";
        case "completed":
            return "Order Completed";
        case "cancelled":
            return "Order Cancelled";
        default:
            return "Status Updated";
    }
}

// ======================
// METHOD: Itakda ang status update
// ======================
// Gamitin ito sa controller bago mag .save():
//   order.setStatusUpdate("processing");
OrderSchema.methods.setStatusUpdate = function (newStatus) {
    this.status = newStatus;
    return this;
};

module.exports = mongoose.model("Order", OrderSchema);