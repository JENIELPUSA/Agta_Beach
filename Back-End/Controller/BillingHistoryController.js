const BillingHistory = require("../Models/BillingHistorySchema");
const AsyncErrorHandler = require("../Utils/AsyncErrorHandler");
const Notification = require("../Models/NotificationSchema");
const UserLoginSchema = require("../Models/LogInDentalSchema");
const Customer = require("../Models/CustomerSchema"); //  IDAGDAG ITO
const mongoose = require("mongoose");
const actionbooking = require("../Models/ActionBooking");
const orders = require("../Models/OrderSchema");
const Accommodation = require("../Models/ActionBooking");
const sendEmail = require("../Utils/email");

const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

// ====================  HELPER: Build Order Origin ====================
const buildOrderOrigin = async (actionBooking, customerId = null) => {
  try {
    if (!actionBooking) return null;

    const origin = {
      accommodationId: null,
      accommodationName: null,
      accommodationType: null,
      roomNumber: null,
      avatar: { url: null, public_id: null },
      actionBookingId: actionBooking._id || null,
      bookingNumber: actionBooking.bookingNumber || null,
      customerId: customerId || actionBooking.customerId || null,
    };

    if (actionBooking.bookingItemModel === 'Accommodation') {
      return null;
    }

    if (actionBooking.origin && actionBooking.origin.accommodationId) {
      return {
        ...origin,
        accommodationId: actionBooking.origin.accommodationId,
        accommodationName: actionBooking.origin.accommodationName || null,
        accommodationType: actionBooking.origin.accommodationType || null,
        roomNumber: actionBooking.origin.roomNumber || null,
        avatar: actionBooking.origin.avatar || { url: null, public_id: null },
        actionBookingId: actionBooking.origin.actionBookingId || actionBooking._id,
        bookingNumber: actionBooking.origin.bookingNumber || actionBooking.bookingNumber,
      };
    }

    if (actionBooking.relatedAccommodationId) {
      const accommodation = await Accommodation.findById(
        actionBooking.relatedAccommodationId
      ).lean();

      if (accommodation) {
        return {
          ...origin,
          accommodationId: accommodation._id,
          accommodationName: accommodation.name || null,
          accommodationType: accommodation.type || null,
          roomNumber: accommodation.roomNumber || null,
          avatar: {
            url: accommodation.avatar?.url || null,
            public_id: accommodation.avatar?.public_id || null,
          },
        };
      }
    }

    const searchCustomerId = customerId || actionBooking.customerId;
    if (searchCustomerId) {
      const activeAccommodationBooking = await actionbooking.findOne({
        customerId: searchCustomerId,
        bookingItemModel: 'Accommodation',
        status: { $in: ['Confirmed', 'Paid', 'waiting'] },
      })
        .sort({ createdAt: -1 })
        .lean();

      if (activeAccommodationBooking) {
        const accommodation = await Accommodation.findById(
          activeAccommodationBooking.bookingItemId
        ).lean();

        if (accommodation) {
          return {
            ...origin,
            accommodationId: accommodation._id,
            accommodationName: accommodation.name || null,
            accommodationType: accommodation.type || null,
            roomNumber: accommodation.roomNumber || null,
            avatar: {
              url: accommodation.avatar?.url || null,
              public_id: accommodation.avatar?.public_id || null,
            },
            actionBookingId: activeAccommodationBooking._id,
            bookingNumber: activeAccommodationBooking.bookingNumber,
          };
        }
      }
    }

    return null;
  } catch (error) {
    console.error('❌ [buildOrderOrigin] Error:', error);
    return null;
  }
};

// ==================== CREATE ====================

