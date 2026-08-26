const mongoose = require('mongoose');

// ==================== SUB-SCHEMAS ====================

// Customer Schema
const CustomerSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  avatar: {
    url: {
      type: String,
      default: ''
    },
    public_id: {
      type: String,
      default: ''
    }
  }
}, { _id: false });

// Food Item Schema (for Orders)
const FoodItemSchema = new mongoose.Schema({
  foodId: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  image: {
    type: String,
    default: ''
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  subtotal: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: false });

// Totals Schema
const TotalsSchema = new mongoose.Schema({
  totalItems: {
    type: Number,
    required: true,
    min: 0
  },
  totalQuantity: {
    type: Number,
    required: true,
    min: 0
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: false });

// Payment Schema
const PaymentSchema = new mongoose.Schema({
  method: {
    type: String,
    enum: ['pending', 'gcash', 'bank_transfer', 'credit_card', 'cash', 'paypal'],
    default: 'pending'
  },
  status: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'PHP'
  }
}, { _id: false });

// Delivery Schema
const DeliverySchema = new mongoose.Schema({
  roomNumber: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'preparing', 'delivered', 'cancelled'],
    default: 'pending'
  },
  notes: {
    type: String,
    default: ''
  }
}, { _id: false });

// Item Details Schema (for Bookings - Accommodation/Rental/Service)
const ItemDetailsSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  avatar: {
    url: {
      type: String,
      default: ''
    },
    public_id: {
      type: String,
      default: ''
    }
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  price: {
    type: Number,
    min: 0
  },
  pricePerDay: {
    type: Number,
    min: 0
  },
  unit: {
    type: String,
    enum: ['per_hour', 'per_day', 'per_session', null],
    default: null
  },
  category: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    enum: ['cottage', 'room', 'villa', 'suite', null],
    default: null
  },
  minCapacity: {
    type: Number,
    min: 0
  },
  maxCapacity: {
    type: Number,
    min: 0
  },
  amenities: {
    type: [String],
    default: []
  },
  status: {
    type: String,
    enum: ['available', 'unavailable', 'booked', 'maintenance'],
    default: 'available'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  __v: {
    type: Number,
    default: 0
  }
}, { _id: false });

// ==================== BOOKING/ORDER ITEM SCHEMA ====================

