const AsyncErrorHandler = require("../Utils/AsyncErrorHandler");
const Notification = require("../Models/NotificationSchema");
const UserLoginSchema = require("../Models/LogInDentalSchema");
const mongoose = require("mongoose");
const BillingHistory = require('../Models/BillingHistorySchema')
const Billing = require("../Models/BillingHistorySchema")
const Order = require("../Models/OrderSchema")
const ActionBooking = require("../Models/ActionBooking")
const Customer = require("../Models/CustomerSchema")

exports.getMyBilling = AsyncErrorHandler(async (req, res) => {
  const userId = req.user?._id;
  const role = req.user?.role;

  // =========================
  // INITIAL MATCH CONDITIONS
  // =========================
  const bookingMatch = {
    status: "Confirmed", 
  };

  const orderMatch = {
    status: "completed",
    "payment.status": { $ne: "paid" },
  };

  // =========================
  // ROLE-BASED FILTERING
  // =========================
  const nonCustomerRoles = ["admin", "receptionist", "staff", "manager", "superadmin"];

  if (role && nonCustomerRoles.includes(role)) {
    console.log(`🔍 ${role} - Fetching ALL confirmed bookings and orders (no user filter)`);
    // Don't add userId filter - fetch everything
  } else if (userId) {
    // Customer - filter by userId
    bookingMatch.customerId = new mongoose.Types.ObjectId(userId);
    orderMatch.userId = new mongoose.Types.ObjectId(userId);
    console.log("🔍 Customer - Filtering by user ID:", userId);
  } else {
    console.log("⚠️ No user ID found - returning empty data");
    return res.status(200).json({
      success: true,
      summary: {
        bookingTotal: 0,
        orderTotal: 0,
        grandTotal: 0,
        totalBookings: 0,
        totalOrders: 0,
      },
      statusSummary: {
        booking: {},
        order: {},
      },
      totalItems: 0,
      data: [],
    });
  }

  // =========================
  // DEBUG - CHECK FINAL MATCH CONDITIONS
  // =========================
  console.log("📋 Booking Match:", JSON.stringify(bookingMatch, null, 2));
  console.log("📋 Order Match:", JSON.stringify(orderMatch, null, 2));

  if (bookingMatch.customerId) {
    console.log("⚠️ WARNING: bookingMatch has customerId filter!");
  } else {
    console.log("✅ bookingMatch has NO customerId filter - fetching ALL confirmed bookings");
  }

  if (orderMatch.userId) {
    console.log("⚠️ WARNING: orderMatch has userId filter!");
  } else {
    console.log("✅ orderMatch has NO userId filter - fetching ALL orders");
  }

  // =========================
  // PRE-AGGREGATION CHECK (DEBUG)
  // =========================
  console.log("🔍 PRE-AGGREGATION DATA CHECK:");

  const rawBookingCount = await ActionBooking.countDocuments({ status: "Confirmed" });
  console.log(`📊 Confirmed bookings: ${rawBookingCount}`);

  const rawOrderCount = await Order.countDocuments({
    status: "completed",
    "payment.status": { $ne: "paid" }
  });
  console.log(`📊 Raw orders (completed & not paid): ${rawOrderCount}`);

  // =========================
  // BOOKINGS AGGREGATION
  // =========================
  console.log("📚 ===== FETCHING CONFIRMED BOOKINGS =====");

  const bookings = await ActionBooking.aggregate([
    { $match: bookingMatch },

    // LOOKUP Accommodation
    {
      $lookup: {
        from: "accommodations",
        localField: "bookingItemId",
        foreignField: "_id",
        as: "accommodationItem",
      },
    },

    // LOOKUP Rental
    {
      $lookup: {
        from: "rentals",
        localField: "bookingItemId",
        foreignField: "_id",
        as: "rentalItem",
      },
    },

    // LOOKUP Service
    {
      $lookup: {
        from: "services",
        localField: "bookingItemId",
        foreignField: "_id",
        as: "serviceItem",
      },
    },

    // LOOKUP Activity
    {
      $lookup: {
        from: "activities",
        localField: "bookingItemId",
        foreignField: "_id",
        as: "activityItem",
      },
    },

    // =========================
    // LOOKUP CUSTOMER DETAILS - FIXED FOR NON-CUSTOMERS
    // =========================
    {
      $lookup: {
        from: "userloginschemas",
        localField: "customerId",
        foreignField: "_id",
        as: "customerArray",
      },
    },
    {
      $addFields: {
        customer: {
          $cond: {
            if: { $gt: [{ $size: "$customerArray" }, 0] },
            then: { $arrayElemAt: ["$customerArray", 0] },
            else: {
              _id: null,
              name: "Guest User",
              email: "guest@example.com",
              avatar: null,
              image: null,
            },
          },
        },
      },
    },
    {
      $project: {
        customerArray: 0, // Remove temporary field
      },
    },

    // LOOKUP Approver Details
    {
      $lookup: {
        from: "userloginschemas",
        localField: "approverId",
        foreignField: "_id",
        as: "approverArray",
      },
    },
    {
      $addFields: {
        approver: {
          $cond: {
            if: { $gt: [{ $size: "$approverArray" }, 0] },
            then: { $arrayElemAt: ["$approverArray", 0] },
            else: {
              _id: null,
              name: "N/A",
              email: "N/A",
            },
          },
        },
      },
    },
    {
      $project: {
        approverArray: 0,
      },
    },

    // =========================
    // LOOKUP PARTIAL PAYMENTS ONLY
    // =========================
    {
      $lookup: {
        from: "billinghistories",
        let: {
          bookingNumber: "$bookingNumber",
          bookingId: "$_id",
          itemId: "$bookingItemId",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $or: [
                      { $in: ["$$bookingNumber", "$bookings.bookingNumber"] },
                      { $eq: ["$bookings.bookingNumber", "$$bookingNumber"] },
                      { $eq: ["$bookings._id", "$$bookingId"] },
                      { $eq: ["$bookings.bookingItemId", "$$itemId"] },
                      { $in: ["$$bookingNumber", "$bookings.referenceNo"] },
                      { $eq: ["$bookings.referenceNo", "$$bookingNumber"] },
                    ],
                  },
                  {
                    $or: [
                      { $eq: ["$status", "partial"] },
                      { $eq: ["$paymentDetails.paymentType", "partial"] },
                    ],
                  },
                ],
              },
            },
          },
          {
            $addFields: {
              matchingBooking: {
                $arrayElemAt: [
                  {
                    $filter: {
                      input: "$bookings",
                      as: "b",
                      cond: {
                        $or: [
                          { $eq: ["$$b.bookingNumber", "$$bookingNumber"] },
                          { $eq: ["$$b._id", "$$bookingId"] },
                          { $eq: ["$$b.bookingItemId", "$$itemId"] },
                          { $eq: ["$$b.referenceNo", "$$bookingNumber"] },
                        ],
                      },
                    },
                  },
                  0,
                ],
              },
            },
          },
          {
            $match: {
              "matchingBooking": { $ne: null },
            },
          },
          {
            $sort: { createdAt: -1 },
          },
          {
            $limit: 1,
          },
          {
            $project: {
              _id: 0,
              transactionId: 1,
              status: 1,
              paymentDetails: 1,
              "matchingBooking.paymentStatus": 1,
              "matchingBooking.paymentAmount": 1,
              "matchingBooking.remainingBalance": 1,
              "matchingBooking.amount": 1,
              createdAt: 1,
            },
          },
        ],
        as: "partialBilling",
      },
    },

    // =========================
    // LOOKUP ALL BILLING (for checking fully paid)
    // =========================
    {
      $lookup: {
        from: "billinghistories",
        let: {
          bookingNumber: "$bookingNumber",
          bookingId: "$_id",
          itemId: "$bookingItemId",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  { $in: ["$$bookingNumber", "$bookings.bookingNumber"] },
                  { $eq: ["$bookings.bookingNumber", "$$bookingNumber"] },
                  { $eq: ["$bookings._id", "$$bookingId"] },
                  { $eq: ["$bookings.bookingItemId", "$$itemId"] },
                  { $in: ["$$bookingNumber", "$bookings.referenceNo"] },
                  { $eq: ["$bookings.referenceNo", "$$bookingNumber"] },
                ],
              },
            },
          },
          {
            $addFields: {
              matchingBooking: {
                $arrayElemAt: [
                  {
                    $filter: {
                      input: "$bookings",
                      as: "b",
                      cond: {
                        $or: [
                          { $eq: ["$$b.bookingNumber", "$$bookingNumber"] },
                          { $eq: ["$$b._id", "$$bookingId"] },
                          { $eq: ["$$b.bookingItemId", "$$itemId"] },
                          { $eq: ["$$b.referenceNo", "$$bookingNumber"] },
                        ],
                      },
                    },
                  },
                  0,
                ],
              },
            },
          },
          {
            $match: {
              "matchingBooking": { $ne: null },
            },
          },
          {
            $sort: { createdAt: -1 },
          },
          {
            $project: {
              _id: 0,
              status: 1,
              paymentDetails: 1,
            },
          },
        ],
        as: "allBilling",
      },
    },

    // =========================
    // ADD COMPUTED FIELDS
    // =========================
    {
      $addFields: {
        // Get the correct item based on bookingItemModel
        itemDetails: {
          $switch: {
            branches: [
              {
                case: { $eq: ["$bookingItemModel", "Accommodation"] },
                then: { $arrayElemAt: ["$accommodationItem", 0] },
              },
              {
                case: { $eq: ["$bookingItemModel", "Service"] },
                then: { $arrayElemAt: ["$serviceItem", 0] },
              },
              {
                case: { $eq: ["$bookingItemModel", "Activity"] },
                then: { $arrayElemAt: ["$activityItem", 0] },
              },
              {
                case: { $eq: ["$bookingItemModel", "Rental"] },
                then: { $arrayElemAt: ["$rentalItem", 0] },
              },
            ],
            default: null,
          },
        },

        // Get price based on item type
        itemPrice: {
          $switch: {
            branches: [
              {
                case: { $eq: ["$bookingItemModel", "Accommodation"] },
                then: {
                  $cond: {
                    if: { $gt: [{ $size: "$accommodationItem" }, 0] },
                    then: { $arrayElemAt: ["$accommodationItem.pricePerDay", 0] },
                    else: 0,
                  },
                },
              },
              {
                case: { $eq: ["$bookingItemModel", "Rental"] },
                then: {
                  $cond: {
                    if: { $gt: [{ $size: "$rentalItem" }, 0] },
                    then: { $arrayElemAt: ["$rentalItem.price", 0] },
                    else: 0,
                  },
                },
              },
              {
                case: { $eq: ["$bookingItemModel", "Service"] },
                then: {
                  $cond: {
                    if: { $gt: [{ $size: "$serviceItem" }, 0] },
                    then: { $arrayElemAt: ["$serviceItem.price", 0] },
                    else: 0,
                  },
                },
              },
              {
                case: { $eq: ["$bookingItemModel", "Activity"] },
                then: {
                  $cond: {
                    if: { $gt: [{ $size: "$activityItem" }, 0] },
                    then: { $arrayElemAt: ["$activityItem.price", 0] },
                    else: 0,
                  },
                },
              },
            ],
            default: 0,
          },
        },

        // Item name
        itemName: {
          $switch: {
            branches: [
              {
                case: { $eq: ["$bookingItemModel", "Accommodation"] },
                then: {
                  $cond: {
                    if: { $gt: [{ $size: "$accommodationItem" }, 0] },
                    then: { $arrayElemAt: ["$accommodationItem.name", 0] },
                    else: "Unknown",
                  },
                },
              },
              {
                case: { $eq: ["$bookingItemModel", "Rental"] },
                then: {
                  $cond: {
                    if: { $gt: [{ $size: "$rentalItem" }, 0] },
                    then: { $arrayElemAt: ["$rentalItem.name", 0] },
                    else: "Unknown",
                  },
                },
              },
              {
                case: { $eq: ["$bookingItemModel", "Service"] },
                then: {
                  $cond: {
                    if: { $gt: [{ $size: "$serviceItem" }, 0] },
                    then: { $arrayElemAt: ["$serviceItem.name", 0] },
                    else: "Unknown",
                  },
                },
              },
              {
                case: { $eq: ["$bookingItemModel", "Activity"] },
                then: {
                  $cond: {
                    if: { $gt: [{ $size: "$activityItem" }, 0] },
                    then: { $arrayElemAt: ["$activityItem.name", 0] },
                    else: "Unknown",
                  },
                },
              },
            ],
            default: "Unknown",
          },
        },

        // Item description
        itemDescription: {
          $switch: {
            branches: [
              {
                case: { $eq: ["$bookingItemModel", "Accommodation"] },
                then: {
                  $cond: {
                    if: { $gt: [{ $size: "$accommodationItem" }, 0] },
                    then: { $arrayElemAt: ["$accommodationItem.description", 0] },
                    else: "",
                  },
                },
              },
              {
                case: { $eq: ["$bookingItemModel", "Rental"] },
                then: {
                  $cond: {
                    if: { $gt: [{ $size: "$rentalItem" }, 0] },
                    then: { $arrayElemAt: ["$rentalItem.description", 0] },
                    else: "",
                  },
                },
              },
              {
                case: { $eq: ["$bookingItemModel", "Service"] },
                then: {
                  $cond: {
                    if: { $gt: [{ $size: "$serviceItem" }, 0] },
                    then: { $arrayElemAt: ["$serviceItem.description", 0] },
                    else: "",
                  },
                },
              },
              {
                case: { $eq: ["$bookingItemModel", "Activity"] },
                then: {
                  $cond: {
                    if: { $gt: [{ $size: "$activityItem" }, 0] },
                    then: { $arrayElemAt: ["$activityItem.description", 0] },
                    else: "",
                  },
                },
              },
            ],
            default: "",
          },
        },

        // Item image
        itemImage: {
          $switch: {
            branches: [
              {
                case: { $eq: ["$bookingItemModel", "Accommodation"] },
                then: {
                  $cond: {
                    if: { $gt: [{ $size: "$accommodationItem" }, 0] },
                    then: { $arrayElemAt: ["$accommodationItem.avatar.url", 0] },
                    else: null,
                  },
                },
              },
              {
                case: { $eq: ["$bookingItemModel", "Rental"] },
                then: {
                  $cond: {
                    if: { $gt: [{ $size: "$rentalItem" }, 0] },
                    then: { $arrayElemAt: ["$rentalItem.avatar.url", 0] },
                    else: null,
                  },
                },
              },
              {
                case: { $eq: ["$bookingItemModel", "Service"] },
                then: {
                  $cond: {
                    if: { $gt: [{ $size: "$serviceItem" }, 0] },
                    then: { $arrayElemAt: ["$serviceItem.avatar.url", 0] },
                    else: null,
                  },
                },
              },
              {
                case: { $eq: ["$bookingItemModel", "Activity"] },
                then: {
                  $cond: {
                    if: { $gt: [{ $size: "$activityItem" }, 0] },
                    then: { $arrayElemAt: ["$activityItem.avatar.url", 0] },
                    else: null,
                  },
                },
              },
            ],
            default: null,
          },
        },

        // Customer name
        customerName: "$customer.name",
        customerEmail: "$customer.email",

        // Approver name
        approverName: "$approver.name",

        // Accommodation specific
        accommodationType: {
          $cond: {
            if: { $gt: [{ $size: "$accommodationItem" }, 0] },
            then: { $arrayElemAt: ["$accommodationItem.type", 0] },
            else: null,
          },
        },
        minCapacity: {
          $cond: {
            if: { $gt: [{ $size: "$accommodationItem" }, 0] },
            then: { $arrayElemAt: ["$accommodationItem.minCapacity", 0] },
            else: null,
          },
        },
        maxCapacity: {
          $cond: {
            if: { $gt: [{ $size: "$accommodationItem" }, 0] },
            then: { $arrayElemAt: ["$accommodationItem.maxCapacity", 0] },
            else: null,
          },
        },
        amenities: {
          $cond: {
            if: { $gt: [{ $size: "$accommodationItem" }, 0] },
            then: { $arrayElemAt: ["$accommodationItem.amenities", 0] },
            else: [],
          },
        },

        // Rental specific
        rentalUnit: {
          $cond: {
            if: { $gt: [{ $size: "$rentalItem" }, 0] },
            then: { $arrayElemAt: ["$rentalItem.unit", 0] },
            else: null,
          },
        },

        // Service specific
        serviceCategory: {
          $cond: {
            if: { $gt: [{ $size: "$serviceItem" }, 0] },
            then: { $arrayElemAt: ["$serviceItem.category", 0] },
            else: null,
          },
        },

        bookingStatus: "$status",
        isCompleted: "$isDone",

        // BILLING HISTORY FIELDS
        latestPartial: { $arrayElemAt: ["$partialBilling", 0] },
        hasPartial: { $gt: [{ $size: "$partialBilling" }, 0] },

        hasFullyPaid: {
          $gt: [
            {
              $size: {
                $filter: {
                  input: "$allBilling",
                  as: "b",
                  cond: {
                    $or: [
                      { $eq: ["$$b.status", "fully_paid"] },
                      { $eq: ["$$b.status", "completed"] },
                      { $eq: ["$$b.paymentDetails.paymentType", "full"] },
                    ],
                  },
                },
              },
            },
            0,
          ],
        },

        partialPaymentAmount: {
          $cond: {
            if: { $gt: [{ $size: "$partialBilling" }, 0] },
            then: "$latestPartial.matchingBooking.paymentAmount",
            else: 0,
          },
        },

        partialRemainingBalance: {
          $cond: {
            if: { $gt: [{ $size: "$partialBilling" }, 0] },
            then: "$latestPartial.matchingBooking.remainingBalance",
            else: null,
          },
        },

        partialTransactionId: {
          $cond: {
            if: { $gt: [{ $size: "$partialBilling" }, 0] },
            then: "$latestPartial.transactionId",
            else: null,
          },
        },

        debugPartial: {
          $cond: {
            if: { $gt: [{ $size: "$partialBilling" }, 0] },
            then: {
              $concat: [
                "Partial found: ",
                { $toString: "$latestPartial.transactionId" },
                " | Amount: ",
                { $toString: "$latestPartial.matchingBooking.paymentAmount" },
                " | Remaining: ",
                { $toString: "$latestPartial.matchingBooking.remainingBalance" },
              ],
            },
            else: "No partial payment found",
          },
        },
      },
    },

    // COMPUTE DISPLAY AMOUNT
    {
      $addFields: {
        originalAmount: "$itemPrice",

        displayAmount: {
          $cond: {
            if: {
              $and: [
                { $eq: ["$hasPartial", true] },
                { $gt: ["$partialPaymentAmount", 0] },
              ],
            },
            then: { $subtract: ["$itemPrice", "$partialPaymentAmount"] },
            else: "$itemPrice",
          },
        },

        paymentStatus: {
          $cond: {
            if: { $eq: ["$hasFullyPaid", true] },
            then: "fully_paid",
            else: {
              $cond: {
                if: { $eq: ["$hasPartial", true] },
                then: "partial",
                else: "pending",
              },
            },
          },
        },

        paymentStatusText: {
          $cond: {
            if: { $eq: ["$hasFullyPaid", true] },
            then: "Fully Paid",
            else: {
              $cond: {
                if: { $eq: ["$hasPartial", true] },
                then: "Partially Paid",
                else: "No Payment Yet",
              },
            },
          },
        },

        remainingBalance: {
          $cond: {
            if: { $eq: ["$hasPartial", true] },
            then: "$partialRemainingBalance",
            else: "$itemPrice",
          },
        },

        transactionId: "$partialTransactionId",
        billingStatus: "$paymentStatus",
        hasBilling: { $gt: [{ $size: "$allBilling" }, 0] },
        billingHistoryCount: { $size: "$allBilling" },
      },
    },

    // PROJECT FINAL OUTPUT
    {
      $project: {
        _id: 1,
        type: { $literal: "Booking" },
        bookingNumber: "$bookingNumber",
        referenceNo: "$bookingNumber",
        title: "$bookingItemModel",
        originalAmount: 1,
        partialPaymentAmount: 1,
        amount: { $ifNull: ["$displayAmount", 0] },
        displayAmount: 1,
        remainingBalance: 1,
        status: "$status",
        bookingStatus: 1,
        isCompleted: 1,
        createdAt: "$created_at",
        customer: {
          _id: "$customer._id",
          name: "$customer.name",
          email: "$customer.email",
          avatar: "$customer.avatar",
          image: "$customer.image",
        },
        customerName: 1,
        customerEmail: 1,
        approver: {
          _id: "$approver._id",
          name: "$approver.name",
          email: "$approver.email",
        },
        approverName: 1,
        bookingItemId: 1,
        bookingItemModel: 1,
        itemDetails: 1,
        itemName: 1,
        itemDescription: 1,
        itemImage: 1,
        itemPrice: 1,
        accommodationType: 1,
        minCapacity: 1,
        maxCapacity: 1,
        amenities: 1,
        rentalUnit: 1,
        serviceCategory: 1,
        paymentStatus: 1,
        paymentStatusText: 1,
        transactionId: 1,
        billingStatus: 1,
        hasBilling: 1,
        billingHistoryCount: 1,
        hasPartial: 1,
        hasFullyPaid: 1,
        debugPartial: 1,
      },
    },
  ]);

  console.log(`📊 Total Confirmed Bookings: ${bookings.length}`);

  // =========================
  // ORDERS AGGREGATION
  // =========================
  console.log("📚 ===== FETCHING ORDERS =====");

  const orders = await Order.aggregate([
    { $match: orderMatch },

    // LOOKUP USER DETAILS - FIXED FOR NON-CUSTOMERS
    {
      $lookup: {
        from: "userloginschemas",
        localField: "userId",
        foreignField: "_id",
        as: "userArray",
      },
    },
    {
      $addFields: {
        user: {
          $cond: {
            if: { $gt: [{ $size: "$userArray" }, 0] },
            then: { $arrayElemAt: ["$userArray", 0] },
            else: {
              _id: null,
              name: "Guest User",
              email: "guest@example.com",
              avatar: null,
              image: null,
            },
          },
        },
      },
    },
    {
      $project: {
        userArray: 0,
      },
    },

    // LOOKUP PARTIAL PAYMENTS
    {
      $lookup: {
        from: "billinghistories",
        let: {
          orderId: "$orderId",
          orderNumber: "$orderNumber",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $or: [
                      { $in: ["$$orderId", "$bookings.orderId"] },
                      { $eq: ["$bookings.orderId", "$$orderId"] },
                      { $in: ["$$orderId", "$bookings.referenceNo"] },
                      { $eq: ["$bookings.referenceNo", "$$orderId"] },
                      { $in: ["$$orderNumber", "$bookings.orderNumber"] },
                      { $eq: ["$bookings.orderNumber", "$$orderNumber"] },
                    ],
                  },
                  {
                    $or: [
                      { $eq: ["$status", "partial"] },
                      { $eq: ["$paymentDetails.paymentType", "partial"] },
                    ],
                  },
                ],
              },
            },
          },
          {
            $addFields: {
              matchingBooking: {
                $arrayElemAt: [
                  {
                    $filter: {
                      input: "$bookings",
                      as: "b",
                      cond: {
                        $or: [
                          { $eq: ["$$b.orderId", "$$orderId"] },
                          { $eq: ["$$b.referenceNo", "$$orderId"] },
                          { $eq: ["$$b.orderNumber", "$$orderNumber"] },
                        ],
                      },
                    },
                  },
                  0,
                ],
              },
            },
          },
          {
            $match: {
              "matchingBooking": { $ne: null },
            },
          },
          {
            $sort: { createdAt: -1 },
          },
          {
            $limit: 1,
          },
          {
            $project: {
              _id: 0,
              transactionId: 1,
              status: 1,
              paymentDetails: 1,
              "matchingBooking.paymentStatus": 1,
              "matchingBooking.paymentAmount": 1,
              "matchingBooking.remainingBalance": 1,
              "matchingBooking.amount": 1,
              createdAt: 1,
            },
          },
        ],
        as: "partialBilling",
      },
    },

    // LOOKUP ALL BILLING
    {
      $lookup: {
        from: "billinghistories",
        let: {
          orderId: "$orderId",
          orderNumber: "$orderNumber",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  { $in: ["$$orderId", "$bookings.orderId"] },
                  { $eq: ["$bookings.orderId", "$$orderId"] },
                  { $in: ["$$orderId", "$bookings.referenceNo"] },
                  { $eq: ["$bookings.referenceNo", "$$orderId"] },
                  { $in: ["$$orderNumber", "$bookings.orderNumber"] },
                  { $eq: ["$bookings.orderNumber", "$$orderNumber"] },
                ],
              },
            },
          },
          {
            $addFields: {
              matchingBooking: {
                $arrayElemAt: [
                  {
                    $filter: {
                      input: "$bookings",
                      as: "b",
                      cond: {
                        $or: [
                          { $eq: ["$$b.orderId", "$$orderId"] },
                          { $eq: ["$$b.referenceNo", "$$orderId"] },
                          { $eq: ["$$b.orderNumber", "$$orderNumber"] },
                        ],
                      },
                    },
                  },
                  0,
                ],
              },
            },
          },
          {
            $match: {
              "matchingBooking": { $ne: null },
            },
          },
          {
            $sort: { createdAt: -1 },
          },
          {
            $project: {
              status: 1,
              paymentDetails: 1,
            },
          },
        ],
        as: "allBilling",
      },
    },

    {
      $addFields: {
        customerName: "$user.name",
        customerEmail: "$user.email",
        itemCount: { $size: "$items" },
        latestPartial: { $arrayElemAt: ["$partialBilling", 0] },
        hasPartial: { $gt: [{ $size: "$partialBilling" }, 0] },
        hasFullyPaid: {
          $gt: [
            {
              $size: {
                $filter: {
                  input: "$allBilling",
                  as: "b",
                  cond: {
                    $or: [
                      { $eq: ["$$b.status", "fully_paid"] },
                      { $eq: ["$$b.status", "completed"] },
                      { $eq: ["$$b.paymentDetails.paymentType", "full"] },
                    ],
                  },
                },
              },
            },
            0,
          ],
        },
        partialPaymentAmount: {
          $cond: {
            if: { $gt: [{ $size: "$partialBilling" }, 0] },
            then: "$latestPartial.matchingBooking.paymentAmount",
            else: 0,
          },
        },
        partialRemainingBalance: {
          $cond: {
            if: { $gt: [{ $size: "$partialBilling" }, 0] },
            then: "$latestPartial.matchingBooking.remainingBalance",
            else: null,
          },
        },
        partialTransactionId: {
          $cond: {
            if: { $gt: [{ $size: "$partialBilling" }, 0] },
            then: "$latestPartial.transactionId",
            else: null,
          },
        },
        debugPartial: {
          $cond: {
            if: { $gt: [{ $size: "$partialBilling" }, 0] },
            then: {
              $concat: [
                "Partial found: ",
                { $toString: "$latestPartial.transactionId" },
                " | Amount: ",
                { $toString: "$latestPartial.matchingBooking.paymentAmount" },
                " | Remaining: ",
                { $toString: "$latestPartial.matchingBooking.remainingBalance" },
              ],
            },
            else: "No partial payment found",
          },
        },
      },
    },

    {
      $addFields: {
        originalAmount: "$totals.totalAmount",
        displayAmount: {
          $cond: {
            if: {
              $and: [
                { $eq: ["$hasPartial", true] },
                { $gt: ["$partialPaymentAmount", 0] },
              ],
            },
            then: { $subtract: ["$totals.totalAmount", "$partialPaymentAmount"] },
            else: "$totals.totalAmount",
          },
        },
        paymentStatus: {
          $cond: {
            if: { $eq: ["$hasFullyPaid", true] },
            then: "fully_paid",
            else: {
              $cond: {
                if: { $eq: ["$hasPartial", true] },
                then: "partial",
                else: "pending",
              },
            },
          },
        },
        paymentStatusText: {
          $cond: {
            if: { $eq: ["$hasFullyPaid", true] },
            then: "Fully Paid",
            else: {
              $cond: {
                if: { $eq: ["$hasPartial", true] },
                then: "Partially Paid",
                else: "No Payment Yet",
              },
            },
          },
        },
        remainingBalance: {
          $cond: {
            if: { $eq: ["$hasPartial", true] },
            then: "$partialRemainingBalance",
            else: "$totals.totalAmount",
          },
        },
        transactionId: "$partialTransactionId",
        billingStatus: "$paymentStatus",
        hasBilling: { $gt: [{ $size: "$allBilling" }, 0] },
        billingHistoryCount: { $size: "$allBilling" },
      },
    },

    {
      $project: {
        _id: 1,
        type: { $literal: "Order" },
        orderNumber: "$orderId",
        referenceNo: "$orderId",
        title: { $literal: "Food Order" },
        originalAmount: 1,
        partialPaymentAmount: 1,
        amount: { $ifNull: ["$displayAmount", 0] },
        displayAmount: 1,
        remainingBalance: 1,
        status: "$status",
        orderStatus: "$status",
        deliveryStatus: "$delivery.status",
        createdAt: "$orderDate",
        customer: {
          _id: "$user._id",
          name: "$user.name",
          email: "$user.email",
          avatar: "$user.avatar",
          image: "$user.image",
        },
        customerName: 1,
        customerEmail: 1,
        orderId: 1,
        items: 1,
        itemCount: 1,
        totals: 1,
        subtotal: "$totals.subtotal",
        tax: "$totals.tax",
        discount: "$totals.discount",
        grandTotal: "$totals.grandTotal",
        payment: 1,
        paymentMethod: "$payment.method",
        delivery: 1,
        deliveryAddress: "$delivery.address",
        paymentStatus: 1,
        paymentStatusText: 1,
        transactionId: 1,
        billingStatus: 1,
        hasBilling: 1,
        billingHistoryCount: 1,
        hasPartial: 1,
        hasFullyPaid: 1,
        debugPartial: 1,
      },
    },
  ]);

  console.log(`📊 Total Orders: ${orders.length}`);

  // =========================
  // COMBINE & SORT
  // =========================
  const data = [...bookings, ...orders].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );

  console.log(`📊 Total Combined: ${data.length} items`);

  // =========================
  // TOTALS
  // =========================
  const bookingTotal = bookings.reduce(
    (sum, item) => sum + Number(item.displayAmount || item.amount || 0),
    0
  );

  const orderTotal = orders.reduce(
    (sum, item) => sum + Number(item.displayAmount || item.amount || 0),
    0
  );

  // Count by status
  const bookingStatusCounts = bookings.reduce((acc, item) => {
    const status = item.paymentStatusText || item.status || "Unknown";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const orderStatusCounts = orders.reduce((acc, item) => {
    const status = item.paymentStatusText || item.status || "Unknown";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  // =========================
  // RESPONSE
  // =========================
  res.status(200).json({
    success: true,
    summary: {
      bookingTotal,
      orderTotal,
      grandTotal: bookingTotal + orderTotal,
      totalBookings: bookings.length,
      totalOrders: orders.length,
    },
    statusSummary: {
      booking: bookingStatusCounts,
      order: orderStatusCounts,
    },
    totalItems: data.length,
    data,
  });
});

exports.getAllBookings = AsyncErrorHandler(async (req, res) => {
  const { dateFrom, dateTo, page = 1, limit = 10, search } = req.query;

  const role = req.user?.role;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const pageSize = parseInt(limit);

  // =========================
  // 1. DYNAMIC FILTER OBJECT
  // =========================
  let filter = {};

  // DATE FILTER
  if (dateFrom || dateTo) {
    filter.created_at = {};
    if (dateFrom) filter.created_at.$gte = new Date(dateFrom);
    if (dateTo) {
      const endOfDay = new Date(dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      filter.created_at.$lte = endOfDay;
    }
  }

  // SEARCH FILTER
  if (search && search.trim() !== "") {
    filter.$or = [
      { bookingReference: { $regex: search, $options: "i" } },
      { status: { $regex: search, $options: "i" } },
      { bookingItemModel: { $regex: search, $options: "i" } },
    ];
  }

  // =========================
  // 2. AGGREGATION
  // =========================
  const results = await ActionBooking.aggregate([
    { $match: filter },
    { $sort: { created_at: -1 } },

    // CUSTOMER USER
    {
      $lookup: {
        from: "userloginschemas",
        localField: "customerId",
        foreignField: "_id",
        as: "customerUser",
      },
    },
    { $unwind: { path: "$customerUser", preserveNullAndEmptyArrays: true } },

    {
      $lookup: {
        from: "customers",
        localField: "customerUser.linkedId",
        foreignField: "_id",
        as: "customer",
      },
    },
    { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },

    // ACCOMMODATION
    {
      $lookup: {
        from: "accommodations",
        let: { id: "$bookingItemId", model: "$bookingItemModel" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$_id", "$$id"] },
                  { $eq: ["$$model", "Accommodation"] },
                ],
              },
            },
          },
        ],
        as: "accommodation",
      },
    },

    // SERVICE
    {
      $lookup: {
        from: "services",
        let: { id: "$bookingItemId", model: "$bookingItemModel" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$_id", "$$id"] },
                  { $eq: ["$$model", "Service"] },
                ],
              },
            },
          },
        ],
        as: "service",
      },
    },

    // ACTIVITY
    {
      $lookup: {
        from: "activities",
        let: { id: "$bookingItemId", model: "$bookingItemModel" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$_id", "$$id"] },
                  { $eq: ["$$model", "Activity"] },
                ],
              },
            },
          },
        ],
        as: "activity",
      },
    },

    // RENTAL
    {
      $lookup: {
        from: "rentals",
        let: { id: "$bookingItemId", model: "$bookingItemModel" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$_id", "$$id"] },
                  { $eq: ["$$model", "Rental"] },
                ],
              },
            },
          },
        ],
        as: "rental",
      },
    },

    // MERGE BOOKING ITEM
    {
      $addFields: {
        bookingItem: {
          $switch: {
            branches: [
              {
                case: { $eq: ["$bookingItemModel", "Accommodation"] },
                then: { $arrayElemAt: ["$accommodation", 0] },
              },
              {
                case: { $eq: ["$bookingItemModel", "Service"] },
                then: { $arrayElemAt: ["$service", 0] },
              },
              {
                case: { $eq: ["$bookingItemModel", "Activity"] },
                then: { $arrayElemAt: ["$activity", 0] },
              },
              {
                case: { $eq: ["$bookingItemModel", "Rental"] },
                then: { $arrayElemAt: ["$rental", 0] },
              },
            ],
            default: null,
          },
        },
      },
    },

    // =========================
    // 3. LOOKUP BILLING HISTORY
    // =========================
    {
      $lookup: {
        from: "billinghistories",
        let: {
          bookingRef: "$bookingReference",
          orderNumber: "$orderNumber",
          bookingId: "$_id"
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  { $eq: ["$bookings.bookingNumber", "$$bookingRef"] },
                  { $eq: ["$bookings.orderNumber", "$$orderNumber"] },
                  { $eq: ["$bookings.bookingNumber", "$$orderNumber"] },
                  { $eq: ["$bookings.orderNumber", "$$bookingRef"] },
                  { $eq: ["$bookings._id", "$$bookingId"] },
                  { $in: ["$$bookingRef", "$bookings.bookingNumber"] },
                  { $in: ["$$orderNumber", "$bookings.orderNumber"] },
                ]
              }
            }
          },
          {
            $addFields: {
              matchingBooking: {
                $arrayElemAt: [
                  {
                    $filter: {
                      input: "$bookings",
                      as: "b",
                      cond: {
                        $or: [
                          { $eq: ["$$b.bookingNumber", "$$bookingRef"] },
                          { $eq: ["$$b.orderNumber", "$$orderNumber"] },
                          { $eq: ["$$b.bookingNumber", "$$orderNumber"] },
                          { $eq: ["$$b.orderNumber", "$$bookingRef"] },
                          { $eq: ["$$b._id", "$$bookingId"] },
                        ]
                      }
                    }
                  },
                  0
                ]
              }
            }
          },
          {
            $match: {
              "matchingBooking": { $ne: null }
            }
          },
          {
            $sort: { createdAt: -1 }
          },
          {
            $project: {
              _id: 0,
              transactionId: 1,
              status: 1,
              paymentDetails: 1,
              "matchingBooking.paymentStatus": 1,
              "matchingBooking.paymentAmount": 1,
              "matchingBooking.remainingBalance": 1,
              createdAt: 1,
              updatedAt: 1,
            }
          }
        ],
        as: "billingHistory",
      }
    },

    // =========================
    // 4. PROCESS BILLING DATA
    // =========================
    {
      $addFields: {
        latestBilling: { $arrayElemAt: ["$billingHistory", 0] },
        allBilling: "$billingHistory",

        // Check if booking has billing history
        hasBilling: { $gt: [{ $size: "$billingHistory" }, 0] },

        // Get payment status from latest billing
        paymentStatus: {
          $cond: {
            if: { $gt: [{ $size: "$billingHistory" }, 0] },
            then: {
              $switch: {
                branches: [
                  {
                    case: { $eq: ["$latestBilling.status", "fully_paid"] },
                    then: "fully_paid"
                  },
                  {
                    case: { $eq: ["$latestBilling.status", "partial"] },
                    then: "partial"
                  },
                  {
                    case: {
                      $and: [
                        { $eq: ["$latestBilling.paymentDetails.paymentType", "full"] },
                        { $eq: ["$latestBilling.status", "completed"] }
                      ]
                    },
                    then: "fully_paid"
                  }
                ],
                default: "unpaid"
              }
            },
            else: "unpaid"
          }
        },

        // Get total paid amount from all billings
        totalPaidAmount: {
          $cond: {
            if: { $gt: [{ $size: "$billingHistory" }, 0] },
            then: {
              $sum: "$billingHistory.paymentDetails.paymentAmount"
            },
            else: 0
          }
        },

        // Get the payment amount from the matching booking
        bookingPaymentAmount: {
          $cond: {
            if: { $gt: [{ $size: "$billingHistory" }, 0] },
            then: "$latestBilling.matchingBooking.paymentAmount",
            else: 0
          }
        },

        // Get remaining balance
        remainingBalance: {
          $cond: {
            if: { $gt: [{ $size: "$billingHistory" }, 0] },
            then: {
              $cond: {
                if: { $eq: ["$latestBilling.status", "partial"] },
                then: "$latestBilling.matchingBooking.remainingBalance",
                else: 0
              }
            },
            else: null
          }
        },

        // Check if fully paid
        isFullyPaid: {
          $cond: {
            if: { $gt: [{ $size: "$billingHistory" }, 0] },
            then: {
              $or: [
                { $eq: ["$latestBilling.status", "fully_paid"] },
                { $eq: ["$latestBilling.status", "completed"] },
                { $eq: ["$latestBilling.paymentDetails.paymentType", "full"] }
              ]
            },
            else: false
          }
        }
      }
    },

    // =========================
    // 5. CALCULATE ADJUSTED AMOUNT
    // =========================
    {
      $addFields: {
        originalAmount: "$amount",

        // Deduct paid amount from original amount for partial payments
        adjustedAmount: {
          $cond: {
            if: {
              $and: [
                { $eq: ["$paymentStatus", "partial"] },
                { $gt: ["$bookingPaymentAmount", 0] }
              ]
            },
            then: { $subtract: ["$amount", "$bookingPaymentAmount"] },
            else: "$amount"
          }
        },

        // Display amount based on payment status
        displayAmount: {
          $switch: {
            branches: [
              {
                case: { $eq: ["$paymentStatus", "fully_paid"] },
                then: 0 // Fully paid - no amount due
              },
              {
                case: { $eq: ["$paymentStatus", "partial"] },
                then: { $subtract: ["$amount", "$bookingPaymentAmount"] } // Remaining balance
              }
            ],
            default: "$amount" // Unpaid - full amount
          }
        },

        // Payment status display text
        paymentStatusText: {
          $switch: {
            branches: [
              {
                case: { $eq: ["$paymentStatus", "fully_paid"] },
                then: "Fully Paid"
              },
              {
                case: { $eq: ["$paymentStatus", "partial"] },
                then: "Partially Paid"
              }
            ],
            default: "Unpaid"
          }
        },

        // Payment history count
        paymentCount: { $size: "$billingHistory" }
      }
    },

    // =========================
    // 6. FILTER OUT FULLY PAID (Optional)
    // =========================
    // Uncomment this to hide fully paid bookings
    // {
    //   $match: {
    //     isFullyPaid: { $ne: true }
    //   }
    // },

    // =========================
    // 7. CLEANUP
    // =========================
    {
      $project: {
        accommodation: 0,
        service: 0,
        activity: 0,
        rental: 0,
        customerUser: 0,
        billingHistory: 0,
        latestBilling: 0,
        allBilling: 0,
      },
    },

    // =========================
    // 8. PAGINATION (FACET)
    // =========================
    {
      $facet: {
        metadata: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: pageSize }],
      },
    },
  ]);

  const totalCount = results[0].metadata[0]?.total || 0;
  const bookings = results[0].data;
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
    data: bookings,
  });
});

