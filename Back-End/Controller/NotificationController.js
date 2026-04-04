const AsyncErrorHandler = require("../Utils/AsyncErrorHandler");
const Notification = require("./../Models/NotificationSchema");
const ApiFeatures = require("./../Utils/ApiFeatures");
const mongoose = require("mongoose");

exports.createNotification = AsyncErrorHandler(async (req, res) => {
  const { message, userIds } = req.body; // userIds: [array of linkId]

  const viewers = userIds.map((id) => ({
    user: new mongoose.Types.ObjectId(id),
    isRead: false,
  }));

  const newNotification = await Notification.create({ message, viewers });

  res.status(201).json({
    status: "success",
    data: newNotification,
  });
});

exports.getByLinkId = AsyncErrorHandler(async (req, res) => {
  const { linkId } = req.params;
  const { limit } = req.query;

  // Default limit = 5, unless limit=all
  let queryLimit = 5;
  if (limit && limit.toLowerCase() === "all") {
    queryLimit = 0; // 0 means walang limit sa MongoDB
  }

  const notificationsQuery = Notification.find({
    "viewers.user": linkId,
  }).sort({ createdAt: -1 });

  if (queryLimit > 0) {
    notificationsQuery.limit(queryLimit);
  }

  const notifications = await notificationsQuery;

  res.status(200).json({
    status: "success",
    data: notifications,
  });
});




exports.markAsRead = AsyncErrorHandler(async (req, res) => {
  const { id } = req.params;
  const { linkId } = req.body;

  if (!linkId) {
    return res.status(400).json({ message: "linkId is required" });
  }

  const notification = await Notification.findById(id);
  if (!notification) {
    return res.status(404).json({ message: "Notification not found" });
  }

  const viewer = notification.viewers.find(
    (v) => v.user.toString() === linkId
  );

  if (!viewer) {
    return res.status(403).json({ message: "Not authorized to read this notification" });
  }

  if (!viewer.isRead) {
    viewer.isRead = true;
    await notification.save();
  }

  res.status(200).json({ message: "Notification marked as read" });
});

exports.DisplayNotification = AsyncErrorHandler(async (req, res) => {
  let limit = 5; // default limit
  if (req.query.showAll === "true") {
    limit = null;
  }

  let query = Notification.find().sort({ createdAt: -1 });

  if (limit) {
    query = query.limit(limit);
  }

  const dataNotification = await query;

  res.status(200).json({
    status: "success",
    results: dataNotification.length,
    data: dataNotification,
  });
});



exports.deleteNotification = AsyncErrorHandler(async (req, res) => {
  const deleted = await Notification.findByIdAndDelete(req.params.id);

  if (!deleted) {
    return res.status(404).json({
      status: "fail",
      message: "Notification not found",
    });
  }

  res.status(200).json({
    status: "success",
    data: null,
  });
});



exports.AddNews = AsyncErrorHandler(async (req, res) => {

  try {
    const {
      title,
      date,
      excerpt,
      category,
      image,
    } = req.body;

    const missingFields = [];
    requiredFields.forEach((field) => {
      if (!req.body[field]) {
        missingFields.push(
          field.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())
        );
      }
    });

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    // 🔹 Check if user already exists
    const existingUser = await UserLogin.findOne({ username: email });
    if (existingUser) {
      return res.status(400).json({
        message: "User with this email already exists!",
      });
    }

    // 🔸 Handle image upload if avatar is present
    let avatarUploadPromise = Promise.resolve({ url: "", public_id: "" });

    if (req.file) {
      avatarUploadPromise = sharp(req.file.buffer)
        .resize({ width: 512 })
        .jpeg({ quality: 80 })
        .toBuffer()
        .then((resizedBuffer) => {
          const base64Image = `data:${
            req.file.mimetype
          };base64,${resizedBuffer.toString("base64")}`;
          return cloudinary.uploader.upload(base64Image, {
            folder: "Government Archiving/Profile",
          });
        })
        .then((uploadedResponse) => ({
          url: uploadedResponse.secure_url,
          public_id: uploadedResponse.public_id,
        }));
    }

    // 🔹 Wait for avatar upload to finish
    const avatar = await avatarUploadPromise;
  
    if (gender) profileData.gender = gender;

    const linkedRecord = await profileModel.create(profileData);

    return res.status(201).json({
      status: "Success",
      user: newUserLogin,
      profile: linkedRecord,
    });
  } catch (error) {
    console.error("Signup Error:", error);
    return res.status(500).json({
      message: "Something went wrong during signup.",
      error: error.message,
    });
  }
});
