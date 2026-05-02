const ActionBooking = require("../Models/ActionBooking");
const AsyncErrorHandler = require("../Utils/AsyncErrorHandler");
const Notification = require("../Models/NotificationSchema");
const UserLoginSchema = require("../Models/LogInDentalSchema");

exports.createBooking = AsyncErrorHandler(async (req, res) => {
  try {
    const { customerId, bookingItemId, bookingItemModel } = req.body;

    console.log("CREATE BOOKING REQUEST BODY:", req.body);

    // =====================================
    // 1. CREATE BOOKING
    // =====================================
    const booking = await ActionBooking.create({
      customerId,
      bookingItemId,
      bookingItemModel,
    });

    // =====================================
    // 2. AGGREGATION (FULL DETAILS)
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
    // 3. SOCKET EMIT (BOOKING)
    // =====================================
    const io = req.app.get("socketio");

    if (io) {
      const payload = {
        booking: finalBookingData,
        message: "New booking created",
      };

      io.to("admin").emit("newBooking", payload);
      io.to("receptionist").emit("newBooking", payload);

      console.log("📡 BOOKING EMITTED TO ADMIN + RECEPTIONIST");
    }

    const staffMembers = await UserLoginSchema.find({
      role: { $in: ["admin", "receptionist"] }
    }).select("_id");

    // =====================================
    // 5. CREATE NOTIFICATION
    // =====================================
    const viewersList = staffMembers.map(staff => ({
      user: staff._id,
      isRead: false
    }));

    const newNotification = await Notification.create({
      message: `New booking created for ${bookingItemModel}`,
      FileId: finalBookingData?._id,
      viewers: viewersList,
    });

    // =====================================
    // 6. SOCKET EMIT (NOTIFICATION ONLY ADMIN + RECEPTIONIST)
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
    // 7. RESPONSE
    // =====================================
    res.status(201).json({
      success: true,
      message: "Booking created",
      data: finalBookingData,
    });

  } catch (error) {
    console.error("CREATE BOOKING ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create booking",
      error: error.message,
    });
  }
});

exports.getAllBookings = AsyncErrorHandler(async (req, res) => {
  const { dateFrom, dateTo, page = 1, limit = 10, search } = req.query;

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
      { status: { $regex: search, $options: "i" } }, // fixed field name
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

    {
      $project: {
        accommodation: 0,
        service: 0,
        activity: 0,
        rental: 0,
        customerUser: 0,
      },
    },

    // =========================
    // 3. PAGINATION (FACET)
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

// GET SINGLE BOOKING
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

// DELETE BOOKING
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
