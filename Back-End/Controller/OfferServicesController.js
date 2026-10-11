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
    const {
      // ── Per-collection limits (optional) ──
      accLimit = 4,
      svcLimit = 8,
      rentLimit = 10,

      // ── Optional filters (shared) ──
      status,
      category,
      type,
    } = req.query;

    // ─── Helper: sanitize limit ───────────────────────────────
    const sanitizeLimit = (val, fallback) => {
      const n = parseInt(val, 10);
      if (Number.isNaN(n) || n < 1) return fallback;
      return Math.min(100, n); // cap sa 100
    };

    const accL = sanitizeLimit(accLimit, 4);
    const svcL = sanitizeLimit(svcLimit, 8);
    const rentL = sanitizeLimit(rentLimit, 10);

    // ─── Helper: build query ──────────────────────────────────
    const buildQuery = (extra = {}) => {
      const q = { ...extra };
      if (status) q.status = status;
      return q;
    };

    // ─── Build per-collection queries ─────────────────────────
    const accQuery = buildQuery({ type: type || "room" });
    const svcQuery = buildQuery();
    if (category) svcQuery.category = category;
    const rentQuery = buildQuery();

    // ─── Fetch paid bookings + offers in parallel ─────────────
    const [paidBookings, accommodations, services, rentals] =
      await Promise.all([
        ActionBookingScheema.find({ status: "Paid" })
          .select("bookingItemId bookingItemModel")
          .lean(),

        Accommodation.find(accQuery)
          .sort({ createdAt: -1 })
          .limit(accL)
          .lean(),

        Service.find(svcQuery)
          .sort({ createdAt: -1 })
          .limit(svcL)
          .lean(),

        Rental.find(rentQuery)
          .sort({ createdAt: -1 })
          .limit(rentL)
          .lean(),
      ]);

    // ─── Build paidMap (safe sa null bookingItemId) ───────────
    const paidMap = new Map();
    (paidBookings || []).forEach((item) => {
      if (!item?.bookingItemId) return;
      paidMap.set(item.bookingItemId.toString(), item.bookingItemModel);
    });

    // ─── Helper: update availabilityStatus ────────────────────
    const updateStatus = (items, modelName) => {
      if (!Array.isArray(items)) return [];
      return items.map((item) => {
        const id = item?._id?.toString();
        const isPaid =
          id && paidMap.has(id) && paidMap.get(id) === modelName;

        return {
          ...item,
          availabilityStatus: isPaid ? "Not Available" : "Available",
        };
      });
    };

    const updatedAccommodations = updateStatus(
      accommodations,
      "Accommodation"
    );
    const updatedServices = updateStatus(services, "Service");
    const updatedRentals = updateStatus(rentals, "Rental");

    // ─── Response ─────────────────────────────────────────────
    res.status(200).json({
      success: true,
      limits: {
        accommodations: accL,
        services: svcL,
        rentals: rentL,
      },
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

// ✅ Helper: Get model by categoryType
const getModelByCategoryType = (categoryType) => {
  switch (categoryType.toLowerCase()) {
    case "accommodation":
      return Accommodation;
    case "service":
      return Service;
    case "rental":
      return Rental;
    default:
      return null;
  }
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
      // ✅ BAGONG FIELDS (para sa room lang)
      weekdaysPrice,
      weekendPrice,
      weekdaysBreakfastPrice,
      weekendBreakfastPrice,
      // end
      price,
      category,
      unit,
      description,
      status,
      amenities,
    } = req.body;

    console.log("BODY:", req.body);

    if (!categoryType || !name) {
      return res.status(400).json({
        success: false,
        message: "categoryType and name are required",
      });
    }

    // ✅ AVATAR NA ARRAY NGAYON
    let avatar = [];

    // Cloudinary Upload Logic
    if (req.file) {
      const form = new FormData();
      form.append(
        "file",
        fs.createReadStream(req.file.path),
        req.file.originalname,
      );

      try {
        const response = await axios.post(process.env.UPLOADAGTA_URL, form, {
          maxBodyLength: Infinity,
          headers: { ...form.getHeaders() },
        });

        if (response.data.success) {
          avatar.push({
            url: response.data.url,
            public_id: response.data.public_id || req.file.filename,
          });
          if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        }
      } catch (err) {
        console.error("❌ Cloudinary Error:", err.message);
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      }
    }

    // ✅ KUNG MULTIPLE FILES (req.files) - OPTIONAL SUPPORT
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files) {
        const form = new FormData();
        form.append("file", fs.createReadStream(file.path), file.originalname);

        try {
          const response = await axios.post(process.env.UPLOADAGTA_URL, form, {
            maxBodyLength: Infinity,
            headers: { ...form.getHeaders() },
          });

          if (response.data.success) {
            avatar.push({
              url: response.data.url,
              public_id: response.data.public_id || file.filename,
            });
            if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          }
        } catch (err) {
          console.error("❌ Cloudinary Error:", err.message);
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        }
      }
    }

    let model;
    let data = { name, avatar };

    // PROCESS AMENITIES
    let processedAmenities = [];
    if (amenities) {
      processedAmenities = Array.isArray(amenities)
        ? amenities
        : amenities.split(",").map((item) => item.trim());
    }

    switch (categoryType.toLowerCase()) {
      case "accommodation":
        model = Accommodation;

        // ✅ BASE DATA (lahat ng type)
        data = {
          ...data,
          type,
          description,
          minCapacity: Number(minCapacity),
          maxCapacity: Number(maxCapacity),
          pricePerDay: Number(pricePerDay),
          status,
          amenities: processedAmenities,
        };

        // ✅ IDAGDAG LANG ANG PRICING FIELDS KUNG type === "room"
        if (type === "room") {
          data.weekdaysPrice = Number(weekdaysPrice) || 0;
          data.weekendPrice = Number(weekendPrice) || 0;
          data.weekdaysBreakfastPrice = Number(weekdaysBreakfastPrice) || 0;
          data.weekendBreakfastPrice = Number(weekendBreakfastPrice) || 0;
        }
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


exports.updateOfferController = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🔵 UPDATE BODY:", req.body);
    console.log("🔵 UPDATE FILES:", req.files);
    console.log("🔵 UPDATE PARAMS:", req.params);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Offer ID is required",
      });
    }

    const {
      categoryType,
      name,
      type,
      minCapacity,
      maxCapacity,
      pricePerDay,
      // ✅ BAGONG FIELDS (para sa room lang)
      weekdaysPrice,
      weekendPrice,
      weekdaysBreakfastPrice,
      weekendBreakfastPrice,
      // end
      price,
      category,
      unit,
      description,
      status,
      amenities,
      existingAvatar,
    } = req.body;

    if (!categoryType || !name) {
      return res.status(400).json({
        success: false,
        message: "categoryType and name are required",
      });
    }

    const model = getModelByCategoryType(categoryType);
    if (!model) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid categoryType" });
    }

    const existingItem = await model.findById(id);
    if (!existingItem) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    // =========================================
    // ✅ HANDLE AVATAR
    // =========================================
    let avatar = [];

    if (
      existingAvatar !== undefined &&
      existingAvatar !== null &&
      existingAvatar !== ""
    ) {
      try {
        const parsed =
          typeof existingAvatar === "string"
            ? JSON.parse(existingAvatar)
            : existingAvatar;

        if (Array.isArray(parsed)) {
          avatar = parsed.filter((img) => img && img.url);
        }
      } catch (err) {
        console.error("❌ existingAvatar parse error:", err.message);
        avatar = existingItem.avatar || [];
      }
    } else {
      avatar = existingItem.avatar || [];
    }

    const incomingFiles = [];
    if (req.file) incomingFiles.push(req.file);
    if (Array.isArray(req.files)) incomingFiles.push(...req.files);

    for (const file of incomingFiles) {
      try {
        const form = new FormData();
        form.append(
          "file",
          fs.createReadStream(file.path),
          file.originalname,
        );

        const response = await axios.post(process.env.UPLOADAGTA_URL, form, {
          maxBodyLength: Infinity,
          headers: { ...form.getHeaders() },
        });

        if (response.data.success) {
          avatar.push({
            url: response.data.url,
            public_id: response.data.public_id || file.filename,
          });
        }
      } catch (err) {
        console.error("❌ Upload Error:", err.message);
      } finally {
        if (file.path && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    }

    // =========================================
    // ✅ BUILD UPDATE DATA
    // =========================================
    let data = { name, avatar };

    let processedAmenities = [];
    if (amenities) {
      processedAmenities = Array.isArray(amenities)
        ? amenities
        : String(amenities)
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
    }

    switch (categoryType.toLowerCase()) {
      case "accommodation":
        // ✅ BASE DATA (lahat ng type)
        data = {
          ...data,
          type,
          description,
          minCapacity: Number(minCapacity),
          maxCapacity: Number(maxCapacity),
          pricePerDay: Number(pricePerDay),
          status,
          amenities: processedAmenities,
        };

        // ✅ IDAGDAG LANG ANG PRICING FIELDS KUNG type === "room"
        if (type === "room") {
          data.weekdaysPrice = Number(weekdaysPrice) || 0;
          data.weekendPrice = Number(weekendPrice) || 0;
          data.weekdaysBreakfastPrice = Number(weekdaysBreakfastPrice) || 0;
          data.weekendBreakfastPrice = Number(weekendBreakfastPrice) || 0;
        }
        break;

      case "service":
        data = {
          ...data,
          price: Number(price),
          category,
          description,
        };
        break;

      case "rental":
        data = {
          ...data,
          price: Number(price),
          unit,
          description,
          status,
        };
        break;
    }

    const finalData = removeEmptyFields(data);

    console.log("🟢 FINAL UPDATE DATA:", finalData);

    const updatedItem = await model.findByIdAndUpdate(id, finalData, {
      new: true,
      runValidators: true,
    });

    return res.status(200).json({ success: true, data: updatedItem });
  } catch (error) {
    console.error("❌ Server Error 500:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// =========================================
//  DELETE OFFER CONTROLLER
// =========================================
exports.deleteOfferController = async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryType } = req.body;

    console.log("DELETE PARAMS:", req.params);
    console.log("DELETE BODY:", req.body);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Offer ID is required",
      });
    }

    if (!categoryType) {
      return res.status(400).json({
        success: false,
        message: "categoryType is required",
      });
    }

    const model = getModelByCategoryType(categoryType);
    if (!model) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid categoryType" });
    }

    const deletedItem = await model.findByIdAndDelete(id);

    if (!deletedItem) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Offer deleted successfully",
      data: deletedItem,
    });
  } catch (error) {
    console.error("❌ Server Error 500:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.searchAvailableRooms = async (req, res) => {
  const { checkIn, checkOut, guests, type } = req.query;
  const guestCount = parseInt(guests) || 1;

  try {
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

// =========================================
//  DISPLAY ALL OFFERS
//  — may SEPARATE pagination per collection
// =========================================
exports.displayAllOffersController = async (req, res) => {
  try {
    const {
      // Global defaults
      search = "",
      page = 1,
      limit = 10,

      // Filters (shared sa lahat)
      status,
      category,

      // ── Per-collection pagination (optional) ──
      // Kung hindi ibinigay, gagamitin ang global page/limit
      accPage,
      accLimit,
      svcPage,
      svcLimit,
      rentPage,
      rentLimit,

      // ── Accommodation-specific filter ──
      type, // para sa accommodation only (room, villa, etc.)
    } = req.query;

    // ─── Helper: sanitize pagination ──────────────────────────
    const sanitizePage = (val, fallback) =>
      Math.max(1, parseInt(val, 10) || fallback);

    const sanitizeLimit = (val, fallback) =>
      Math.min(100, Math.max(1, parseInt(val, 10) || fallback));

    const globalPage = sanitizePage(page, 1);
    const globalLimit = sanitizeLimit(limit, 10);

    const accP = sanitizePage(accPage, globalPage);
    const accL = sanitizeLimit(accLimit, globalLimit);
    const svcP = sanitizePage(svcPage, globalPage);
    const svcL = sanitizeLimit(svcLimit, globalLimit);
    const rentP = sanitizePage(rentPage, globalPage);
    const rentL = sanitizeLimit(rentLimit, globalLimit);

    // ─── Helper: build query ──────────────────────────────────
    const buildQuery = (extra = {}) => {
      const q = { ...extra };
      if (search.trim()) {
        const escaped = search
          .trim()
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        q.name = { $regex: escaped, $options: "i" };
      }
      if (status) q.status = status;
      return q;
    };

    // ─── Build per-collection queries ─────────────────────────
    const accQuery = buildQuery({});
    if (type) accQuery.type = type;

    const svcQuery = buildQuery();
    if (category) svcQuery.category = category;

    const rentQuery = buildQuery();

    // ─── Execute all queries in parallel ──────────────────────
    const [
      accTotal,
      svcTotal,
      rentTotal,
      accommodations,
      services,
      rentals,
    ] = await Promise.all([
      Accommodation.countDocuments(accQuery),
      Service.countDocuments(svcQuery),
      Rental.countDocuments(rentQuery),

      Accommodation.find(accQuery)
        .sort({ createdAt: -1 })
        .skip((accP - 1) * accL)
        .limit(accL)
        .lean(),

      Service.find(svcQuery)
        .sort({ createdAt: -1 })
        .skip((svcP - 1) * svcL)
        .limit(svcL)
        .lean(),

      Rental.find(rentQuery)
        .sort({ createdAt: -1 })
        .skip((rentP - 1) * rentL)
        .limit(rentL)
        .lean(),
    ]);

    // ─── Response ─────────────────────────────────────────────
    res.status(200).json({
      success: true,
      pagination: {
        accommodations: {
          currentPage: accP,
          limit: accL,
          totalRecords: accTotal,
          totalPages: Math.ceil(accTotal / accL) || 0,
        },
        services: {
          currentPage: svcP,
          limit: svcL,
          totalRecords: svcTotal,
          totalPages: Math.ceil(svcTotal / svcL) || 0,
        },
        rentals: {
          currentPage: rentP,
          limit: rentL,
          totalRecords: rentTotal,
          totalPages: Math.ceil(rentTotal / rentL) || 0,
        },
      },
      counts: {
        accommodations: accTotal,
        services: svcTotal,
        rentals: rentTotal,
      },
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

exports.dropdownDisplay = async (req, res) => {
  try {
    const [accommodations, services, rentals] = await Promise.all([
      Accommodation.find()
        .select(
          "name type minCapacity maxCapacity pricePerDay weekdaysPrice weekendPrice weekdaysBreakfastPrice weekendBreakfastPrice",
        )
        .lean()
        .sort({ createdAt: -1 }),
      Service.find()
        .select("name price")
        .lean()
        .sort({ createdAt: -1 }),
      Rental.find()
        .select("name price")
        .lean()
        .sort({ createdAt: -1 }),
    ]);

    // ✅ I-include lang ang pricing fields kung type === "room"
    const formattedAccommodations = accommodations.map((item) => {
      const base = {
        id: item._id,
        type: item.type || "N/A",
        name: item.name,
        minCapacity: item.minCapacity || 0,
        maxCapacity: item.maxCapacity || 0,
        pricePerDay: item.pricePerDay || 0,
        label: `${item.name} (${item.type || "N/A"}) - ${item.minCapacity || 0}-${item.maxCapacity || 0} guests - ₱${item.pricePerDay?.toLocaleString() || 0}/day`,
      };

      // ✅ IDAGDAG LANG KUNG ROOM
      if (item.type === "room") {
        base.weekdaysPrice = item.weekdaysPrice || 0;
        base.weekendPrice = item.weekendPrice || 0;
        base.weekdaysBreakfastPrice = item.weekdaysBreakfastPrice || 0;
        base.weekendBreakfastPrice = item.weekendBreakfastPrice || 0;
      }

      return base;
    });

    const formattedServices = services.map((item) => ({
      id: item._id,
      name: item.name,
      price: item.price || 0,
      label: `${item.name} - ₱${item.price?.toLocaleString() || 0}`,
    }));

    const formattedRentals = rentals.map((item) => ({
      id: item._id,
      name: item.name,
      price: item.price || 0,
      label: `${item.name} - ₱${item.price?.toLocaleString() || 0}`,
    }));

    res.status(200).json({
      success: true,
      data: {
        accommodations: formattedAccommodations,
        services: formattedServices,
        rentals: formattedRentals,
      },
      counts: {
        accommodations: formattedAccommodations.length,
        services: formattedServices.length,
        rentals: formattedRentals.length,
      },
    });
  } catch (error) {
    console.error("❌ Server Error 500:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};