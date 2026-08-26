const express = require("express");
const router = express.Router(); //express router
const cardController = require("../Controller/cartController");
const authController = require("./../Controller/authController");
const upload = require("../middleware/fileUploader");
router
    .route("/add")
    .post(
        authController.protect,
        upload.single("avatar"),
        cardController.addToCart,
    )
router
    .route("/:linkId")
    .get(
        authController.protect,
        cardController.getCart),

 router
        .route("/remove/:foodId")
        .delete(
            authController.protect,
            cardController.removeFromCart,
        )
    router
        .route("/update")
        .patch(
            authController.protect,
            cardController.updateCartItemQuantity,
        )



module.exports = router;