exports.createBillingHistory = AsyncErrorHandler(async (req, res) => {
  console.log("BODY________", req.body);

  try {
    // Parse JSON strings from FormData
    let paymentDetails = req.body.paymentDetails;
    let bookings = req.body.bookings;
    let processedBy = req.body.processedBy;
    let metadata = req.body.metadata;

    if (typeof paymentDetails === 'string') {
      paymentDetails = JSON.parse(paymentDetails);
    }
    if (typeof bookings === 'string') {
      bookings = JSON.parse(bookings);
    }
    if (typeof processedBy === 'string') {
      processedBy = JSON.parse(processedBy);
    }
    if (typeof metadata === 'string') {
      metadata = JSON.parse(metadata);
    }

    console.log("📋 Payment Details:", paymentDetails);
    console.log("📋 Bookings:", bookings);
    console.log("📋 Processed By:", processedBy);
    console.log("📋 Metadata:", metadata);

    //  I-extract ang selectedAccommodation details
    const selectedAccommodation = paymentDetails?.selectedAccommodation || null;
    const selectedAccommodationDetails = paymentDetails?.selectedAccommodationDetails || null;

    console.log("🏠 Selected Accommodation:", selectedAccommodation);
    console.log("🏠 Selected Accommodation Details:", JSON.stringify(selectedAccommodationDetails, null, 2));

    // ============================================
    // EXTRACT CUSTOMER ID
    // ============================================
    let rawCustomerId = null;
    let customerId = null;
    let bookingIds = [];

    if (bookings && bookings.length > 0) {
      const firstBooking = bookings[0];

      if (firstBooking.customerId) {
        rawCustomerId = firstBooking.customerId;
      } else if (firstBooking.customer && firstBooking.customer._id) {
        rawCustomerId = firstBooking.customer._id;
      } else if (firstBooking.customer && firstBooking.customer.id) {
        rawCustomerId = firstBooking.customer.id;
      } else if (firstBooking.userId) {
        rawCustomerId = firstBooking.userId;
      } else if (firstBooking.customer && firstBooking.customer.customerId) {
        rawCustomerId = firstBooking.customer.customerId;
      }

      bookingIds = bookings.map(b => b._id).filter(id => id);
      console.log(`📋 Extracted ${bookingIds.length} booking IDs:`, bookingIds);
      console.log(`👤 Raw customerId from booking: ${rawCustomerId}`);
    }

    if (!rawCustomerId && req.user) {
      rawCustomerId = req.user._id || req.user.id;
      console.log(`👤 Raw customerId from request user: ${rawCustomerId}`);
    }

    if (!rawCustomerId) {
      console.warn("⚠️ No raw customerId found in bookings or request");
    }

    // ============================================
    //  CONVERT rawCustomerId → Customer._id
    // ============================================
    let userLoginDoc = null;
    let customerDoc = null;
    customerId = rawCustomerId;

    if (rawCustomerId && mongoose.Types.ObjectId.isValid(rawCustomerId)) {
      try {
        console.log(`🔍 Looking up for ID: ${rawCustomerId}`);

        userLoginDoc = await UserLoginSchema.findOne({
          $or: [
            { _id: rawCustomerId },
            { linkedId: rawCustomerId },
          ],
        }).lean();

        if (userLoginDoc) {
          console.log(` Found UserLoginSchema: ${userLoginDoc._id}`);
          console.log(`👤 User role: ${userLoginDoc.role}`);
          console.log(`🔗 linkedId: ${userLoginDoc.linkedId}`);

          if (userLoginDoc.linkedId) {
            customerId = userLoginDoc.linkedId;
            console.log(` Using linkedId (Customer._id): ${customerId}`);

            customerDoc = await Customer.findById(customerId).lean();
            if (customerDoc) {
              console.log(` Customer found: ${customerDoc.first_name} ${customerDoc.last_name}`);
            } else {
              console.warn(`⚠️ Customer not found for linkedId: ${customerId}`);
            }
          } else {
            customerId = userLoginDoc._id;
            console.log(`⚠️ No linkedId, using UserLoginSchema._id: ${customerId}`);
          }
        } else {
          console.log(`⚠️ UserLoginSchema not found, checking Customer...`);
          customerDoc = await Customer.findById(rawCustomerId).lean();

          if (customerDoc) {
            customerId = customerDoc._id;
            console.log(` Found Customer directly: ${customerDoc.first_name} ${customerDoc.last_name}`);
          } else {
            console.warn(`⚠️ Customer not found either for ID: ${rawCustomerId}`);
            customerId = rawCustomerId;
          }
        }
      } catch (lookupError) {
        console.error("❌ Error looking up customer:", lookupError.message);
        customerId = rawCustomerId;
      }
    } else {
      console.warn(`⚠️ rawCustomerId is not a valid ObjectId: ${rawCustomerId}`);
    }

    if (!customerId) {
      console.warn("⚠️ No customerId found");
      customerId = "unknown-customer";
    }

    console.log(`📌 FINAL customerId (Customer._id): ${customerId}`);
    console.log(`📌 FINAL customerId type: ${typeof customerId}`);

    // ============================================
    // 🔍 SEARCH FOR ROOM NUMBER FROM ACTIONBOOKING
    // ============================================
    let roomNumber = "";
    let customerDetails = customerDoc;
    let actionBookingData = null;

    try {
      if (bookingIds && bookingIds.length > 0) {
        console.log(`🔍 Searching for booking details in ActionBooking...`);

        const firstBookingId = bookingIds[0];

        if (mongoose.Types.ObjectId.isValid(firstBookingId)) {
          actionBookingData = await actionbooking.findById(firstBookingId)
            .populate('customerId')
            .lean();

          if (actionBookingData) {
            console.log(` Found ActionBooking: ${actionBookingData._id}`);
            console.log(`📋 Booking Item Model: ${actionBookingData.bookingItemModel}`);

            if (actionBookingData.bookingItemModel === 'Accommodation') {
              console.log(` This is an Accommodation booking`);

              if (actionBookingData.roomNumber) {
                roomNumber = actionBookingData.roomNumber;
              } else if (actionBookingData.delivery && actionBookingData.delivery.roomNumber) {
                roomNumber = actionBookingData.delivery.roomNumber;
              } else if (actionBookingData.address && actionBookingData.address.roomNumber) {
                roomNumber = actionBookingData.address.roomNumber;
              } else if (actionBookingData.room) {
                if (typeof actionBookingData.room === 'string') {
                  roomNumber = actionBookingData.room;
                } else if (typeof actionBookingData.room === 'object' && actionBookingData.room.number) {
                  roomNumber = actionBookingData.room.number;
                } else if (typeof actionBookingData.room === 'object' && actionBookingData.room.roomNumber) {
                  roomNumber = actionBookingData.room.roomNumber;
                }
              } else if (actionBookingData.location && actionBookingData.location.roomNumber) {
                roomNumber = actionBookingData.location.roomNumber;
              }

              if (!roomNumber && actionBookingData.bookingItemId) {
                if (typeof actionBookingData.bookingItemId === 'object') {
                  if (actionBookingData.bookingItemId.roomNumber) {
                    roomNumber = actionBookingData.bookingItemId.roomNumber;
                  } else if (actionBookingData.bookingItemId.room && actionBookingData.bookingItemId.room.number) {
                    roomNumber = actionBookingData.bookingItemId.room.number;
                  }
                }
              }

              console.log(` Final room number: ${roomNumber || 'Not found'}`);
            } else {
              console.log(`ℹ️ Non-Accommodation booking`);

              const customerIdForSearch = actionBookingData.customerId?._id || actionBookingData.customerId;
              if (customerIdForSearch) {
                const relatedAccommodationBooking = await actionbooking.findOne({
                  customerId: customerIdForSearch,
                  bookingItemModel: 'Accommodation',
                  status: { $in: ['Confirmed', 'Paid', 'waiting'] },
                })
                  .sort({ createdAt: -1 })
                  .lean();

                if (relatedAccommodationBooking) {
                  if (relatedAccommodationBooking.roomNumber) {
                    roomNumber = relatedAccommodationBooking.roomNumber;
                  } else if (relatedAccommodationBooking.delivery?.roomNumber) {
                    roomNumber = relatedAccommodationBooking.delivery.roomNumber;
                  }
                  console.log(`🏠 Room from related Accommodation: ${roomNumber || 'Not found'}`);
                }
              }
            }
          }
        }
      }

      if (!roomNumber && customerId && customerId !== "unknown-customer") {
        if (mongoose.Types.ObjectId.isValid(customerId)) {
          if (!customerDetails) {
            customerDetails = await Customer.findById(customerId).lean();
          }

          if (customerDetails) {
            if (customerDetails.roomNumber) {
              roomNumber = customerDetails.roomNumber;
            } else if (customerDetails.delivery && customerDetails.delivery.roomNumber) {
              roomNumber = customerDetails.delivery.roomNumber;
            } else if (customerDetails.address && customerDetails.address.roomNumber) {
              roomNumber = customerDetails.address.roomNumber;
            }
            console.log(`🏠 Customer Room Number: ${roomNumber || 'Not found'}`);
          }
        }
      }

      if (!roomNumber && customerId && customerId !== "unknown-customer") {
        const customerBookings = await actionbooking.find({
          customerId: customerId,
          bookingItemModel: 'Accommodation'
        }).lean();

        if (customerBookings && customerBookings.length > 0) {
          for (const booking of customerBookings) {
            if (booking.roomNumber) {
              roomNumber = booking.roomNumber;
              break;
            } else if (booking.delivery && booking.delivery.roomNumber) {
              roomNumber = booking.delivery.roomNumber;
              break;
            } else if (booking.room && booking.room.number) {
              roomNumber = booking.room.number;
              break;
            }
          }
        }
      }

      console.log(` Final Room Number: ${roomNumber || 'Not found'}`);

    } catch (error) {
      console.error("❌ Error finding customer/booking:", error.message);
    }

    // ============================================
    //  BUILD ORDER ORIGIN
    // ============================================
    let orderOrigin = null;
    try {
      if (actionBookingData) {
        console.log(`🎯 Building order origin from ActionBooking...`);
        orderOrigin = await buildOrderOrigin(
          actionBookingData,
          customerId !== "unknown-customer" ? customerId : null
        );
        console.log(` Order Origin:`, JSON.stringify(orderOrigin, null, 2));
      }
    } catch (originError) {
      console.error(`⚠️ Error building order origin:`, originError.message);
    }

    // ============================================
    // ADD ROOM NUMBER + ORIGIN TO BOOKINGS
    // ============================================
    if (bookings && bookings.length > 0) {
      bookings = bookings.map(booking => {
        const updatedBooking = { ...booking };

        if (roomNumber) {
          updatedBooking.roomNumber = roomNumber;
          updatedBooking.delivery = {
            ...booking.delivery,
            roomNumber: roomNumber
          };
        }

        if (orderOrigin && booking.bookingItemModel !== 'Accommodation') {
          updatedBooking.origin = orderOrigin;
        }

        updatedBooking.customerId = customerId;

        return updatedBooking;
      });

      console.log(` Added roomNumber "${roomNumber}" and origin to all bookings`);
      console.log(` Set customerId "${customerId}" on all bookings`);
    }

    // ============================================
    // AVATAR UPLOAD
    // ============================================
    let avatar = { url: "", public_id: "" };

    if (req.file) {
      console.log("📸 Uploading image to UPLOADAGTA...");

      const form = new FormData();
      form.append("file", fs.createReadStream(req.file.path), req.file.originalname);

      try {
        const response = await axios.post(process.env.UPLOADAGTA_URL, form, {
          maxBodyLength: Infinity,
          headers: { ...form.getHeaders() },
        });

        if (response.data && response.data.url) {
          avatar = {
            url: response.data.url,
            public_id: response.data.public_id || response.data.filename || req.file.filename,
          };
        } else if (response.data && response.data.success && response.data.data) {
          avatar = {
            url: response.data.data.url,
            public_id: response.data.data.public_id || req.file.filename,
          };
        } else if (response.data && response.data.file) {
          avatar = {
            url: response.data.file,
            public_id: req.file.filename,
          };
        } else {
          avatar = {
            url: `/temp-uploads/${req.file.filename}`,
            public_id: req.file.filename,
          };
        }

        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } catch (err) {
        console.error("❌ Upload Error:", err.message);
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      }
    }

    // Validate required fields
    if (!paymentDetails || !bookings || bookings.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Payment details and at least one booking are required"
      });
    }

    if (!paymentDetails.paymentType) {
      return res.status(400).json({
        success: false,
        message: "Payment type (full or partial) is required"
      });
    }

    if (paymentDetails.paymentType === "partial") {
      if (!paymentDetails.paymentAmount || paymentDetails.paymentAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Payment amount is required for partial payments"
        });
      }
      if (paymentDetails.paymentAmount > paymentDetails.totalAmount) {
        return res.status(400).json({
          success: false,
          message: "Partial payment amount cannot exceed total amount"
        });
      }
    }

    const remainingBalance = paymentDetails.paymentType === "partial"
      ? paymentDetails.totalAmount - paymentDetails.paymentAmount
      : 0;

    const isFullyPaid = remainingBalance <= 0;
    const paymentStatus = isFullyPaid ? "completed" : "pending";
    const billingStatus = isFullyPaid ? "fully_paid" : "partial";

    let referenceNumber = null;
    if (bookings && bookings.length > 0) {
      referenceNumber = bookings[0].bookingNumber || bookings[0].orderNumber || bookings[0].referenceNo;
    }

    let existingBilling = null;
    let existingBooking = null;

    if (referenceNumber) {
      existingBilling = await BillingHistory.findOne({
        "bookings.referenceNo": referenceNumber
      });

      if (!existingBilling) {
        existingBilling = await BillingHistory.findOne({
          "bookings.bookingNumber": referenceNumber
        });
      }

      if (!existingBilling) {
        existingBilling = await BillingHistory.findOne({
          "bookings.orderNumber": referenceNumber
        });
      }

      if (existingBilling) {
        existingBooking = existingBilling.bookings.find(b =>
          b.referenceNo === referenceNumber ||
          b.bookingNumber === referenceNumber ||
          b.orderNumber === referenceNumber
        );

        console.log(`📋 Found existing billing with reference: ${referenceNumber}`);
      }
    }

    // ============================================
    // UPDATE EXISTING PARTIAL PAYMENT
    // ============================================
    if (existingBilling && existingBooking && existingBilling.status === "partial") {
      console.log(`🔄 Updating existing partial payment for reference: ${referenceNumber}`);

      const currentRemainingBalance = existingBooking.remainingBalance || 0;
      const newPaymentAmount = paymentDetails.paymentAmount;
      const updatedRemainingBalance = Math.max(0, currentRemainingBalance - newPaymentAmount);
      const isNowFullyPaid = updatedRemainingBalance <= 0;
      const totalPaidSoFar = (existingBooking.amount || 0) - updatedRemainingBalance;

      const updatedBookings = existingBilling.bookings.map(booking => {
        const isMatchingBooking =
          booking.referenceNo === referenceNumber ||
          booking.bookingNumber === referenceNumber ||
          booking.orderNumber === referenceNumber;

        if (isMatchingBooking) {
          const bookingData = booking.toObject ? booking.toObject() : booking;
          return {
            ...bookingData,
            remainingBalance: updatedRemainingBalance,
            paymentAmount: totalPaidSoFar,
            paymentStatus: isNowFullyPaid ? "full" : "partial",
            roomNumber: roomNumber || booking.roomNumber,
            customerId: customerId || booking.customerId,
            delivery: {
              ...booking.delivery,
              roomNumber: roomNumber || booking.delivery?.roomNumber
            },
            origin: orderOrigin || booking.origin || null,
          };
        }
        return booking;
      });

      const newPaymentStatus = isNowFullyPaid ? "completed" : "pending";
      const newBillingStatus = isNowFullyPaid ? "fully_paid" : "partial";

      const updatedBilling = await BillingHistory.findByIdAndUpdate(
        existingBilling._id,
        {
          $set: {
            "paymentDetails.remainingBalance": updatedRemainingBalance,
            "paymentDetails.paymentAmount": totalPaidSoFar,
            "paymentDetails.status": newPaymentStatus,
            "paymentDetails.paymentType": isNowFullyPaid ? "full" : "partial",
            "paymentDetails.method": paymentDetails.method || existingBilling.paymentDetails.method,
            "paymentDetails.referenceNo": paymentDetails.referenceNo || existingBilling.paymentDetails.referenceNo,
            "paymentDetails.processedAt": new Date(),
            "status": newBillingStatus,
            "bookings": updatedBookings,
            "customerId": customerId || existingBilling.customerId,

            ...(selectedAccommodation && {
              "paymentDetails.selectedAccommodation": selectedAccommodation,
            }),
            ...(selectedAccommodationDetails && {
              "paymentDetails.selectedAccommodationDetails": selectedAccommodationDetails,
            }),

            ...(avatar.url && { avatar: avatar })
          },
          $push: {
            statusHistory: {
              status: newBillingStatus,
              timestamp: new Date(),
              note: isNowFullyPaid
                ? ` Fully Paid! Remaining balance: ₱0.00. Total paid: ₱${totalPaidSoFar.toFixed(2)}`
                : `💰 Additional partial payment of ₱${newPaymentAmount.toFixed(2)}. Remaining balance: ₱${updatedRemainingBalance.toFixed(2)}. Total paid: ₱${totalPaidSoFar.toFixed(2)}`,
              updatedBy: {
                userId: processedBy?.userId || req.user?._id || "system",
                userName: processedBy?.userName || req.user?.name || "System"
              }
            }
          }
        },
        { new: true }
      );

      console.log(` Updated billing: ${updatedBilling.transactionId}`);
      console.log(`👤 Customer ID: ${updatedBilling.customerId}`);

      const io = req.app.get("socketio");

      if (io) {
        const payload = {
          billingHistory: updatedBilling,
          message: isNowFullyPaid
            ? ` Billing ${updatedBilling.transactionId} is now fully paid!`
            : `💰 Additional payment for ${updatedBilling.transactionId} - Remaining: ₱${updatedRemainingBalance.toFixed(2)}`
        };

        io.to("admin").emit("updateBilling", payload);
        io.to("finance").emit("updateBilling", payload);
      }

      const staffMembers = await UserLoginSchema.find({
        role: { $in: ["admin", "finance"] }
      }).select("_id");

      const viewersList = staffMembers.map(staff => ({
        user: staff._id,
        isRead: false
      }));

      const newNotification = await Notification.create({
        message: isNowFullyPaid
          ? ` ${updatedBilling.transactionId} is now fully paid! (Total: ₱${totalPaidSoFar.toFixed(2)})`
          : `💰 Additional payment for ${updatedBilling.transactionId} - ₱${newPaymentAmount.toFixed(2)}. Remaining: ₱${updatedRemainingBalance.toFixed(2)}`,
        FileId: updatedBilling._id,
        viewers: viewersList,
      });

      if (io) {
        const notifPayload = {
          _id: newNotification._id,
          message: newNotification.message,
          FileId: newNotification.FileId,
          viewers: newNotification.viewers,
          createdAt: newNotification.createdAt,
        };

        io.to("admin").emit("newNotification", notifPayload);
        io.to("finance").emit("newNotification", notifPayload);
      }

      // ==================== SEND EMAIL — FULLY PAID OR PARTIAL (UPDATE PATH) ====================
      try {
        const customerIdForEmail = updatedBilling.customerId;

        if (customerIdForEmail) {
          const userLogin = await UserLoginSchema.findOne({
            linkedId: customerIdForEmail
          }).select("username linkedId");

          if (userLogin && userLogin.username) {
            const emailSubject = isNowFullyPaid
              ? "Payment Completed - Fully Paid"
              : "Payment Received - Partially Paid";

            const emailText = isNowFullyPaid
              ? `Your billing ${updatedBilling.transactionId} is now FULLY PAID. Total paid: ₱${totalPaidSoFar.toFixed(2)}. Remaining balance: ₱0.00. Thank you!`
              : `We received your partial payment for billing ${updatedBilling.transactionId}.\n\nAmount paid: ₱${newPaymentAmount.toFixed(2)}\nTotal paid so far: ₱${totalPaidSoFar.toFixed(2)}\nRemaining balance: ₱${updatedRemainingBalance.toFixed(2)}\n\nThank you!`;

            await sendEmail({
              email: userLogin.username,
              subject: emailSubject,
              text: emailText,
            });

            console.log(`📧 Email sent to ${userLogin.username} (${isNowFullyPaid ? "FULLY PAID" : "PARTIAL"}) for billing ${updatedBilling.transactionId}`);
          } else {
            console.warn(`⚠️ No user login found for linkedId: ${customerIdForEmail}`);
          }
        } else {
          console.warn("⚠️ No customerId found for email notification");
        }
      } catch (emailError) {
        console.error("⚠️ Error sending email:", emailError.message);
      }

      return res.status(200).json({
        success: true,
        message: isNowFullyPaid ? "Billing fully paid!" : "Additional partial payment processed",
        data: updatedBilling,
        isUpdate: true
      });
    }

    // ============================================
    // CREATE NEW BILLING RECORD
    // ============================================
    console.log(`🆕 Creating new billing record`);

    const transactionId = BillingHistory.getTransactionId();
    console.log(`📋 Generated Transaction ID: ${transactionId}`);

    const updatedBookings = bookings.map(booking => {
      let bookingPaymentAmount = booking.amount;
      let bookingRemainingBalance = 0;

      if (paymentDetails.paymentType === "partial") {
        bookingPaymentAmount = booking.amount * (paymentDetails.paymentAmount / paymentDetails.totalAmount);
        bookingRemainingBalance = booking.amount - bookingPaymentAmount;
      }

      const bookingRoomNumber = roomNumber || booking.roomNumber || booking.delivery?.roomNumber || '';

      return {
        ...booking,
        customerId: customerId,
        paymentStatus: paymentDetails.paymentType,
        paymentAmount: bookingPaymentAmount,
        remainingBalance: bookingRemainingBalance,
        status: "completed",
        roomNumber: bookingRoomNumber,
        delivery: {
          ...booking.delivery,
          roomNumber: bookingRoomNumber
        },
        origin: booking.origin || (booking.bookingItemModel !== 'Accommodation' ? orderOrigin : null) || null,
      };
    });

    const billingHistory = new BillingHistory({
      transactionId: transactionId,
      customerId: customerId,
      paymentDetails: {
        ...paymentDetails,
        paymentAmount: paymentDetails.paymentAmount || paymentDetails.totalAmount,
        paymentType: paymentDetails.paymentType || "full",
        remainingBalance: remainingBalance,
        processedAt: paymentDetails.processedAt || new Date(),
        status: paymentStatus,

        selectedAccommodation: selectedAccommodation,
        selectedAccommodationDetails: selectedAccommodationDetails,
      },
      bookings: updatedBookings,
      processedBy: {
        userId: processedBy?.userId || req.user?._id || "system",
        userName: processedBy?.userName || req.user?.name || "System",
        userEmail: processedBy?.userEmail || req.user?.email || "",
        userRole: processedBy?.userRole || req.user?.role || "staff"
      },
      metadata: metadata || {},
      avatar: avatar,
      status: billingStatus
    });

    await billingHistory.save();

    console.log(" Billing created successfully!");
    console.log("📋 Transaction ID:", billingHistory.transactionId);
    console.log("👤 Customer ID (Customer._id):", billingHistory.customerId);
    console.log("🏠 Room Number:", roomNumber || 'Not set');

    const bookingIdsToUpdate = billingHistory.bookings
      .map(booking => booking._id)
      .filter(id => id);

    console.log(`📋 Found ${bookingIdsToUpdate.length} booking/order IDs to process:`, bookingIdsToUpdate);

    // ============================================
    // UPDATE ORDERS STATUS ONLY (NOT ACTION BOOKINGS)
    // ============================================
    //  TINANGGAL NA ANG ACTION BOOKING UPDATE DITO
    //  Ang ActionBooking status ay hindi na gagalawin sa CREATE.
    //  Ang status update para sa ActionBooking ay ginagawa na lang ng
    //  BillingHistory post-save hook (`updateActionBookingStatus`)
    //  at ito ay may filter na para hindi mabago ang "Confirmed".
    if (bookingIdsToUpdate.length > 0) {
      try {
        const updatedOrders = await orders.updateMany(
          { _id: { $in: bookingIdsToUpdate } },
          {
            $set: {
              status: "completed",
              paymentStatus: paymentDetails.paymentType === "full" ? "completed" : "partial",
              updatedAt: new Date(),
              roomNumber: roomNumber || '',
              delivery: {
                roomNumber: roomNumber || ''
              }
            }
          }
        );

        if (updatedOrders.modifiedCount > 0) {
          console.log(` Updated ${updatedOrders.modifiedCount} order(s) status to "completed"`);
        }
      } catch (updateError) {
        console.error("⚠️ Error updating orders:", updateError);
      }
    }

    // Socket emit
    const io = req.app.get("socketio");

    if (io) {
      const payload = {
        billingHistory: billingHistory,
        message: `New ${paymentDetails.paymentType} billing record created`
      };

      io.to("admin").emit("newBilling", payload);
      io.to("finance").emit("newBilling", payload);
      console.log(`📡 ${paymentDetails.paymentType.toUpperCase()} BILLING EMITTED TO ADMIN + FINANCE`);
    }

    // Notification
    const staffMembers = await UserLoginSchema.find({
      role: { $in: ["admin", "finance"] }
    }).select("_id");

    const viewersList = staffMembers.map(staff => ({
      user: staff._id,
      isRead: false
    }));

    const newNotification = await Notification.create({
      message: `New ${paymentDetails.paymentType} billing: ${billingHistory.transactionId} (₱${paymentDetails.paymentAmount.toFixed(2)}) - ${billingStatus}`,
      FileId: billingHistory._id,
      viewers: viewersList,
    });

    if (io) {
      const notifPayload = {
        _id: newNotification._id,
        message: newNotification.message,
        FileId: newNotification.FileId,
        viewers: newNotification.viewers,
        createdAt: newNotification.createdAt,
      };

      io.to("admin").emit("newNotification", notifPayload);
      io.to("finance").emit("newNotification", notifPayload);
      console.log("🔔 NOTIFICATION EMITTED TO ADMIN + FINANCE");
    }

    // ==================== SEND EMAIL — FULLY PAID OR PARTIAL (CREATE PATH) ====================
    try {
      const customerIdForEmail = billingHistory.customerId;

      if (customerIdForEmail) {
        const userLogin = await UserLoginSchema.findOne({
          linkedId: customerIdForEmail
        }).select("username linkedId");

        if (userLogin && userLogin.username) {
          const isFullyPaidNow = billingStatus === "fully_paid";

          const emailSubject = isFullyPaidNow
            ? "Payment Completed - Fully Paid"
            : "Payment Received - Partially Paid";

          const emailText = isFullyPaidNow
            ? `Your billing ${billingHistory.transactionId} is FULLY PAID.\n\nTotal amount: ₱${billingHistory.paymentDetails.paymentAmount.toFixed(2)}\nRemaining balance: ₱0.00\n\nThank you!`
            : `We received your payment for billing ${billingHistory.transactionId}.\n\nAmount paid: ₱${billingHistory.paymentDetails.paymentAmount.toFixed(2)}\nRemaining balance: ₱${billingHistory.paymentDetails.remainingBalance.toFixed(2)}\n\nThank you!`;

          await sendEmail({
            email: userLogin.username,
            subject: emailSubject,
            text: emailText,
          });

          console.log(`📧 Email sent to ${userLogin.username} (${isFullyPaidNow ? "FULLY PAID" : "PARTIAL"}) for billing ${billingHistory.transactionId}`);
        } else {
          console.warn(`⚠️ No user login found for linkedId: ${customerIdForEmail}`);
        }
      } else {
        console.warn("⚠️ No customerId found for email notification");
      }
    } catch (emailError) {
      console.error("⚠️ Error sending email:", emailError.message);
    }

    res.status(201).json({
      success: true,
      message: "Billing history created successfully",
      data: billingHistory,
      isUpdate: false
    });

  } catch (error) {
    console.error("CREATE BILLING HISTORY ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create billing history",
      message: "Failed to create billing history",
      error: error.message
    });
  }
});

