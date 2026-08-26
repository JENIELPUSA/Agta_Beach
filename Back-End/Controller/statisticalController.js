const ActionBooking = require("../Models/ActionBooking");
const AsyncErrorHandler = require("../Utils/AsyncErrorHandler");
const mongoose = require("mongoose");
const BillingHistory = require("../Models/BillingHistorySchema");
const Customer = require("../Models/CustomerSchema");
const UserLogin = require("../Models/LogInDentalSchema");

exports.DisplayBookings = AsyncErrorHandler(async (req, res) => {
    try {
        const {
            search = "",
            status = "",
            bookingType = "",
            isWalkin = "",
            isDone = "",
            startDate = "",
            endDate = "",
            customerId = "",
        } = req.query;

        const matchStage = {};

        if (search.trim()) {
            matchStage.bookingNumber = {
                $regex: new RegExp(search.trim(), "i"),
            };
        }

        if (status.trim()) {
            matchStage.status = status;
        }

        if (bookingType.trim()) {
            matchStage.bookingItemModel = bookingType;
        }

        if (isWalkin !== "") {
            matchStage.isWalkin = isWalkin === "true";
        }

        if (isDone !== "") {
            matchStage.isDone = isDone === "true";
        }

        if (customerId.trim()) {
            matchStage.customerId = new mongoose.Types.ObjectId(customerId);
        }

        if (startDate || endDate) {
            matchStage.created_at = {};
            if (startDate) {
                matchStage.created_at.$gte = new Date(startDate);
            }
            if (endDate) {
                matchStage.created_at.$lte = new Date(endDate);
            }
        }

        // ActionBooking Aggregation
        const bookingPipeline = [
            { $match: matchStage },
            {
                $facet: {
                    totalCount: [{ $count: "count" }],
                    statusCounts: [
                        {
                            $group: {
                                _id: "$status",
                                count: { $sum: 1 },
                            },
                        },
                    ],
                    typeCounts: [
                        {
                            $group: {
                                _id: "$bookingItemModel",
                                count: { $sum: 1 },
                            },
                        },
                    ],
                    walkinCount: [
                        {
                            $group: {
                                _id: null,
                                walkins: {
                                    $sum: { $cond: ["$isWalkin", 1, 0] }
                                },
                                done: {
                                    $sum: { $cond: ["$isDone", 1, 0] }
                                },
                                avgStay: { $avg: "$expected_stay" },
                                totalStays: { $sum: "$expected_stay" }
                            }
                        }
                    ],
                    todayCheckIn: [
                        {
                            $match: {
                                created_at: {
                                    $gte: new Date(new Date().setHours(0, 0, 0, 0)),
                                    $lte: new Date(new Date().setHours(23, 59, 59, 999))
                                },
                                status: { $in: ["Confirmed", "Paid"] }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                count: { $sum: 1 },
                                walkins: {
                                    $sum: { $cond: ["$isWalkin", 1, 0] }
                                },
                                online: {
                                    $sum: { $cond: ["$isWalkin", 0, 1] }
                                },
                                accommodations: {
                                    $sum: { $cond: [{ $eq: ["$bookingItemModel", "Accommodation"] }, 1, 0] }
                                },
                                services: {
                                    $sum: { $cond: [{ $eq: ["$bookingItemModel", "Service"] }, 1, 0] }
                                },
                                activities: {
                                    $sum: { $cond: [{ $eq: ["$bookingItemModel", "Activity"] }, 1, 0] }
                                },
                                rentals: {
                                    $sum: { $cond: [{ $eq: ["$bookingItemModel", "Rental"] }, 1, 0] }
                                },
                                totalStays: { $sum: "$expected_stay" },
                                avgStay: { $avg: "$expected_stay" }
                            }
                        }
                    ],
                    todayBookings: [
                        {
                            $match: {
                                created_at: {
                                    $gte: new Date(new Date().setHours(0, 0, 0, 0)),
                                    $lte: new Date(new Date().setHours(23, 59, 59, 999))
                                }
                            }
                        },
                        { $sort: { created_at: 1 } },
                        { $limit: 20 },
                        {
                            $lookup: {
                                from: "userloginschemas",
                                localField: "customerId",
                                foreignField: "_id",
                                as: "userLogin"
                            }
                        },
                        {
                            $addFields: {
                                userLogin: { $arrayElemAt: ["$userLogin", 0] }
                            }
                        },
                        {
                            $lookup: {
                                from: "customers",
                                localField: "userLogin.linkedId",
                                foreignField: "_id",
                                as: "customer"
                            }
                        },
                        {
                            $addFields: {
                                customer: { $arrayElemAt: ["$customer", 0] }
                            }
                        },
                        {
                            $project: {
                                _id: 1,
                                bookingNumber: 1,
                                status: 1,
                                isWalkin: 1,
                                expected_stay: 1,
                                created_at: 1,
                                "customer.first_name": 1,
                                "customer.last_name": 1,
                                "customer.middle_name": 1,
                                "customer.suffix": 1,
                                "customer.email": 1,
                                "customer.avatar": 1,
                                bookingItemModel: 1,
                                bookingItemId: 1
                            }
                        }
                    ]
                },
            },
        ];

        const results = await ActionBooking.aggregate(bookingPipeline);
        const totalBookings = results[0].totalCount[0]?.count || 0;
        const statusCounts = results[0].statusCounts || [];
        const typeCounts = results[0].typeCounts || [];
        const walkinData = results[0].walkinCount[0] || { walkins: 0, done: 0, avgStay: 0, totalStays: 0 };
        const todayCheckInData = results[0].todayCheckIn[0] || { 
            count: 0, 
            walkins: 0, 
            online: 0,
            accommodations: 0,
            services: 0,
            activities: 0,
            rentals: 0,
            totalStays: 0,
            avgStay: 0
        };
        
        const todayBookings = results[0].todayBookings || [];

        // ============================================
        // BILLING HISTORY WITH REVENUE
        // ============================================
        const billingMatchStage = {};

        if (customerId.trim()) {
            billingMatchStage.customerId = new mongoose.Types.ObjectId(customerId);
        }

        if (startDate || endDate) {
            billingMatchStage.createdAt = {};
            if (startDate) {
                billingMatchStage.createdAt.$gte = new Date(startDate);
            }
            if (endDate) {
                billingMatchStage.createdAt.$lte = new Date(endDate);
            }
        }

        if (status.trim()) {
            billingMatchStage.status = status;
        }

        // Get date ranges
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        
        const weekStart = new Date(now);
        const day = now.getDay();
        const diff = (day === 0 ? 6 : day - 1);
        weekStart.setDate(now.getDate() - diff);
        weekStart.setHours(0, 0, 0, 0);
        
        const yearStart = new Date(now.getFullYear(), 0, 1);
        const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

        // Month names
        const monthNames = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];

        const billingPipeline = [
            { $match: billingMatchStage },
            {
                $facet: {
                    totalBills: [{ $count: "count" }],
                    
                    statusCounts: [
                        {
                            $group: {
                                _id: "$status",
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    
                    paymentMethodCounts: [
                        {
                            $group: {
                                _id: "$paymentDetails.method",
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    
                    paymentTypeCounts: [
                        {
                            $group: {
                                _id: "$paymentDetails.paymentType",
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    
                    revenueSummary: [
                        {
                            $group: {
                                _id: null,
                                grossRevenue: { $sum: "$paymentDetails.totalAmount" },
                                netRevenue: { $sum: "$paymentDetails.paymentAmount" },
                                outstandingBalance: { $sum: "$paymentDetails.remainingBalance" },
                                totalRefunded: { $sum: "$refund.refundAmount" },
                                totalBills: { $sum: 1 },
                                averageRevenue: { $avg: "$paymentDetails.paymentAmount" },
                                minRevenue: { $min: "$paymentDetails.paymentAmount" },
                                maxRevenue: { $max: "$paymentDetails.paymentAmount" },
                                fullPayments: {
                                    $sum: { $cond: [{ $eq: ["$paymentDetails.paymentType", "full"] }, 1, 0] }
                                },
                                partialPayments: {
                                    $sum: { $cond: [{ $eq: ["$paymentDetails.paymentType", "partial"] }, 1, 0] }
                                },
                                completedPayments: {
                                    $sum: { 
                                        $cond: [
                                            { $or: [{ $eq: ["$status", "completed"] }, { $eq: ["$status", "fully_paid"] }] },
                                            1, 
                                            0 
                                        ]
                                    }
                                }
                            }
                        }
                    ],
                    
                    todayRevenue: [
                        {
                            $match: {
                                createdAt: {
                                    $gte: todayStart,
                                    $lte: todayEnd
                                }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                totalAmount: { $sum: "$paymentDetails.totalAmount" },
                                totalPaid: { $sum: "$paymentDetails.paymentAmount" },
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    
                    weeklyRevenue: [
                        {
                            $match: {
                                createdAt: {
                                    $gte: weekStart,
                                    $lte: todayEnd
                                }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                totalAmount: { $sum: "$paymentDetails.totalAmount" },
                                totalPaid: { $sum: "$paymentDetails.paymentAmount" },
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    
                    yearlyRevenue: [
                        {
                            $match: {
                                createdAt: {
                                    $gte: yearStart,
                                    $lte: yearEnd
                                }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                totalAmount: { $sum: "$paymentDetails.totalAmount" },
                                totalPaid: { $sum: "$paymentDetails.paymentAmount" },
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    
                    monthlyRevenue: [
                        {
                            $group: {
                                _id: {
                                    year: { $year: "$createdAt" },
                                    month: { $month: "$createdAt" }
                                },
                                revenue: { $sum: "$paymentDetails.paymentAmount" },
                                gross: { $sum: "$paymentDetails.totalAmount" },
                                count: { $sum: 1 }
                            }
                        },
                        { $sort: { "_id.year": 1, "_id.month": 1 } }
                    ],
                    
                    revenueByMethod: [
                        {
                            $group: {
                                _id: "$paymentDetails.method",
                                totalAmount: { $sum: "$paymentDetails.totalAmount" },
                                totalPaid: { $sum: "$paymentDetails.paymentAmount" },
                                count: { $sum: 1 }
                            }
                        },
                        { $sort: { totalPaid: -1 } }
                    ],
                    
                    revenueByStatus: [
                        {
                            $group: {
                                _id: "$status",
                                totalAmount: { $sum: "$paymentDetails.totalAmount" },
                                totalPaid: { $sum: "$paymentDetails.paymentAmount" },
                                count: { $sum: 1 }
                            }
                        },
                        { $sort: { totalPaid: -1 } }
                    ],
                    
                    refundSummary: [
                        {
                            $match: { "refund.isRefunded": true }
                        },
                        {
                            $group: {
                                _id: null,
                                totalRefunded: { $sum: "$refund.refundAmount" },
                                count: { $sum: 1 },
                                avgRefund: { $avg: "$refund.refundAmount" },
                                minRefund: { $min: "$refund.refundAmount" },
                                maxRefund: { $max: "$refund.refundAmount" }
                            }
                        }
                    ],
                    
                    // ============================================
                    // LATEST 5 BOOKINGS TODAY 
                    // WITH USERLOGIN -> CUSTOMER LOOKUP
                    // ============================================
                    latestBookingsToday: [
                        {
                            $match: {
                                createdAt: {
                                    $gte: todayStart,
                                    $lte: todayEnd
                                }
                            }
                        },
                        { $sort: { createdAt: -1 } },
                        { $limit: 5 },
                        // Step 1: Lookup UserLogin using customerId
                        {
                            $lookup: {
                                from: "userloginschemas",
                                localField: "customerId",
                                foreignField: "_id",
                                as: "userLogin"
                            }
                        },
                        {
                            $addFields: {
                                userLogin: { $arrayElemAt: ["$userLogin", 0] }
                            }
                        },
                        // Step 2: Lookup Customer using userLogin.linkedId
                        {
                            $lookup: {
                                from: "customers",
                                localField: "userLogin.linkedId",
                                foreignField: "_id",
                                as: "customerDetails"
                            }
                        },
                        {
                            $addFields: {
                                customerDetails: { $arrayElemAt: ["$customerDetails", 0] }
                            }
                        },
                        {
                            $project: {
                                _id: 1,
                                transactionId: 1,
                                customerId: 1,
                                createdAt: 1,
                                status: 1,
                                // Customer details from Customer schema via linkedId
                                customer: {
                                    _id: "$customerDetails._id",
                                    first_name: "$customerDetails.first_name",
                                    last_name: "$customerDetails.last_name",
                                    middle_name: "$customerDetails.middle_name",
                                    suffix: "$customerDetails.suffix",
                                    gender: "$customerDetails.gender",
                                    email: "$customerDetails.email",
                                    avatar: "$customerDetails.avatar"
                                },
                                // UserLogin details (for reference)
                                user: {
                                    _id: "$userLogin._id",
                                    first_name: "$userLogin.first_name",
                                    last_name: "$userLogin.last_name",
                                    username: "$userLogin.username",
                                    role: "$userLogin.role"
                                },
                                paymentDetails: {
                                    totalAmount: 1,
                                    paymentAmount: 1,
                                    method: 1,
                                    paymentType: 1,
                                    remainingBalance: 1
                                },
                                bookings: {
                                    $map: {
                                        input: "$bookings",
                                        as: "booking",
                                        in: {
                                            _id: "$$booking._id",
                                            type: "$$booking.type",
                                            status: "$$booking.status",
                                            amount: "$$booking.amount",
                                            bookingNumber: "$$booking.bookingNumber",
                                            bookingItemModel: "$$booking.bookingItemModel",
                                            itemName: "$$booking.itemName"
                                        }
                                    }
                                }
                            }
                        }
                    ]
                }
            }
        ];

        const billingResults = await BillingHistory.aggregate(billingPipeline);
        
        const totalBills = billingResults[0].totalBills[0]?.count || 0;
        const billingStatusCounts = billingResults[0].statusCounts || [];
        const paymentMethodCounts = billingResults[0].paymentMethodCounts || [];
        const paymentTypeCounts = billingResults[0].paymentTypeCounts || [];
        
        const revenueData = billingResults[0].revenueSummary[0] || { 
            grossRevenue: 0, 
            netRevenue: 0, 
            outstandingBalance: 0,
            totalRefunded: 0,
            totalBills: 0,
            averageRevenue: 0,
            minRevenue: 0,
            maxRevenue: 0,
            fullPayments: 0,
            partialPayments: 0,
            completedPayments: 0
        };
        
        const todayData = billingResults[0].todayRevenue[0] || {
            totalAmount: 0,
            totalPaid: 0,
            count: 0
        };
        
        const weeklyData = billingResults[0].weeklyRevenue[0] || {
            totalAmount: 0,
            totalPaid: 0,
            count: 0
        };
        
        const yearlyData = billingResults[0].yearlyRevenue[0] || {
            totalAmount: 0,
            totalPaid: 0,
            count: 0
        };
        
        const revenueByMethod = billingResults[0].revenueByMethod || [];
        const revenueByStatus = billingResults[0].revenueByStatus || [];
        const refundData = billingResults[0].refundSummary[0] || { 
            totalRefunded: 0, 
            count: 0, 
            avgRefund: 0,
            minRefund: 0,
            maxRefund: 0
        };

        const latestBookingsToday = billingResults[0].latestBookingsToday || [];

        // Format Monthly Revenue
        const monthlyData = billingResults[0].monthlyRevenue || [];
        const currentYear = now.getFullYear();
        
        const monthlyRevenueFormatted = monthNames.map((monthName, index) => {
            const monthNumber = index + 1;
            const found = monthlyData.find(
                item => item._id.year === currentYear && item._id.month === monthNumber
            );
            return {
                month: monthName,
                revenue: found ? found.revenue : 0,
                gross: found ? found.gross : 0,
                count: found ? found.count : 0
            };
        });

        const prevYear = currentYear - 1;
        const previousYearData = monthlyData.filter(item => item._id.year === prevYear);
        
        const previousYearFormatted = monthNames.map((monthName, index) => {
            const monthNumber = index + 1;
            const found = previousYearData.find(
                item => item._id.month === monthNumber
            );
            return {
                month: monthName,
                revenue: found ? found.revenue : 0,
                gross: found ? found.gross : 0,
                count: found ? found.count : 0
            };
        });

        const statuses = await ActionBooking.distinct("status");
        const bookingTypes = await ActionBooking.distinct("bookingItemModel");
        const billingStatuses = await BillingHistory.distinct("status");
        const paymentMethods = await BillingHistory.distinct("paymentDetails.method");
        const paymentTypes = ["full", "partial"];

        // Format Today's Bookings
        const formattedTodayBookings = todayBookings.map((booking) => {
            const time = new Date(booking.created_at);
            const timeStr = time.toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: true 
            });
            
            const firstName = booking.customer?.first_name || '';
            const lastName = booking.customer?.last_name || '';
            const middleName = booking.customer?.middle_name || '';
            const suffix = booking.customer?.suffix || '';
            
            let fullName = `${firstName} ${lastName}`.trim();
            if (middleName) fullName += ` ${middleName}`;
            if (suffix) fullName += ` ${suffix}`;
            
            return {
                time: timeStr,
                guest: fullName || 'Unknown Guest',
                status: booking.status,
                balance: `₱${(booking.expected_stay || 0) * 1000}`
            };
        });

        // Format Latest Bookings Today with full customer details
        const formattedLatestBookings = latestBookingsToday.map(item => {
            const firstName = item.customer?.first_name || '';
            const lastName = item.customer?.last_name || '';
            const middleName = item.customer?.middle_name || '';
            const suffix = item.customer?.suffix || '';
            
            let fullName = `${firstName} ${lastName}`.trim();
            if (middleName) fullName += ` ${middleName}`;
            if (suffix) fullName += ` ${suffix}`;
            
            // If no customer found, try to get from userLogin
            if (!fullName && item.user) {
                fullName = `${item.user.first_name || ''} ${item.user.last_name || ''}`.trim() || 'Unknown User';
            }
            
            // Format time
            const time = new Date(item.createdAt);
            const timeStr = time.toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: true 
            });
            
            return {
                time: timeStr,
                transactionId: item.transactionId,
                customerId: item.customerId,
                customerName: fullName || 'Unknown Customer',
                customerEmail: item.customer?.email || 'N/A',
                customerGender: item.customer?.gender || 'N/A',
                customerAvatar: item.customer?.avatar?.url || '',
                userRole: item.user?.role || 'N/A',
                username: item.user?.username || 'N/A',
                status: item.status,
                totalAmount: item.paymentDetails?.totalAmount || 0,
                paymentAmount: item.paymentDetails?.paymentAmount || 0,
                paymentMethod: item.paymentDetails?.method || 'N/A',
                paymentType: item.paymentDetails?.paymentType || 'N/A',
                remainingBalance: item.paymentDetails?.remainingBalance || 0,
                bookings: item.bookings?.map(booking => ({
                    id: booking._id,
                    type: booking.type,
                    status: booking.status,
                    amount: booking.amount,
                    bookingNumber: booking.bookingNumber || 'N/A',
                    itemModel: booking.bookingItemModel || 'N/A',
                    itemName: booking.itemName || 'N/A'
                })) || [],
                createdAt: item.createdAt
            };
        });

        res.status(200).json({
            status: "success",
            summary: {
                bookings: {
                    totalBookings,
                    totalWalkins: walkinData.walkins,
                    totalDone: walkinData.done,
                    averageStay: Math.round((walkinData.avgStay || 0) * 100) / 100,
                    totalExpectedStays: walkinData.totalStays,
                },
                todayCheckIn: {
                    total: todayCheckInData.count,
                    walkins: todayCheckInData.walkins,
                    online: todayCheckInData.online,
                    totalStays: todayCheckInData.totalStays,
                    averageStay: Math.round((todayCheckInData.avgStay || 0) * 100) / 100,
                    breakdown: {
                        accommodations: todayCheckInData.accommodations,
                        services: todayCheckInData.services,
                        activities: todayCheckInData.activities,
                        rentals: todayCheckInData.rentals
                    },
                    date: todayStart.toISOString().split('T')[0]
                },
                revenue: {
                    grossRevenue: revenueData.grossRevenue,
                    netRevenue: revenueData.netRevenue - refundData.totalRefunded,
                    totalCollected: revenueData.netRevenue,
                    outstandingBalance: revenueData.outstandingBalance,
                    totalRefunded: refundData.totalRefunded,
                    totalBills: revenueData.totalBills,
                    averageRevenue: Math.round((revenueData.averageRevenue || 0) * 100) / 100,
                    minRevenue: revenueData.minRevenue,
                    maxRevenue: revenueData.maxRevenue,
                    fullPayments: revenueData.fullPayments,
                    partialPayments: revenueData.partialPayments,
                    completedPayments: revenueData.completedPayments,
                    refundCount: refundData.count,
                    averageRefund: Math.round((refundData.avgRefund || 0) * 100) / 100,
                    minRefund: refundData.minRefund,
                    maxRefund: refundData.maxRefund,
                    
                    period: {
                        today: {
                            revenue: todayData.totalPaid,
                            gross: todayData.totalAmount,
                            count: todayData.count,
                            date: todayStart.toISOString().split('T')[0]
                        },
                        thisWeek: {
                            revenue: weeklyData.totalPaid,
                            gross: weeklyData.totalAmount,
                            count: weeklyData.count,
                            startDate: weekStart.toISOString().split('T')[0],
                            endDate: todayEnd.toISOString().split('T')[0]
                        },
                        thisYear: {
                            revenue: yearlyData.totalPaid,
                            gross: yearlyData.totalAmount,
                            count: yearlyData.count,
                            year: currentYear
                        }
                    },
                    
                    monthly: {
                        currentYear: monthlyRevenueFormatted,
                        previousYear: previousYearFormatted
                    }
                }
            },
            // Today's Bookings Table
            todayBookingsTable: {
                headers: ["Time", "Guest", "Status", "Balance"],
                rows: formattedTodayBookings,
                total: formattedTodayBookings.length,
                date: todayStart.toISOString().split('T')[0]
            },
            // Latest 5 Bookings Today with Customer Details
            latestBookingsToday: formattedLatestBookings,
            bookingStatusCounts: statusCounts,
            bookingTypeCounts: typeCounts,
            billingStatusCounts,
            paymentMethodCounts,
            paymentTypeCounts,
            revenueByMethod,
            revenueByStatus,
            filters: {
                bookingStatuses: statuses,
                bookingTypes,
                billingStatuses,
                paymentMethods,
                paymentTypes,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "fail",
            message: "Something went wrong while fetching booking summary.",
            error: error.message,
        });
    }
});