exports.createBooking = AsyncErrorHandler(async (req, res) => {
  try {
    const {
      bookingItemId,
      bookingItemModel,
      first_name,
      last_name,
      middle_name,
      suffix,
      expected_stay,
      userId
    } = req.body;
    const role = req.user.role;

    console.log("role", role);
    console.log("CREATE BOOKING REQUEST BODY:", req.body);

    let guestUserId = null;
    let customerId = null;
    let isWalkin = false;
    let shouldCreateUser = true; // Flag to determine if we should create a user account

    // =====================================
    // 1. CHECK IF USER IS RECEPTIONIST OR ADMIN
    // =====================================
    if (role === "receptionist" || role === "admin") {

      // Set isWalkin to true for staff-created bookings
      isWalkin = true;

      // Check if we should create a user account
      // For Rentals and Services, we don't create user accounts
      if (bookingItemModel === "Rental" || bookingItemModel === "Service") {
        shouldCreateUser = false;
        console.log(`ℹ️ ${bookingItemModel} booking - will create customer only, no user account`);
      }

      // Check if userId is provided (existing user selected from table)
      if (userId) {
        // Find existing user by userId
        const existingUser = await UserLoginSchema.findById(userId);

        if (existingUser) {
          console.log(`👤 Using existing user account: ${existingUser.username}`);
          guestUserId = existingUser._id;
          customerId = existingUser.linkedId; // Get the linked customer ID

          // Update customer info if provided (optional)
          if (first_name || last_name || middle_name || suffix) {
            await Customer.findByIdAndUpdate(customerId, {
              first_name: first_name || existingUser.customer?.first_name,
              last_name: last_name || existingUser.customer?.last_name,
              middle_name: middle_name || existingUser.customer?.middle_name,
              suffix: suffix || existingUser.customer?.suffix,
            });
          }
        } else {
          return res.status(404).json({
            success: false,
            message: "User not found with the provided userId"
          });
        }
      } else {
        // No userId provided - create new customer
        // Step 1: Create Customer first
        const customer = await Customer.create({
          first_name: first_name || "",
          last_name: last_name || "",
          middle_name: middle_name || "",
          suffix: suffix || "",
          avatar: {
            url: "",
            public_id: ""
          }
        });

        customerId = customer._id;
        console.log(`✅ Created customer: ${first_name} ${last_name}`);

        // Step 2: Create user account ONLY for Accommodation bookings
        if (shouldCreateUser) {
          // Check if user account already exists for this customer
          const existingUser = await UserLoginSchema.findOne({ linkedId: customerId });

          if (!existingUser) {
            // Generate username: firstname + "guestagta" + "@gmail.com"
            const guestFirstName = first_name || "guest";
            const username = `${guestFirstName.toLowerCase()}guestagta@gmail.com`;
            const password = "default123";

            // Create user login account linked to the customer
            const newUser = await UserLoginSchema.create({
              username: username,
              password: password, // Make sure to hash this if using bcrypt
              role: "customer", // Always set role as customer for guests
              linkedId: customerId,
              isVerified: true, // Auto-verified for staff-created accounts
            });

            guestUserId = newUser._id;
            console.log(`✅ Created user account for guest: ${username}`);
            console.log(`🔑 Default password: ${password}`);
          } else {
            console.log(`👤 Guest already has user account: ${existingUser.username}`);
            guestUserId = existingUser._id;
          }
        } else {
          // For Rentals and Services, we don't create a user account
          // We'll use the customer ID directly or create a placeholder user
          console.log(`ℹ️ No user account created for ${bookingItemModel} booking`);
          
          // Let's create a minimal user account without login credentials
          // This allows the booking to be linked properly without creating a full user account
          const tempUser = await UserLoginSchema.create({
            username: `${first_name?.toLowerCase() || 'guest'}_temp_${Date.now()}`,
            password: "temporary", // This will be hashed
            role: "customer",
            linkedId: customerId,
            isVerified: false,
            isTemporary: true // Add this field to your schema or use a flag
          });
          
          guestUserId = tempUser._id;
          console.log(`✅ Created temporary user account for ${bookingItemModel} booking`);
        }
      }

    } else {
      // For customers creating their own booking, use provided userId
      customerId = req.body.userId || req.body.customerId;
      isWalkin = false; // Not a walk-in for customer-created bookings

      // Check if user exists
      const user = await UserLoginSchema.findById(customerId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }
      guestUserId = customerId;
    }

    // =====================================
    // 2. DETERMINE BOOKING STATUS
    // =====================================
    // If isWalkin is true, set status to "Confirmed"
    // Otherwise, set to "Pending" for regular bookings
    const bookingStatus = isWalkin ? "Confirmed" : "Pending";
    console.log(`📌 Booking status set to: ${bookingStatus} (isWalkin: ${isWalkin})`);

    // =====================================
    // 3. CREATE BOOKING with isWalkin, expected_stay, and status
    // =====================================
    const booking = await ActionBooking.create({
      customerId: guestUserId, // Use the user ID
      bookingItemId,
      bookingItemModel,
      isWalkin: isWalkin,
      expected_stay: expected_stay || 1, // Default to 1 day if not provided
      status: bookingStatus // Set the status based on isWalkin
    });

    // =====================================
    // 4. AGGREGATION (FULL DETAILS)
    // =====================================
    const detailedBookingArray = await ActionBooking.aggregate([
      { $match: { _id: booking._id } },

      // CUSTOMER USER
      {
        $lookup: {
          from: "userloginschemas",
          localField: "customerId",
          foreignField: "_id",
          as: "customerUser",
        },
      },
      { $unwind: { path: "$customerUser", preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: "customers",
          localField: "customerUser.linkedId",
          foreignField: "_id",
          as: "customer",
        },
      },
      { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },

      // ACCOMMODATION
      {
        $lookup: {
          from: "accommodations",
          let: { id: "$bookingItemId", model: "$bookingItemModel" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$_id", "$$id"] },
                    { $eq: ["$$model", "Accommodation"] },
                  ],
                },
              },
            },
          ],
          as: "accommodation",
        },
      },

      // SERVICE
      {
        $lookup: {
          from: "services",
          let: { id: "$bookingItemId", model: "$bookingItemModel" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$_id", "$$id"] },
                    { $eq: ["$$model", "Service"] },
                  ],
                },
              },
            },
          ],
          as: "service",
        },
      },

      // ACTIVITY
      {
        $lookup: {
          from: "activities",
          let: { id: "$bookingItemId", model: "$bookingItemModel" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$_id", "$$id"] },
                    { $eq: ["$$model", "Activity"] },
                  ],
                },
              },
            },
          ],
          as: "activity",
        },
      },

      // RENTAL
      {
        $lookup: {
          from: "rentals",
          let: { id: "$bookingItemId", model: "$bookingItemModel" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$_id", "$$id"] },
                    { $eq: ["$$model", "Rental"] },
                  ],
                },
              },
            },
          ],
          as: "rental",
        },
      },

      // MERGE FINAL ITEM
      {
        $addFields: {
          bookingItem: {
            $switch: {
              branches: [
                {
                  case: { $eq: ["$bookingItemModel", "Accommodation"] },
                  then: { $arrayElemAt: ["$accommodation", 0] },
                },
                {
                  case: { $eq: ["$bookingItemModel", "Service"] },
                  then: { $arrayElemAt: ["$service", 0] },
                },
                {
                  case: { $eq: ["$bookingItemModel", "Activity"] },
                  then: { $arrayElemAt: ["$activity", 0] },
                },
                {
                  case: { $eq: ["$bookingItemModel", "Rental"] },
                  then: { $arrayElemAt: ["$rental", 0] },
                },
              ],
              default: null,
            },
          },
        },
      },

      {
        $project: {
          accommodation: 0,
          service: 0,
          activity: 0,
          rental: 0,
          customerUser: 0,
        },
      },
    ]);

    const finalBookingData = detailedBookingArray[0];

    // =====================================
    // 5. SOCKET EMIT (BOOKING)
    // =====================================
    const io = req.app.get("socketio");

    if (io) {
      const payload = {
        booking: finalBookingData,
        message: `New ${isWalkin ? 'walk-in ' : ''}booking created (${bookingStatus})`,
      };

      io.to("admin").emit("newBooking", payload);
      io.to("receptionist").emit("newBooking", payload);

      console.log(`📡 BOOKING EMITTED TO ADMIN + RECEPTIONIST (Status: ${bookingStatus})`);
    }

    const staffMembers = await UserLoginSchema.find({
      role: { $in: ["admin", "receptionist"] }
    }).select("_id");

    // =====================================
    // 6. CREATE NOTIFICATION
    // =====================================
    const viewersList = staffMembers.map(staff => ({
      user: staff._id,
      isRead: false
    }));

    const newNotification = await Notification.create({
      message: `New ${isWalkin ? 'walk-in ' : ''}booking created for ${bookingItemModel} (${bookingStatus}) - ${expected_stay || 1} day${expected_stay > 1 ? 's' : ''}`,
      FileId: finalBookingData?._id,
      viewers: viewersList,
    });

    // =====================================
    // 7. SOCKET EMIT (NOTIFICATION ONLY ADMIN + RECEPTIONIST)
    // =====================================
    if (io) {
      const notifPayload = {
        _id: newNotification._id,
        message: newNotification.message,
        FileId: newNotification.FileId,
        viewers: newNotification.viewers,
        createdAt: newNotification.createdAt,
      };

      io.to("admin").emit("newNotification", notifPayload);
      io.to("receptionist").emit("newNotification", notifPayload);

      console.log("🔔 NOTIFICATION EMITTED TO ADMIN + RECEPTIONIST ONLY");
    }

    // =====================================
    // 8. RESPONSE
    // =====================================
    const responseData = {
      success: true,
      message: "Booking created successfully",
      data: finalBookingData,
      status: bookingStatus, // Include status in response
    };

    // Include customer and user creation info for staff
    if (role === "receptionist" || role === "admin") {
      if (userId) {
        responseData.userInfo = {
          userId: userId,
          message: "Used existing user account",
          isExistingUser: true
        };
      } else {
        responseData.customerInfo = {
          customerId: customerId,
          name: `${first_name} ${last_name}`,
          bookingType: bookingItemModel,
          hasUserAccount: shouldCreateUser,
          username: shouldCreateUser ? `${first_name?.toLowerCase() || 'guest'}guestagta@gmail.com` : null,
          password: shouldCreateUser ? "default123" : null,
          isWalkin: true,
          expected_stay: expected_stay || 1,
          status: bookingStatus,
          message: shouldCreateUser ? 
            "Customer and user account created" : 
            "Customer created (no user account for rentals/services)"
        };
      }
    }

    res.status(201).json(responseData);

  } catch (error) {
    console.error("CREATE BOOKING ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create booking",
      error: error.message,
    });
  }
});

