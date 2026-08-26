const BillingHistory = require("../Models/BillingHistorySchema");
const AsyncErrorHandler = require("../Utils/AsyncErrorHandler");
const Notification = require("../Models/NotificationSchema");
const UserLoginSchema = require("../Models/LogInDentalSchema");
const mongoose = require("mongoose");
const actionbooking = require("../Models/ActionBooking")
const orders = require("../Models/OrderSchema")

const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

exports.createBillingHistory = AsyncErrorHandler(async (req, res) => {
  console.log("BODY________", req.body);

  try {
    // Parse JSON strings from FormData
    let paymentDetails = req.body.paymentDetails;
    let bookings = req.body.bookings;
    let processedBy = req.body.processedBy;
    let metadata = req.body.metadata;

    // Parse JSON strings if they are strings
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

    // ============================================
    // EXTRACT AND VALIDATE CUSTOMER ID
    // ============================================
    let customerId = null;
    let bookingIds = [];

    if (bookings && bookings.length > 0) {
      const firstBooking = bookings[0];

      // Try to get customerId from various possible fields
      if (firstBooking.customerId) {
        customerId = firstBooking.customerId;
      } else if (firstBooking.customer && firstBooking.customer._id) {
        customerId = firstBooking.customer._id;
      } else if (firstBooking.customer && firstBooking.customer.id) {
        customerId = firstBooking.customer.id;
      } else if (firstBooking.userId) {
        customerId = firstBooking.userId;
      } else if (firstBooking.customer && firstBooking.customer.customerId) {
        customerId = firstBooking.customer.customerId;
      }

      // Extract booking IDs
      bookingIds = bookings.map(b => b._id).filter(id => id);
      console.log(`📋 Extracted ${bookingIds.length} booking IDs:`, bookingIds);
      console.log(`👤 Extracted customerId from booking: ${customerId}`);
    }

    if (!customerId && req.user) {
      customerId = req.user._id || req.user.id;
      console.log(`👤 Using customerId from request user: ${customerId}`);
    }

    if (!customerId) {
      console.warn("⚠️ No customerId found in bookings or request");
      customerId = "unknown-customer";
    }

    // ============================================
    // 🔍 SEARCH FOR ROOM NUMBER FROM ACTIONBOOKING
    // ============================================
    let roomNumber = "";
    let customerDetails = null;
    let actionBookingData = null;

    try {
      // If we have booking IDs, search in ActionBooking
      if (bookingIds && bookingIds.length > 0) {
        console.log(`🔍 Searching for booking details in ActionBooking...`);
        
        // Find the first booking in ActionBooking
        const firstBookingId = bookingIds[0];
        
        if (mongoose.Types.ObjectId.isValid(firstBookingId)) {
          actionBookingData = await actionbooking.findById(firstBookingId)
            .populate('customerId') // Populate customer details
            .lean();
          
          if (actionBookingData) {
            console.log(`✅ Found ActionBooking: ${actionBookingData._id}`);
            console.log(`📋 ActionBooking Data:`, JSON.stringify(actionBookingData, null, 2));
            console.log(`📋 Booking Item Model: ${actionBookingData.bookingItemModel}`);
            
            // ============================================
            // 🔍 CHECK IF BOOKING ITEM MODEL IS ACCOMMODATION
            // ============================================
            if (actionBookingData.bookingItemModel === 'Accommodation') {
              console.log(`✅ This is an Accommodation booking`);
              
              // ============================================
              // 🔍 GET ROOM NUMBER FROM ACTIONBOOKING
              // ============================================
              // Check if ActionBooking has roomNumber field directly
              if (actionBookingData.roomNumber) {
                roomNumber = actionBookingData.roomNumber;
                console.log(`🏠 Room number from ActionBooking.roomNumber: ${roomNumber}`);
              } 
              // Check if roomNumber is in delivery object
              else if (actionBookingData.delivery && actionBookingData.delivery.roomNumber) {
                roomNumber = actionBookingData.delivery.roomNumber;
                console.log(`🏠 Room number from ActionBooking.delivery.roomNumber: ${roomNumber}`);
              }
              // Check if roomNumber is in address object
              else if (actionBookingData.address && actionBookingData.address.roomNumber) {
                roomNumber = actionBookingData.address.roomNumber;
                console.log(`🏠 Room number from ActionBooking.address.roomNumber: ${roomNumber}`);
              }
              // Check if there's a room field
              else if (actionBookingData.room) {
                if (typeof actionBookingData.room === 'string') {
                  roomNumber = actionBookingData.room;
                } else if (typeof actionBookingData.room === 'object' && actionBookingData.room.number) {
                  roomNumber = actionBookingData.room.number;
                } else if (typeof actionBookingData.room === 'object' && actionBookingData.room.roomNumber) {
                  roomNumber = actionBookingData.room.roomNumber;
                }
                console.log(`🏠 Room number from ActionBooking.room: ${roomNumber}`);
              }
              // Check if roomNumber is in location object
              else if (actionBookingData.location && actionBookingData.location.roomNumber) {
                roomNumber = actionBookingData.location.roomNumber;
                console.log(`🏠 Room number from ActionBooking.location.roomNumber: ${roomNumber}`);
              }
              
              // If still no room number, try to extract from bookingItemId
              if (!roomNumber && actionBookingData.bookingItemId) {
                console.log(`🔍 Trying to get room from bookingItemId: ${actionBookingData.bookingItemId}`);
                // If bookingItemId is an object with room info
                if (typeof actionBookingData.bookingItemId === 'object') {
                  if (actionBookingData.bookingItemId.roomNumber) {
                    roomNumber = actionBookingData.bookingItemId.roomNumber;
                    console.log(`🏠 Room number from bookingItemId.roomNumber: ${roomNumber}`);
                  } else if (actionBookingData.bookingItemId.room && actionBookingData.bookingItemId.room.number) {
                    roomNumber = actionBookingData.bookingItemId.room.number;
                    console.log(`🏠 Room number from bookingItemId.room.number: ${roomNumber}`);
                  }
                }
              }
              
              console.log(`✅ Final room number from ActionBooking: ${roomNumber || 'Not found'}`);
            } else {
              console.log(`ℹ️ Booking item model is ${actionBookingData.bookingItemModel}, not Accommodation`);
            }
            
            // If still no room number, try to get from customer
            if (!roomNumber && actionBookingData.customerId) {
              if (typeof actionBookingData.customerId === 'object' && actionBookingData.customerId._id) {
                customerDetails = actionBookingData.customerId;
              } else if (actionBookingData.customerId.toString) {
                const customerIdFromBooking = actionBookingData.customerId.toString ? 
                  actionBookingData.customerId.toString() : actionBookingData.customerId;
                
                if (mongoose.Types.ObjectId.isValid(customerIdFromBooking)) {
                  customerDetails = await UserLoginSchema.findById(customerIdFromBooking).lean();
                  if (customerDetails) {
                    console.log(`✅ Customer found via UserLogin: ${customerDetails.name || customerDetails.email}`);
                    
                    // Get room number from customer details if not found in ActionBooking
                    if (!roomNumber) {
                      if (customerDetails.roomNumber) {
                        roomNumber = customerDetails.roomNumber;
                      } else if (customerDetails.delivery && customerDetails.delivery.roomNumber) {
                        roomNumber = customerDetails.delivery.roomNumber;
                      } else if (customerDetails.address && customerDetails.address.roomNumber) {
                        roomNumber = customerDetails.address.roomNumber;
                      }
                      console.log(`🏠 Room number from UserLogin: ${roomNumber || 'Not found'}`);
                    }
                  }
                }
              }
            }
          } else {
            console.warn(`⚠️ ActionBooking not found with ID: ${firstBookingId}`);
          }
        }
      }
      
      // If no room number found, try searching by customerId directly
      if (!roomNumber && customerId && customerId !== "unknown-customer") {
        console.log(`🔍 Searching for customer with ID: ${customerId}`);
        
        if (mongoose.Types.ObjectId.isValid(customerId)) {
          if (!customerDetails) {
            customerDetails = await UserLoginSchema.findById(customerId).lean();
          }
          
          if (customerDetails) {
            console.log(`✅ Customer found: ${customerDetails.name || customerDetails.email}`);
            
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
      
      // Last resort: Search all ActionBookings with the same customer
      if (!roomNumber && customerId && customerId !== "unknown-customer") {
        console.log(`🔍 Searching all ActionBookings for customer: ${customerId}`);
        
        const customerBookings = await actionbooking.find({ 
          customerId: customerId,
          bookingItemModel: 'Accommodation' // Only search Accommodation bookings
        }).lean();
        
        if (customerBookings && customerBookings.length > 0) {
          console.log(`📋 Found ${customerBookings.length} Accommodation bookings for this customer`);
          
          for (const booking of customerBookings) {
            // Try to extract room number from each booking
            if (booking.roomNumber) {
              roomNumber = booking.roomNumber;
              console.log(`🏠 Found room number in booking: ${roomNumber}`);
              break;
            } else if (booking.delivery && booking.delivery.roomNumber) {
              roomNumber = booking.delivery.roomNumber;
              console.log(`🏠 Found room number in booking.delivery: ${roomNumber}`);
              break;
            } else if (booking.room && booking.room.number) {
              roomNumber = booking.room.number;
              console.log(`🏠 Found room number in booking.room.number: ${roomNumber}`);
              break;
            } else if (booking.address && booking.address.roomNumber) {
              roomNumber = booking.address.roomNumber;
              console.log(`🏠 Found room number in booking.address: ${roomNumber}`);
              break;
            }
          }
        }
      }

      console.log(`✅ Final Room Number: ${roomNumber || 'Not found'}`);

    } catch (error) {
      console.error("❌ Error finding customer/booking:", error.message);
      console.error("Error stack:", error.stack);
    }

    // ============================================
    // ADD ROOM NUMBER TO BOOKINGS
    // ============================================
    if (bookings && bookings.length > 0 && roomNumber) {
      bookings = bookings.map(booking => ({
        ...booking,
        roomNumber: roomNumber,
        delivery: {
          ...booking.delivery,
          roomNumber: roomNumber
        }
      }));
      console.log(`✅ Added roomNumber "${roomNumber}" to all bookings`);
    } else if (bookings && bookings.length > 0) {
      console.warn(`⚠️ No roomNumber found, keeping existing delivery info`);
    }

    // ============================================
    // AVATAR UPLOAD
    // ============================================
    let avatar = { url: "", public_id: "" };

    if (req.file) {
      console.log("📸 Uploading image to UPLOADAGTA...");
      console.log("📁 File:", {
        originalname: req.file.originalname,
        size: `${(req.file.size / 1024).toFixed(2)} KB`,
        mimetype: req.file.mimetype,
        path: req.file.path,
      });

      const form = new FormData();
      form.append("file", fs.createReadStream(req.file.path), req.file.originalname);

      try {
        const response = await axios.post(process.env.UPLOADAGTA_URL, form, {
          maxBodyLength: Infinity,
          headers: { ...form.getHeaders() },
        });

        console.log("📤 Upload Response:", response.data);

        if (response.data && response.data.url) {
          avatar = {
            url: response.data.url,
            public_id: response.data.public_id || response.data.filename || req.file.filename,
          };
          console.log("✅ Image uploaded successfully:", avatar);
        } else if (response.data && response.data.success && response.data.data) {
          avatar = {
            url: response.data.data.url,
            public_id: response.data.data.public_id || req.file.filename,
          };
          console.log("✅ Image uploaded successfully:", avatar);
        } else if (response.data && response.data.file) {
          avatar = {
            url: response.data.file,
            public_id: req.file.filename,
          };
          console.log("✅ Image uploaded successfully:", avatar);
        } else {
          console.log("⚠️ Unexpected response format:", response.data);
          avatar = {
            url: `/temp-uploads/${req.file.filename}`,
            public_id: req.file.filename,
          };
        }

        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
          console.log("🗑️ Temporary file deleted:", req.file.path);
        }
      } catch (err) {
        console.error("❌ Upload Error:", err.message);
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
          console.log("🗑️ Temporary file deleted (error):", req.file.path);
        }
      }
    } else {
      console.log("ℹ️ No image file provided, using default avatar.");
    }

    // Validate required fields
    if (!paymentDetails || !bookings || bookings.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Payment details and at least one booking are required"
      });
    }

    // Validate payment type
    if (!paymentDetails.paymentType) {
      return res.status(400).json({
        success: false,
        message: "Payment type (full or partial) is required"
      });
    }

    // Validate partial payment amount
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

    // Calculate remaining balance
    const remainingBalance = paymentDetails.paymentType === "partial"
      ? paymentDetails.totalAmount - paymentDetails.paymentAmount
      : 0;

    const isFullyPaid = remainingBalance <= 0;
    const paymentStatus = isFullyPaid ? "completed" : "pending";
    const billingStatus = isFullyPaid ? "fully_paid" : "partial";

    console.log(`💰 Payment Type: ${paymentDetails.paymentType}`);
    console.log(`💰 Remaining Balance: ₱${remainingBalance.toFixed(2)}`);
    console.log(`💰 Is Fully Paid: ${isFullyPaid}`);
    console.log(`💰 Payment Status: ${paymentStatus}`);
    console.log(`💰 Billing Status: ${billingStatus}`);

    // Check for existing billing with the same reference number
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
        console.log(`Current status: ${existingBilling.status}`);
        console.log(`Current remaining balance: ${existingBooking?.remainingBalance || 0}`);
      }
    }

    // If existing billing found and it's a partial payment, update it
    if (existingBilling && existingBooking && existingBilling.status === "partial") {
      console.log(`🔄 Updating existing partial payment for reference: ${referenceNumber}`);

      const currentRemainingBalance = existingBooking.remainingBalance || 0;
      const newPaymentAmount = paymentDetails.paymentAmount;
      const updatedRemainingBalance = Math.max(0, currentRemainingBalance - newPaymentAmount);
      const isNowFullyPaid = updatedRemainingBalance <= 0;
      const totalPaidSoFar = (existingBooking.amount || 0) - updatedRemainingBalance;

      console.log(`Current remaining: ₱${currentRemainingBalance.toFixed(2)}`);
      console.log(`New payment: ₱${newPaymentAmount.toFixed(2)}`);
      console.log(`New remaining: ₱${updatedRemainingBalance.toFixed(2)}`);
      console.log(`Total paid: ₱${totalPaidSoFar.toFixed(2)}`);
      console.log(`Fully paid: ${isNowFullyPaid}`);

      const updatedBookings = existingBilling.bookings.map(booking => {
        const isMatchingBooking =
          booking.referenceNo === referenceNumber ||
          booking.bookingNumber === referenceNumber ||
          booking.orderNumber === referenceNumber;

        if (isMatchingBooking) {
          return {
            ...booking.toObject ? booking.toObject() : booking,
            remainingBalance: updatedRemainingBalance,
            paymentAmount: totalPaidSoFar,
            paymentStatus: isNowFullyPaid ? "full" : "partial",
            roomNumber: roomNumber || booking.roomNumber,
            delivery: {
              ...booking.delivery,
              roomNumber: roomNumber || booking.delivery?.roomNumber
            }
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
            ...(avatar.url && { avatar: avatar })
          },
          $push: {
            statusHistory: {
              status: newBillingStatus,
              timestamp: new Date(),
              note: isNowFullyPaid
                ? `✅ Fully Paid! Remaining balance: ₱0.00. Total paid: ₱${totalPaidSoFar.toFixed(2)}`
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

      console.log(`✅ Updated billing: ${updatedBilling.transactionId}`);
      console.log(`New remaining balance: ₱${updatedRemainingBalance.toFixed(2)}`);
      console.log(`Status: ${isNowFullyPaid ? "FULLY PAID" : "PARTIAL"}`);

      // Socket emit and notification...
      const io = req.app.get("socketio");

      if (io) {
        const payload = {
          billingHistory: updatedBilling,
          message: isNowFullyPaid
            ? `✅ Billing ${updatedBilling.transactionId} is now fully paid!`
            : `💰 Additional payment for ${updatedBilling.transactionId} - Remaining: ₱${updatedRemainingBalance.toFixed(2)}`
        };

        io.to("admin").emit("updateBilling", payload);
        io.to("finance").emit("updateBilling", payload);
        console.log(`📡 BILLING UPDATE EMITTED TO ADMIN + FINANCE`);
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
          ? `✅ ${updatedBilling.transactionId} is now fully paid! (Total: ₱${totalPaidSoFar.toFixed(2)})`
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
        console.log("🔔 NOTIFICATION EMITTED TO ADMIN + FINANCE");
      }

      return res.status(200).json({
        success: true,
        message: isNowFullyPaid ? "Billing fully paid!" : "Additional partial payment processed",
        data: updatedBilling,
        isUpdate: true
      });
    }

    // If no existing billing found, create a new one
    console.log(`🆕 Creating new billing record`);

    const transactionId = BillingHistory.getTransactionId();
    console.log(`📋 Generated Transaction ID: ${transactionId}`);

    // ============================================
    // UPDATE BOOKINGS WITH CUSTOMER ID AND PAYMENT INFO
    // ============================================
    const updatedBookings = bookings.map(booking => {
      let bookingPaymentAmount = booking.amount;
      let bookingRemainingBalance = 0;

      if (paymentDetails.paymentType === "partial") {
        bookingPaymentAmount = booking.amount * (paymentDetails.paymentAmount / paymentDetails.totalAmount);
        bookingRemainingBalance = booking.amount - bookingPaymentAmount;
      }

      // Get roomNumber from customer or existing booking
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
        }
      };
    });

    // Create new billing history
    const billingHistory = new BillingHistory({
      transactionId: transactionId,
      customerId: customerId,
      paymentDetails: {
        ...paymentDetails,
        paymentAmount: paymentDetails.paymentAmount || paymentDetails.totalAmount,
        paymentType: paymentDetails.paymentType || "full",
        remainingBalance: remainingBalance,
        processedAt: paymentDetails.processedAt || new Date(),
        status: paymentStatus
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

    // Save - this will trigger pre-save hooks
    await billingHistory.save();
    console.log("✅ Billing created successfully!");
    console.log("📋 Transaction ID:", billingHistory.transactionId);
    console.log("👤 Customer ID:", billingHistory.customerId);
    console.log("🏠 Room Number:", roomNumber || 'Not set');
    console.log("📸 Avatar saved:", billingHistory.avatar);
    console.log("📊 Payment Status:", billingHistory.paymentDetails?.status);
    console.log("📊 Billing Status:", billingHistory.status);

    // Extract all IDs from bookings
    const bookingIdsToUpdate = billingHistory.bookings
      .map(booking => booking._id)
      .filter(id => id);

    console.log(`📋 Found ${bookingIdsToUpdate.length} booking/order IDs to process:`, bookingIdsToUpdate);

    // ============================================
    // UPDATE ACTION BOOKINGS STATUS
    // ============================================
    if (bookingIdsToUpdate.length > 0) {
      try {
        const updatedActionBookings = await actionbooking.updateMany(
          { _id: { $in: bookingIdsToUpdate } },
          {
            $set: {
              status: "Paid",
              isDone: true,
              updatedAt: new Date()
            }
          }
        );

        if (updatedActionBookings.modifiedCount > 0) {
          console.log(`✅ Updated ${updatedActionBookings.modifiedCount} action booking(s) status to "Paid"`);
        }
      } catch (updateError) {
        console.error("⚠️ Error updating action bookings:", updateError);
      }

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
          console.log(`✅ Updated ${updatedOrders.modifiedCount} order(s) status to "completed"`);
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

  // =========================
  // 1. DYNAMIC FILTER OBJECT
  // =========================
  let filter = {};

  // STATUS FILTER
  if (status) {
    filter.status = status;
  }

  // PAYMENT METHOD FILTER
  if (paymentMethod) {
    filter["paymentDetails.method"] = paymentMethod;
  }

  // PAYMENT TYPE FILTER (NEW)
  if (paymentType) {
    filter["paymentDetails.paymentType"] = paymentType;
  }

  // USER FILTER
  if (userId) {
    filter["processedBy.userId"] = userId;
  }

  // DATE FILTER
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

  // SEARCH FILTER
  if (search && search.trim() !== "") {
    filter.$or = [
      { transactionId: { $regex: search, $options: "i" } },
      { "paymentDetails.referenceNo": { $regex: search, $options: "i" } },
      { "bookings.orderNumber": { $regex: search, $options: "i" } },
      { "bookings.bookingNumber": { $regex: search, $options: "i" } }
    ];
  }

  console.log("🔍 GET BILLING HISTORY FILTER:", filter);

  // =========================
  // 2. AGGREGATION
  // =========================
  const results = await BillingHistory.aggregate([
    { $match: filter },
    { $sort: { "paymentDetails.processedAt": -1 } },

    // LOOKUP USER WHO PROCESSED
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

    // ADD COMPUTED FIELDS
    {
      $addFields: {
        processedByName: "$processedByUser.name",
        processedByEmail: "$processedByUser.email",
        totalItems: { $size: "$bookings" },
        isPartialPayment: { $eq: ["$paymentDetails.paymentType", "partial"] },
        isFullPayment: { $eq: ["$paymentDetails.paymentType", "full"] }
      }
    },

    // =========================
    // 3. PAGINATION (FACET)
    // =========================
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

  // =========================
  // RESPONSE
  // =========================
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

    // LOOKUP USER WHO PROCESSED
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

    // ADD COMPUTED FIELDS
    {
      $addFields: {
        processedByName: "$processedByUser.name",
        processedByEmail: "$processedByUser.email",
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

  // Date filter
  const dateFilter = {};
  if (startDate && endDate) {
    dateFilter["paymentDetails.processedAt"] = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }

  // =========================
  // STATUS BREAKDOWN
  // =========================
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

  // =========================
  // PAYMENT TYPE BREAKDOWN (NEW)
  // =========================
  const paymentTypeStats = await BillingHistory.aggregate([
    {
      $match: {
        ...dateFilter,
        status: "completed"
      }
    },
    {
      $group: {
        _id: "$paymentDetails.paymentType",
        totalAmount: { $sum: "$paymentDetails.paymentAmount" },
        totalDue: { $sum: "$paymentDetails.totalAmount" },
        count: { $sum: 1 }
      }
    }
  ]);

  // =========================
  // DAILY TREND
  // =========================
  const dailyStats = await BillingHistory.aggregate([
    {
      $match: {
        ...dateFilter,
        status: "completed"
      }
    },
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
    {
      $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 }
    },
    {
      $limit: 30
    }
  ]);

  // =========================
  // PAYMENT METHOD BREAKDOWN
  // =========================
  const methodStats = await BillingHistory.aggregate([
    {
      $match: {
        ...dateFilter,
        status: "completed"
      }
    },
    {
      $group: {
        _id: "$paymentDetails.method",
        totalAmount: { $sum: "$paymentDetails.paymentAmount" },
        count: { $sum: 1 }
      }
    }
  ]);

  // =========================
  // SUMMARY
  // =========================
  const summary = await BillingHistory.aggregate([
    {
      $match: dateFilter
    },
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
        totalDue: {
          $sum: "$paymentDetails.totalAmount"
        },
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

// GET partial payments - with role-based filtering (EXCLUDES pending status)
exports.getPartialPayments = AsyncErrorHandler(async (req, res) => {
  const role = req.user.role;
  const userId = req.user.linkId;

  console.log("👤 User Role:", role);
  console.log("👤 User ID:", userId);

  const { page = 1, limit = 20 } = req.query;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const pageSize = parseInt(limit);

  // =========================
  // ✅ VALIDATION: Check if user exists and has proper role
  // =========================
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

  // =========================
  // ✅ VALIDATION: Validate pagination parameters
  // =========================
  if (parseInt(page) < 1 || parseInt(limit) < 1) {
    return res.status(400).json({
      success: false,
      message: "Invalid pagination parameters: page and limit must be positive integers"
    });
  }

  if (parseInt(limit) > 100) {
    return res.status(400).json({
      success: false,
      message: "Limit cannot exceed 100 records per page"
    });
  }

  // =========================
  // BUILD MATCH CONDITION - EXCLUDE PENDING STATUS
  // =========================
  let matchCondition = {
    $and: [
      {
        "paymentDetails.paymentType": "partial"
      },
      {
        "paymentDetails.status": { $ne: "pending" } // ✅ EXCLUDE pending status
      }
    ]
  };

  // =========================
  // IF NOT CUSTOMER - FETCH ALL DATA (NO USER FILTER)
  // =========================
  if (role && role !== "customer") {
    console.log("🔍 Staff/Admin - Fetching ALL partial payments (excluding pending)");
    // Don't add userId filter - fetch everything
  } else if (userId) {
    // Customer - filter by userId
    console.log("🔍 Customer - Filtering by user ID:", userId);

    // ✅ VALIDATION: Find the user in UserLoginSchema using the linkId
    const user = await UserLoginSchema.findOne({ linkedId: userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found with the provided linkId"
      });
    }

    console.log("✅ Found user:", user._id);
    console.log("User ID as string:", user._id.toString());

    // Get the user's _id as string
    const userObjectIdString = user._id.toString();

    // Add customer filter for customer role
    matchCondition.$and.push({
      "bookings.customer._id": userObjectIdString
    });
  } else {
    console.log("⚠️ No user ID found - returning empty data");
    return res.status(200).json({
      success: true,
      totalCount: 0,
      totalPages: 0,
      currentPage: parseInt(page),
      limit: pageSize,
      data: []
    });
  }

  console.log("📋 Match Condition:", JSON.stringify(matchCondition, null, 2));

  // =========================
  // AGGREGATION PIPELINE
  // =========================
  try {
    const results = await BillingHistory.aggregate([
      {
        $match: matchCondition
      },
      { $sort: { "paymentDetails.processedAt": -1 } },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $skip: skip },
            { $limit: pageSize },
            {
              $project: {
                _id: 1,
                transactionId: 1,
                paymentDetails: 1,
                bookings: 1,
                processedBy: 1,
                metadata: 1,
                avatar: 1,
                status: 1,
                statusHistory: 1,
                refund: 1,
                createdAt: 1,
                updatedAt: 1
              }
            }
          ]
        }
      }
    ]);

    const totalCount = results[0].metadata[0]?.total || 0;
    const billingHistory = results[0].data;
    const totalPages = Math.ceil(totalCount / pageSize);

    console.log(`📊 Total Partial Payments (excluding pending): ${totalCount}`);

    // ✅ VALIDATION: Check if data exists
    if (billingHistory.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No partial payments found (excluding pending)",
        totalCount: 0,
        totalPages: 0,
        currentPage: parseInt(page),
        limit: pageSize,
        data: []
      });
    }

    res.status(200).json({
      success: true,
      message: `Successfully retrieved ${billingHistory.length} partial payments (excluding pending)`,
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

exports.getFullPayments = AsyncErrorHandler(async (req, res) => {
  const role = req.user.role;
  const userId = req.user.linkId;

  console.log("👤 User Role:", role);
  console.log("👤 User ID (linkId):", userId);

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

  if (parseInt(page) < 1 || parseInt(limit) < 1) {
    return res.status(400).json({
      success: false,
      message: "Invalid pagination parameters: page and limit must be positive integers"
    });
  }

  if (parseInt(limit) > 100) {
    return res.status(400).json({
      success: false,
      message: "Limit cannot exceed 100 records per page"
    });
  }

  // =========================
  // BUILD MATCH CONDITION - EXCLUDE PENDING STATUS
  // =========================
  let matchCondition = {
    $and: [
      {
        "paymentDetails.paymentType": "full"
      },
      {
        "paymentDetails.status": { $ne: "pending" }
      }
    ]
  };

  // ============================================
  // IF CUSTOMER - GET USER AND ACTION BOOKINGS
  // ============================================
  let customerActionBookings = [];

  if (role === "customer") {
    console.log("🔍 Customer - Filtering by user ID:", userId);

    // ✅ Find the user in UserLoginSchema using the linkId
    const user = await UserLoginSchema.findOne({ linkedId: userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found with the provided linkId"
      });
    }

    console.log("✅ Found user:", user._id);
    console.log("User ID as string:", user._id.toString());

    const userObjectIdString = user._id.toString();

    // ============================================
    // ✅ FIND ACTION BOOKINGS WITH MATCHING CUSTOMER ID
    // ============================================
    console.log("🔍 Searching for action bookings with customerId:", userObjectIdString);

    customerActionBookings = await actionbooking.find({
      customerId: userObjectIdString
    }).lean(); // Use lean() for better performance

    console.log(`📋 Found ${customerActionBookings.length} action booking(s) for customer`);

    // Log details of each action booking found
    if (customerActionBookings.length > 0) {
      customerActionBookings.forEach((booking, index) => {
        console.log(`📋 Action Booking ${index + 1}:`);
        console.log(`   _id: ${booking._id}`);
        console.log(`   bookingNumber: ${booking.bookingNumber}`);
        console.log(`   bookingItemModel: ${booking.bookingItemModel}`);
        console.log(`   status: ${booking.status}`);
        console.log(`   amount: ${booking.amount}`);
        console.log(`   createdAt: ${booking.createdAt}`);
      });
    } else {
      console.log("⚠️ No action bookings found for this customer");
    }

    // ✅ Add customer filter for billing history
    matchCondition.$and.push({
      "customerId": user._id // Use the main customerId field
    });

    console.log("📋 Match Condition with customer filter:", JSON.stringify(matchCondition, null, 2));

  } else if (role && role !== "customer") {
    console.log("🔍 Staff/Admin - Fetching ALL full payments (excluding pending)");
    // Don't add userId filter - fetch everything
  } else {
    console.log("⚠️ No valid role found - returning empty data");
    return res.status(200).json({
      success: true,
      totalCount: 0,
      totalPages: 0,
      currentPage: parseInt(page),
      limit: pageSize,
      data: []
    });
  }

  // =========================
  // AGGREGATION PIPELINE
  // =========================
  try {
    const results = await BillingHistory.aggregate([
      {
        $match: matchCondition
      },
      { $sort: { "paymentDetails.processedAt": -1 } },
      // =========================
      // LOOKUP: Populate customer details
      // =========================
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
      // =========================
      // UNWIND BOOKINGS TO PROCESS EACH ONE
      // =========================
      {
        $unwind: {
          path: "$bookings",
          preserveNullAndEmptyArrays: true
        }
      },
      // =========================
      // LOOKUP FOR ACTION BOOKINGS
      // =========================
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
      // =========================
      // GROUP BACK THE BOOKINGS
      // =========================
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
                  // Add customer info
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
                  // Add action booking details
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
      // =========================
      // PROJECT FINAL OUTPUT
      // =========================
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
                "$customerDetails.first_name",
                " ",
                "$customerDetails.last_name"
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
                // Customer info
                customer: {
                  _id: "$$booking.customerInfo._id",
                  first_name: "$$booking.customerInfo.first_name",
                  last_name: "$$booking.customerInfo.last_name",
                  full_name: {
                    $concat: [
                      "$$booking.customerInfo.first_name",
                      " ",
                      "$$booking.customerInfo.last_name"
                    ]
                  },
                  email: "$$booking.customerInfo.email"
                },
                // Order fields
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
                // Booking fields
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
                // Accommodation specifics
                accommodationType: "$$booking.accommodationType",
                minCapacity: "$$booking.minCapacity",
                maxCapacity: "$$booking.maxCapacity",
                amenities: "$$booking.amenities",
                // Rental specifics
                rentalUnit: "$$booking.rentalUnit",
                // Service specifics
                serviceCategory: "$$booking.serviceCategory",
                // Approver
                approver: "$$booking.approver",
                // Payment tracking
                paymentStatus: "$$booking.paymentStatus",
                paymentAmount: "$$booking.paymentAmount",
                remainingBalance: "$$booking.remainingBalance",
                // Action Booking Details
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

    console.log(`📊 Total Full Payments (excluding pending): ${totalCount}`);

    // ✅ VALIDATION: Check if data exists
    if (billingHistory.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No full payments found (excluding pending)",
        totalCount: 0,
        totalPages: 0,
        currentPage: parseInt(page),
        limit: pageSize,
        data: []
      });
    }

    // ============================================
    // ✅ PREPARE ACTION BOOKINGS SUMMARY
    // ============================================
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
      message: `Successfully retrieved ${billingHistory.length} full payments (excluding pending)`,
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

// GET verify payments with pending status - with role-based filtering
exports.getVerifyPayments = AsyncErrorHandler(async (req, res) => {
  const role = req.user.role;
  const userId = req.user.linkId;

  console.log("👤 User Role:", role);
  console.log("👤 User ID:", userId);

  const { page = 1, limit = 20 } = req.query;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const pageSize = parseInt(limit);

  // =========================
  // ✅ VALIDATION: Check if user exists and has proper role
  // =========================
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

  // =========================
  // ✅ VALIDATION: Validate pagination parameters
  // =========================
  if (parseInt(page) < 1 || parseInt(limit) < 1) {
    return res.status(400).json({
      success: false,
      message: "Invalid pagination parameters: page and limit must be positive integers"
    });
  }

  if (parseInt(limit) > 100) {
    return res.status(400).json({
      success: false,
      message: "Limit cannot exceed 100 records per page"
    });
  }

  // =========================
  // BUILD MATCH CONDITION - Filter ONLY PENDING status
  // =========================
  let matchCondition = {
    $and: [
      {
        $or: [
          { "paymentDetails.paymentType": "partial" },
          { "paymentDetails.paymentType": "full" }
        ]
      },
      { "paymentDetails.status": "pending" } // ✅ Filter only PENDING status
    ]
  };

  // =========================
  // IF NOT CUSTOMER - FETCH ALL DATA (NO USER FILTER)
  // =========================
  if (role && role !== "customer") {
    console.log("🔍 Staff/Admin - Fetching ALL pending verify payments (no user filter)");
    // Don't add userId filter - fetch everything
  } else if (userId) {
    // Customer - filter by userId
    console.log("🔍 Customer - Filtering by user ID:", userId);

    // ✅ VALIDATION: Find the user in UserLoginSchema using the linkId
    const user = await UserLoginSchema.findOne({ linkedId: userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found with the provided linkId"
      });
    }

    console.log("✅ Found user:", user._id);
    console.log("User ID as string:", user._id.toString());

    // Get the user's _id as string
    const userObjectIdString = user._id.toString();

    // Add customer filter for customer role
    matchCondition.$and.push({
      "bookings.customer._id": userObjectIdString
    });
  } else {
    console.log("⚠️ No user ID found - returning empty data");
    return res.status(200).json({
      success: true,
      totalCount: 0,
      totalPages: 0,
      currentPage: parseInt(page),
      limit: pageSize,
      data: []
    });
  }

  console.log("📋 Match Condition:", JSON.stringify(matchCondition, null, 2));

  // =========================
  // AGGREGATION PIPELINE
  // =========================
  try {
    const results = await BillingHistory.aggregate([
      {
        $match: matchCondition
      },
      { $sort: { "paymentDetails.processedAt": -1 } },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $skip: skip },
            { $limit: pageSize },
            {
              $project: {
                _id: 1,
                transactionId: 1,
                paymentDetails: 1,
                bookings: 1,
                processedBy: 1,
                metadata: 1,
                avatar: 1,
                status: 1,
                statusHistory: 1,
                refund: 1,
                createdAt: 1,
                updatedAt: 1
              }
            }
          ]
        }
      }
    ]);

    const totalCount = results[0].metadata[0]?.total || 0;
    const billingHistory = results[0].data;
    const totalPages = Math.ceil(totalCount / pageSize);

    console.log(`📊 Total Pending Verify Payments (Partial/Full): ${totalCount}`);

    // ✅ VALIDATION: Check if data exists
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

// ==================== UPDATE ====================

exports.updateBillingStatus = AsyncErrorHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;
    const userId = req.user?._id || "system";
    const userName = req.user?.name || "System";

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required"
      });
    }

    const validStatuses = ["pending", "verified", "completed", "failed", "refunded", "partial"];
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

    // Update status
    billingHistory.status = status;
    billingHistory.statusHistory.push({
      status,
      timestamp: new Date(),
      note: note || `Status updated to ${status}`,
      updatedBy: { userId, userName }
    });

    // If status is completed, update payment details status
    if (status === "completed") {
      billingHistory.paymentDetails.status = "completed";
    }

    // If status is partial, update remaining balance
    if (status === "partial") {
      const totalPaid = billingHistory.paymentDetails.paymentAmount;
      const totalDue = billingHistory.paymentDetails.totalAmount;
      billingHistory.paymentDetails.remainingBalance = totalDue - totalPaid;
    }

    await billingHistory.save();

    // =========================
    // SOCKET EMIT
    // =========================
    const io = req.app.get("socketio");

    if (io) {
      const payload = {
        billingHistory,
        message: `Billing status updated to ${status}`
      };

      io.to("admin").emit("billingStatusUpdated", payload);
      io.to("finance").emit("billingStatusUpdated", payload);

      console.log("📡 BILLING STATUS EMITTED TO ADMIN + FINANCE");
    }

    // =========================
    // NOTIFICATION
    // =========================
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

      console.log("🔔 NOTIFICATION SENT");
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

    // For partial payments, only refund the amount paid
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

    // Update remaining balance if partial payment
    if (billingHistory.paymentDetails.paymentType === "partial") {
      billingHistory.paymentDetails.remainingBalance =
        billingHistory.paymentDetails.totalAmount - billingHistory.paymentDetails.paymentAmount;
    }

    await billingHistory.save();

    // =========================
    // SOCKET EMIT
    // =========================
    const io = req.app.get("socketio");

    if (io) {
      const payload = {
        billingHistory,
        message: `Refund processed for ${billingHistory.transactionId}`
      };

      io.to("admin").emit("billingRefunded", payload);
      io.to("finance").emit("billingRefunded", payload);

      console.log("📡 REFUND EMITTED TO ADMIN + FINANCE");
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

// NEW: Add partial payment to existing billing
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

    // Update payment details
    billingHistory.paymentDetails.paymentAmount += additionalAmount;
    billingHistory.paymentDetails.remainingBalance =
      billingHistory.paymentDetails.totalAmount - billingHistory.paymentDetails.paymentAmount;

    // Update each booking's payment amount proportionally
    const totalPaid = billingHistory.paymentDetails.paymentAmount;
    const totalDue = billingHistory.paymentDetails.totalAmount;

    billingHistory.bookings.forEach(booking => {
      const bookingRatio = booking.amount / totalDue;
      booking.paymentAmount = totalPaid * bookingRatio;
      booking.remainingBalance = booking.amount - booking.paymentAmount;
    });

    // If remaining balance is 0, mark as completed
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

    // Socket emit and notification
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

    // Soft delete - mark as deleted instead of removing
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

    // Validate required fields
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

    // Validate billingId format
    if (!mongoose.Types.ObjectId.isValid(billingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Billing ID format"
      });
    }

    // Validate status
    const validStatuses = ['pending', 'verified', 'completed', 'rejected', 'cancelled', 'refunded', 'partial'];
    if (!validStatuses.includes(status)) {
      console.log(`⚠️ Warning: Status "${status}" is not in the standard list. Allowing anyway.`);
    }

    console.log(`📌 Updating paymentDetails.status to: ${status}`);

    // Find the billing record
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

    // Check if status is already the same
    if (billing.paymentDetails?.status === status) {
      console.log(`ℹ️ Status is already "${status}". No changes needed.`);
      return res.status(200).json({
        success: true,
        message: `Status is already set to "${status}"`,
        data: billing,
        noChange: true
      });
    }

    // ============================================
    // DETERMINE IF FULLY PAID OR PARTIALLY PAID
    // ============================================
    const remainingBalance = billing.paymentDetails?.remainingBalance || 0;
    const isFullyPaid = remainingBalance <= 0;
    const paymentType = isFullyPaid ? "full" : "partial";
    const billingStatus = isFullyPaid ? "fully_paid" : "partial";

    console.log(`💰 Remaining Balance: ₱${remainingBalance.toFixed(2)}`);
    console.log(`💳 Payment Type: ${paymentType.toUpperCase()}`);
    console.log(`✅ Is Fully Paid: ${isFullyPaid}`);
    console.log(`📊 Billing Status: ${billingStatus}`);

    // ============================================
    // PREPARE UPDATE DATA
    // ============================================
    const updateData = {
      $set: {
        "paymentDetails.status": status,
        // Update paymentType based on remaining balance
        "paymentDetails.paymentType": paymentType,
        // Update root status
        "status": billingStatus
      },
      $push: {
        statusHistory: {
          status: billingStatus,
          timestamp: new Date(),
          note: isFullyPaid
            ? `✅ Payment verified and FULLY PAID! Remaining balance: ₱0.00`
            : `⏳ Payment verified but PARTIALLY PAID. Remaining balance: ₱${remainingBalance.toFixed(2)}`,
          updatedBy: {
            userId: req.user?._id || "system",
            userName: req.user?.name || req.user?.username || "System"
          }
        }
      }
    };

    // ✅ Update paymentDetails.status and other fields
    const updatedBilling = await BillingHistory.findByIdAndUpdate(
      billingId,
      updateData,
      { new: true, runValidators: true }
    );

    console.log(`✅ Updated paymentDetails.status to: ${status}`);
    console.log(`✅ Updated paymentDetails.paymentType to: ${paymentType}`);
    console.log(`✅ Updated root status to: ${billingStatus}`);
    console.log(`✅ Is Fully Paid: ${isFullyPaid}`);

    // ============================================
    // UPDATE BOOKINGS STATUS IF FULLY PAID
    // ============================================
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
            console.log(`✅ Updated ${updatedActionBookings.modifiedCount} action booking(s) status to "Paid"`);
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
            console.log(`✅ Updated ${updatedOrders.modifiedCount} order(s) status to "Paid"`);
          }
        } catch (updateError) {
          console.error("⚠️ Error updating orders:", updateError);
        }
      }
    }

    // Socket emit
    const io = req.app.get("socketio");
    if (io) {
      const payload = {
        billingHistory: updatedBilling,
        message: isFullyPaid
          ? `✅ Billing ${updatedBilling.transactionId} is now FULLY PAID!`
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
      console.log(`📡 BILLING UPDATE EMITTED TO ADMIN + FINANCE + RECEPTIONIST`);
    }

    // Create notification
    const staffMembers = await UserLoginSchema.find({
      role: { $in: ["admin", "finance", "receptionist"] }
    }).select("_id");

    const viewersList = staffMembers.map(staff => ({
      user: staff._id,
      isRead: false
    }));

    const updaterName = req.user?.name || req.user?.username || "System";
    const statusDisplay = isFullyPaid ? "FULLY PAID ✅" : "PARTIALLY PAID ⏳";

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
      console.log("🔔 NOTIFICATION EMITTED TO ADMIN + FINANCE + RECEPTIONIST");
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