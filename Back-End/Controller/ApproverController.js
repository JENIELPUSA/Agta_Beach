const AsyncErrorHandler = require("../Utils/AsyncErrorHandler");
const Approver = require("../Models/ApproverSchema");
const Apifeatures = require("../Utils/ApiFeatures");

exports.createApprover = AsyncErrorHandler(async (req, res) => {
  const existingApprover = await Approver.findOne();
  if (existingApprover) {
    return res.status(400).json({
      status: "fail",
      message: "An approver already exists. Only one is allowed.",
    });
  }
  const newApprover = await Approver.create(req.body);

  res.status(201).json({
    status: "success",
    message: "Approver created successfully.",
    data: newApprover,
  });
});


exports.deleteApprover = AsyncErrorHandler(async (req, res, next) => {
  const ApproverID = req.params.id;
  const deleteApprover = await Approver.findByIdAndDelete(ApproverID);

  if (!deleteApprover) {
    return res.status(404).json({
      status: "fail",
      message: "Officer not found.",
    });
  }

  res.status(200).json({
    status: "success",
    message: "Officer and related login deleted successfully.",
    data: null,
  });
});

exports.DisplayApprover = AsyncErrorHandler(async (req, res) => {
  const approver = await Approver.findOne().sort({ createdAt: -1 }); // get latest

  if (!approver) {
    return res.status(404).json({
      status: "fail",
      message: "No Approver found",
    });
  }

  res.status(200).json({
    status: "success",
    data: approver,
  });
});



exports.UpdateApprover = AsyncErrorHandler(async (req, res, next) => {
  const updateApprover = await Approver.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
  });

  res.status(200).json({
    status: "success",
    data: updateApprover,
  });
});
