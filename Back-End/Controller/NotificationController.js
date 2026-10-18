const AsyncErrorHandler = require("../Utils/AsyncErrorHandler");
const Notification = require("./../Models/NotificationSchema");
const mongoose = require("mongoose");

// ============================================================
// CREATE NOTIFICATION (admin)
// body: { message, userIds: [linkId, ...] }
// ============================================================
exports.createNotification = AsyncErrorHandler(async (req, res) => {
  const { message, userIds } = req.body;

  if (!message || !Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({
      status: "fail",
      message: "message and a non-empty userIds array are required",
    });
  }

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

// ============================================================
// GET NOTIFICATIONS FOR A USER (paginated)
// ============================================================
exports.getByLinkId = AsyncErrorHandler(async (req, res) => {
  const { linkId } = req.params;
  const { limit, page } = req.query;

  if (!mongoose.Types.ObjectId.isValid(linkId)) {
    return res.status(400).json({ status: "fail", message: "Invalid linkId" });
  }

  const query = { "viewers.user": new mongoose.Types.ObjectId(linkId) };

  const currentPage = Math.max(parseInt(page) || 1, 1);
  let itemsPerPage = parseInt(limit) || 10;
  if (itemsPerPage > 50) itemsPerPage = 50;
  if (itemsPerPage < 1) itemsPerPage = 10;

  const skip = (currentPage - 1) * itemsPerPage;
  const totalCount = await Notification.countDocuments(query);

  const notifications = await Notification.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(itemsPerPage)
    .lean();

  const hasMore = skip + notifications.length < totalCount;

  res.status(200).json({
    status: "success",
    data: {
      notifications,
      pagination: {
        currentPage,
        itemsPerPage,
        totalCount,
        hasMore,
        nextPage: hasMore ? currentPage + 1 : null,
      },
    },
  });
});

// ============================================================
// MARK ONE AS READ
// ============================================================
exports.markAsRead = AsyncErrorHandler(async (req, res) => {
  const { id } = req.params;
  const { linkId } = req.body;

  if (!linkId) {
    return res.status(400).json({ message: "linkId is required" });
  }
  if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(linkId)) {
    return res.status(400).json({ message: "Invalid id or linkId" });
  }

  const result = await Notification.updateOne(
    { _id: id, "viewers.user": new mongoose.Types.ObjectId(linkId) },
    { $set: { "viewers.$[elem].isRead": true } },
    {
      arrayFilters: [
        { "elem.user": new mongoose.Types.ObjectId(linkId), "elem.isRead": false },
      ],
    }
  );

  // matchedCount === 0  ->  notification not found OR user not in viewers
  if (result.matchedCount === 0) {
    return res.status(404).json({
      message: "Notification not found or not authorized",
    });
  }

  res.status(200).json({
    status: "success",
    message: "Notification marked as read",
  });
});

// ============================================================
// MARK ALL AS READ FOR A USER
// ============================================================
exports.markAllAsRead = AsyncErrorHandler(async (req, res) => {
  const { linkId } = req.body;

  if (!linkId) {
    return res.status(400).json({ message: "linkId is required" });
  }
  if (!mongoose.Types.ObjectId.isValid(linkId)) {
    return res.status(400).json({ message: "Invalid linkId" });
  }

  const userObjId = new mongoose.Types.ObjectId(linkId);

  const result = await Notification.updateMany(
    { "viewers.user": userObjId, "viewers.isRead": false },
    { $set: { "viewers.$[elem].isRead": true } },
    {
      arrayFilters: [{ "elem.user": userObjId, "elem.isRead": false }],
    }
  );

  res.status(200).json({
    status: "success",
    message: "All notifications marked as read",
    modifiedCount: result.modifiedCount,
  });
});

// ============================================================
// DISPLAY (admin view — recent or all)
// ============================================================
exports.DisplayNotification = AsyncErrorHandler(async (req, res) => {
  const showAll = req.query.showAll === "true";
  const limit = showAll ? null : 5;

  let query = Notification.find().sort({ createdAt: -1 });
  if (limit) query = query.limit(limit);

  const dataNotification = await query.lean();

  res.status(200).json({
    status: "success",
    results: dataNotification.length,
    data: dataNotification,
  });
});

// ============================================================
// DELETE
// ============================================================
exports.deleteNotification = AsyncErrorHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ status: "fail", message: "Invalid id" });
  }

  const deleted = await Notification.findByIdAndDelete(id);

  if (!deleted) {
    return res.status(404).json({
      status: "fail",
      message: "Notification not found",
    });
  }

  res.status(200).json({ status: "success", data: null });
});