// ==================== READ ====================

exports.getAllBillingHistory = AsyncErrorHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    status,
    startDate,
    endDate,
    userId,
    paymentMethod,
    paymentType,
    search
  } = req.query;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const pageSize = parseInt(limit);

  let filter = {};

  if (status) {
    filter.status = status;
  }

  if (paymentMethod) {
    filter["paymentDetails.method"] = paymentMethod;
  }

  if (paymentType) {
    filter["paymentDetails.paymentType"] = paymentType;
  }

  if (userId) {
    filter["processedBy.userId"] = userId;
  }

  if (startDate || endDate) {
    filter["paymentDetails.processedAt"] = {};
    if (startDate) {
      filter["paymentDetails.processedAt"].$gte = new Date(startDate);
    }
    if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      filter["paymentDetails.processedAt"].$lte = endOfDay;
    }
  }

  if (search && search.trim() !== "") {
    filter.$or = [
      { transactionId: { $regex: search, $options: "i" } },
      { "paymentDetails.referenceNo": { $regex: search, $options: "i" } },
      { "bookings.orderNumber": { $regex: search, $options: "i" } },
      { "bookings.bookingNumber": { $regex: search, $options: "i" } },
      { "paymentDetails.selectedAccommodation": { $regex: search, $options: "i" } }
    ];
  }

  console.log("🔍 GET BILLING HISTORY FILTER:", filter);

  const results = await BillingHistory.aggregate([
    { $match: filter },
    { $sort: { "paymentDetails.processedAt": -1 } },

    //  LOOKUP: Customer details from "customers"
    {
      $lookup: {
        from: "customers",
        localField: "customerId",
        foreignField: "_id",
        as: "customerDetails"
      }
    },
    {
      $unwind: {
        path: "$customerDetails",
        preserveNullAndEmptyArrays: true
      }
    },

    //  LOOKUP: processedBy user
    {
      $lookup: {
        from: "userloginschemas",
        localField: "processedBy.userId",
        foreignField: "_id",
        as: "processedByUser"
      }
    },
    {
      $unwind: {
        path: "$processedByUser",
        preserveNullAndEmptyArrays: true
      }
    },

    {
      $addFields: {
        processedByName: "$processedByUser.name",
        processedByEmail: "$processedByUser.email",
        customer: {
          _id: "$customerDetails._id",
          first_name: "$customerDetails.first_name",
          last_name: "$customerDetails.last_name",
          middle_name: "$customerDetails.middle_name",
          suffix: "$customerDetails.suffix",
          email: "$customerDetails.email",
          gender: "$customerDetails.gender",
          avatar: "$customerDetails.avatar",
          full_name: {
            $concat: [
              { $ifNull: ["$customerDetails.first_name", ""] },
              " ",
              { $ifNull: ["$customerDetails.last_name", ""] }
            ]
          }
        },
        totalItems: { $size: "$bookings" },
        isPartialPayment: { $eq: ["$paymentDetails.paymentType", "partial"] },
        isFullPayment: { $eq: ["$paymentDetails.paymentType", "full"] }
      }
    },
    {
      $facet: {
        metadata: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: pageSize }]
      }
    }
  ]);

  const totalCount = results[0].metadata[0]?.total || 0;
  const billingHistory = results[0].data;
  const totalPages = Math.ceil(totalCount / pageSize);

  res.status(200).json({
    success: true,
    totalCount,
    totalPages,
    currentPage: parseInt(page),
    limit: pageSize,
    data: billingHistory
  });
});

