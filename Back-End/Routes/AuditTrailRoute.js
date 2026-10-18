const express = require("express");
const router = express.Router();
const auditLogController = require("../Controller/AuditTrailController");
const authController = require("../Controller/authController");

// ==========================================
// DISPLAY ROUTES (GET)
// ==========================================

// Get all audit logs with pagination and filters
router
    .route("/")
    .get(
        authController.protect,
        auditLogController.GetAllAuditLogs
    );

// Get audit statistics
router
    .route("/statistics")
    .get(
        authController.protect,
        auditLogController.GetAuditStatistics
    );

// Get filter options
router
    .route("/options")
    .get(
        authController.protect,
        auditLogController.GetFilterOptions
    );

// Get audit logs by user ID
router
    .route("/user/:userId")
    .get(
        authController.protect,
        auditLogController.GetAuditLogsByUser
    );

// Get single audit log by ID (MUST BE LAST)
router
    .route("/:id")
    .get(
        authController.protect,
        auditLogController.GetAuditLogById
    );

// ==========================================
// DELETE ROUTES (DELETE)
// ==========================================

// Delete single audit log (MUST BE LAST sa DELETE)
router
    .route("/:id")
    .delete(
        authController.protect,
        auditLogController.DeleteAuditLog
    );

// Delete multiple audit logs (bulk)
router
    .route("/bulk")
    .delete(
        authController.protect,
        auditLogController.DeleteMultipleAuditLogs
    );

// Delete old audit logs (by date)
router
    .route("/old")
    .delete(
        authController.protect,
        auditLogController.DeleteOldAuditLogs
    );

// Delete all audit logs (with confirmation)
router
    .route("/all")
    .delete(
        authController.protect,
        auditLogController.DeleteAllAuditLogs
    );

module.exports = router;