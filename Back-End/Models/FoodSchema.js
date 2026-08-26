const mongoose = require("mongoose");

const foodSchema = new mongoose.Schema(
    {
        avatar: {
            url: {
                type: String,
                default: "",
            },
            public_id: {
                type: String,
                default: "",
            },
        },

        name: {
            type: String,
            required: [true, "Food name is required"],
            trim: true,
        },
        category: {
            type: String,
            required: [true, "Category name is required"],
            trim: true,
        },

        price: {
            type: Number,
            required: [true, "Price is required"],
            min: [0, "Price cannot be negative"],
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("Food", foodSchema);