exports.getBillingHistoryById = AsyncErrorHandler(async (req, res) => {
  const { id } = req.params;

  const billingHistory = await BillingHistory.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(id) } },

    //  LOOKUP: Customer details
    {
      $lookup: {
        from: "customers",
        localField: "customerId",
        foreignField: "_id",
        as: "customerDetails"
      }
    },
    {
      $unwind: {
        path: "$customerDetails",
        preserveNullAndEmptyArrays: true
      }
    },

    //  LOOKUP: processedBy
    {
      $lookup: {
        from: "userloginschemas",
        localField: "processedBy.userId",
        foreignField: "_id",
        as: "processedByUser"
      }
    },
    {
      $unwind: {
        path: "$processedByUser",
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $addFields: {
        processedByName: "$processedByUser.name",
        processedByEmail: "$processedByUser.email",
        customer: {
          _id: "$customerDetails._id",
          first_name: "$customerDetails.first_name",
          last_name: "$customerDetails.last_name",
          middle_name: "$customerDetails.middle_name",
          suffix: "$customerDetails.suffix",
          email: "$customerDetails.email",
          gender: "$customerDetails.gender",
          avatar: "$customerDetails.avatar",
          full_name: {
            $concat: [
              { $ifNull: ["$customerDetails.first_name", ""] },
              " ",
              { $ifNull: ["$customerDetails.last_name", ""] }
            ]
          }
        },
        totalItems: { $size: "$bookings" },
        isPartialPayment: { $eq: ["$paymentDetails.paymentType", "partial"] },
        isFullPayment: { $eq: ["$paymentDetails.paymentType", "full"] }
      }
    }
  ]);

  if (!billingHistory || billingHistory.length === 0) {
    return res.status(404).json({
      success: false,
      message: "Billing history not found"
    });
  }

  res.status(200).json({
    success: true,
    data: billingHistory[0]
  });
});

exports.getBillingHistoryByTransactionId = AsyncErrorHandler(async (req, res) => {
  const { transactionId } = req.params;

  const billingHistory = await BillingHistory.findOne({ transactionId });

  if (!billingHistory) {
    return res.status(404).json({
      success: false,
      message: "Billing history not found"
    });
  }

  res.status(200).json({
    success: true,
    data: billingHistory
  });
});

exports.getBillingHistoryByUser = AsyncErrorHandler(async (req, res) => {
  const { userId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const pageSize = parseInt(limit);

  const results = await BillingHistory.aggregate([
    { $match: { "processedBy.userId": userId } },
    { $sort: { "paymentDetails.processedAt": -1 } },
    {
      $facet: {
        metadata: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: pageSize }]
      }
    }
  ]);

  const totalCount = results[0].metadata[0]?.total || 0;
  const billingHistory = results[0].data;
  const totalPages = Math.ceil(totalCount / pageSize);

  res.status(200).json({
    success: true,
    totalCount,
    totalPages,
    currentPage: parseInt(page),
    limit: pageSize,
    data: billingHistory
  });
});

