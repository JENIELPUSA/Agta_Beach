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
// DELIVERY SCHEMA
// ======================
const DeliverySchema = new mongoose.Schema(
    {
        roomNumber: {
            type: String,
            required: true,
        },

        status: {
            type: String,
            enum: [
                "pending",
                "preparing",
                "ready", "processing", "shipped", "delivered",
                "delivering",
                "completed",
                "cancelled",
            ],
            default: "pending",
        },

        notes: {
            type: String,
            default: "",
        },
    },
    { _id: false }
);

// ======================
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
                "accepted",
                "preparing",
                "ready",
                "delivering",
                "completed",
                "cancelled",
            ],
            default: "pending",
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

        delivery: {
            type: DeliverySchema,
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

module.exports = mongoose.model("Order", OrderSchema);