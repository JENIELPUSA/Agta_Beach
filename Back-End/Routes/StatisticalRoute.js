const express = require("express");
const router = express.Router(); //express router
const Statistical = require("../Controller/statisticalController");
const authController = require("./../Controller/authController");
const upload = require("../middleware/fileUploader");
router
    .route("/")
    .get(
        authController.protect,Statistical.DisplayBookings
    );


module.exports = router;
