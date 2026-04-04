const Notification = require("../../Models/NotificationSchema");
const User = require("../../Models/LogInDentalSchema"); // this is your UserLoginSchema

exports.sendTreatmentNotification = async (io, treatment) => {
  const messageText = `🦷 New treatment has been added. (ID: ${treatment._id})`;


  const users = await User.find({
    role: { $in: ["admin", "staff"] },
    linkedId: { $exists: true, $ne: null },
  }).select("linkedId");

  const validUsers = users.filter((u) => u.linkedId);

  if (validUsers.length === 0) {
    console.warn("⚠️ No users with valid linkedId found.");
    return;
  }

  const notificationDoc = await Notification.create({
    message: messageText,
    viewers: validUsers.map((user) => ({
      user: user.linkedId, 
      isRead: false,
    })),
  });

  let sent = false;
  for (const linkId in global.connectedUsers) {
    const { socketId, role } = global.connectedUsers[linkId];

    const isTarget = validUsers.some(
      (user) => user.linkedId.toString() === linkId
    );

    if (isTarget) {
      io.to(socketId).emit("treatmentNotification", {
        _id: notificationDoc._id,
        message: notificationDoc.message,
        createdAt: notificationDoc.createdAt,
        viewers: notificationDoc.viewers,
      });

      console.log(`Sent treatment notification to ${role} (${linkId})`);
      sent = true;
    }
  }

  if (!sent) {
    console.warn("No online recipients for the treatment notification.");
  }
};
