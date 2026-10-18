const AsyncErrorHandler = require("../Utils/AsyncErrorHandler");
const AuditLog = require("../Models/AuditlogsSchema");
const mongoose = require("mongoose");

// ==========================================
// DISPLAY - GET ALL AUDIT LOGS (WITH PAGINATION & FILTERS)
// ==========================================
exports.GetAllAuditLogs = AsyncErrorHandler(async (req, res) => {
    // ========== PAGINATION ==========
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // ========== FILTERS ==========
    const {
        event_type,
        status,
        action,
        user_id,
        username,
        employeeRef,
        dateFrom,
        dateTo,
        search
    } = req.query;

    // ========== BUILD MATCH QUERY ==========
    let matchQuery = {};

    // Event type filter
    if (event_type) {
        matchQuery.event_type = event_type;
    }

    // Status filter
    if (status) {
        matchQuery.status = status;
    }

    // Action filter (partial match)
    if (action) {
        matchQuery.action = { $regex: action, $options: "i" };
    }

    // User ID filter
    if (user_id) {
        matchQuery["user.user_id"] = user_id;
    }

    // Username filter
    if (username) {
        matchQuery["user.username"] = { $regex: username, $options: "i" };
    }

    // Employee reference filter
    if (employeeRef) {
        if (!mongoose.Types.ObjectId.isValid(employeeRef)) {
            return res.status(400).json({
                status: "fail",
                message: "Invalid employeeRef ID",
            });
        }
        matchQuery["user.employeeRef"] = new mongoose.Types.ObjectId(employeeRef);
    }

    // Date range filter - handle string dates
    if (dateFrom || dateTo) {
        matchQuery.timestamp = {};
        if (dateFrom) {
            const fromDate = new Date(dateFrom);
            matchQuery.timestamp.$gte = fromDate.toISOString().split('T')[0]; // Format: YYYY-MM-DD
        }
        if (dateTo) {
            const toDate = new Date(dateTo);
            matchQuery.timestamp.$lte = toDate.toISOString().split('T')[0]; // Format: YYYY-MM-DD
        }
    }

    // ========== BUILD SEARCH QUERY ==========
    let searchQuery = {};
    if (search) {
        searchQuery = {
            $or: [
                { log_id: { $regex: search, $options: "i" } },
                { "user.username": { $regex: search, $options: "i" } },
                { action: { $regex: search, $options: "i" } },
                { "user.user_id": { $regex: search, $options: "i" } },
                { event_type: { $regex: search, $options: "i" } },
                { status: { $regex: search, $options: "i" } },
            ]
        };
    }

    // ========== AGGREGATION PIPELINE ==========
    const pipeline = [
        // Apply search filter
        ...(Object.keys(searchQuery).length > 0 ? [{
            $match: searchQuery
        }] : []),

        // Apply filters
        ...(Object.keys(matchQuery).length > 0 ? [{
            $match: matchQuery
        }] : []),

        // Lookup employee details
        {
            $lookup: {
                from: "employees",
                localField: "user.employeeRef",
                foreignField: "_id",
                as: "employee",
            },
        },
        {
            $unwind: {
                path: "$employee",
                preserveNullAndEmptyArrays: true,
            },
        },

        // ========== ADD SORTABLE DATE FIELD (BULLETPROOF SORTING) ==========
        {
            $addFields: {
                // Convert string timestamp to Date object for reliable sorting
                // Handles formats like: "2025-01-15 14:30:00", "2025-01-15T14:30:00Z", etc.
                timestampDate: {
                    $dateFromString: {
                        dateString: "$timestamp",
                        onError: null,
                        onNull: null,
                    }
                },
                // Fallback: kung mali ang format, gamitin ang createdAt
                sortDate: {
                    $ifNull: [
                        {
                            $dateFromString: {
                                dateString: "$timestamp",
                                onError: null,
                                onNull: null,
                            }
                        },
                        "$createdAt"
                    ]
                }
            }
        },

        // ========== SORT: LATEST FIRST (HULI → UNA) ==========
        {
            $sort: {
                sortDate: -1,   // -1 = descending = pinakabago muna
                createdAt: -1,
                _id: -1         // tie-breaker para consistent ang order
            }
        },

        // ========== FACET FOR PAGINATION AND COUNTS ==========
        {
            $facet: {
                // Metadata for pagination
                metadata: [
                    { $count: "totalCount" },
                    {
                        $addFields: {
                            totalPages: {
                                $ceil: {
                                    $divide: ["$totalCount", limit]
                                }
                            },
                            currentPage: page,
                            limit: limit,
                        }
                    }
                ],
                data: [
                    { $skip: skip },
                    { $limit: limit },
                    {
                        $project: {
                            _id: 1,
                            // ===== WHO =====
                            performedBy: 1,
                            performedByModel: 1,
                            // ===== WHAT =====
                            type: 1,              // dating event_type
                            action: 1,
                            module: 1,
                            message: 1,
                            level: 1,
                            // ===== TARGET =====
                            targetId: 1,
                            targetModel: 1,
                            targetLabel: 1,
                            ownerId: 1,
                            // ===== DIFF =====
                            beforeChange: 1,
                            afterChange: 1,
                            changedFields: 1,
                            // ===== CONTEXT =====
                            ipAddress: 1,         // dating ip_address
                            userAgent: 1,         // dating user_agent
                            method: 1,
                            endpoint: 1,
                            requestId: 1,
                            // ===== RESULT =====
                            status: 1,
                            errorMessage: 1,
                            // ===== EXTRA =====
                            metadata: 1,
                            isArchived: 1,
                            // ===== TIMESTAMPS =====
                            createdAt: 1,
                            updatedAt: 1,
                            // ===== LOOKUP: performer (User) =====
                            "performer._id": 1,
                            "performer.name": 1,
                            "performer.email": 1,
                            "performer.role": 1,
                        }
                    }
                ],
                // ========== COUNTS BY EVENT TYPE ==========
                eventTypeCounts: [
                    { $group: { _id: "$event_type", count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ],
                // ========== COUNTS BY ACTION ==========
                actionCounts: [
                    { $group: { _id: "$action", count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ],
                // ========== COUNTS BY STATUS ==========
                statusCounts: [
                    { $group: { _id: "$status", count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ],
                // ========== COUNTS BY USER ==========
                userCounts: [
                    { $group: { _id: "$user.username", count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ],
                // ========== COUNTS BY USER ID ==========
                userIdCounts: [
                    { $group: { _id: "$user.user_id", count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ],
                // ========== COUNTS BY IP ADDRESS ==========
                ipAddressCounts: [
                    { $group: { _id: "$ip_address", count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ],
                // ========== COUNTS BY DATE (Handle string timestamp) ==========
                dateCounts: [
                    {
                        $group: {
                            _id: {
                                $substr: ["$timestamp", 0, 10] // Extract YYYY-MM-DD from string
                            },
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { _id: -1 } }
                ],
                // ========== COUNTS BY EVENT TYPE AND ACTION (Combined) ==========
                eventActionCounts: [
                    {
                        $group: {
                            _id: {
                                event_type: "$event_type",
                                action: "$action"
                            },
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { count: -1 } }
                ],
                // ========== STATUS BY EVENT TYPE ==========
                statusByEventType: [
                    {
                        $group: {
                            _id: {
                                event_type: "$event_type",
                                status: "$status"
                            },
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { "_id.event_type": 1, count: -1 } }
                ],
                // ========== COUNTS BY MONTH (Extract from string timestamp) ==========
                monthCounts: [
                    {
                        $group: {
                            _id: {
                                $substr: ["$timestamp", 0, 7] // Extract YYYY-MM from string
                            },
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { _id: -1 } }
                ],
                // ========== COUNTS BY HOUR (Extract from string timestamp) ==========
                hourCounts: [
                    {
                        $group: {
                            _id: {
                                $substr: ["$timestamp", 11, 2] // Extract HH from "YYYY-MM-DD HH:MM:SS"
                            },
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { _id: 1 } }
                ]
            }
        }
    ];

    const result = await AuditLog.aggregate(pipeline);

    const metadata = result[0]?.metadata?.[0] || {
        totalCount: 0,
        totalPages: 0,
        currentPage: page,
        limit: limit
    };

    const data = result[0]?.data || [];

    // ========== TRANSFORM COUNTS TO OBJECTS ==========
    const transformCounts = (array) => {
        const obj = {};
        array.forEach(item => {
            const key = item._id || 'UNKNOWN';
            obj[key] = item.count;
        });
        return obj;
    };

    const transformNestedCounts = (array) => {
        const obj = {};
        array.forEach(item => {
            const key = `${item._id.event_type || 'UNKNOWN'}|${item._id.action || 'UNKNOWN'}`;
            obj[key] = item.count;
        });
        return obj;
    };

    const transformStatusByEventType = (array) => {
        const obj = {};
        array.forEach(item => {
            const eventType = item._id.event_type || 'UNKNOWN';
            const status = item._id.status || 'UNKNOWN';
            if (!obj[eventType]) {
                obj[eventType] = {};
            }
            obj[eventType][status] = item.count;
        });
        return obj;
    };

    // ========== TOTAL COUNTS ==========
    const eventTypeCountsObj = transformCounts(result[0]?.eventTypeCounts || []);
    const actionCountsObj = transformCounts(result[0]?.actionCounts || []);
    const statusCountsObj = transformCounts(result[0]?.statusCounts || []);
    const userCountsObj = transformCounts(result[0]?.userCounts || []);
    const userIdCountsObj = transformCounts(result[0]?.userIdCounts || []);
    const ipAddressCountsObj = transformCounts(result[0]?.ipAddressCounts || []);
    const dateCountsObj = transformCounts(result[0]?.dateCounts || []);
    const monthCountsObj = transformCounts(result[0]?.monthCounts || []);
    const hourCountsObj = transformCounts(result[0]?.hourCounts || []);
    const eventActionCountsObj = transformNestedCounts(result[0]?.eventActionCounts || []);
    const statusByEventTypeObj = transformStatusByEventType(result[0]?.statusByEventType || []);

    // ========== CALCULATE SUMMARY STATISTICS ==========
    const totalCount = metadata.totalCount;
    const uniqueUsers = Object.keys(userCountsObj).length;
    const uniqueEventTypes = Object.keys(eventTypeCountsObj).length;
    const uniqueActions = Object.keys(actionCountsObj).length;
    const uniqueStatuses = Object.keys(statusCountsObj).length;
    const uniqueIPs = Object.keys(ipAddressCountsObj).length;

    return res.status(200).json({
        status: "success",
        data: data,
        pagination: {
            total: metadata.totalCount,
            totalPages: metadata.totalPages,
            currentPage: metadata.currentPage,
            limit: metadata.limit,
        },
        counts: {
            // Summary statistics
            summary: {
                totalRecords: totalCount,
                uniqueUsers: uniqueUsers,
                uniqueEventTypes: uniqueEventTypes,
                uniqueActions: uniqueActions,
                uniqueStatuses: uniqueStatuses,
                uniqueIPAddresses: uniqueIPs,
            },
            // Detailed counts
            byEventType: eventTypeCountsObj,
            byAction: actionCountsObj,
            byStatus: statusCountsObj,
            byUser: userCountsObj,
            byUserId: userIdCountsObj,
            byIpAddress: ipAddressCountsObj,
            byDate: dateCountsObj,
            byMonth: monthCountsObj,
            byHour: hourCountsObj,
            byEventAndAction: eventActionCountsObj,
            statusByEventType: statusByEventTypeObj,
        },
        // Add filter info
        filters: {
            event_type: event_type || null,
            status: status || null,
            action: action || null,
            user_id: user_id || null,
            username: username || null,
            employeeRef: employeeRef || null,
            dateFrom: dateFrom || null,
            dateTo: dateTo || null,
            search: search || null,
        }
    });
});

// ==========================================
// DISPLAY - GET SINGLE AUDIT LOG BY ID
// ==========================================
exports.GetAuditLogById = AsyncErrorHandler(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
            status: "fail",
            message: "Invalid audit log ID",
        });
    }

    const auditLog = await AuditLog.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(id),
            }
        },
        {
            $lookup: {
                from: "employees",
                localField: "user.employeeRef",
                foreignField: "_id",
                as: "employee",
            },
        },
        {
            $unwind: {
                path: "$employee",
                preserveNullAndEmptyArrays: true,
            },
        },
        {
            $project: {
                _id: 1,
                timestamp: 1,
                log_id: 1,
                event_type: 1,
                action: 1,
                user: 1,
                ip_address: 1,
                status: 1,
                details: 1,
                session_id: 1,
                user_agent: 1,
                createdAt: 1,
                updatedAt: 1,
                "employee.first_name": 1,
                "employee.middle_name": 1,
                "employee.surname": 1,
                "employee.email": 1,
                "employee.position": 1,
            }
        }
    ]);

    if (!auditLog || auditLog.length === 0) {
        return res.status(404).json({
            status: "fail",
            message: "Audit log not found",
        });
    }

    return res.status(200).json({
        status: "success",
        data: auditLog[0],
    });
});

// ==========================================
// DISPLAY - GET AUDIT LOGS BY USER ID
// ==========================================
exports.GetAuditLogsByUser = AsyncErrorHandler(async (req, res) => {
    const { userId } = req.params;

    if (!userId) {
        return res.status(400).json({
            status: "fail",
            message: "User ID is required",
        });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const result = await AuditLog.aggregate([
        {
            $match: {
                "user.user_id": userId,
            }
        },
        {
            $lookup: {
                from: "employees",
                localField: "user.employeeRef",
                foreignField: "_id",
                as: "employee",
            },
        },
        {
            $unwind: {
                path: "$employee",
                preserveNullAndEmptyArrays: true,
            },
        },
        {
            $sort: {
                timestamp: -1,
            }
        },
        {
            $facet: {
                metadata: [
                    { $count: "totalCount" },
                    {
                        $addFields: {
                            totalPages: {
                                $ceil: {
                                    $divide: ["$totalCount", limit]
                                }
                            },
                            currentPage: page,
                            limit: limit,
                        }
                    }
                ],
                data: [
                    { $skip: skip },
                    { $limit: limit },
                    {
                        $project: {
                            _id: 1,
                            timestamp: 1,
                            log_id: 1,
                            event_type: 1,
                            action: 1,
                            user: 1,
                            ip_address: 1,
                            status: 1,
                            details: 1,
                            session_id: 1,
                            user_agent: 1,
                            createdAt: 1,
                            updatedAt: 1,
                            "employee.first_name": 1,
                            "employee.middle_name": 1,
                            "employee.surname": 1,
                            "employee.email": 1,
                        }
                    }
                ]
            }
        }
    ]);

    const metadata = result[0]?.metadata?.[0] || {
        totalCount: 0,
        totalPages: 0,
        currentPage: page,
        limit: limit
    };

    const data = result[0]?.data || [];

    return res.status(200).json({
        status: "success",
        data: data,
        total: metadata.totalCount,
        totalPages: metadata.totalPages,
        currentPage: metadata.currentPage,
        limit: metadata.limit,
    });
});

// ==========================================
// DISPLAY - GET AUDIT LOG STATISTICS
// ==========================================
exports.GetAuditStatistics = AsyncErrorHandler(async (req, res) => {
    const { dateFrom, dateTo } = req.query;

    // Build match query for date range
    let matchQuery = {};
    if (dateFrom || dateTo) {
        matchQuery.timestamp = {};
        if (dateFrom) {
            matchQuery.timestamp.$gte = dateFrom;
        }
        if (dateTo) {
            matchQuery.timestamp.$lte = dateTo;
        }
    }

    // ========== STATISTICS BY EVENT TYPE ==========
    const eventTypeStats = await AuditLog.aggregate([
        ...(Object.keys(matchQuery).length > 0 ? [{ $match: matchQuery }] : []),
        {
            $group: {
                _id: "$event_type",
                count: { $sum: 1 },
                uniqueUsers: { $addToSet: "$user.user_id" },
                failedCount: {
                    $sum: {
                        $cond: [{ $eq: ["$status", "FAILED"] }, 1, 0]
                    }
                },
                successCount: {
                    $sum: {
                        $cond: [{ $eq: ["$status", "SUCCESS"] }, 1, 0]
                    }
                }
            }
        },
        {
            $project: {
                event_type: "$_id",
                count: 1,
                uniqueUsers: { $size: "$uniqueUsers" },
                failedCount: 1,
                successCount: 1,
                _id: 0,
            }
        },
        {
            $sort: { count: -1 }
        }
    ]);

    // ========== STATISTICS BY STATUS ==========
    const statusStats = await AuditLog.aggregate([
        ...(Object.keys(matchQuery).length > 0 ? [{ $match: matchQuery }] : []),
        {
            $group: {
                _id: "$status",
                count: { $sum: 1 },
            }
        },
        {
            $project: {
                status: "$_id",
                count: 1,
                _id: 0,
            }
        },
        {
            $sort: { count: -1 }
        }
    ]);

    // ========== TOTAL COUNTS ==========
    const totalCount = await AuditLog.countDocuments(matchQuery);

    // ========== RECENT ACTIVITY ==========
    const recentActivity = await AuditLog.aggregate([
        ...(Object.keys(matchQuery).length > 0 ? [{ $match: matchQuery }] : []),
        {
            $sort: { timestamp: -1 }
        },
        {
            $limit: 10
        },
        {
            $project: {
                log_id: 1,
                event_type: 1,
                action: 1,
                "user.username": 1,
                status: 1,
                timestamp: 1,
            }
        }
    ]);

    return res.status(200).json({
        status: "success",
        data: {
            total: totalCount,
            byEventType: eventTypeStats,
            byStatus: statusStats,
            recentActivity: recentActivity,
        }
    });
});

// ==========================================
// DISPLAY - GET AVAILABLE FILTER OPTIONS
// ==========================================
exports.GetFilterOptions = AsyncErrorHandler(async (req, res) => {
    // Get distinct event types
    const eventTypes = await AuditLog.distinct("event_type");

    // Get distinct statuses
    const statuses = await AuditLog.distinct("status");

    // Get distinct actions (limited to 50 most common)
    const actions = await AuditLog.aggregate([
        {
            $group: {
                _id: "$action",
                count: { $sum: 1 }
            }
        },
        {
            $sort: { count: -1 }
        },
        {
            $limit: 50
        },
        {
            $project: {
                action: "$_id",
                count: 1,
                _id: 0
            }
        }
    ]);

    // Get date range
    const dateRange = await AuditLog.aggregate([
        {
            $group: {
                _id: null,
                earliest: { $min: "$timestamp" },
                latest: { $max: "$timestamp" }
            }
        },
        {
            $project: {
                _id: 0,
                earliest: 1,
                latest: 1
            }
        }
    ]);

    return res.status(200).json({
        status: "success",
        data: {
            eventTypes: eventTypes.sort(),
            statuses: statuses.sort(),
            actions: actions,
            dateRange: dateRange[0] || { earliest: null, latest: null },
        }
    });
});

// ==========================================
// DELETE - DELETE SINGLE AUDIT LOG
// ==========================================
exports.DeleteAuditLog = AsyncErrorHandler(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
            status: "fail",
            message: "Invalid audit log ID",
        });
    }

    const deleted = await AuditLog.findByIdAndDelete(id);

    if (!deleted) {
        return res.status(404).json({
            status: "fail",
            message: "Audit log not found",
        });
    }

    return res.status(200).json({
        status: "success",
        message: "Audit log deleted successfully",
        data: deleted,
    });
});

// ==========================================
// DELETE - DELETE MULTIPLE AUDIT LOGS (BULK)
// ==========================================
exports.DeleteMultipleAuditLogs = AsyncErrorHandler(async (req, res) => {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
            status: "fail",
            message: "Please provide an array of audit log IDs",
        });
    }

    // Validate all IDs
    const invalidIds = ids.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
        return res.status(400).json({
            status: "fail",
            message: `Invalid IDs: ${invalidIds.join(", ")}`,
        });
    }

    // Convert to ObjectIds
    const objectIds = ids.map(id => new mongoose.Types.ObjectId(id));

    // Delete all
    const result = await AuditLog.deleteMany({
        _id: { $in: objectIds }
    });

    if (result.deletedCount === 0) {
        return res.status(404).json({
            status: "fail",
            message: "No audit logs found to delete",
        });
    }

    return res.status(200).json({
        status: "success",
        message: `${result.deletedCount} audit log(s) deleted successfully`,
        deletedCount: result.deletedCount,
    });
});

// ==========================================
// DELETE - DELETE OLD AUDIT LOGS (BY DATE)
// ==========================================
exports.DeleteOldAuditLogs = AsyncErrorHandler(async (req, res) => {
    const { beforeDate } = req.query;

    if (!beforeDate) {
        return res.status(400).json({
            status: "fail",
            message: "Please provide 'beforeDate' query parameter (YYYY-MM-DD)",
        });
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(beforeDate)) {
        return res.status(400).json({
            status: "fail",
            message: "Invalid date format. Use YYYY-MM-DD",
        });
    }

    const deleteDate = new Date(beforeDate);
    deleteDate.setHours(23, 59, 59, 999);

    const result = await AuditLog.deleteMany({
        createdAt: { $lte: deleteDate }
    });

    return res.status(200).json({
        status: "success",
        message: `${result.deletedCount} audit log(s) deleted successfully`,
        deletedCount: result.deletedCount,
        beforeDate: beforeDate,
    });
});

// ==========================================
// DELETE - DELETE ALL AUDIT LOGS
// ==========================================
exports.DeleteAllAuditLogs = AsyncErrorHandler(async (req, res) => {
    const { confirm } = req.query;

    // Safety check - require confirmation
    if (confirm !== 'true') {
        return res.status(400).json({
            status: "fail",
            message: "Confirmation required. Set confirm=true to delete all logs",
        });
    }

    const result = await AuditLog.deleteMany({});

    return res.status(200).json({
        status: "success",
        message: `All ${result.deletedCount} audit logs deleted successfully`,
        deletedCount: result.deletedCount,
    });
});