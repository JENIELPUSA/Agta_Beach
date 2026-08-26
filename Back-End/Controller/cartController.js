const AsyncErrorHandler = require("../Utils/AsyncErrorHandler");
const Cart = require("../Models/cartModel");
const Food = require("../Models/FoodSchema");

// Helper function para makuha ang ID ng authenticated user
const getUserId = (req) => {
    return req.user?._id || req.user?.id || req.user?.linkId || req.user?.userId;
};

// ======================
// GET USER CART
// ======================
const UserLogin = require("../Models/LogInDentalSchema")
// ======================
// GET USER CART - SIMPLIFIED
// ======================
exports.getCart = AsyncErrorHandler(async (req, res) => {
    try {
        const { linkId } = req.params;

        console.log("🔍 Get Cart - linkId:", linkId);

        if (!linkId) {
            return res.status(400).json({
                success: false,
                message: "Link ID is required.",
            });
        }

        // Hanapin ang UserLogin gamit ang linkedId
        const loginUser = await UserLogin.findOne({
            linkedId: linkId,
        }).select("_id");

        if (!loginUser) {
            return res.status(404).json({
                success: false,
                message: "User account not found.",
            });
        }

        // Hanapin ang cart gamit ang customerId
        let cart = await Cart.findOne({ 
            customerId: loginUser._id 
        })
        .populate({
            path: 'items.foodId',
            model: 'Food',
            select: 'name category price avatar description'
        });

        // Kung walang cart, gumawa ng bagong empty cart
        if (!cart) {
            const newCart = await Cart.create({
                customerId: loginUser._id,
                items: [],
            });

            return res.status(200).json({
                success: true,
                message: "Cart is empty",
                data: {
                    _id: newCart._id,
                    customerId: loginUser._id,
                    items: [],
                    totalPrice: 0,
                    totalQuantity: 0,
                    itemCount: 0,
                    created_at: newCart.created_at,
                },
            });
        }

        // Kung may cart pero walang laman, ibalik lang ang empty cart (HUWAG I-DELETE)
        if (!cart.items || cart.items.length === 0) {
            return res.status(200).json({
                success: true,
                message: "Cart is empty",
                data: {
                    _id: cart._id,
                    customerId: cart.customerId,
                    items: [],
                    totalPrice: 0,
                    totalQuantity: 0,
                    itemCount: 0,
                    created_at: cart.created_at,
                },
            });
        }

        // Format items and compute totals
        let totalPrice = 0;
        let totalQuantity = 0;

        const formattedItems = cart.items.map(item => {
            const food = item.foodId || {};
            const price = food.price || 0;
            const quantity = item.quantity || 0;
            const subtotal = price * quantity;

            totalPrice += subtotal;
            totalQuantity += quantity;

            return {
                foodId: food._id || item.foodId,
                name: food.name || 'Unknown',
                category: food.category || null,
                price: price,
                avatar: food.avatar || null,
                description: food.description || null,
                quantity: quantity,
                subtotal: subtotal
            };
        });

        // I-convert sa plain object para maiwasan ang mongoose hooks
        const cartObject = cart.toObject ? cart.toObject() : cart;

        const responseData = {
            ...cartObject,
            items: formattedItems,
            totalPrice: Math.round(totalPrice * 100) / 100,
            totalQuantity: totalQuantity,
            itemCount: formattedItems.length,
            customerId: cartObject.customerId,
            created_at: cartObject.created_at
        };

        console.log(`✅ Cart loaded: ${formattedItems.length} items, Total: ₱${totalPrice}`);

        return res.status(200).json({
            success: true,
            message: "Cart retrieved successfully.",
            data: responseData,
        });

    } catch (error) {
        console.error("❌ GET CART ERROR:", error);

        // Handle any cart-related errors gracefully
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to get cart",
        });
    }
});
// ======================
// ADD ITEM TO CART
// ======================
exports.addToCart = AsyncErrorHandler(async (req, res, next) => {
    try {
        const customerId = getUserId(req);
        let { foodId, quantity } = req.body;

        if (!customerId) {
            return res.status(401).json({
                status: "fail",
                message: "User authentication required.",
            });
        }

        // Extract foodId kung naka-nest mula sa request
        if (foodId && typeof foodId === "object") {
            if (foodId.foodId) {
                quantity = quantity || foodId.quantity;
                foodId = foodId.foodId;
            } else if (foodId._id) {
                foodId = foodId._id;
            }
        }

        if (!foodId) {
            return res.status(400).json({
                status: "fail",
                message: "Food ID is required.",
            });
        }

        quantity = Number(quantity) || 1;
        if (quantity < 1) {
            return res.status(400).json({
                status: "fail",
                message: "Quantity must be at least 1.",
            });
        }

        // Siguraduhing umiiral ang food item
        const food = await Food.findById(foodId);
        if (!food) {
            return res.status(404).json({
                status: "fail",
                message: "Food item not found.",
            });
        }

        // Tiyakin ang stock kung sakaling may stock field
        if (food.stock !== undefined && quantity > food.stock) {
            return res.status(400).json({
                status: "fail",
                message: `Only ${food.stock} item(s) available.`,
            });
        }

        // Hanapin ang cart ng user gamit ang customerId
        let cart = await Cart.findOne({ customerId });

        if (!cart) {
            cart = new Cart({
                customerId,
                items: [],
            });
        }

        // Suriin kung nasa cart na ang item
        const itemIndex = cart.items.findIndex(
            (item) => item.foodId.toString() === foodId.toString()
        );

        if (itemIndex > -1) {
            const newQuantity = cart.items[itemIndex].quantity + quantity;

            if (food.stock !== undefined && newQuantity > food.stock) {
                return res.status(400).json({
                    status: "fail",
                    message: `Only ${food.stock} item(s) available.`,
                });
            }

            cart.items[itemIndex].quantity = newQuantity;
        } else {
            cart.items.push({
                foodId,
                quantity,
            });
        }

        await cart.save();

        // Populate ang food details para sa response
        await cart.populate({
            path: "items.foodId",
            select: "name price avatar category status stock",
        });

        return res.status(200).json({
            status: "success",
            message: `${food.name} added to cart successfully.`,
            data: cart,
        });
    } catch (error) {
        console.error("❌ Error in addToCart:", error);
        return next(error);
    }
});

