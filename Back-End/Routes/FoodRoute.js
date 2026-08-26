const express = require("express");
const router = express.Router(); //express router
const FoodServiceController = require("../Controller/FoodController");
const authController = require("./../Controller/authController");
const upload = require("../middleware/fileUploader");
router
    .route("/")
    .post(
        authController.protect,
        upload.single("avatar"),
        FoodServiceController.createFood,
    )
    .get(
        FoodServiceController.DisplayFood,
    );

router
    .route("/:id")
    .patch(
        authController.protect,
        upload.single("avatar"),
        FoodServiceController.UpdateFood,
    )
    .delete(
        authController.protect,
        FoodServiceController.deleteFood,
    );




module.exports = router;
