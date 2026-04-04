const DoctorSpecificSchedule = require("../../Models/DoctorSchemaSched");
const Appointment = require("../../Models/appointmentSchema");
const User = require("../../Models/LogInDentalSchema");
const Notification = require("../../Models/NotificationSchema");
const sendEmail = require("../../Utils/email");
const mongoose = require("mongoose");

exports.findValidScheduleAndSlot = async (
  doctor_id,
  appointment_date,
  slot_id
) => {
  const schedule = await DoctorSpecificSchedule.findOne({
    doctor: doctor_id,
    date: new Date(appointment_date),
    isActive: true,
    status: "Approved",
  });

  if (!schedule)
    throw new Error("Schedule not found for this doctor on the selected date.");

  const slot = schedule.timeSlots.id(slot_id);
  if (!slot) throw new Error("Time slot not found.");
  if (slot.maxPatientsPerSlot <= 0)
    throw new Error("This time slot is already full.");

  slot.maxPatientsPerSlot -= 1;
  await schedule.save();

  return slot;
};

exports.returnSlotOnCancel = async (doctor_id, appointment_date, slot_id) => {
  const schedule = await DoctorSpecificSchedule.findOne({
    doctor: doctor_id,
    date: new Date(appointment_date),
    isActive: true,
    status: "Approved",
  });

  if (!schedule) {
    throw new Error("Schedule not found for this doctor on the selected date.");
  }

  const slot = schedule.timeSlots.id(slot_id);
  if (!slot) {
    throw new Error("Time slot not found.");
  }

  slot.maxPatientsPerSlot += 1; // ibalik ang slot
  await schedule.save();

  return slot;
};

exports.createAppointmentEntry = async ({
  patient_id,
  doctor_id,
  appointment_date,
  appointment_status,
  slot_id,
  slot,
}) => {
  return await Appointment.create({
    patient_id,
    doctor_id,
    appointment_date,
    appointment_status,
    slot_id,
    start_time: slot.start,
    end_time: slot.end,
  });
};

exports.sendSocketNotification = (io, doctor_id, appointment) => {
  const message = {
    message: `🦷 New appointment scheduled. (ID: ${appointment._id})`,
    data: appointment,
  };

  let sent = false;
  for (const linkId in global.connectedUsers) {
    const { socketId, role } = global.connectedUsers[linkId];
    if (["admin", "staff"].includes(role) || linkId === doctor_id.toString()) {
      io.to(socketId).emit("adminNotification", message);
      console.log(
        `📨 Sent new appointment notification to ${role} (${linkId})`
      );
      sent = true;
    }
  }

  if (!sent) {
    console.warn(
      "⚠️ No online recipients for the new appointment notification."
    );
  }
};

exports.notifyByEmailAndDatabase = async (appointment, doctor_id) => {
  const allowedUsers = await User.find({
    $or: [{ role: { $in: ["admin", "staff"] } }, { _id: doctor_id }],
  }).select("linkedId username role");

  const viewerIds = allowedUsers
    .map((u) => u.linkedId)
    .filter((id) => mongoose.Types.ObjectId.isValid(id));

  const emailList = allowedUsers
    .map((u) => u.username)
    .filter((email) => typeof email === "string" && email.includes("@"));

  const message = {
    message: `🦷 New appointment has been scheduled. (ID: ${appointment._id})`,
    data: appointment,
  };

  let anyOnline = false;

  if (global.io && global.connectedUsers) {
    for (const linkId in global.connectedUsers) {
      const { socketId, role } = global.connectedUsers[linkId];
      if (
        role === "admin" ||
        role === "staff" ||
        linkId === doctor_id.toString()
      ) {
        global.io.to(socketId).emit("adminNotification", message);
        console.log(`📣 Real-time notification sent to ${role} (${linkId})`);
        anyOnline = true;
      }
    }
  }

  // ✅ Save to Notification using linkedId
  try {
    const saved = await Notification.create({
      message: message.message,
      viewers: viewerIds.map((id) => ({
        user: id, // now linkedId
        isRead: false,
        viewedAt: null,
      })),
    });
    console.log("📥 Notification saved to DB:", saved._id);
  } catch (err) {
    console.error("❌ Failed to save notification:", err.message);
  }

  for (const email of emailList) {
    try {
      await sendEmail({
        email,
        subject: "New Appointment Scheduled",
        text: `<strong>New Appointment Created</strong><br/>
<strong>ID:</strong> ${appointment._id}<br/>
<strong>Date:</strong> ${appointment.appointment_date}<br/>
<strong>Time:</strong> ${appointment.start_time} – ${appointment.end_time}<br/>
<strong>Status:</strong> ${appointment.appointment_status}`,
      });
      console.log(`📨 Email sent to ${email}`);
    } catch (err) {
      console.error(`❌ Failed to send email to ${email}: ${err.message}`);
    }
  }

  if (!anyOnline) {
    console.log("⚠️ No user online. Notification saved for later viewing.");
  }
};