const BillingItemSchema = new mongoose.Schema({
  // Common fields for all types
  _id: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['Order', 'Booking'],
    required: true
  },
  status: {
    type: String,
    enum: ['Pending', 'Confirmed', 'completed', 'paid', 'waiting', 'on process', 'cancelled'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  createdAt: {
    type: Date,
    required: true
  },
  customer: {
    type: CustomerSchema,
    required: true
  },

  // Order-specific fields
  orderId: {
    type: String,
    default: null
  },
  orderNumber: {
    type: String,
    default: null
  },
  orderStatus: {
    type: String,
    enum: ['pending', 'completed', 'cancelled', 'refunded', null],
    default: null
  },
  paymentMethod: {
    type: String,
    enum: ['pending', 'gcash', 'bank_transfer', 'credit_card', 'cash', 'paypal', null],
    default: null
  },
  referenceNo: {
    type: String,
    default: null
  },
  title: {
    type: String,
    default: null
  },
  itemCount: {
    type: Number,
    min: 0,
    default: null
  },
  items: {
    type: [FoodItemSchema],
    default: null
  },
  totals: {
    type: TotalsSchema,
    default: null
  },
  payment: {
    type: PaymentSchema,
    default: null
  },
  delivery: {
    type: DeliverySchema,
    default: null
  },

  // Booking-specific fields
  bookingNumber: {
    type: String,
    default: null
  },
  bookingItemId: {
    type: String,
    default: null
  },
  bookingItemModel: {
    type: String,
    enum: ['Accommodation', 'Rental', 'Service', null],
    default: null
  },
  bookingStatus: {
    type: String,
    enum: ['Pending', 'Confirmed', 'Completed', 'Cancelled', null],
    default: null
  },
  isCompleted: {
    type: Boolean,
    default: false
  },

  // Item details for bookings
  itemName: {
    type: String,
    default: null
  },
  itemDescription: {
    type: String,
    default: null
  },
  itemPrice: {
    type: Number,
    min: 0,
    default: null
  },
  itemImage: {
    type: String,
    default: null
  },
  itemDetails: {
    type: ItemDetailsSchema,
    default: null
  },

  // Accommodation specifics
  accommodationType: {
    type: String,
    enum: ['cottage', 'room', 'villa', 'suite', null],
    default: null
  },
  minCapacity: {
    type: Number,
    min: 0,
    default: null
  },
  maxCapacity: {
    type: Number,
    min: 0,
    default: null
  },
  amenities: {
    type: [String],
    default: []
  },

  // Rental specifics
  rentalUnit: {
    type: String,
    enum: ['per_hour', 'per_day', 'per_session', null],
    default: null
  },

  // Service specifics
  serviceCategory: {
    type: String,
    default: null
  },

  // Approver (simplified - just an object without schema)
  approver: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  // Payment tracking per booking
  paymentStatus: {
    type: String,
    enum: ['full', 'partial', null],
    default: null
  },
  paymentAmount: {
    type: Number,
    min: 0,
    default: null
  },
  remainingBalance: {
    type: Number,
    min: 0,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ==================== RECEIPT SCHEMA ====================

const ReceiptSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true,
    min: 0
  },
  fileType: {
    type: String,
    required: true
  },
  previewUrl: {
    type: String,
    default: ''
  },
  storageUrl: {
    type: String,
    default: ''
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

// ==================== PAYMENT DETAILS SCHEMA ====================

const PaymentDetailsSchema = new mongoose.Schema({
  method: {
    type: String,
    enum: ['gcash', 'bank_transfer', 'credit_card', 'cash', 'paypal'],
    required: true
  },
  referenceNo: {
    type: String,
    required: true,
    trim: true
  },
  receipt: {
    type: ReceiptSchema,
    required: true
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  paymentAmount: {
    type: Number,
    required: true,
    min: 0
  },
  paymentType: {
    type: String,
    enum: ['full', 'partial'],
    required: true
  },
  remainingBalance: {
    type: Number,
    min: 0,
    default: 0
  },
  processedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  bookingCount: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  notes: {
    type: String,
    default: ''
  }
}, { _id: false });

// ==================== MAIN BILLING HISTORY SCHEMA ====================

const BillingHistorySchema = new mongoose.Schema({
  avatar: {
    url: {
      type: String,
      default: "",
    },
    public_id: {
      type: String,
      default: "",
    },
  },
  transactionId: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "UserLoginSchema",
    required: true,
  },
  // Payment details
  paymentDetails: {
    type: PaymentDetailsSchema,
    required: true
  },

  // List of bookings/orders included in this payment
  bookings: {
    type: [BillingItemSchema],
    required: true,
    validate: {
      validator: function (v) {
        return v && v.length > 0;
      },
      message: 'At least one booking/order is required'
    }
  },

  // Reference to the user who processed the payment
  processedBy: {
    userId: {
      type: String,
      required: true
    },
    userName: {
      type: String,
      default: ''
    },
    userEmail: {
      type: String,
      default: ''
    },
    userRole: {
      type: String,
      enum: ['admin', 'receptionist', 'manager', 'customer'],
      default: 'receptionist'
    }
  },

  // Additional metadata
  metadata: {
    ipAddress: {
      type: String,
      default: ''
    },
    userAgent: {
      type: String,
      default: ''
    },
    deviceInfo: {
      type: String,
      default: ''
    },
    location: {
      type: String,
      default: ''
    }
  },

  // Status tracking - FIXED: Added 'fully_paid' status
  status: {
    type: String,
    enum: ['pending', 'verified', 'completed', 'fully_paid', 'failed', 'refunded', 'partial'],
    default: 'pending'
  },

  // Timestamps for different statuses - FIXED: Added 'fully_paid' status
  statusHistory: [{
    status: {
      type: String,
      enum: ['pending', 'verified', 'completed', 'fully_paid', 'failed', 'refunded', 'partial']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    note: {
      type: String,
      default: ''
    },
    updatedBy: {
      userId: String,
      userName: String
    }
  }],

  // Refund information (if applicable)
  refund: {
    isRefunded: {
      type: Boolean,
      default: false
    },
    refundAmount: {
      type: Number,
      min: 0,
      default: 0
    },
    refundDate: {
      type: Date
    },
    refundReason: {
      type: String,
      default: ''
    },
    refundReference: {
      type: String,
      default: ''
    }
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ==================== INDEXES ====================

BillingHistorySchema.index({ transactionId: 1 });
BillingHistorySchema.index({ 'paymentDetails.referenceNo': 1 });
BillingHistorySchema.index({ 'paymentDetails.processedAt': -1 });
BillingHistorySchema.index({ status: 1 });
BillingHistorySchema.index({ 'processedBy.userId': 1 });
BillingHistorySchema.index({ 'bookings._id': 1 });
BillingHistorySchema.index({ 'bookings.type': 1 });
BillingHistorySchema.index({ 'bookings.status': 1 });
BillingHistorySchema.index({ createdAt: -1 });
BillingHistorySchema.index({ 'paymentDetails.paymentType': 1 });

// ==================== VIRTUAL PROPERTIES ====================

BillingHistorySchema.virtual('totalItemsCount').get(function () {
  return this.bookings.length;
});

BillingHistorySchema.virtual('isCompleted').get(function () {
  return this.status === 'completed' || this.status === 'fully_paid';
});

BillingHistorySchema.virtual('isRefunded').get(function () {
  return this.refund && this.refund.isRefunded;
});

BillingHistorySchema.virtual('isPartialPayment').get(function () {
  return this.paymentDetails.paymentType === 'partial';
});

BillingHistorySchema.virtual('isFullPayment').get(function () {
  return this.paymentDetails.paymentType === 'full';
});

BillingHistorySchema.virtual('isFullyPaid').get(function () {
  return this.status === 'fully_paid';
});

// ==================== METHODS ====================

BillingHistorySchema.methods.markAsCompleted = function (userId, userName) {
  this.status = 'completed';
  this.paymentDetails.status = 'completed';
  this.statusHistory.push({
    status: 'completed',
    timestamp: new Date(),
    note: 'Payment completed successfully',
    updatedBy: { userId, userName }
  });
  return this.save();
};

BillingHistorySchema.methods.markAsFullyPaid = function (userId, userName, note) {
  this.status = 'fully_paid';
  this.paymentDetails.status = 'completed';
  this.statusHistory.push({
    status: 'fully_paid',
    timestamp: new Date(),
    note: note || 'Payment fully completed',
    updatedBy: { userId, userName }
  });
  return this.save();
};

BillingHistorySchema.methods.markAsPartial = function (userId, userName, note) {
  this.status = 'partial';
  this.paymentDetails.status = 'pending';
  this.statusHistory.push({
    status: 'partial',
    timestamp: new Date(),
    note: note || 'Partial payment recorded',
    updatedBy: { userId, userName }
  });
  return this.save();
};

BillingHistorySchema.methods.markAsVerified = function (userId, userName) {
  this.status = 'verified';
  this.statusHistory.push({
    status: 'verified',
    timestamp: new Date(),
    note: 'Payment verified by admin',
    updatedBy: { userId, userName }
  });
  return this.save();
};

BillingHistorySchema.methods.markAsFailed = function (userId, userName, reason) {
  this.status = 'failed';
  this.paymentDetails.status = 'failed';
  this.statusHistory.push({
    status: 'failed',
    timestamp: new Date(),
    note: reason || 'Payment failed',
    updatedBy: { userId, userName }
  });
  return this.save();
};

BillingHistorySchema.methods.processRefund = function (userId, userName, amount, reason) {
  this.refund = {
    isRefunded: true,
    refundAmount: amount || this.paymentDetails.paymentAmount,
    refundDate: new Date(),
    refundReason: reason || 'Customer requested refund',
    refundReference: `REF-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
  };
  this.status = 'refunded';
  this.paymentDetails.status = 'refunded';
  this.statusHistory.push({
    status: 'refunded',
    timestamp: new Date(),
    note: `Refund processed: ${reason || 'Customer requested refund'}`,
    updatedBy: { userId, userName }
  });
  return this.save();
};

BillingHistorySchema.methods.updateRemainingBalance = function () {
  if (this.paymentDetails.paymentType === 'partial') {
    const totalPaid = this.paymentDetails.paymentAmount;
    const totalDue = this.paymentDetails.totalAmount;
    this.paymentDetails.remainingBalance = totalDue - totalPaid;

    // Update each booking's remaining balance
    this.bookings.forEach(booking => {
      if (booking.paymentStatus === 'partial') {
        booking.remainingBalance = booking.amount - (booking.paymentAmount || 0);
      }
    });
  }
  return this.save();
};

// ==================== STATIC METHODS ====================

BillingHistorySchema.statics.getTransactionId = function () {
  const prefix = 'BILL';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

BillingHistorySchema.statics.findByDateRange = function (startDate, endDate) {
  return this.find({
    'paymentDetails.processedAt': {
      $gte: startDate,
      $lte: endDate
    }
  }).sort({ 'paymentDetails.processedAt': -1 });
};

BillingHistorySchema.statics.findByUser = function (userId) {
  return this.find({
    'processedBy.userId': userId
  }).sort({ createdAt: -1 });
};

BillingHistorySchema.statics.getTotalAmountByStatus = function (status) {
  return this.aggregate([
    { $match: { status: status } },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$paymentDetails.paymentAmount' },
        totalDue: { $sum: '$paymentDetails.totalAmount' },
        count: { $sum: 1 }
      }
    }
  ]);
};

BillingHistorySchema.statics.getPartialPayments = function () {
  return this.find({
    'paymentDetails.paymentType': 'partial'
  }).sort({ 'paymentDetails.processedAt': -1 });
};

BillingHistorySchema.statics.getFullPayments = function () {
  return this.find({
    'paymentDetails.paymentType': 'full'
  }).sort({ 'paymentDetails.processedAt': -1 });
};

// ==================== PRE-SAVE HOOKS ====================

BillingHistorySchema.pre('save', function (next) {
  // Generate transaction ID if not provided
  if (!this.transactionId) {
    this.transactionId = this.constructor.getTransactionId();
  }

  // Set status based on payment type if not already set
  if (!this.status || this.status === 'pending') {
    if (this.paymentDetails.paymentType === 'full') {
      this.status = 'fully_paid';
      this.paymentDetails.status = 'completed';
    } else if (this.paymentDetails.paymentType === 'partial') {
      this.status = 'partial';
      this.paymentDetails.status = 'pending';
    }
  }

  // Ensure payment status matches overall status
  if (this.status === 'fully_paid' || this.status === 'completed') {
    this.paymentDetails.status = 'pending';
  }

  // Update bookingCount if not matching
  if (this.paymentDetails.bookingCount !== this.bookings.length) {
    this.paymentDetails.bookingCount = this.bookings.length;
  }

  // Calculate remaining balance for partial payments
  if (this.paymentDetails.paymentType === 'partial') {
    this.paymentDetails.remainingBalance =
      this.paymentDetails.totalAmount - this.paymentDetails.paymentAmount;

    // Update each booking with payment info
    this.bookings.forEach(booking => {
      booking.paymentStatus = 'partial';
      booking.paymentAmount = booking.amount * (this.paymentDetails.paymentAmount / this.paymentDetails.totalAmount);
      booking.remainingBalance = booking.amount - booking.paymentAmount;
    });
  } else if (this.paymentDetails.paymentType === 'full') {
    this.paymentDetails.remainingBalance = 0;
    this.bookings.forEach(booking => {
      booking.paymentStatus = 'full';
      booking.paymentAmount = booking.amount;
      booking.remainingBalance = 0;
    });
  }

  // Auto-add status history if not present
  if (!this.statusHistory || this.statusHistory.length === 0) {
    const statusNote = this.status === 'fully_paid'
      ? `Fully Paid - Full payment of ₱${this.paymentDetails.paymentAmount.toFixed(2)} processed for ${this.bookings.length} booking(s)`
      : `Partially Paid - Partial payment of ₱${this.paymentDetails.paymentAmount.toFixed(2)} processed. Remaining balance: ₱${this.paymentDetails.remainingBalance.toFixed(2)}`;

    this.statusHistory = [{
      status: this.status,
      timestamp: new Date(),
      note: statusNote,
      updatedBy: {
        userId: this.processedBy?.userId || 'system',
        userName: this.processedBy?.userName || 'System'
      }
    }];
  }

  next();
});

// ==================== EXPORT ====================

const BillingHistory = mongoose.model('BillingHistory', BillingHistorySchema);

module.exports = BillingHistory;