exports.getSingleBooking = AsyncErrorHandler(async (req, res) => {
  const booking = await ActionBooking.findById(req.params.id)
    .populate("custromerId")
    .populate("approverId");

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking not found",
    });
  }

  res.status(200).json({
    success: true,
    data: booking,
  });
});

exports.updateBookingStatus = AsyncErrorHandler(async (req, res) => {
  try {
    const { status, approverId } = req.body;

    let booking = await ActionBooking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // =========================
    // BUILD UPDATE OBJECT (IGNORE EMPTY VALUES)
    // =========================
    const updateData = Object.fromEntries(
      Object.entries({ status, approverId })
        .filter(([_, value]) => value !== undefined && value !== null && value !== "")
    );

    // OPTIONAL: prevent empty update
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields to update",
      });
    }

    // =========================
    // UPDATE BOOKING
    // =========================
    booking = await ActionBooking.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    // =========================
    // ENRICHED BOOKING (LOOKUP)
    // =========================
    const detailedBookingArray = await ActionBooking.aggregate([
      { $match: { _id: booking._id } },

      // CUSTOMER USER
      {
        $lookup: {
          from: "userloginschemas",
          localField: "customerId",
          foreignField: "_id",
          as: "customerUser",
        },
      },
      { $unwind: { path: "$customerUser", preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: "customers",
          localField: "customerUser.linkedId",
          foreignField: "_id",
          as: "customer",
        },
      },
      { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },

      // ACCOMMODATION
      {
        $lookup: {
          from: "accommodations",
          let: { id: "$bookingItemId", model: "$bookingItemModel" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$_id", "$$id"] },
                    { $eq: ["$$model", "Accommodation"] },
                  ],
                },
              },
            },
          ],
          as: "accommodation",
        },
      },

      // SERVICE
      {
        $lookup: {
          from: "services",
          let: { id: "$bookingItemId", model: "$bookingItemModel" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$_id", "$$id"] },
                    { $eq: ["$$model", "Service"] },
                  ],
                },
              },
            },
          ],
          as: "service",
        },
      },

      // ACTIVITY
      {
        $lookup: {
          from: "activities",
          let: { id: "$bookingItemId", model: "$bookingItemModel" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$_id", "$$id"] },
                    { $eq: ["$$model", "Activity"] },
                  ],
                },
              },
            },
          ],
          as: "activity",
        },
      },

      // RENTAL
      {
        $lookup: {
          from: "rentals",
          let: { id: "$bookingItemId", model: "$bookingItemModel" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$_id", "$$id"] },
                    { $eq: ["$$model", "Rental"] },
                  ],
                },
              },
            },
          ],
          as: "rental",
        },
      },

      // MERGE FINAL ITEM
      {
        $addFields: {
          bookingItem: {
            $switch: {
              branches: [
                {
                  case: { $eq: ["$bookingItemModel", "Accommodation"] },
                  then: { $arrayElemAt: ["$accommodation", 0] },
                },
                {
                  case: { $eq: ["$bookingItemModel", "Service"] },
                  then: { $arrayElemAt: ["$service", 0] },
                },
                {
                  case: { $eq: ["$bookingItemModel", "Activity"] },
                  then: { $arrayElemAt: ["$activity", 0] },
                },
                {
                  case: { $eq: ["$bookingItemModel", "Rental"] },
                  then: { $arrayElemAt: ["$rental", 0] },
                },
              ],
              default: null,
            },
          },
        },
      },

      {
        $project: {
          accommodation: 0,
          service: 0,
          activity: 0,
          rental: 0,
          customerUser: 0,
        },
      },
    ]);

    const io = req.app.get("socketio");

    const finalBooking =
      detailedBookingArray.length > 0
        ? detailedBookingArray[0]
        : booking.toObject();

    const payload = {
      message: "Booking status updated",
      data: finalBooking,
    };

    const customerRoom = `user-${booking.customerId}`;

    // =========================
    // SOCKET EMIT
    // =========================
    if (io) {
      io.to("admin").emit("booking-status-updated", payload);
      io.to("receptionist").emit("booking-status-updated", payload);
      io.to(customerRoom).emit("booking-status-updated", payload);

      console.log("📡 STATUS EMITTED TO ROOMS");
    }

    // =========================
    // NOTIFICATION (ONLY IF STATUS CHANGED)
    // =========================
    if (updateData.status) {
      const notification = await Notification.create({
        message: `Your booking status has been updated to ${updateData.status}`,
        FileId: finalBooking._id,
        viewers: [
          {
            user: booking.customerId,
            isRead: false,
          },
        ],
      });

      if (io) {
        const notifPayload = {
          _id: notification._id,
          message: notification.message,
          FileId: notification.FileId,
          createdAt: notification.createdAt,
        };

        io.to(customerRoom).emit("newNotification", notifPayload);

        console.log("🔔 NOTIFICATION SENT ONLY TO CUSTOMER");
      }
    }

    // =========================
    // RESPONSE
    // =========================
    res.status(200).json({
      success: true,
      data: finalBooking,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

exports.deleteBooking = AsyncErrorHandler(async (req, res) => {
  const booking = await ActionBooking.findById(req.params.id);

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking not found",
    });
  }

  await booking.deleteOne();

  res.status(200).json({
    success: true,
    message: "Booking deleted successfully",
  });
});