// ======================
// UPDATE CART ITEM QUANTITY
// ======================
exports.updateCartItemQuantity = AsyncErrorHandler(async (req, res, next) => {
    try {
        const userId = getUserId(req);
        const { foodId, quantity } = req.body;

        if (!foodId || quantity === undefined) {
            return res.status(400).json({
                status: "fail",
                message: "Food ID and quantity are required.",
            });
        }

        const newQuantity = Number(quantity);

        if (isNaN(newQuantity) || newQuantity < 1) {
            return res.status(400).json({
                status: "fail",
                message: "Quantity must be at least 1.",
            });
        }

        const cart = await Cart.findOne({ customerId: userId });

        if (!cart) {
            return res.status(404).json({
                status: "fail",
                message: "Cart not found.",
            });
        }

        const itemIndex = cart.items.findIndex(
            (item) => item.foodId.toString() === foodId.toString()
        );

        if (itemIndex === -1) {
            return res.status(404).json({
                status: "fail",
                message: "Item not found in cart.",
            });
        }

        cart.items[itemIndex].quantity = newQuantity;

        await cart.save();

        await cart.populate({
            path: "items.foodId",
            select: "name price avatar category status",
        });

        return res.status(200).json({
            status: "success",
            message: "Cart item updated successfully.",
            data: cart,
        });
    } catch (error) {
        console.error("❌ Update Cart Item Quantity Error:", error);

        return res.status(500).json({
            status: "error",
            message: "Failed to update cart item quantity.",
            error: error.message,
        });
    }
});

// ======================
// REMOVE SINGLE ITEM FROM CART
// ======================
exports.removeFromCart = AsyncErrorHandler(async (req, res, next) => {
    console.log("TRigger!!!")
    const userId = getUserId(req);
    const { foodId } = req.params;

    if (!foodId) {
        return res.status(400).json({
            status: "fail",
            message: "Food ID parameter is required.",
        });
    }

    const cart = await Cart.findOne({ customerId: userId });

    if (!cart) {
        return res.status(404).json({
            status: "fail",
            message: "Cart not found.",
        });
    }

    const initialLength = cart.items.length;
    cart.items = cart.items.filter(
        (item) => item.foodId.toString() !== foodId.toString()
    );

    if (cart.items.length === initialLength) {
        return res.status(404).json({
            status: "fail",
            message: "Item was not found in cart.",
        });
    }

    await cart.save();

    await cart.populate({
        path: "items.foodId",
        select: "name price avatar category status",
    });

    res.status(200).json({
        status: "success",
        message: "Item removed from cart successfully.",
        data: cart,
    });
});

// ======================
// CLEAR ENTIRE CART
// ======================
exports.clearCart = AsyncErrorHandler(async (req, res, next) => {
    const userId = getUserId(req);

    const cart = await Cart.findOne({ customerId: userId });

    if (cart) {
        cart.items = [];
        await cart.save();
    }

    res.status(200).json({
        status: "success",
        message: "Cart cleared successfully.",
        data: cart || { customerId: userId, items: [] },
    });
});