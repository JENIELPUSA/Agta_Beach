const AsyncErrorHandler = require("../Utils/AsyncErrorHandler");
const CustomError = require("../Utils/CustomError");
const user = require("../Models/usermodel");
const Apifeatures = require("./../Utils/ApiFeatures");

exports.createUser = AsyncErrorHandler(async (req, res) => {
    const { FirstName,LastName, email, password} = req.body;
  
    // Check for required fields (except Middle if optional)
    if (!FirstName || !LastName || !email || !password ) {
      return res.status(400).json({
        status: "fail",
        message: "Please fill in all required fields.",
      });
    }
  
  
    // Optional: validate email format
    const isValidEmail = /\S+@\S+\.\S+/.test(email);
    if (!isValidEmail) {
      return res.status(400).json({
        status: "fail",
        message: "Please provide a valid email address.",
      });
    }
  
    // Create user
    const newUser = await user.create(req.body);
    console.log("Text",newUser)
  
    // Respond
    res.status(201).json({
      status: "success",
      data: newUser,
    });
  });
  

exports.DisplayAll = AsyncErrorHandler(async (req, res) => {
  try {
    const displayuser = await user.find();

    if (!displayuser || displayuser.length === 0) {
      return res.status(404).json({ message: "No users found" });
    }

    // Count total Male and Female users using aggregation
    const result = await user.aggregate([
      {
        $group: {
          _id: null,
          totalMale: {
            $sum: { $cond: [{ $eq: ["$gender", "Male"] }, 1, 0] }
          },
          totalFemale: {
            $sum: { $cond: [{ $eq: ["$gender", "Female"] }, 1, 0] }
          }
        }
      }
    ]);

    const totalMale = result.length > 0 ? result[0].totalMale : 0;
    const totalFemale = result.length > 0 ? result[0].totalFemale : 0;

    res.status(200).json({
      status: "success",
      totalUser: displayuser.length,
      totalMale,
      totalFemale,
      data: displayuser,
    });

  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({
      status: "fail",
      message: "Failed to retrieve users.",
      error: error.message
    });
  }
});



exports.deleteUser = AsyncErrorHandler(async (req, res) => {
  await user.findByIdAndDelete(req.params.id);

  res.status(200).json({
    status: "success",
    data: null,
  });
});

exports.Updateuser = AsyncErrorHandler(async (req, res, next) => {
    const { FirstName, LastName, email,role} =
    req.body;
  if (
    !FirstName ||
    !LastName ||
    !email||
    !role
  ) {
    return res.status(400).json({
      status: "fail",
      message: "Please fill in all required fields.",
    });
  }
  const updateuser = await user.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
  });
  res.status(200).json({
    status: "success",
    data: updateuser,
  });
});

exports.Getiduser = AsyncErrorHandler(async (req, res, next) => {
  const users = await user.findById(req.params.id);
  if (!users) {
    const error = new CustomError("User with the ID is not found", 404);
    return next(error);
  }
  res.status(200).json({
    status: "Success",
    data: users,
  });
});

exports.updatePassword = AsyncErrorHandler(async (req, res, next) => {
  //GET CURRENT USER DATA FROM DATABASE
  const user = await user.findById(req.user._id).select("+password");

  //CHECK IF THE SUPPLIED CURRENT PASSWORD IS CORRECT
  if (
    !(await user.comparePasswordInDb(req.body.currentPassword, user.password))
  ) {
    return next(
      new CustomError("The current password you provided is wrong", 401)
    );
  }

  //IF SUPPLIED PASSWORD IS CORRECT, UPDATE USER PASSWORD WITH NEW VALUE
  user.password = req.body.password;
  user.confirmPassword = req.body.confirmPassword;
  await user.save();

  //LOGIN USER & SEND JWT
  authController.createSendResponse(user, 200, res);
});

exports.signup = AsyncErrorHandler(async (req, res, next) => {
  const { FirstName, Middle, LastName, email, password,role } = req.body;
  user
    .findOne({ email: email })
    .then((user) => {
      if (user) {
        res.json("Already Have an Account!");
      } else {
        user.create({
          FirstName: FirstName,
          Middle: Middle,
          LastName: LastName,
          email: email,
          password: password,
          role:role
        })
          .then((result) => res.json(result))

          .catch((err) => res.json(err));
      }
    })
    .catch((err) => res.json(err));
});
