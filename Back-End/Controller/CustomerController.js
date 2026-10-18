const Customer = require("../Models/CustomerSchema");
const AsyncErrorHandler = require("../Utils/AsyncErrorHandler");

const Admin = require("../Models/AdminSchema")

exports.getProfileData = AsyncErrorHandler(async (req, res) => {
  const userId = req.user.linkId;

  // 1. Hanapin muna sa Admin
  let profile = await Admin.findById(userId);
  let role = "Admin";

  // 2. Kung wala sa Admin, hanapin sa Customer
  if (!profile) {
    profile = await Customer.findById(userId);
    role = "Customer";
  }

  // 3. Kung wala sa pareho, mag-return ng 404
  if (!profile) {
    return res.status(404).json({
      success: false,
      message: "Profile not found",
    });
  }

  // 4. Ibalik ang profile kasama ang role
  res.status(200).json({
    success: true,
    role,
    data: profile,
  });
});




exports.createCustomer = AsyncErrorHandler(async (req, res) => {
  const { first_name, last_name, middle_name, gender, email } = req.body;

  let avatar = { url: "", public_id: "" };

  if (req.file) {
    avatar = {
      url: req.file.path, // pwede mo palitan if gumagamit ka ng cloud
      public_id: req.file.filename,
    };
  }

  const customer = await Customer.create({
    avatar,
    first_name,
    last_name,
    middle_name,
    gender,
    email,
  });

  res.status(201).json({
    success: true,
    message: "Customer created successfully",
    data: customer,
  });
});

// controllers/customerController.js

exports.getAllCustomers = AsyncErrorHandler(async (req, res) => {
  // ─── 1. Extract & sanitize query params ─────────────────────────
  const {
    search = "",
    page = 1,
    limit = 10,
    status,
    customerType,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (pageNum - 1) * limitNum;

  // ─── 2. Build query object ──────────────────────────────────────
  const query = {};

  // Search across multiple fields (case-insensitive)
  if (search.trim()) {
    const escaped = search
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // escape regex chars

    query.$or = [
      { name: { $regex: escaped, $options: "i" } },
      { email: { $regex: escaped, $options: "i" } },
      { phone: { $regex: escaped, $options: "i" } },
      { company: { $regex: escaped, $options: "i" } },
    ];
  }

  // Optional filters
  if (status) query.status = status;
  if (customerType) query.customerType = customerType;

  // ─── 3. Sorting ─────────────────────────────────────────────────
  const allowedSortFields = ["createdAt", "name", "email", "company"];
  const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
  const sortDir = sortOrder === "asc" ? 1 : -1;

  // ─── 4. Execute queries in parallel ─────────────────────────────
  const [totalRecords, customers] = await Promise.all([
    Customer.countDocuments(query),
    Customer.find(query)
      .sort({ [sortField]: sortDir })
      .skip(skip)
      .limit(limitNum)
      .lean(),
  ]);

  // ─── 5. Response ────────────────────────────────────────────────
  res.status(200).json({
    success: true,
    totalRecords,
    currentPage: pageNum,
    totalPages: Math.ceil(totalRecords / limitNum),
    limit: limitNum,
    count: customers.length, // count sa current page lang
    data: customers,
  });
});

exports.getSingleCustomer = AsyncErrorHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);

  if (!customer) {
    return res.status(404).json({
      success: false,
      message: "Customer not found",
    });
  }

  res.status(200).json({
    success: true,
    data: customer,
  });
});


exports.updateCustomer = AsyncErrorHandler(async (req, res) => {
  let customer = await Customer.findById(req.params.id);

  if (!customer) {
    return res.status(404).json({
      success: false,
      message: "Customer not found",
    });
  }

  let avatar = customer.avatar;

  if (req.file) {
    avatar = {
      url: req.file.path,
      public_id: req.file.filename,
    };
  }

  const updatedData = {
    ...req.body,
    avatar,
  };

  customer = await Customer.findByIdAndUpdate(
    req.params.id,
    updatedData,
    {
      new: true,
      runValidators: true,
    }
  );

  res.status(200).json({
    success: true,
    message: "Customer updated successfully",
    data: customer,
  });
});


exports.deleteCustomer = AsyncErrorHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);

  if (!customer) {
    return res.status(404).json({
      success: false,
      message: "Customer not found",
    });
  }

  await customer.deleteOne();

  res.status(200).json({
    success: true,
    message: "Customer deleted successfully",
  });
});