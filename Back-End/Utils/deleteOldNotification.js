const StorageOptimized = require("../Models/StorageOptimazed");
const Notification = require("../Models/NotificationSchema");

const deleteOldNotifications = async () => {
  const setting = await StorageOptimized.findOne();

  if (setting?.enabled && !isNaN(setting.deleteAfterDays)) {
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - setting.deleteAfterDays);

    const result = await Notification.deleteMany({
      createdAt: { $lt: daysAgo },
    });

    console.log(`Deleted ${result.deletedCount} old notifications.`);
    return result.deletedCount;
  } else {
    console.log("Optimization is disabled or invalid setting.");
    return 0;
  }
};

module.exports = deleteOldNotifications;
