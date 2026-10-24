const mongoose = require('mongoose');
const Accommodation = require("../Models/accommodationSchema");


// ==================== SUB-SCHEMAS ====================

// Customer Schema
const CustomerSchema = new mongoose.Schema({
  _id: { type: String, required: false },
  avatar: {
    url: { type: String, default: '' },
    public_id: { type: String, default: '' }
  }
}, { _id: false });

// Food Item Schema (for Orders)
const FoodItemSchema = new mongoose.Schema({
  foodId: { type: String, required: true },
  name: { type: String, required: true },
  category: { type: String, required: true },
  image: { type: String, default: '' },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 },
  subtotal: { type: Number, required: true, min: 0 }
}, { _id: false });

// Totals Schema
const TotalsSchema = new mongoose.Schema({
  totalItems: { type: Number, required: true, min: 0 },
  totalQuantity: { type: Number, required: true, min: 0 },
  totalAmount: { type: Number, required: true, min: 0 }
}, { _id: false });

// Payment Schema
const PaymentSchema = new mongoose.Schema({
  method: {
    type: String,
    enum: [
      'pending',
      'gcash',
      'bank_transfer',
      'credit_card',
      'cash',
      'paypal'
    ],
    default: 'pending'
  },

  status: {
    type: String,
    enum: [
      'pending',
      'paid',
      'failed',
      'refunded'
    ],
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
    enum: [
      'pending',
      'preparing',
      'delivered',
      'cancelled'
    ],
    default: 'pending'
  },

  notes: {
    type: String,
    default: ''
  }
}, { _id: false });

// ==================== ITEM DETAILS SCHEMA ====================
// For Bookings - Accommodation/Rental/Service

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
    enum: [
      'per_hour',
      'per_day',
      'per_session',
      null
    ],
    default: null
  },

  category: {
    type: String,
    default: ''
  },

  type: {
    type: String,
    enum: [
      'cottage',
      'room',
      'villa',
      'suite',
      null
    ],
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
    enum: [
      'available',
      'not available',
      'booked',
      'maintenance'
    ],
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

}, {
  _id: false
});

// ==================== ORDER ORIGIN SCHEMA ====================
// Para ma-track kung SAANG ACCOMMODATION/ROOM galing ang order/rental/service

const OrderOriginSchema = new mongoose.Schema({

  // Reference sa Accommodation kung saan nag-order
  accommodationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Accommodation',
    default: null
  },

  // Snapshot ng accommodation details
  accommodationName: {
    type: String,
    default: null
  },

  accommodationType: {
    type: String,
    enum: [
      'cottage',
      'room',
      'villa',
      'suite',
      'table',
      null
    ],
    default: null
  },

  roomNumber: {
    type: String,
    default: null
  },

  avatar: {
    url: {
      type: String,
      default: null
    },

    public_id: {
      type: String,
      default: null
    }
  },

  // Reference sa ActionBooking
  actionBookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ActionBooking',
    default: null
  },

  bookingNumber: {
    type: String,
    default: null
  },

  // Info kung sino ang nag-order mula sa accommodation
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserLoginSchema',
    default: null
  }

}, {
  _id: false
});

// ==================== BOOKING / ORDER ITEM SCHEMA ====================

