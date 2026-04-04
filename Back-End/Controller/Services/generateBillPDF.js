const mongoose = require("mongoose");
const DentalBill = require("../../Models/Bills_Schema");
const PDFDocument = require("pdfkit");
const { PassThrough } = require("stream");
const sendEmail = require("../../Utils/email");

const generateBillPDFAndSend = async (patientId) => {
  if (!patientId || !mongoose.Types.ObjectId.isValid(patientId)) {
    throw new Error("Invalid patient ID.");
  }

  const patientObjectId = new mongoose.Types.ObjectId(patientId);

  const bills = await DentalBill.aggregate([
    {
      $lookup: {
        from: "treatments",
        localField: "treatment_id",
        foreignField: "_id",
        as: "treatment_info",
      },
    },
    { $unwind: { path: "$treatment_info" } },
    {
      $lookup: {
        from: "appointments",
        localField: "treatment_info.appointment_id",
        foreignField: "_id",
        as: "appointment_info",
      },
    },
    { $unwind: { path: "$appointment_info" } },
    {
      $match: {
        "appointment_info.patient_id": patientObjectId,
        isGenerated: false,
      },
    },
    {
      $lookup: {
        from: "patients",
        localField: "appointment_info.patient_id",
        foreignField: "_id",
        as: "patient_info",
      },
    },
    { $unwind: { path: "$patient_info" } },
    {
      $project: {
        _id: 1,
        bill_date: 1,
        total_amount: { $ifNull: ["$total_amount", 0] },
        amount_paid: { $ifNull: ["$amount_paid", 0] },
        balance: { $ifNull: ["$balance", 0] },
        payment_status: { $ifNull: ["$payment_status", "Pending"] },
        email: { $ifNull: ["$patient_info.email", "N/A"] },
        isGenerated: 1,
        treatment_description: {
          $ifNull: ["$treatment_info.treatment_description", "No description"],
        },
        treatment_date: { $ifNull: ["$treatment_info.treatment_date", null] },
        appointment_date: {
          $ifNull: ["$appointment_info.appointment_date", null],
        },
        patient_id: "$appointment_info.patient_id",
        patient_first_name: { $ifNull: ["$patient_info.first_name", ""] },
        patient_last_name: { $ifNull: ["$patient_info.last_name", ""] },
        patient_address: { $ifNull: ["$patient_info.address", "N/A"] },
        patient_phone: { $ifNull: ["$patient_info.phone", "N/A"] },
        patient_email: { $ifNull: ["$patient_info.email", "N/A"] },
      },
    },
    { $sort: { bill_date: 1 } },
  ]);

  if (bills.length === 0) {
    throw new Error("No outstanding or non-generated bills found for this patient.");
  }

  const totalAmountDue = bills.reduce((acc, bill) => acc + bill.total_amount, 0);
  const totalAmountPaid = bills.reduce((acc, bill) => acc + bill.amount_paid, 0);

  const {
    patient_first_name,
    patient_last_name,
    patient_address,
    patient_phone,
    patient_email,
  } = bills[0];

  const patient_name = `${patient_first_name} ${patient_last_name}`.trim();

  const phpFormatter = (amount) =>
    amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  const invoiceDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const invoiceNumber = `INV-${Date.now().toString().slice(-8)}`;

  const doc = new PDFDocument({ margin: 50, size: "A4" });
  const chunks = [];
  const stream = new PassThrough();

  doc.pipe(stream);
  stream.on("data", (chunk) => chunks.push(chunk));

  const pdfGenerated = new Promise((resolve, reject) => {
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });

  // --- PDF Content ---
  doc.fontSize(18).font("Helvetica-Bold").text("Smile Bright Dental Clinic", { align: "center" });
  doc.fontSize(10).font("Helvetica").text("Unit 101, Bright Tower, 123 Clinic Street", { align: "center" });
  doc.text("City, Postal Code 1234, Philippines", { align: "center" });
  doc.text("Phone: +63 (2) 1234 5678 | Email: info@smilebright.com", { align: "center" });

  doc.moveDown();
  doc.fontSize(20).font("Helvetica-Bold").fillColor("#333333").text("INVOICE", { align: "right" });
  doc.fontSize(10).fillColor("#555555").text(`Invoice No: ${invoiceNumber}`, { align: "right" });
  doc.text(`Date: ${invoiceDate}`, { align: "right" });
  doc.fillColor("#000000").moveDown(2);

  doc.fontSize(12).font("Helvetica-Bold").text("BILL TO:");
  doc.font("Helvetica").fontSize(10).text(patient_name);
  if (patient_address !== "N/A") doc.text(patient_address);
  if (patient_phone !== "N/A") doc.text(`Phone: ${patient_phone}`);
  if (patient_email !== "N/A") doc.text(`Email: ${patient_email}`);

  doc.moveDown(1.5);
  const tableTop = doc.y;
  const itemX = 50;
  const colWidths = {
    date: 70,
    description: 200,
    amount: 80,
    paid: 80,
    status: 80,
  };

  doc.font("Helvetica-Bold").fontSize(10);
  doc.text("Date", itemX, tableTop, { width: colWidths.date });
  doc.text("Description", itemX + colWidths.date, tableTop, { width: colWidths.description });
  doc.text("Amount", itemX + colWidths.date + colWidths.description, tableTop, {
    width: colWidths.amount,
    align: "right",
  });
  doc.text("Paid", itemX + colWidths.date + colWidths.description + colWidths.amount, tableTop, {
    width: colWidths.paid,
    align: "right",
  });
  doc.text("Status", itemX + colWidths.date + colWidths.description + colWidths.amount + colWidths.paid, tableTop, {
    width: colWidths.status,
    align: "right",
  });

  doc.moveDown(0.5);
  doc.strokeColor("#aaaaaa").lineWidth(1).moveTo(itemX, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
  doc.moveDown(0.3);

  doc.font("Helvetica").fontSize(10);
  bills.forEach((bill) => {
    const billDate = bill.bill_date
      ? new Date(bill.bill_date).toLocaleDateString("en-US")
      : "N/A";
    const y = doc.y;

    doc.text(billDate, itemX, y, { width: colWidths.date });
    doc.text(bill.treatment_description, itemX + colWidths.date, y, { width: colWidths.description });
    doc.text(phpFormatter(bill.total_amount), itemX + colWidths.date + colWidths.description, y, {
      width: colWidths.amount,
      align: "right",
    });
    doc.text(phpFormatter(bill.amount_paid), itemX + colWidths.date + colWidths.description + colWidths.amount, y, {
      width: colWidths.paid,
      align: "right",
    });
    doc.text(bill.payment_status, itemX + colWidths.date + colWidths.description + colWidths.amount + colWidths.paid, y, {
      width: colWidths.status,
      align: "right",
    });

    doc.moveDown();
  });

  doc.moveDown(1);
  doc.strokeColor("#aaaaaa").lineWidth(1).moveTo(itemX, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
  doc.moveDown(1);

  const totalX = doc.page.width - 200;
  doc.font("Helvetica-Bold").fontSize(10);
  doc.text(`Subtotal: ${phpFormatter(totalAmountDue)}`, totalX, doc.y, { align: "right", width: 150 });
  doc.text(`Amount Paid: ${phpFormatter(totalAmountPaid)}`, totalX, doc.y, { align: "right", width: 150 });

  doc.moveDown(2);
  doc.fontSize(10).font("Helvetica-Bold").text("Payment Information:", itemX, doc.y);
  doc.font("Helvetica").text("Please make payment within 7 days. We accept bank transfers and major credit cards.", itemX, doc.y + 15);

  doc.moveDown(2);
  doc.fontSize(12).font("Helvetica-Bold").text("Thank you for your business!", { align: "center" });

  doc.end();

  const pdfBuffer = await pdfGenerated;

  try {
    await sendEmail({
      email: patient_email,
      subject: "Dental Invoice from BrightSmile Clinic",
      text: `Dear ${patient_name},<br><br>Your invoice is attached as a PDF document. Thank you for choosing BrightSmile Dental Clinic.`,
      attachments: [
        {
          filename: `invoice-${invoiceNumber}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    const billIds = bills.map((b) => b._id);
    await DentalBill.updateMany(
      { _id: { $in: billIds }, isGenerated: false },
      { $set: { isGenerated: true } }
    );

    return {
      status: "success",
      message: `Invoice sent to ${patient_email}`,
    };
  } catch (error) {
    console.error("Email send error:", error.message);
    throw new Error("Failed to send invoice email");
  }
};

module.exports = generateBillPDFAndSend;
