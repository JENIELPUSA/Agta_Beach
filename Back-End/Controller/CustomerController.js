const Customer = require("../Models/CustomerSchema");
const AsyncErrorHandler = require("../Utils/AsyncErrorHandler");

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


exports.getAllCustomers = AsyncErrorHandler(async (req, res) => {
  const customers = await Customer.find().sort({ created_at: -1 });

  res.status(200).json({
    success: true,
    count: customers.length,
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