const BillingItemSchema = new mongoose.Schema({

  // ==================== COMMON FIELDS ====================

  _id: {
    type: String,
    required: true
  },

  type: {
    type: String,
    enum: [
      'Order',
      'Booking'
    ],
    required: true
  },

  status: {
    type: String,
    enum: [
      'Pending',
      'Confirmed',
      'completed',
      'paid',
      'waiting',
      'on process',
      'cancelled'
    ],
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

  // ==================== ORDER ORIGIN ====================
  // Para malaman kung SAAN galing ang order

  origin: {
    type: OrderOriginSchema,
    default: null
  },

  // ==================== ORDER-SPECIFIC FIELDS ====================

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
    enum: [
      'pending',
      'completed',
      'cancelled',
      'refunded',
      null
    ],
    default: null
  },

  paymentMethod: {
    type: String,
    enum: [
      'pending',
      'gcash',
      'bank_transfer',
      'credit_card',
      'cash',
      'paypal',
      null
    ],
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

  // ==================== BOOKING-SPECIFIC FIELDS ====================

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
    enum: [
      'Accommodation',
      'Rental',
      'Service',
      null
    ],
    default: null
  },

  bookingStatus: {
    type: String,
    enum: [
      'Pending',
      'Confirmed',
      'Completed',
      'Cancelled',
      null
    ],
    default: null
  },

  isCompleted: {
    type: Boolean,
    default: false
  },

  // ==================== DIRECT REFERENCES ====================

  accommodationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Accommodation',
    default: null,
    index: true
  },

  rentalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Rental',
    default: null,
    index: true
  },

  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    default: null,
    index: true
  },

  // ==================== ITEM DETAILS ====================

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

  // IMPORTANT:
  // Accommodation.avatar is an array,
  // therefore BillingItem.itemImage must also be an array.
  itemImage: {
    type: [String],
    default: []
  },

  itemDetails: {
    type: ItemDetailsSchema,
    default: null
  },

  // ==================== ACCOMMODATION SPECIFICS ====================

  accommodationType: {
    type: String,
    enum: [
      'cottage',
      'room',
      'villa',
      'suite',
      null
    ],
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

  // ==================== RENTAL SPECIFICS ====================

  rentalUnit: {
    type: String,
    enum: [
      'per_hour',
      'per_day',
      'per_session',
      null
    ],
    default: null
  },

  // ==================== SERVICE SPECIFICS ====================

  serviceCategory: {
    type: String,
    default: null
  },

  // ==================== APPROVER ====================

  approver: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  // ==================== PAYMENT TRACKING PER BOOKING ====================

  paymentStatus: {
    type: String,
    enum: [
      'full',
      'partial',
      null
    ],
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

  toJSON: {
    virtuals: true
  },

  toObject: {
    virtuals: true
  }
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

}, {
  _id: false
});

// ==================== SELECTED ACCOMMODATION DETAILS ====================

const SelectedAccommodationDetailsSchema = new mongoose.Schema({

  bookingNumber: {
    type: String,
    default: null
  },

  accommodationName: {
    type: String,
    default: null
  },

  status: {
    type: String,
    default: null
  }

}, {
  _id: false
});

// ==================== PAYMENT DETAILS SCHEMA ====================

const PaymentDetailsSchema = new mongoose.Schema({

  method: {
    type: String,
    enum: [
      'gcash',
      'bank_transfer',
      'credit_card',
      'cash',
      'paypal'
    ],
    required: true
  },

  // ✅ FIXED: Required lang kung HINDI cash ang payment method
  referenceNo: {
    type: String,
    required: function () {
      return this.method && this.method !== 'cash';
    },
    trim: true,
    default: ''
  },

  receipt: {
    type: ReceiptSchema
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
    enum: [
      'full',
      'partial'
    ],
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
    enum: [
      'pending',
      'completed',
      'failed',
      'refunded'
    ],
    default: 'pending'
  },

  notes: {
    type: String,
    default: ''
  },

  // Napiling accommodation mula sa dropdown
  selectedAccommodation: {
    type: String,
    default: null
  },

  // Snapshot ng accommodation details
  selectedAccommodationDetails: {
    type: SelectedAccommodationDetailsSchema,
    default: null
  }

}, {
  _id: false
});

// ==================== MAIN BILLING HISTORY SCHEMA ====================

