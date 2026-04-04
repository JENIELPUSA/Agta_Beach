const express = require("express");
const router = express.Router(); //express router
const OfferServicesController = require("../Controller/OfferServicesController");
const authController = require("./../Controller/authController");
const upload = require("../middleware/fileUploader");
router
  .route("/")
  .post(
    authController.protect,
    upload.single("avatar"),
    OfferServicesController.createOfferController,
  )
  .get(
    authController.protect,
    OfferServicesController.displayAllOffersController,
  );

router
  .route("/findAvailableRooms")
  .get(OfferServicesController.searchAvailableRooms);

router
  .route("/displayAllLimitOffers")
  .get(OfferServicesController.displayAllLimitOffers);

module.exports = router;
