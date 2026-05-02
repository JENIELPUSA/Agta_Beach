const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
const Accommodation = require("../Models/accommodationSchema");
const Service = require("../Models/serviceSchema ");
const Rental = require("../Models/rentalSchema");
const BookingItem = require("../Models/bookingItemSchema");
const ActionBookingScheema = require("../Models/ActionBooking");

exports.displayAllLimitOffers = async (req, res) => {
  try {
    // =========================
    // 1. GET ALL PAID BOOKINGS
    // =========================
    const paidBookings = await ActionBookingScheema.find({
      status: "Paid",
    }).select("bookingItemId bookingItemModel");

    // Convert to easy lookup
    const paidMap = new Map();

    paidBookings.forEach((item) => {
      paidMap.set(item.bookingItemId.toString(), item.bookingItemModel);
    });

    // =========================
    // 2. FETCH DATA
    // =========================
    const [accommodations, services, rentals] = await Promise.all([
      Accommodation.find({ type: "room" }).sort({ createdAt: -1 }).limit(4),
      Service.find().sort({ createdAt: -1 }).limit(8),
      Rental.find().sort({ createdAt: -1 }),
    ]);

    // =========================
    // 3. APPLY STATUS LOGIC
    // =========================
    const updateStatus = (items, modelName) => {
      return items.map((item) => {
        const isPaid = paidMap.has(item._id.toString()) &&
                       paidMap.get(item._id.toString()) === modelName;

        return {
          ...item._doc,
          availabilityStatus: isPaid ? "Not Available" : "Available",
        };
      });
    };

    const updatedAccommodations = updateStatus(accommodations, "Accommodation");
    const updatedServices = updateStatus(services, "Service");
    const updatedRentals = updateStatus(rentals, "Rental");

    res.status(200).json({
      success: true,
      count: {
        accommodations: updatedAccommodations.length,
        services: updatedServices.length,
        rentals: updatedRentals.length,
      },
      data: {
        accommodations: updatedAccommodations,
        services: updatedServices,
        rentals: updatedRentals,
      },
    });

  } catch (error) {
    console.error("❌ Server Error:", error);
    res.status(500).json({
      success: false,
      message: "May error sa pag-retrieve ng data.",
      error: error.message,
    });
  }
};

// Helper function para linisin ang undefined fields
const removeEmptyFields = (obj) => {
  const newObj = { ...obj };
  Object.keys(newObj).forEach((key) => {
    if (
      newObj[key] === undefined ||
      newObj[key] === null ||
      newObj[key] === ""
    ) {
      delete newObj[key];
    }
  });
  return newObj;
};

exports.createOfferController = async (req, res) => {
  try {
    const {
      categoryType,
      name,
      type,
      minCapacity,
      maxCapacity,
      pricePerDay,
      price,
      category,
      unit,
      description,
      status,
      amenities, // <--- TINANGGAP ANG AMENITIES GALING SA FRONTEND
    } = req.body;

    if (!categoryType || !name) {
      return res.status(400).json({
        success: false,
        message: "categoryType and name are required",
      });
    }

    let avatar = { url: "", public_id: "" };

    // Cloudinary Upload Logic
    if (req.file) {
      const form = new FormData();
      form.append(
        "file",
        fs.createReadStream(req.file.path),
        req.file.originalname,
      );

      try {
        const response = await axios.post(process.env.UPLOAD_URL, form, {
          maxBodyLength: Infinity,
          headers: { ...form.getHeaders() },
        });

        if (response.data.success) {
          avatar = {
            url: response.data.url,
            public_id: response.data.public_id || req.file.filename,
          };
          if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        }
      } catch (err) {
        console.error("❌ Cloudinary Error:", err.message);
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      }
    }

    let model;
    let data = { name, avatar };

    // PROCESS AMENITIES: Siguraduhin na magiging Array ito (kahit galing sa comma-separated string)
    let processedAmenities = [];
    if (amenities) {
      processedAmenities = Array.isArray(amenities)
        ? amenities
        : amenities.split(",").map((item) => item.trim());
    }

    switch (categoryType.toLowerCase()) {
      case "accommodation":
        model = Accommodation;
        data = {
          ...data,
          type,
          description, // Isinama na rin ang description
          minCapacity: Number(minCapacity),
          maxCapacity: Number(maxCapacity),
          pricePerDay: Number(pricePerDay),
          status,
          amenities: processedAmenities, // <--- DITO NA-SAVE ANG "FREE WIFI", ETC.
        };
        break;
      case "service":
        model = Service;
        data = { ...data, price: Number(price), category, description };
        break;
      case "rental":
        model = Rental;
        data = { ...data, price: Number(price), unit, description, status };
        break;
      default:
        return res
          .status(400)
          .json({ success: false, message: "Invalid categoryType" });
    }

    const finalData = removeEmptyFields(data);
    const newItem = new model(finalData);
    const savedItem = await newItem.save();

    res.status(201).json({ success: true, data: savedItem });
  } catch (error) {
    console.error("❌ Server Error 500:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.searchAvailableRooms = async (req, res) => {
  const { checkIn, checkOut, guests, type } = req.query;
  const guestCount = parseInt(guests) || 1;

  try {
    // 1. Hanapin ang overlapping bookings
    const overlappingBookings = await BookingItem.find({
      itemType: "accommodation",
    }).populate({
      path: "booking",
      match: {
        status: { $in: ["pending", "confirmed"] },
        checkInDate: { $lt: new Date(checkOut) },
        checkOutDate: { $gt: new Date(checkIn) },
      },
    });

    const bookedRoomIds = overlappingBookings
      .filter((item) => item.booking)
      .map((item) => item.accommodation);

    // 2. Query Available Rooms
    let query = {
      _id: { $nin: bookedRoomIds },
      status: "available",
      minCapacity: { $lte: guestCount },
      maxCapacity: { $gte: guestCount },
    };

    if (type && type !== "all") {
      query.type = type;
    }

    const availableRooms = await Accommodation.find(query);

    res.json({
      success: true,
      count: availableRooms.length,
      data: availableRooms,
    });
  } catch (err) {
    console.error("❌ Search Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.displayAllOffersController = async (req, res) => {
  try {
    const [accommodations, services, rentals] = await Promise.all([
      Accommodation.find().sort({ createdAt: -1 }),
      Service.find().sort({ createdAt: -1 }),
      Rental.find().sort({ createdAt: -1 }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        accommodations,
        services,
        rentals,
      },
    });
  } catch (error) {
    console.error("❌ Server Error 500:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