const BillingHistorySchema = new mongoose.Schema({

  avatar: {
    url: {
      type: String,
      default: ""
    },

    public_id: {
      type: String,
      default: ""
    }
  },

  transactionId: {
    type: String,
    unique: true,
    required: true,
    index: true
  },

  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Customer",
    required: true
  },

  paymentDetails: {
    type: PaymentDetailsSchema,
    required: true
  },

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
      enum: [
        'admin',
        'receptionist',
        'manager',
        'customer'
      ],
      default: 'receptionist'
    }
  },

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

  status: {
    type: String,
    enum: [
      'pending',
      'verified',
      'completed',
      'fully_paid',
      'failed',
      'refunded',
      'partial'
    ],
    default: 'pending'
  },

  statusHistory: [{
    status: {
      type: String,
      enum: [
        'pending',
        'verified',
        'completed',
        'fully_paid',
        'failed',
        'refunded',
        'partial'
      ]
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

  toJSON: {
    virtuals: true
  },

  toObject: {
    virtuals: true
  }
});

// ==================== INDEXES ====================

BillingHistorySchema.index({
  transactionId: 1
});

BillingHistorySchema.index({
  'paymentDetails.referenceNo': 1
});

BillingHistorySchema.index({
  'paymentDetails.processedAt': -1
});

BillingHistorySchema.index({
  status: 1
});

BillingHistorySchema.index({
  'processedBy.userId': 1
});

BillingHistorySchema.index({
  'bookings._id': 1
});

BillingHistorySchema.index({
  'bookings.type': 1
});

BillingHistorySchema.index({
  'bookings.status': 1
});

BillingHistorySchema.index({
  createdAt: -1
});

BillingHistorySchema.index({
  'paymentDetails.paymentType': 1
});

BillingHistorySchema.index({
  'bookings.bookingItemId': 1
});

BillingHistorySchema.index({
  'bookings.bookingItemModel': 1
});

BillingHistorySchema.index({
  'bookings.bookingNumber': 1
});

BillingHistorySchema.index({
  'bookings.orderNumber': 1
});

BillingHistorySchema.index({
  'bookings.accommodationId': 1
});

BillingHistorySchema.index({
  'bookings.rentalId': 1
});

BillingHistorySchema.index({
  'bookings.serviceId': 1
});

// ==================== ORIGIN INDEXES ====================

BillingHistorySchema.index({
  'bookings.origin.accommodationId': 1
});

BillingHistorySchema.index({
  'bookings.origin.bookingNumber': 1
});

BillingHistorySchema.index({
  'bookings.origin.actionBookingId': 1
});

// ==================== SELECTED ACCOMMODATION INDEXES ====================

BillingHistorySchema.index({
  'paymentDetails.selectedAccommodation': 1
});

BillingHistorySchema.index({
  'paymentDetails.selectedAccommodationDetails.bookingNumber': 1
});

BillingHistorySchema.index({
  'paymentDetails.selectedAccommodationDetails.accommodationName': 1
});

// ==================== VIRTUAL PROPERTIES ====================

BillingHistorySchema.virtual('totalItemsCount').get(function () {
  return this.bookings.length;
});

BillingHistorySchema.virtual('isCompleted').get(function () {
  return (
    this.status === 'completed' ||
    this.status === 'fully_paid'
  );
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

// ==================== VIRTUAL: ORIGINS ====================

BillingHistorySchema.virtual('origins').get(function () {

  if (!this.bookings) {
    return [];
  }

  return this.bookings
    .filter(
      b =>
        b.origin &&
        b.origin.accommodationId
    )
    .map(b => b.origin);
});

// ==================== VIRTUAL: RELATED ACCOMMODATION IDS ====================

BillingHistorySchema.virtual(
  'relatedAccommodationIds'
).get(function () {

  if (!this.bookings) {
    return [];
  }

  return [
    ...new Set(
      this.bookings
        .filter(
          b => b.origin?.accommodationId
        )
        .map(
          b =>
            b.origin.accommodationId.toString()
        )
    )
  ];
});

// ==================== VIRTUAL: SELECTED ACCOMMODATION ====================

BillingHistorySchema.virtual(
  'selectedAccommodationInfo'
).get(function () {

  return (
    this.paymentDetails
      ?.selectedAccommodationDetails ||
    null
  );
});

// ==================== METHODS ====================

BillingHistorySchema.methods.markAsCompleted =
  function (userId, userName) {

    this.status = 'completed';

    this.paymentDetails.status = 'completed';

    this.statusHistory.push({
      status: 'completed',
      timestamp: new Date(),
      note: 'Payment completed successfully',

      updatedBy: {
        userId,
        userName
      }
    });

    return this.save();
  };

BillingHistorySchema.methods.markAsFullyPaid =
  function (userId, userName, note) {

    this.status = 'fully_paid';

    this.paymentDetails.status = 'completed';

    this.statusHistory.push({
      status: 'fully_paid',
      timestamp: new Date(),

      note:
        note ||
        'Payment fully completed',

      updatedBy: {
        userId,
        userName
      }
    });

    return this.save();
  };

BillingHistorySchema.methods.markAsPartial =
  function (userId, userName, note) {

    this.status = 'partial';

    this.paymentDetails.status = 'pending';

    this.statusHistory.push({
      status: 'partial',
      timestamp: new Date(),

      note:
        note ||
        'Partial payment recorded',

      updatedBy: {
        userId,
        userName
      }
    });

    return this.save();
  };

BillingHistorySchema.methods.markAsVerified =
  function (userId, userName) {

    this.status = 'verified';

    this.statusHistory.push({
      status: 'verified',
      timestamp: new Date(),

      note:
        'Payment verified by admin',

      updatedBy: {
        userId,
        userName
      }
    });

    return this.save();
  };

BillingHistorySchema.methods.markAsFailed =
  function (userId, userName, reason) {

    this.status = 'failed';

    this.paymentDetails.status = 'failed';

    this.statusHistory.push({
      status: 'failed',
      timestamp: new Date(),

      note:
        reason ||
        'Payment failed',

      updatedBy: {
        userId,
        userName
      }
    });

    return this.save();
  };

BillingHistorySchema.methods.processRefund =
  function (
    userId,
    userName,
    amount,
    reason
  ) {

    this.refund = {
      isRefunded: true,

      refundAmount:
        amount ||
        this.paymentDetails.paymentAmount,

      refundDate: new Date(),

      refundReason:
        reason ||
        'Customer requested refund',

      refundReference:
        `REF-${Date.now()}-${Math.random()
          .toString(36)
          .substr(2, 5)}`
    };

    this.status = 'refunded';

    this.paymentDetails.status =
      'refunded';

    this.statusHistory.push({
      status: 'refunded',
      timestamp: new Date(),

      note:
        `Refund processed: ${
          reason ||
          'Customer requested refund'
        }`,

      updatedBy: {
        userId,
        userName
      }
    });

    return this.save();
  };

BillingHistorySchema.methods.updateRemainingBalance =
  function () {

    if (
      this.paymentDetails.paymentType ===
      'partial'
    ) {

      const totalPaid =
        this.paymentDetails.paymentAmount;

      const totalDue =
        this.paymentDetails.totalAmount;

      this.paymentDetails.remainingBalance =
        totalDue - totalPaid;

      this.bookings.forEach(
        booking => {

          if (
            booking.paymentStatus ===
            'partial'
          ) {

            booking.remainingBalance =
              booking.amount -
              (booking.paymentAmount || 0);
          }
        }
      );
    }

    return this.save();
  };

// ==================== STATIC METHODS ====================

BillingHistorySchema.statics.getTransactionId =
  function () {

    const prefix = 'BILL';

    const timestamp =
      Date.now()
        .toString(36)
        .toUpperCase();

    const random =
      Math.random()
        .toString(36)
        .substring(2, 7)
        .toUpperCase();

    return `${prefix}-${timestamp}-${random}`;
  };

BillingHistorySchema.statics.findByDateRange =
  function (startDate, endDate) {

    return this.find({
      'paymentDetails.processedAt': {
        $gte: startDate,
        $lte: endDate
      }
    }).sort({
      'paymentDetails.processedAt': -1
    });
  };

BillingHistorySchema.statics.findByUser =
  function (userId) {

    return this.find({
      'processedBy.userId': userId
    }).sort({
      createdAt: -1
    });
  };

BillingHistorySchema.statics.getTotalAmountByStatus =
  function (status) {

    return this.aggregate([

      {
        $match: {
          status: status
        }
      },

      {
        $group: {

          _id: null,

          totalAmount: {
            $sum:
              '$paymentDetails.paymentAmount'
          },

          totalDue: {
            $sum:
              '$paymentDetails.totalAmount'
          },

          count: {
            $sum: 1
          }
        }
      }

    ]);
  };

BillingHistorySchema.statics.getPartialPayments =
  function () {

    return this.find({
      'paymentDetails.paymentType':
        'partial'
    }).sort({
      'paymentDetails.processedAt': -1
    });
  };

BillingHistorySchema.statics.getFullPayments =
  function () {

    return this.find({
      'paymentDetails.paymentType':
        'full'
    }).sort({
      'paymentDetails.processedAt': -1
    });
  };

// ==================== FIND BY ORIGIN ACCOMMODATION ====================

BillingHistorySchema.statics.findByOriginAccommodation =
  function (accommodationId) {

    return this.find({
      'bookings.origin.accommodationId':
        accommodationId
    }).sort({
      createdAt: -1
    });
  };

// ==================== FIND BY ORIGIN BOOKING NUMBER ====================

BillingHistorySchema.statics.findByOriginBookingNumber =
  function (bookingNumber) {

    return this.find({
      'bookings.origin.bookingNumber':
        bookingNumber
    }).sort({
      createdAt: -1
    });
  };

// ==================== GET ACCOMMODATION ORDERS ====================

BillingHistorySchema.statics.getAccommodationOrders =
  async function (accommodationId) {

    return this.aggregate([

      {
        $unwind: '$bookings'
      },

      {
        $match: {
          'bookings.origin.accommodationId':
            mongoose.Types.ObjectId(
              accommodationId
            )
        }
      },

      {
        $group: {

          _id: '$_id',

          transactionId: {
            $first: '$transactionId'
          },

          customerId: {
            $first: '$customerId'
          },

          paymentDetails: {
            $first: '$paymentDetails'
          },

          booking: {
            $push: '$bookings'
          },

          createdAt: {
            $first: '$createdAt'
          }
        }
      },

      {
        $sort: {
          createdAt: -1
        }
      }

    ]);
  };

// ==================== FIND BY SELECTED ACCOMMODATION ====================

BillingHistorySchema.statics.findBySelectedAccommodation =
  function (bookingNumber) {

    return this.find({
      'paymentDetails.selectedAccommodation':
        bookingNumber
    }).sort({
      createdAt: -1
    });
  };

// ==================== ✅ BAGO: CHECK DUPLICATE ORDER/BOKING ====================

/**
 * ✅ STATIC METHOD: Check kung existing na ang orderNumber o bookingNumber
 * 
 * @param {Object} params - { orderNumber, bookingNumber }
 * @returns {Promise<Object>} - { isDuplicate, existingRecord, field }
 */
BillingHistorySchema.statics.checkDuplicate = async function ({
  orderNumber,
  bookingNumber,
}) {
  // Build query — check kung alinman sa dalawa ang existing
  const orConditions = [];

  if (orderNumber && orderNumber.trim() !== '') {
    orConditions.push({ 'bookings.orderNumber': orderNumber.trim() });
  }

  if (bookingNumber && bookingNumber.trim() !== '') {
    orConditions.push({ 'bookings.bookingNumber': bookingNumber.trim() });
  }

  // Kung walang laman, hindi duplicate
  if (orConditions.length === 0) {
    return { isDuplicate: false, existingRecord: null, field: null };
  }

  const existing = await this.findOne({ $or: orConditions })
    .select('_id transactionId status createdAt bookings')
    .lean();

  if (!existing) {
    return { isDuplicate: false, existingRecord: null, field: null };
  }

  // Determine kung alin ang nag-duplicate
  let field = null;
  if (orderNumber && orderNumber.trim() !== '') {
    const foundOrder = existing.bookings?.find(
      (b) => b.orderNumber === orderNumber.trim()
    );
    if (foundOrder) field = 'orderNumber';
  }
  if (!field && bookingNumber && bookingNumber.trim() !== '') {
    const foundBooking = existing.bookings?.find(
      (b) => b.bookingNumber === bookingNumber.trim()
    );
    if (foundBooking) field = 'bookingNumber';
  }

  return {
    isDuplicate: true,
    existingRecord: existing,
    field,
  };
};

/**
 * ✅ STATIC METHOD: Check kung alinman sa array ng bookings ay duplicate na
 * 
 * @param {Array} bookings - Array ng booking objects
 * @returns {Promise<Object>} - { isDuplicate, duplicates: Array }
 */
BillingHistorySchema.statics.checkBatchDuplicates = async function (bookings) {
  if (!bookings || bookings.length === 0) {
    return { isDuplicate: false, duplicates: [] };
  }

  // Collect lahat ng orderNumber at bookingNumber
  const orderNumbers = [];
  const bookingNumbers = [];

  bookings.forEach((b) => {
    if (b.orderNumber && String(b.orderNumber).trim() !== '') {
      orderNumbers.push(String(b.orderNumber).trim());
    }
    if (b.bookingNumber && String(b.bookingNumber).trim() !== '') {
      bookingNumbers.push(String(b.bookingNumber).trim());
    }
  });

  if (orderNumbers.length === 0 && bookingNumbers.length === 0) {
    return { isDuplicate: false, duplicates: [] };
  }

  // Query lahat ng existing records na nagma-match
  const orConditions = [];
  if (orderNumbers.length > 0) {
    orConditions.push({ 'bookings.orderNumber': { $in: orderNumbers } });
  }
  if (bookingNumbers.length > 0) {
    orConditions.push({ 'bookings.bookingNumber': { $in: bookingNumbers } });
  }

  const existingRecords = await this.find({ $or: orConditions })
    .select('_id transactionId status bookings')
    .lean();

  // Collect duplicates
  const duplicates = [];
  const seenOrderNumbers = new Set();
  const seenBookingNumbers = new Set();

  existingRecords.forEach((record) => {
    record.bookings?.forEach((b) => {
      if (b.orderNumber && orderNumbers.includes(b.orderNumber)) {
        if (!seenOrderNumbers.has(b.orderNumber)) {
          seenOrderNumbers.add(b.orderNumber);
          duplicates.push({
            field: 'orderNumber',
            value: b.orderNumber,
            existingTransactionId: record.transactionId,
            existingStatus: record.status,
          });
        }
      }
      if (b.bookingNumber && bookingNumbers.includes(b.bookingNumber)) {
        if (!seenBookingNumbers.has(b.bookingNumber)) {
          seenBookingNumbers.add(b.bookingNumber);
          duplicates.push({
            field: 'bookingNumber',
            value: b.bookingNumber,
            existingTransactionId: record.transactionId,
            existingStatus: record.status,
          });
        }
      }
    });
  });

  return {
    isDuplicate: duplicates.length > 0,
    duplicates,
  };
};

// ==================== ✅ PRE-SAVE HOOK: I-CHECK ANG DUPLICATE ====================

BillingHistorySchema.pre('save', async function (next) {
  try {
    // ✅ Skip check kung UPDATE (hindi bagong document)
    if (!this.isNew) {
      return next();
    }

    // ✅ Collect lahat ng orderNumber at bookingNumber sa bagong document
    const orderNumbers = [];
    const bookingNumbers = [];

    (this.bookings || []).forEach((b) => {
      if (b.orderNumber && String(b.orderNumber).trim() !== '') {
        orderNumbers.push(String(b.orderNumber).trim());
      }
      if (b.bookingNumber && String(b.bookingNumber).trim() !== '') {
        bookingNumbers.push(String(b.bookingNumber).trim());
      }
    });

    // ✅ Kung wala, skip
    if (orderNumbers.length === 0 && bookingNumbers.length === 0) {
      return next();
    }

    // ✅ Build query conditions
    const orConditions = [];
    if (orderNumbers.length > 0) {
      orConditions.push({ 'bookings.orderNumber': { $in: orderNumbers } });
    }
    if (bookingNumbers.length > 0) {
      orConditions.push({ 'bookings.bookingNumber': { $in: bookingNumbers } });
    }

    // ✅ Hanapin ang existing records
    const existingRecords = await this.constructor
      .find({ $or: orConditions })
      .select('_id transactionId status bookings')
      .lean();

    if (existingRecords.length === 0) {
      return next(); // Walang duplicate
    }

    // ✅ I-check kung alin sa mga ito ang duplicate
    const duplicateErrors = [];

    existingRecords.forEach((record) => {
      record.bookings?.forEach((b) => {
        if (b.orderNumber && orderNumbers.includes(b.orderNumber)) {
          duplicateErrors.push(
            `OrderNumber "${b.orderNumber}" already exists in transaction ${record.transactionId}`
          );
        }
        if (b.bookingNumber && bookingNumbers.includes(b.bookingNumber)) {
          duplicateErrors.push(
            `BookingNumber "${b.bookingNumber}" already exists in transaction ${record.transactionId}`
          );
        }
      });
    });

    if (duplicateErrors.length > 0) {
      const error = new Error(
        `Duplicate booking/order detected: ${duplicateErrors.join(', ')}`
      );
      error.code = 'DUPLICATE_BOOKING';
      error.statusCode = 400;
      return next(error);
    }

    return next();
  } catch (error) {
    console.error('❌ [BillingHistory pre-save] Duplicate check error:', error);
    return next(error);
  }
});

// ==================== PRE-SAVE HOOKS (ORIGINAL) ====================

BillingHistorySchema.pre(
  'save',
  function (next) {

    if (!this.transactionId) {

      this.transactionId =
        this.constructor.getTransactionId();
    }

    if (
      !this.status ||
      this.status === 'pending'
    ) {

      if (
        this.paymentDetails.paymentType ===
        'full'
      ) {

        this.status = 'fully_paid';

        this.paymentDetails.status =
          'completed';

      } else if (
        this.paymentDetails.paymentType ===
        'partial'
      ) {

        this.status = 'partial';

        this.paymentDetails.status =
          'pending';
      }
    }

    if (
      this.status === 'fully_paid' ||
      this.status === 'completed'
    ) {

      this.paymentDetails.status =
        'pending';
    }

    if (
      this.paymentDetails.bookingCount !==
      this.bookings.length
    ) {

      this.paymentDetails.bookingCount =
        this.bookings.length;
    }

    if (
      this.paymentDetails.paymentType ===
      'partial'
    ) {

      this.paymentDetails.remainingBalance =
        this.paymentDetails.totalAmount -
        this.paymentDetails.paymentAmount;

      this.bookings.forEach(
        booking => {

          booking.paymentStatus =
            'partial';

          booking.paymentAmount =
            booking.amount *
            (
              this.paymentDetails
                .paymentAmount /
              this.paymentDetails
                .totalAmount
            );

          booking.remainingBalance =
            booking.amount -
            booking.paymentAmount;
        }
      );

    } else if (
      this.paymentDetails.paymentType ===
      'full'
    ) {

      this.paymentDetails.remainingBalance =
        0;

      this.bookings.forEach(
        booking => {

          booking.paymentStatus =
            'full';

          booking.paymentAmount =
            booking.amount;

          booking.remainingBalance =
            0;
        }
      );
    }

    if (
      !this.statusHistory ||
      this.statusHistory.length === 0
    ) {

      const statusNote =
        this.status === 'fully_paid'

          ? `Fully Paid - Full payment of ₱${this.paymentDetails.paymentAmount.toFixed(2)} processed for ${this.bookings.length} booking(s)`

          : `Partially Paid - Partial payment of ₱${this.paymentDetails.paymentAmount.toFixed(2)} processed. Remaining balance: ₱${this.paymentDetails.remainingBalance.toFixed(2)}`;

      this.statusHistory = [
        {
          status: this.status,

          timestamp: new Date(),

          note: statusNote,

          updatedBy: {
            userId:
              this.processedBy?.userId ||
              'system',

            userName:
              this.processedBy?.userName ||
              'System'
          }
        }
      ];
    }

    next();
  }
);

// ==================== HELPER: UPDATE ACCOMMODATION STATUS ====================

async function updateAccommodationStatus(bookings, transactionId) {
  try {
    if (!bookings || !bookings.length) return;

    // Collect accommodation IDs from bookings
    const accommodationIds = [
      ...new Set(
        bookings
          .filter(
            (b) =>
              b.bookingItemModel === 'Accommodation' &&
              (b.accommodationId || b.bookingItemId)
          )
          .map((b) => (b.accommodationId || b.bookingItemId).toString())
      ),
    ];

    if (accommodationIds.length === 0) return;

    const result = await Accommodation.updateMany(
      {
        _id: { $in: accommodationIds },
        status: { $ne: 'not available' },
      },
      {
        $set: { status: 'not available' },
      }
    );

    if (result.modifiedCount > 0) {
      console.log(
        `✅ [updateAccommodationStatus] Updated ${result.modifiedCount} accommodation(s) from transaction ${transactionId}`
      );
    }
  } catch (error) {
    console.error('❌ [updateAccommodationStatus] Error:', error.message);
  }
}

// ==================== HELPER: UPDATE ACTIONBOOKING STATUS ====================

async function updateActionBookingStatus(bookings, paymentType, transactionId) {
  try {
    if (!bookings || !bookings.length) return;
    if (!paymentType) return;

    // Kunin ang ActionBooking model (safe kung wala pa)
    let ActionBooking;
    try {
      ActionBooking = mongoose.model('ActionBooking');
    } catch (e) {
      try {
        ActionBooking = require('../Models/ActionBookingSchema');
      } catch (err) {
        console.warn(
          '⚠️ [updateActionBookingStatus] ActionBooking model not available — skipping'
        );
        return;
      }
    }

    // Target status base sa payment type
    let targetStatus = null;
    if (paymentType === 'partial') {
      targetStatus = 'waiting';
    } else if (paymentType === 'full') {
      targetStatus = 'Confirmed';
    }

    if (!targetStatus) return;

    // Collect booking numbers
    const bookingNumbers = [
      ...new Set(
        bookings
          .filter(
            (b) => b.bookingNumber && String(b.bookingNumber).trim() !== ''
          )
          .map((b) => String(b.bookingNumber).trim())
      ),
    ];

    if (bookingNumbers.length === 0) return;

    const result = await ActionBooking.updateMany(
      {
        bookingNumber: { $in: bookingNumbers },
        status: { $nin: ['cancelled', 'Cancelled', 'completed', 'Completed'] },
      },
      {
        $set: { status: targetStatus },
      }
    );

    if (result.modifiedCount > 0) {
      console.log(
        `✅ [updateActionBookingStatus] Updated ${result.modifiedCount} booking(s) to "${targetStatus}" from transaction ${transactionId}`
      );
    }
  } catch (error) {
    console.error('❌ [updateActionBookingStatus] Error:', error.message);
  }
}

// ==================== POST-SAVE HOOK ====================

BillingHistorySchema.post(
  'save',
  async function (doc, next) {

    try {

      await updateAccommodationStatus(
        doc.bookings,
        doc.transactionId
      );

      await updateActionBookingStatus(
        doc.bookings,
        doc.paymentDetails.paymentType,
        doc.transactionId
      );

      next();

    } catch (error) {

      console.error(
        '❌ [BillingHistory post-save] Error:',
        error
      );

      next();
    }
  }
);

// ==================== POST FINDONEANDUPDATE HOOK ====================

BillingHistorySchema.post(
  'findOneAndUpdate',
  async function (doc, next) {

    try {

      if (!doc) {
        return next();
      }

      await updateAccommodationStatus(
        doc.bookings,
        doc.transactionId
      );

      await updateActionBookingStatus(
        doc.bookings,
        doc.paymentDetails?.paymentType,
        doc.transactionId
      );

      next();

    } catch (error) {

      console.error(
        '❌ [BillingHistory findOneAndUpdate] Error:',
        error
      );

      next();
    }
  }
);

// ==================== STATIC METHOD: MANUAL SYNC ACCOMMODATION ====================

BillingHistorySchema.statics.syncAccommodationStatus =
  async function () {

    try {

      const billings =
        await this.find({
          'bookings.bookingItemModel':
            'Accommodation'
        })
        .select(
          'bookings.accommodationId bookings.bookingItemId transactionId'
        );

      const accommodationIds =
        new Set();

      billings.forEach(
        billing => {

          billing.bookings

            .filter(
              b =>
                b.bookingItemModel ===
                'Accommodation'
            )

            .forEach(
              b => {

                const id =
                  b.accommodationId ||
                  b.bookingItemId;

                if (id) {

                  accommodationIds.add(
                    id.toString().trim()
                  );
                }
              }
            );
        }
      );

      if (
        accommodationIds.size === 0
      ) {

        console.log(
          'ℹ️ [syncAccommodationStatus] No accommodations found'
        );

        return {
          success: true,
          updatedCount: 0,
          totalFound: 0
        };
      }

      const result =
        await Accommodation.updateMany(
          {
            _id: {
              $in:
                Array.from(
                  accommodationIds
                )
            },

            status: {
              $ne: 'not available'
            }
          },

          {
            $set: {
              status: 'not available'
            }
          }
        );

      console.log(
        `✅ [syncAccommodationStatus] Updated ${result.modifiedCount}/${accommodationIds.size} accommodation(s)`
      );

      return {
        success: true,
        updatedCount:
          result.modifiedCount,
        totalFound:
          accommodationIds.size
      };

    } catch (error) {

      console.error(
        '❌ [syncAccommodationStatus] Error:',
        error
      );

      throw error;
    }
  };

// ==================== STATIC METHOD: MANUAL SYNC ACTIONBOOKING ====================

BillingHistorySchema.statics.syncActionBookingStatus =
  async function () {

    try {

      const billings =
        await this.find({
          'paymentDetails.paymentType': {
            $in: [
              'partial',
              'full'
            ]
          }
        })
        .select(
          'paymentDetails.paymentType bookings.bookingNumber bookings.bookingItemId transactionId'
        );

      let partialCount = 0;
      let fullCount = 0;

      for (
        const billing of billings
      ) {

        if (
          billing.paymentDetails
            ?.paymentType ===
          'partial'
        ) {

          await updateActionBookingStatus(
            billing.bookings,
            'partial',
            billing.transactionId
          );

          partialCount++;

        } else if (
          billing.paymentDetails
            ?.paymentType ===
          'full'
        ) {

          await updateActionBookingStatus(
            billing.bookings,
            'full',
            billing.transactionId
          );

          fullCount++;
        }
      }

      console.log(
        `✅ [syncActionBookingStatus] Processed ${partialCount} partial + ${fullCount} full payments`
      );

      return {
        success: true,
        partialCount,
        fullCount
      };

    } catch (error) {

      console.error(
        '❌ [syncActionBookingStatus] Error:',
        error
      );

      throw error;
    }
  };

// ==================== STATIC METHOD: CHECK IF IN BILLING ====================

BillingHistorySchema.statics.isAccommodationInBilling =
  async function (accommodationId) {

    try {

      if (!accommodationId) {

        return {
          isInBilling: false,
          billingInfo: null
        };
      }

      const id =
        accommodationId.toString();

      const result =
        await this.findOne({

          $or: [

            {
              'bookings.accommodationId':
                id
            },

            {
              'bookings.bookingItemId': id,

              'bookings.bookingItemModel':
                'Accommodation'
            },

            {
              'bookings.origin.accommodationId':
                id
            }

          ]

        })
        .select(
          '_id transactionId status createdAt'
        );

      return {

        isInBilling:
          !!result,

        billingInfo:
          result || null
      };

    } catch (error) {

      console.error(
        '❌ [isAccommodationInBilling] Error:',
        error
      );

      throw error;
    }
  };

// ==================== EXPORT ====================

const BillingHistory =
  mongoose.model(
    'BillingHistory',
    BillingHistorySchema
  );

module.exports = BillingHistory;