exports.getBillingHistoryByDateRange = AsyncErrorHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({
      success: false,
      message: "Start date and end date are required"
    });
  }

  const billingHistory = await BillingHistory.findByDateRange(
    new Date(startDate),
    new Date(endDate)
  );

  res.status(200).json({
    success: true,
    count: billingHistory.length,
    data: billingHistory
  });
});

exports.getBillingStatistics = AsyncErrorHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const dateFilter = {};
  if (startDate && endDate) {
    dateFilter["paymentDetails.processedAt"] = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }

  const stats = await BillingHistory.aggregate([
    {
      $match: {
        ...dateFilter,
        status: { $in: ["completed", "verified", "pending", "failed", "refunded", "partial"] }
      }
    },
    {
      $group: {
        _id: "$status",
        totalAmount: { $sum: "$paymentDetails.paymentAmount" },
        totalDue: { $sum: "$paymentDetails.totalAmount" },
        count: { $sum: 1 },
        avgAmount: { $avg: "$paymentDetails.paymentAmount" }
      }
    }
  ]);

  const paymentTypeStats = await BillingHistory.aggregate([
    { $match: { ...dateFilter, status: "completed" } },
    {
      $group: {
        _id: "$paymentDetails.paymentType",
        totalAmount: { $sum: "$paymentDetails.paymentAmount" },
        totalDue: { $sum: "$paymentDetails.totalAmount" },
        count: { $sum: 1 }
      }
    }
  ]);

  const dailyStats = await BillingHistory.aggregate([
    { $match: { ...dateFilter, status: "completed" } },
    {
      $group: {
        _id: {
          year: { $year: "$paymentDetails.processedAt" },
          month: { $month: "$paymentDetails.processedAt" },
          day: { $dayOfMonth: "$paymentDetails.processedAt" }
        },
        totalAmount: { $sum: "$paymentDetails.paymentAmount" },
        count: { $sum: 1 }
      }
    },
    { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    { $limit: 30 }
  ]);

  const methodStats = await BillingHistory.aggregate([
    { $match: { ...dateFilter, status: "completed" } },
    {
      $group: {
        _id: "$paymentDetails.method",
        totalAmount: { $sum: "$paymentDetails.paymentAmount" },
        count: { $sum: 1 }
      }
    }
  ]);

  const summary = await BillingHistory.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: null,
        totalRevenue: {
          $sum: {
            $cond: [
              { $in: ["$status", ["completed", "verified"]] },
              "$paymentDetails.paymentAmount",
              0
            ]
          }
        },
        totalDue: { $sum: "$paymentDetails.totalAmount" },
        totalRefunded: {
          $sum: {
            $cond: [
              { $eq: ["$status", "refunded"] },
              "$refund.refundAmount",
              0
            ]
          }
        },
        totalTransactions: { $sum: 1 },
        totalBookings: { $sum: "$paymentDetails.bookingCount" },
        totalPartialPayments: {
          $sum: {
            $cond: [
              { $eq: ["$paymentDetails.paymentType", "partial"] },
              1,
              0
            ]
          }
        },
        totalFullPayments: {
          $sum: {
            $cond: [
              { $eq: ["$paymentDetails.paymentType", "full"] },
              1,
              0
            ]
          }
        }
      }
    }
  ]);

  res.status(200).json({
    success: true,
    data: {
      summary: summary[0] || {
        totalRevenue: 0,
        totalDue: 0,
        totalRefunded: 0,
        totalTransactions: 0,
        totalBookings: 0,
        totalPartialPayments: 0,
        totalFullPayments: 0
      },
      statusBreakdown: stats,
      paymentTypeBreakdown: paymentTypeStats,
      dailyTrend: dailyStats,
      paymentMethodBreakdown: methodStats
    }
  });
});

// ==================== GET PARTIAL PAYMENTS ====================

exports.getPartialPayments = AsyncErrorHandler(async (req, res) => {
  const role = req.user.role;
  const userId = req.user.linkId;

  console.log("👤 User Role:", role);
  console.log("👤 User ID:", userId);

  const { page = 1, limit = 20 } = req.query;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const pageSize = parseInt(limit);

  if (!role) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: User role not found"
    });
  }

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: User ID not found"
    });
  }

  let matchCondition = {
    $and: [
      { "paymentDetails.paymentType": "partial" },
      { "paymentDetails.status": { $ne: "pending" } }
    ]
  };

  if (role && role !== "customer") {
    console.log("🔍 Staff/Admin - Fetching ALL partial payments");
  } else if (role === "customer") {
    console.log("🔍 Customer - Filtering by user ID:", userId);

    const user = await UserLoginSchema.findOne({ linkedId: userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found with the provided linkId"
      });
    }

    console.log(" Found user:", user._id);
    console.log("User linkedId (Customer._id):", user.linkedId);

    //  Match by linkedId (Customer._id) OR _id
    matchCondition.$and.push({
      $or: [
        { customerId: user.linkedId },
        { customerId: user._id },
      ]
    });
  } else {
    return res.status(200).json({
      success: true,
      totalCount: 0,
      totalPages: 0,
      currentPage: parseInt(page),
      limit: pageSize,
      data: []
    });
  }

  try {
    const results = await BillingHistory.aggregate([
      { $match: matchCondition },
      { $sort: { "paymentDetails.processedAt": -1 } },

      //  LOOKUP: Customer details from "customers"
      {
        $lookup: {
          from: "customers",
          localField: "customerId",
          foreignField: "_id",
          as: "customerDetails"
        }
      },
      {
        $unwind: {
          path: "$customerDetails",
          preserveNullAndEmptyArrays: true
        }
      },

      //  I-inject ang customer info sa bawat booking
      {
        $addFields: {
          customer: {
            _id: "$customerDetails._id",
            first_name: "$customerDetails.first_name",
            last_name: "$customerDetails.last_name",
            middle_name: "$customerDetails.middle_name",
            suffix: "$customerDetails.suffix",
            email: "$customerDetails.email",
            gender: "$customerDetails.gender",
            avatar: "$customerDetails.avatar",
            full_name: {
              $concat: [
                { $ifNull: ["$customerDetails.first_name", ""] },
                " ",
                { $ifNull: ["$customerDetails.last_name", ""] }
              ]
            }
          },
          bookings: {
            $map: {
              input: "$bookings",
              as: "booking",
              in: {
                $mergeObjects: [
                  "$$booking",
                  {
                    customer: {
                      _id: "$customerDetails._id",
                      first_name: "$customerDetails.first_name",
                      last_name: "$customerDetails.last_name",
                      full_name: {
                        $concat: [
                          { $ifNull: ["$customerDetails.first_name", ""] },
                          " ",
                          { $ifNull: ["$customerDetails.last_name", ""] }
                        ]
                      },
                      email: "$customerDetails.email"
                    }
                  }
                ]
              }
            }
          }
        }
      },

      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $skip: skip },
            { $limit: pageSize }
          ]
        }
      }
    ]);

    const totalCount = results[0].metadata[0]?.total || 0;
    const billingHistory = results[0].data;
    const totalPages = Math.ceil(totalCount / pageSize);

    console.log(`📊 Total Partial Payments: ${totalCount}`);

    if (billingHistory.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No partial payments found",
        totalCount: 0,
        totalPages: 0,
        currentPage: parseInt(page),
        limit: pageSize,
        data: []
      });
    }

    res.status(200).json({
      success: true,
      message: `Successfully retrieved ${billingHistory.length} partial payments`,
      totalCount,
      totalPages,
      currentPage: parseInt(page),
      limit: pageSize,
      data: billingHistory
    });

  } catch (error) {
    console.error("❌ Error in getPartialPayments:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while fetching partial payment data",
      error: error.message
    });
  }
});

// ==================== GET FULL PAYMENTS ====================

