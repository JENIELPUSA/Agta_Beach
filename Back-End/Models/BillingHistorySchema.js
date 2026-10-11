const mongoose = require('mongoose');

// ==================== SUB-SCHEMAS ====================

// Customer Schema
const CustomerSchema = new mongoose.Schema({
  _id: { type: String, required: true },
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

  referenceNo: {
    type: String,
    required: true,
    trim: true
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

// ==================== HELPER: UPDATE ACCOMMODATION STATUS ====================

const updateAccommodationStatus =
  async (
    bookings,
    transactionId
  ) => {

    try {

      if (
        !bookings ||
        bookings.length === 0
      ) {
        return;
      }

      let Accommodation;

      try {

        Accommodation =
          mongoose.model(
            'Accommodation'
          );

      } catch (e) {

        try {

          Accommodation =
            require(
              './Accommodation'
            );

        } catch (requireError) {

          console.warn(
            '⚠️ Accommodation model not found, skipping status update'
          );

          return;
        }
      }

      // Priority 1:
      // accommodationId

      const directAccommodationIds =
        bookings

          .filter(
            b =>
              b.bookingItemModel ===
                'Accommodation' &&
              b.accommodationId &&
              b.accommodationId
                .toString()
                .trim() !== ''
          )

          .map(
            b =>
              b.accommodationId
                .toString()
                .trim()
          );

      // Priority 2:
      // bookingItemId

      const fallbackIds =
        bookings

          .filter(
            b =>
              b.bookingItemModel ===
                'Accommodation' &&
              !b.accommodationId &&
              b.bookingItemId &&
              b.bookingItemId
                .trim() !== ''
          )

          .map(
            b =>
              b.bookingItemId
                .trim()
          );

      const accommodationIds =
        [
          ...new Set([
            ...directAccommodationIds,
            ...fallbackIds
          ])
        ];

      if (
        accommodationIds.length === 0
      ) {

        console.log(
          'ℹ️ [updateAccommodationStatus] No accommodation IDs found'
        );

        return;
      }

      const result =
        await Accommodation.updateMany(
          {
            _id: {
              $in: accommodationIds
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
        ` [BillingHistory] Updated ${result.modifiedCount}/${accommodationIds.length} accommodation(s) to "not available"`,
        {
          transactionId,
          directIds:
            directAccommodationIds.length,
          fallbackIds:
            fallbackIds.length
        }
      );

    } catch (error) {

      console.error(
        '❌ [updateAccommodationStatus] Error:',
        error
      );
    }
  };

// ==================== HELPER: UPDATE ACTIONBOOKING STATUS ====================

const updateActionBookingStatus =
  async (
    bookings,
    paymentType,
    transactionId
  ) => {

    try {

      if (
        !bookings ||
        bookings.length === 0
      ) {

        console.log(
          'ℹ️ [updateActionBookingStatus] No bookings to process'
        );

        return;
      }

      let ActionBooking;

      try {

        ActionBooking =
          mongoose.model(
            'ActionBooking'
          );

      } catch (e) {

        try {

          ActionBooking =
            require(
              './ActionBooking'
            );

        } catch (requireError) {

          console.warn(
            '⚠️ ActionBooking model not found, skipping status update'
          );

          return;
        }
      }

      const targetStatus =
        paymentType === 'full'
          ? 'Paid'
          : 'waiting';

      console.log(
        `🎯 [updateActionBookingStatus] Target status: "${targetStatus}" (paymentType: "${paymentType}")`
      );

      const bookingNumbers = [];
      const bookingItemIds = [];

      bookings.forEach(
        b => {

          if (
            b.bookingNumber &&
            typeof b.bookingNumber ===
              'string' &&
            b.bookingNumber
              .trim() !== ''
          ) {

            bookingNumbers.push(
              b.bookingNumber.trim()
            );
          }

          if (
            b.bookingItemId &&
            typeof b.bookingItemId ===
              'string' &&
            b.bookingItemId
              .trim() !== ''
          ) {

            bookingItemIds.push(
              b.bookingItemId.trim()
            );
          }
        }
      );

      if (
        bookingNumbers.length === 0 &&
        bookingItemIds.length === 0
      ) {

        console.log(
          'ℹ️ [updateActionBookingStatus] No booking numbers or item IDs found'
        );

        return;
      }

      const queryConditions = [];

      if (
        bookingNumbers.length > 0
      ) {

        queryConditions.push({
          bookingNumber: {
            $in: bookingNumbers
          }
        });
      }

      if (
        bookingItemIds.length > 0
      ) {

        queryConditions.push({
          bookingItemId: {
            $in: bookingItemIds
          }
        });
      }

      const result =
        await ActionBooking.updateMany(

          {
            $or: queryConditions,

            status: {
              $nin: [
                'Cancelled',
                'Rejected'
              ]
            }
          },

          {
            $set: {
              status: targetStatus
            }
          }
        );

      console.log(
        ` [BillingHistory] Updated ${result.modifiedCount}/${result.matchedCount} ActionBooking(s) to "${targetStatus}"`,
        {
          transactionId,
          paymentType,
          bookingNumbers,
          bookingItemIds
        }
      );

      if (
        result.matchedCount === 0
      ) {

        console.warn(
          `⚠️ [updateActionBookingStatus] No ActionBooking matched.`,
          {
            bookingNumbers,
            bookingItemIds
          }
        );
      }

    } catch (error) {

      console.error(
        '❌ [updateActionBookingStatus] Error:',
        error
      );
    }
  };

// ==================== PRE-SAVE HOOKS ====================

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

      let Accommodation;

      try {

        Accommodation =
          mongoose.model(
            'Accommodation'
          );

      } catch (e) {

        Accommodation =
          require(
            './accommodationSchema'
          );
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
        ` [syncAccommodationStatus] Updated ${result.modifiedCount}/${accommodationIds.size} accommodation(s)`
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
        ` [syncActionBookingStatus] Processed ${partialCount} partial + ${fullCount} full payments`
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