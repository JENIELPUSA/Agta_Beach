const AsyncErrorHandler = require("../Utils/AsyncErrorHandler");
const Officer = require("../Models/OfficerSchema");
const Apifeatures = require("../Utils/ApiFeatures");
const UserLoginSchema = require("../Models/LogInDentalSchema");

exports.DisplayOfficer = AsyncErrorHandler(async (req, res) => {
  const officer = await Officer.aggregate([
    {
      $lookup: {
        from: "departments",
        localField: "department",
        foreignField: "_id",
        as: "departmentInfo",
      },
    },
    {
      $unwind: {
        path: "$departmentInfo",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        _id: 1,
        first_name: 1,
        last_name: 1,
        email: 1,
        gender: 1,
        avatar: 1,
        created_at: 1,
        dob: 1,
        department: "$departmentInfo.department",
      },
    },
  ]);

  const formattedOfficer = officer.map((off) => {
    if (off.dob) {
      const dob = new Date(off.dob);
      const year = dob.getFullYear();
      const month = String(dob.getMonth() + 1).padStart(2, "0");
      const day = String(dob.getDate()).padStart(2, "0");
      off.dob = `${year}-${month}-${day}`;
    }
    return off;
  });

  res.status(200).json({
    status: "success",
    data: formattedOfficer,
    totalUsers: formattedOfficer.length,
  });
});


exports.deleteOfficer = AsyncErrorHandler(async (req, res, next) => {
   const officerID = req.params.id;
  const userLogin = await UserLoginSchema.findOne({ linkedId: officerID });
  if (userLogin) {
    await UserLoginSchema.findByIdAndDelete(userLogin._id);
  }
  const deleteOfficer = await Officer.findByIdAndDelete(officerID);
  if (!deleteOfficer) {
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


exports.UpdateOfficer = AsyncErrorHandler(async (req, res, next) => {
  const updateOfficer = await Officer.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );
  res.status(200).json({
    status: "success",
    data: updateOfficer,
  });
});