exports.getFullPayments = AsyncErrorHandler(async (req, res) => {
  const role = req.user.role;
  const userId = req.user.linkId;
  const { page = 1, limit = 20 } = req.query;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const pageSize = parseInt(limit);

  if (!role) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: User role not found"
    });
  }

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: User ID not found"
    });
  }

  let matchCondition = {
    $and: [
      { "paymentDetails.paymentType": "full" },
      { "paymentDetails.status": { $ne: "pending" } }
    ]
  };

  let customerActionBookings = [];

  if (role === "customer") {
    console.log("🔍 Customer - Filtering by user ID:", userId);

    const user = await UserLoginSchema.findOne({ linkedId: userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found with the provided linkId"
      });
    }

    console.log(" Found user:", user._id);
    const userObjectIdString = user._id.toString();

    customerActionBookings = await actionbooking.find({
      customerId: userObjectIdString
    }).lean();

    console.log(`📋 Found ${customerActionBookings.length} action booking(s) for customer`);

    //  Match by linkedId (Customer._id) OR _id
    matchCondition.$and.push({
      $or: [
        { customerId: user.linkedId },
        { customerId: user._id },
      ]
    });

  } else if (role && role !== "customer") {
    console.log("🔍 Staff/Admin - Fetching ALL full payments");
  } else {
    return res.status(200).json({
      success: true,
      totalCount: 0,
      totalPages: 0,
      currentPage: parseInt(page),
      limit: pageSize,
      data: []
    });
  }

  try {
    const results = await BillingHistory.aggregate([
      { $match: matchCondition },
      { $sort: { "paymentDetails.processedAt": -1 } },

      //  LOOKUP: Customer details from "customers"
      {
        $lookup: {
          from: "customers",
          localField: "customerId",
          foreignField: "_id",
          as: "customerDetails"
        }
      },
      {
        $unwind: {
          path: "$customerDetails",
          preserveNullAndEmptyArrays: true
        }
      },

      {
        $unwind: {
          path: "$bookings",
          preserveNullAndEmptyArrays: true
        }
      },

      {
        $lookup: {
          from: "actionbookings",
          localField: "bookings._id",
          foreignField: "_id",
          as: "actionBookingDetails"
        }
      },
      {
        $unwind: {
          path: "$actionBookingDetails",
          preserveNullAndEmptyArrays: true
        }
      },

      {
        $group: {
          _id: "$_id",
          transactionId: { $first: "$transactionId" },
          customerId: { $first: "$customerId" },
          customerDetails: { $first: "$customerDetails" },
          paymentDetails: { $first: "$paymentDetails" },
          processedBy: { $first: "$processedBy" },
          metadata: { $first: "$metadata" },
          avatar: { $first: "$avatar" },
          status: { $first: "$status" },
          statusHistory: { $first: "$statusHistory" },
          refund: { $first: "$refund" },
          createdAt: { $first: "$createdAt" },
          updatedAt: { $first: "$updatedAt" },
          bookings: {
            $push: {
              $mergeObjects: [
                "$bookings",
                {
                  customerInfo: {
                    _id: "$customerDetails._id",
                    first_name: "$customerDetails.first_name",
                    last_name: "$customerDetails.last_name",
                    middle_name: "$customerDetails.middle_name",
                    suffix: "$customerDetails.suffix",
                    email: "$customerDetails.email",
                    gender: "$customerDetails.gender",
                    avatar: "$customerDetails.avatar"
                  },
                  actionBookingDetails: {
                    _id: "$actionBookingDetails._id",
                    bookingNumber: "$actionBookingDetails.bookingNumber",
                    bookingItemId: "$actionBookingDetails.bookingItemId",
                    bookingItemModel: "$actionBookingDetails.bookingItemModel",
                    isWalkin: "$actionBookingDetails.isWalkin",
                    expected_stay: "$actionBookingDetails.expected_stay",
                    status: "$actionBookingDetails.status",
                    isDone: "$actionBookingDetails.isDone",
                    customerId: "$actionBookingDetails.customerId",
                    amount: "$actionBookingDetails.amount",
                    createdAt: "$actionBookingDetails.createdAt",
                    updatedAt: "$actionBookingDetails.updatedAt"
                  }
                }
              ]
            }
          }
        }
      },

      {
        $project: {
          _id: 1,
          transactionId: 1,
          customerId: 1,
          customer: {
            _id: "$customerDetails._id",
            first_name: "$customerDetails.first_name",
            last_name: "$customerDetails.last_name",
            middle_name: "$customerDetails.middle_name",
            suffix: "$customerDetails.suffix",
            full_name: {
              $concat: [
                { $ifNull: ["$customerDetails.first_name", ""] },
                " ",
                { $ifNull: ["$customerDetails.last_name", ""] }
              ]
            },
            email: "$customerDetails.email",
            gender: "$customerDetails.gender",
            avatar: "$customerDetails.avatar"
          },
          paymentDetails: 1,
          processedBy: 1,
          metadata: 1,
          avatar: 1,
          status: 1,
          statusHistory: 1,
          refund: 1,
          createdAt: 1,
          updatedAt: 1,
          bookings: {
            $map: {
              input: "$bookings",
              as: "booking",
              in: {
                _id: "$$booking._id",
                type: "$$booking.type",
                status: "$$booking.status",
                amount: "$$booking.amount",
                createdAt: "$$booking.createdAt",
                customer: {
                  _id: "$$booking.customerInfo._id",
                  first_name: "$$booking.customerInfo.first_name",
                  last_name: "$$booking.customerInfo.last_name",
                  full_name: {
                    $concat: [
                      { $ifNull: ["$$booking.customerInfo.first_name", ""] },
                      " ",
                      { $ifNull: ["$$booking.customerInfo.last_name", ""] }
                    ]
                  },
                  email: "$$booking.customerInfo.email"
                },
                orderId: "$$booking.orderId",
                orderNumber: "$$booking.orderNumber",
                orderStatus: "$$booking.orderStatus",
                paymentMethod: "$$booking.paymentMethod",
                referenceNo: "$$booking.referenceNo",
                title: "$$booking.title",
                itemCount: "$$booking.itemCount",
                items: "$$booking.items",
                totals: "$$booking.totals",
                payment: "$$booking.payment",
                delivery: "$$booking.delivery",
                bookingNumber: "$$booking.bookingNumber",
                bookingItemId: "$$booking.bookingItemId",
                bookingItemModel: "$$booking.bookingItemModel",
                bookingStatus: "$$booking.bookingStatus",
                isCompleted: "$$booking.isCompleted",
                itemName: "$$booking.itemName",
                itemDescription: "$$booking.itemDescription",
                itemPrice: "$$booking.itemPrice",
                itemImage: "$$booking.itemImage",
                itemDetails: "$$booking.itemDetails",
                accommodationType: "$$booking.accommodationType",
                minCapacity: "$$booking.minCapacity",
                maxCapacity: "$$booking.maxCapacity",
                amenities: "$$booking.amenities",
                rentalUnit: "$$booking.rentalUnit",
                serviceCategory: "$$booking.serviceCategory",
                approver: "$$booking.approver",
                paymentStatus: "$$booking.paymentStatus",
                paymentAmount: "$$booking.paymentAmount",
                remainingBalance: "$$booking.remainingBalance",
                origin: "$$booking.origin",
                actionBookingDetails: "$$booking.actionBookingDetails"
              }
            }
          }
        }
      },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $skip: skip },
            { $limit: pageSize }
          ]
        }
      }
    ]);

    const totalCount = results[0]?.metadata[0]?.total || 0;
    const billingHistory = results[0]?.data || [];
    const totalPages = Math.ceil(totalCount / pageSize);

    if (billingHistory.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No full payments found",
        totalCount: 0,
        totalPages: 0,
        currentPage: parseInt(page),
        limit: pageSize,
        data: []
      });
    }

    let actionBookingsSummary = null;

    if (role === "customer" && customerActionBookings.length > 0) {
      actionBookingsSummary = {
        count: customerActionBookings.length,
        bookings: customerActionBookings.map(ab => ({
          _id: ab._id,
          bookingNumber: ab.bookingNumber,
          bookingItemModel: ab.bookingItemModel,
          status: ab.status,
          amount: ab.amount,
          createdAt: ab.createdAt,
          isWalkin: ab.isWalkin,
          expected_stay: ab.expected_stay
        }))
      };
    }

    res.status(200).json({
      success: true,
      message: `Successfully retrieved ${billingHistory.length} full payments`,
      totalCount,
      totalPages,
      currentPage: parseInt(page),
      limit: pageSize,
      data: billingHistory,
      actionBookingsSummary: actionBookingsSummary
    });

  } catch (error) {
    console.error("❌ Error in getFullPayments:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while fetching full payment data",
      error: error.message
    });
  }
});

// ==================== GET VERIFY PAYMENTS ====================

exports.getVerifyPayments = AsyncErrorHandler(async (req, res) => {
  const role = req.user.role;
  const userId = req.user.linkId;

  const { page = 1, limit = 20 } = req.query;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const pageSize = parseInt(limit);

  if (!role) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: User role not found"
    });
  }

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: User ID not found"
    });
  }

  let matchCondition = {
    $and: [
      {
        $or: [
          { "paymentDetails.paymentType": "partial" },
          { "paymentDetails.paymentType": "full" }
        ]
      },
      { "paymentDetails.status": "pending" }
    ]
  };

  if (role && role !== "customer") {
    console.log("🔍 Staff/Admin - Fetching ALL pending verify payments");
  } else if (role === "customer") {
    const user = await UserLoginSchema.findOne({ linkedId: userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found with the provided linkId"
      });
    }

    console.log(" Found user:", user._id);

    //  Match by linkedId (Customer._id) OR _id
    matchCondition.$and.push({
      $or: [
        { customerId: user.linkedId },
        { customerId: user._id },
      ]
    });
  } else {
    return res.status(200).json({
      success: true,
      totalCount: 0,
      totalPages: 0,
      currentPage: parseInt(page),
      limit: pageSize,
      data: []
    });
  }

  try {
    const results = await BillingHistory.aggregate([
      { $match: matchCondition },
      { $sort: { "paymentDetails.processedAt": -1 } },

      //  LOOKUP: Customer details from "customers"
      {
        $lookup: {
          from: "customers",
          localField: "customerId",
          foreignField: "_id",
          as: "customerDetails"
        }
      },
      {
        $unwind: {
          path: "$customerDetails",
          preserveNullAndEmptyArrays: true
        }
      },

      {
        $addFields: {
          customer: {
            _id: "$customerDetails._id",
            first_name: "$customerDetails.first_name",
            last_name: "$customerDetails.last_name",
            middle_name: "$customerDetails.middle_name",
            suffix: "$customerDetails.suffix",
            email: "$customerDetails.email",
            gender: "$customerDetails.gender",
            avatar: "$customerDetails.avatar",
            full_name: {
              $concat: [
                { $ifNull: ["$customerDetails.first_name", ""] },
                " ",
                { $ifNull: ["$customerDetails.last_name", ""] }
              ]
            }
          },
          bookings: {
            $map: {
              input: "$bookings",
              as: "booking",
              in: {
                $mergeObjects: [
                  "$$booking",
                  {
                    customer: {
                      _id: "$customerDetails._id",
                      first_name: "$customerDetails.first_name",
                      last_name: "$customerDetails.last_name",
                      full_name: {
                        $concat: [
                          { $ifNull: ["$customerDetails.first_name", ""] },
                          " ",
                          { $ifNull: ["$customerDetails.last_name", ""] }
                        ]
                      },
                      email: "$customerDetails.email"
                    }
                  }
                ]
              }
            }
          }
        }
      },

      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $skip: skip },
            { $limit: pageSize }
          ]
        }
      }
    ]);

    const totalCount = results[0].metadata[0]?.total || 0;
    const billingHistory = results[0].data;
    const totalPages = Math.ceil(totalCount / pageSize);

    if (billingHistory.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No pending verify payments found",
        totalCount: 0,
        totalPages: 0,
        currentPage: parseInt(page),
        limit: pageSize,
        data: []
      });
    }

    res.status(200).json({
      success: true,
      message: `Successfully retrieved ${billingHistory.length} pending verify payments`,
      totalCount,
      totalPages,
      currentPage: parseInt(page),
      limit: pageSize,
      data: billingHistory
    });

  } catch (error) {
    console.error("❌ Error in getVerifyPayments:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while fetching verify payment data",
      error: error.message
    });
  }
});

