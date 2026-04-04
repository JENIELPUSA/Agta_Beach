const express = require("express");
const router = express.Router(); //express router
const ApproverController = require("../Controller/ApproverController");
const authController = require("./../Controller/authController");
router
  .route("/")
  .get(authController.protect, ApproverController.DisplayApprover)
  .post(authController.protect, ApproverController.createApprover);
router
  .route("/:id")
  .delete(authController.protect, ApproverController.deleteApprover)
  .patch(authController.protect, ApproverController.UpdateApprover);

module.exports = router;
