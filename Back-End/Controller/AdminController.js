const AsyncErrorHandler = require("../Utils/AsyncErrorHandler");
const Admin = require("../Models/AdminSchema");
const UserLoginSchema = require("../Models/LogInDentalSchema");
const fs = require("fs");
const axios = require("axios");
const { URLSearchParams } = require("url");
const FormData = require("form-data");
exports.deleteAdmin = AsyncErrorHandler(async (req, res, next) => {
  const AdminID = req.params.id;

  const existingAdmin = await Admin.findById(AdminID);
  if (!existingAdmin) {
    return res.status(404).json({
      status: "fail",
      message: "Admin not found.",
    });
  }

  // Hakbang 1: Tanggalin ang admin record at ang UserLogin record
  const userLogin = await UserLoginSchema.findOne({ linkedId: AdminID });
  if (userLogin) {
    await UserLoginSchema.findByIdAndDelete(userLogin._id);
  }

  await Admin.findByIdAndDelete(AdminID);

  // Hakbang 2: Agad na magbigay ng success response sa user
  res.status(200).json({
    status: "success",
    message: "Admin and related login deleted successfully.",
    data: null,
  });

  // Hakbang 3: I-delete ang avatar file sa background
  if (existingAdmin.avatar && existingAdmin.avatar.url) {
    const avatarUrl = existingAdmin.avatar.url;

    // "Fire and forget" ang delete request
    const params = new URLSearchParams();
    params.append("file", avatarUrl);

    axios
      .post(
        "https://bp-sangguniangpanlalawigan.com/delete.php",
        params.toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      )
      .then((response) => {
        if (response.data.success) {
          console.log(
            "Avatar deleted from Hostinger in background:",
            avatarUrl
          );
        } else {
          console.error(
            "Failed to delete avatar from Hostinger in background:",
            response.data.message
          );
        }
      })
      .catch((error) => {
        console.error(
          "Error deleting avatar from Hostinger in background:",
          error.message
        );
      });
  }
});

exports.DisplayAdmin = async (req, res) => {
  try {
    const adminResults = await Admin.aggregate([
      {
        $lookup: {
          from: "userloginschemas", // ⚠️ check actual collection name
          localField: "_id",
          foreignField: "linkedId",
          as: "loginInfo",
        },
      },
      {
        $unwind: {
          path: "$loginInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          avatar: 1,
          first_name: 1,
          last_name: 1,
          middle_name: 1,
          gender: 1,
          contact_number: 1,
          email: 1,
          role: "$loginInfo.role",
          password: "$loginInfo.password", // ⚠️ NOT RECOMMENDED IN PROD
          isVerified: "$loginInfo.isVerified",
          theme: "$loginInfo.theme",
          created_at: 1,
        },
      },
    ]);

    res.status(200).json({
      status: "success",
      data: adminResults,
      totalAdmin: adminResults.length,
    });
  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message,
    });
  }
};
exports.DisplayProfile = AsyncErrorHandler(async (req, res) => {
  const loggedInAdminId = req.user.linkId;
  const admin = await Admin.findById(loggedInAdminId);
  if (!admin) {
    return res.status(404).json({
      status: "fail",
      message: "Admin not found",
    });
  }

  res.status(200).json({
    status: "success",
    data: admin,
  });
});

exports.UpdateAdmin = AsyncErrorHandler(async (req, res) => {
  console.log("Received file:", req.file);
  console.log("Received data:", req.body);
  const adminId = req.params.id;

  const oldRecord = await Admin.findById(adminId);
  if (!oldRecord) {
    return res.status(404).json({ error: "Admin not found" });
  }

  let newAvatarUrl = oldRecord.avatar ? oldRecord.avatar.url : null;
  const oldAvatarUrl = oldRecord.avatar ? oldRecord.avatar.url : null;

  if (req.file) {
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(req.file.mimetype)) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error("Failed to delete invalid temp file:", err);
      });
      return res.status(400).json({ error: "Invalid image type" });
    }
  }

  try {
    if (req.file) {
      const form = new FormData();
      form.append("file", fs.createReadStream(req.file.path), {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });

      const uploadResponse = await axios.post(
        "https://bp-sangguniangpanlalawigan.com/upload.php",
        form,
        {
          headers: form.getHeaders(),
          maxBodyLength: Infinity,
        }
      );

      if (!uploadResponse.data.success) {
        throw new Error(
          uploadResponse.data.message || "Failed to upload new avatar"
        );
      }

      newAvatarUrl = uploadResponse.data.url;
      console.log("New avatar uploaded:", newAvatarUrl);
    }

    const updateData = {
      first_name: req.body.first_name,
      last_name: req.body.last_name,
      middle_name: req.body.middle_name,
      email: req.body.email,
      gender: req.body.gender,
    };

    if (req.file) {
      updateData.avatar = {
        ...oldRecord.avatar,
        url: newAvatarUrl,
      };
    }

    const updatedAdmin = await Admin.findByIdAndUpdate(adminId, updateData, {
      new: true,
    });

    if (!updatedAdmin) {
      return res.status(404).json({ error: "Admin not found after update" });
    }

    res.json({ status: "success", data: updatedAdmin });

    if (req.file && oldAvatarUrl) {
      const params = new URLSearchParams();
      params.append("file", oldAvatarUrl);

      axios
        .post(
          "https://bp-sangguniangpanlalawigan.com/delete.php",
          params.toString(),
          { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        )
        .then((response) => {
          if (response.data.success) {
            console.log("Old news image deleted in background:", oldAvatarUrl);
          } else {
            console.error(
              "Failed to delete old news image in background:",
              response.data.message
            );
          }
        })
        .catch((error) => {
          console.error(
            "Error deleting old news image in background:",
            error.message
          );
        });
    }
  } catch (error) {
    console.error("UpdateAdmin Error:", error);
    res.status(500).json({ error: "Something went wrong." });
  } finally {
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error("Failed to delete temp file:", err);
      });
    }
  }
});