exports.updateBillingStatus = AsyncErrorHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;
    const userId = req.user?._id || "system";
    const userName = req.user?.name || "System";

    console.log("status", status)

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required"
      });
    }

    const validStatuses = ["pending", "verified", "completed", "failed", "refunded", "partial", "paid"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status"
      });
    }

    let billingHistory = await BillingHistory.findById(id);

    if (!billingHistory) {
      return res.status(404).json({
        success: false,
        message: "Billing history not found"
      });
    }

    billingHistory.status = status;
    billingHistory.statusHistory.push({
      status,
      timestamp: new Date(),
      note: note || `Status updated to ${status}`,
      updatedBy: { userId, userName }
    });

    if (status === "completed") {
      billingHistory.paymentDetails.status = "completed";
    }

    if (status === "partial") {
      const totalPaid = billingHistory.paymentDetails.paymentAmount;
      const totalDue = billingHistory.paymentDetails.totalAmount;
      billingHistory.paymentDetails.remainingBalance = totalDue - totalPaid;
    }

    await billingHistory.save();

    const io = req.app.get("socketio");

    if (io) {
      const payload = {
        billingHistory,
        message: `Billing status updated to ${status}`
      };

      io.to("admin").emit("billingStatusUpdated", payload);
      io.to("finance").emit("billingStatusUpdated", payload);
    }

    const notification = await Notification.create({
      message: `Billing ${billingHistory.transactionId} status updated to ${status}`,
      FileId: billingHistory._id,
      viewers: [
        {
          user: billingHistory.processedBy.userId,
          isRead: false
        }
      ]
    });

    if (io) {
      const notifPayload = {
        _id: notification._id,
        message: notification.message,
        FileId: notification.FileId,
        createdAt: notification.createdAt,
      };

      const userRoom = `user-${billingHistory.processedBy.userId}`;
      io.to(userRoom).emit("newNotification", notifPayload);
      io.to("admin").emit("newNotification", notifPayload);
      io.to("finance").emit("newNotification", notifPayload);
    }

    // ==================== SEND EMAIL ONLY WHEN STATUS IS "paid" ====================
    if (status === "paid") {
      const customerId = billingHistory.processedBy?.userId;

      if (!customerId) {
        console.warn("⚠️ No customerId found in billingHistory.processedBy");
      } else {
        // Hanapin ang user sa UserLoginSchema gamit ang linkedId = customerId
        const userLogin = await UserLoginSchema.findOne({
          linkedId: customerId
        }).select("username linkedId");

        if (!userLogin || !userLogin.username) {
          console.warn(`⚠️ No user login found for linkedId: ${customerId}`);
        } else {
          // Send email
          await sendEmail({
            email: userLogin.username, // username field holds the email
            subject: "Please Check your email",
            text: `Billing ${billingHistory.transactionId} status updated to ${status}`,
          });

          console.log(`📧 Email sent to ${userLogin.username} for billing ${billingHistory.transactionId}`);
        }
      }
    }

    res.status(200).json({
      success: true,
      message: "Billing status updated successfully",
      data: billingHistory
    });

  } catch (error) {
    console.error("UPDATE BILLING STATUS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update billing status",
      error: error.message
    });
  }
});

exports.processRefund = AsyncErrorHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body;
    const userId = req.user?._id || "system";
    const userName = req.user?.name || "System";

    const billingHistory = await BillingHistory.findById(id);

    if (!billingHistory) {
      return res.status(404).json({
        success: false,
        message: "Billing history not found"
      });
    }

    if (billingHistory.refund.isRefunded) {
      return res.status(400).json({
        success: false,
        message: "This transaction has already been refunded"
      });
    }

    if (billingHistory.status === "refunded") {
      return res.status(400).json({
        success: false,
        message: "This transaction has already been refunded"
      });
    }

    const refundAmount = amount || billingHistory.paymentDetails.paymentAmount;

    if (refundAmount > billingHistory.paymentDetails.paymentAmount) {
      return res.status(400).json({
        success: false,
        message: `Refund amount cannot exceed paid amount of ₱${billingHistory.paymentDetails.paymentAmount.toFixed(2)}`
      });
    }

    await billingHistory.processRefund(
      userId,
      userName,
      refundAmount,
      reason || "Customer requested refund"
    );

    if (billingHistory.paymentDetails.paymentType === "partial") {
      billingHistory.paymentDetails.remainingBalance =
        billingHistory.paymentDetails.totalAmount - billingHistory.paymentDetails.paymentAmount;
    }

    await billingHistory.save();

    const io = req.app.get("socketio");

    if (io) {
      const payload = {
        billingHistory,
        message: `Refund processed for ${billingHistory.transactionId}`
      };

      io.to("admin").emit("billingRefunded", payload);
      io.to("finance").emit("billingRefunded", payload);
    }

    res.status(200).json({
      success: true,
      message: "Refund processed successfully",
      data: billingHistory
    });

  } catch (error) {
    console.error("PROCESS REFUND ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process refund",
      error: error.message
    });
  }
});

exports.updateBillingNotes = AsyncErrorHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    if (notes === undefined) {
      return res.status(400).json({
        success: false,
        message: "Notes are required"
      });
    }

    const billingHistory = await BillingHistory.findById(id);

    if (!billingHistory) {
      return res.status(404).json({
        success: false,
        message: "Billing history not found"
      });
    }

    billingHistory.paymentDetails.notes = notes;
    await billingHistory.save();

    res.status(200).json({
      success: true,
      message: "Notes updated successfully",
      data: billingHistory
    });

  } catch (error) {
    console.error("UPDATE NOTES ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update notes",
      error: error.message
    });
  }
});

exports.addPartialPayment = AsyncErrorHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { additionalAmount, note } = req.body;
    const userId = req.user?._id || "system";
    const userName = req.user?.name || "System";

    if (!additionalAmount || additionalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid additional payment amount is required"
      });
    }

    const billingHistory = await BillingHistory.findById(id);

    if (!billingHistory) {
      return res.status(404).json({
        success: false,
        message: "Billing history not found"
      });
    }

    if (billingHistory.paymentDetails.paymentType !== "partial") {
      return res.status(400).json({
        success: false,
        message: "This is not a partial payment record"
      });
    }

    if (billingHistory.status === "completed" || billingHistory.status === "refunded") {
      return res.status(400).json({
        success: false,
        message: `Cannot add payment to a ${billingHistory.status} transaction`
      });
    }

    const remainingBalance = billingHistory.paymentDetails.remainingBalance;

    if (additionalAmount > remainingBalance) {
      return res.status(400).json({
        success: false,
        message: `Additional payment cannot exceed remaining balance of ₱${remainingBalance.toFixed(2)}`
      });
    }

    billingHistory.paymentDetails.paymentAmount += additionalAmount;
    billingHistory.paymentDetails.remainingBalance =
      billingHistory.paymentDetails.totalAmount - billingHistory.paymentDetails.paymentAmount;

    const totalPaid = billingHistory.paymentDetails.paymentAmount;
    const totalDue = billingHistory.paymentDetails.totalAmount;

    billingHistory.bookings.forEach(booking => {
      const bookingRatio = booking.amount / totalDue;
      booking.paymentAmount = totalPaid * bookingRatio;
      booking.remainingBalance = booking.amount - booking.paymentAmount;
    });

    if (billingHistory.paymentDetails.remainingBalance === 0) {
      billingHistory.status = "completed";
      billingHistory.paymentDetails.paymentType = "full";
      billingHistory.paymentDetails.status = "completed";
      billingHistory.bookings.forEach(booking => {
        booking.paymentStatus = "full";
        booking.remainingBalance = 0;
      });
    }

    billingHistory.statusHistory.push({
      status: billingHistory.status,
      timestamp: new Date(),
      note: note || `Additional payment of ₱${additionalAmount.toFixed(2)} added. Remaining: ₱${billingHistory.paymentDetails.remainingBalance.toFixed(2)}`,
      updatedBy: { userId, userName }
    });

    await billingHistory.save();

    const io = req.app.get("socketio");
    if (io) {
      io.to("admin").emit("billingUpdated", { billingHistory });
      io.to("finance").emit("billingUpdated", { billingHistory });
    }

    res.status(200).json({
      success: true,
      message: "Additional payment added successfully",
      data: billingHistory
    });

  } catch (error) {
    console.error("ADD PARTIAL PAYMENT ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to add partial payment",
      error: error.message
    });
  }
});

// ==================== DELETE ====================

exports.deleteBillingHistory = AsyncErrorHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id || "system";
    const userName = req.user?.name || "System";

    const billingHistory = await BillingHistory.findById(id);

    if (!billingHistory) {
      return res.status(404).json({
        success: false,
        message: "Billing history not found"
      });
    }

    billingHistory.status = "deleted";
    billingHistory.statusHistory.push({
      status: "deleted",
      timestamp: new Date(),
      note: "Billing record deleted",
      updatedBy: { userId, userName }
    });

    await billingHistory.save();

    res.status(200).json({
      success: true,
      message: "Billing history deleted successfully"
    });

  } catch (error) {
    console.error("DELETE BILLING HISTORY ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete billing history",
      error: error.message
    });
  }
});

