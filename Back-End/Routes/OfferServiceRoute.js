const express = require("express");
const router = express.Router(); // express router
const OfferServicesController = require("../Controller/OfferServicesController");
const authController = require("./../Controller/authController");
const upload = require("../middleware/fileUploader");

router
  .route("/")
  .post(
    authController.protect,
    upload.array("avatar", 5), 
    OfferServicesController.createOfferController,
  )
  .get(
    OfferServicesController.displayAllOffersController,
  );

router
  .route("/findAvailableRooms")
  .get(OfferServicesController.searchAvailableRooms);


router
  .route("/:id")
  .patch(upload.array("avatar", 5), OfferServicesController.updateOfferController)
  .delete(authController.protect,OfferServicesController.deleteOfferController);

router
  .route("/displayAllLimitOffers")
  .get(OfferServicesController.displayAllLimitOffers);

router
  .route("/dropdownrental")
  .get(authController.protect, OfferServicesController.dropdownDisplay);

module.exports = router;