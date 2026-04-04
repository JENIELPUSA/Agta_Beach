const express = require("express");
const router = express.Router(); //express router
const SBmemberController = require("../Controller/SbController");
const authController = require("./../Controller/authController");
const upload = require("../middleware/fileUploader");
router
  .route("/")
  .get(authController.protect, SBmemberController.DisplaySBmember)
  .post(authController.protect, SBmemberController.createSBmember);
router
  .route("/:id")
  .delete(authController.protect, SBmemberController.deleteSBmember)
  .patch(
    authController.protect,
    upload.single("avatar"),
    SBmemberController.UpdateSBmember
  );
router
  .route("/AuthhorDropdown")
  .get(authController.protect,SBmemberController.DisplaySBmemberInDropdown)

module.exports = router;