exports.permanentlyDeleteBillingHistory = AsyncErrorHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const billingHistory = await BillingHistory.findByIdAndDelete(id);

    if (!billingHistory) {
      return res.status(404).json({
        success: false,
        message: "Billing history not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Billing history permanently deleted"
    });

  } catch (error) {
    console.error("PERMANENT DELETE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to permanently delete billing history",
      error: error.message
    });
  }
});

exports.updatePaymentStatus = AsyncErrorHandler(async (req, res) => {
  try {
    const { status } = req.body;
    const { billingId } = req.params;

    console.log("📋 Update Payment Status Request:", { billingId, status });

    if (!billingId) {
      return res.status(400).json({
        success: false,
        message: "Billing ID is required"
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required"
      });
    }

    if (!mongoose.Types.ObjectId.isValid(billingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Billing ID format"
      });
    }

    const validStatuses = ['pending', 'verified', 'completed', 'rejected', 'cancelled', 'refunded', 'partial'];
    if (!validStatuses.includes(status)) {
      console.log(`⚠️ Warning: Status "${status}" is not in the standard list. Allowing anyway.`);
    }

    console.log(`📌 Updating paymentDetails.status to: ${status}`);

    const billing = await BillingHistory.findById(billingId);
    if (!billing) {
      return res.status(404).json({
        success: false,
        message: "Billing record not found"
      });
    }

    console.log(`📋 Found billing: ${billing.transactionId}`);
    console.log(`Current paymentDetails.status: ${billing.paymentDetails?.status}`);
    console.log(`Current remainingBalance: ${billing.paymentDetails?.remainingBalance}`);
    console.log(`New status: ${status}`);

    if (billing.paymentDetails?.status === status) {
      console.log(`ℹ️ Status is already "${status}". No changes needed.`);
      return res.status(200).json({
        success: true,
        message: `Status is already set to "${status}"`,
        data: billing,
        noChange: true
      });
    }

    const remainingBalance = billing.paymentDetails?.remainingBalance || 0;
    const isFullyPaid = remainingBalance <= 0;
    const paymentType = isFullyPaid ? "full" : "partial";
    const billingStatus = isFullyPaid ? "fully_paid" : "partial";

    console.log(`💰 Remaining Balance: ₱${remainingBalance.toFixed(2)}`);
    console.log(`💳 Payment Type: ${paymentType.toUpperCase()}`);
    console.log(` Is Fully Paid: ${isFullyPaid}`);
    console.log(`📊 Billing Status: ${billingStatus}`);

    const updateData = {
      $set: {
        "paymentDetails.status": status,
        "paymentDetails.paymentType": paymentType,
        "status": billingStatus
      },
      $push: {
        statusHistory: {
          status: billingStatus,
          timestamp: new Date(),
          note: isFullyPaid
            ? ` Payment verified and FULLY PAID! Remaining balance: ₱0.00`
            : `⏳ Payment verified but PARTIALLY PAID. Remaining balance: ₱${remainingBalance.toFixed(2)}`,
          updatedBy: {
            userId: req.user?._id || "system",
            userName: req.user?.name || req.user?.username || "System"
          }
        }
      }
    };

    const updatedBilling = await BillingHistory.findByIdAndUpdate(
      billingId,
      updateData,
      { new: true, runValidators: true }
    );

    console.log(` Updated paymentDetails.status to: ${status}`);

    if (isFullyPaid) {
      const bookingIds = updatedBilling.bookings
        .map(booking => booking._id)
        .filter(id => id);

      if (bookingIds.length > 0) {
        try {
          const updatedActionBookings = await actionbooking.updateMany(
            { _id: { $in: bookingIds } },
            {
              $set: {
                status: "Paid",
                paymentStatus: "completed",
                updatedAt: new Date()
              }
            }
          );

          if (updatedActionBookings.modifiedCount > 0) {
            console.log(` Updated ${updatedActionBookings.modifiedCount} action booking(s) status to "Paid"`);
          }
        } catch (updateError) {
          console.error("⚠️ Error updating action bookings:", updateError);
        }

        try {
          const updatedOrders = await orders.updateMany(
            { _id: { $in: bookingIds } },
            {
              $set: {
                status: "Paid",
                paymentStatus: "completed",
                updatedAt: new Date()
              }
            }
          );

          if (updatedOrders.modifiedCount > 0) {
            console.log(` Updated ${updatedOrders.modifiedCount} order(s) status to "Paid"`);
          }
        } catch (updateError) {
          console.error("⚠️ Error updating orders:", updateError);
        }
      }
    }

    const io = req.app.get("socketio");
    if (io) {
      const payload = {
        billingHistory: updatedBilling,
        message: isFullyPaid
          ? ` Billing ${updatedBilling.transactionId} is now FULLY PAID!`
          : `⏳ Payment status updated to "${status}" for ${updatedBilling.transactionId} (Partial)`,
        previousStatus: billing.paymentDetails?.status,
        newStatus: status,
        paymentType: paymentType,
        isFullyPaid: isFullyPaid,
        remainingBalance: remainingBalance
      };

      io.to("admin").emit("updateBilling", payload);
      io.to("finance").emit("updateBilling", payload);
      io.to("receptionist").emit("updateBilling", payload);
    }

    const staffMembers = await UserLoginSchema.find({
      role: { $in: ["admin", "finance", "receptionist"] }
    }).select("_id");

    const viewersList = staffMembers.map(staff => ({
      user: staff._id,
      isRead: false
    }));

    const updaterName = req.user?.name || req.user?.username || "System";
    const statusDisplay = isFullyPaid ? "FULLY PAID " : "PARTIALLY PAID ⏳";

    const newNotification = await Notification.create({
      message: `${updaterName} updated payment status to "${status}" (${statusDisplay}) for ${updatedBilling.transactionId}`,
      FileId: updatedBilling._id,
      viewers: viewersList,
    });

    if (io) {
      const notifPayload = {
        _id: newNotification._id,
        message: newNotification.message,
        FileId: newNotification.FileId,
        viewers: newNotification.viewers,
        createdAt: newNotification.createdAt,
      };

      io.to("admin").emit("newNotification", notifPayload);
      io.to("finance").emit("newNotification", notifPayload);
      io.to("receptionist").emit("newNotification", notifPayload);
    }

    // ==================== SEND EMAIL FOR BOTH "completed" AND "partial" STATUSES ====================
    if (status === "completed" || (status === "verified" && !isFullyPaid)) {
      const customerId = updatedBilling.processedBy?.userId;

      if (!customerId) {
        console.warn("⚠️ No customerId found in billingHistory.processedBy");
      } else {
        // Hanapin ang user sa UserLoginSchema gamit ang linkedId = customerId
        const userLogin = await UserLoginSchema.findOne({
          linkedId: customerId
        }).select("username linkedId");

        if (!userLogin || !userLogin.username) {
          console.warn(`⚠️ No user login found for linkedId: ${customerId}`);
        } else {
          // Determine payment status label
          const paymentStatusLabel = isFullyPaid ? "Fully Paid" : "Partially Paid";

          const emailSubject = isFullyPaid
            ? `Payment Completed (Fully Paid) - ${updatedBilling.transactionId}`
            : `Partial Payment Received (Partially Paid) - ${updatedBilling.transactionId}`;

          const emailText = isFullyPaid
            ? `Dear Customer,

Your payment for billing transaction ${updatedBilling.transactionId} has been successfully completed.

Payment Details:
- Status: ${paymentStatusLabel} ✅
- Amount Paid: ₱${(updatedBilling.paymentDetails?.amountPaid || 0).toFixed(2)}
- Remaining Balance: ₱0.00
- Payment Type: ${paymentType.toUpperCase()}

Thank you for your full payment! Your transaction is now complete.

You may log in to your account to view your billing details and payment history.

Best regards,
Billing Team`
            : `Dear Customer,

We have received your partial payment for billing transaction ${updatedBilling.transactionId}.

Payment Details:
- Status: ${paymentStatusLabel} ⏳
- Amount Paid: ₱${(updatedBilling.paymentDetails?.amountPaid || 0).toFixed(2)}
- Remaining Balance: ₱${remainingBalance.toFixed(2)}
- Payment Type: ${paymentType.toUpperCase()}

Please note that your remaining balance of ₱${remainingBalance.toFixed(2)} is still due. Kindly settle the remaining amount to complete your payment.

You may log in to your account to view your billing details and payment history.

Thank you for your partial payment!

Best regards,
Billing Team`;

          // Send email
          await sendEmail({
            email: userLogin.username, // username field holds the email
            subject: emailSubject,
            text: emailText,
          });

          console.log(`📧 ${paymentStatusLabel} email sent to ${userLogin.username} for billing ${updatedBilling.transactionId}`);
        }
      }
    }

    res.status(200).json({
      success: true,
      message: isFullyPaid
        ? `Payment status updated to "${status}" and marked as FULLY PAID`
        : `Payment status updated to "${status}" successfully (PARTIALLY PAID)`,
      data: updatedBilling,
      audit: {
        previousStatus: billing.paymentDetails?.status,
        newStatus: status,
        paymentType: paymentType,
        isFullyPaid: isFullyPaid,
        remainingBalance: remainingBalance,
        updatedBy: updaterName,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error("UPDATE PAYMENT STATUS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update payment status",
      error: error.message
    });
  }
});