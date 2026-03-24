const express = require('express');

const exportController = require('../controllers/export.controller');
const checkAuth = require('../middleware/check-auth');
const checkRole = require('../middleware/check-role');

const router = express.Router();

router.use(checkAuth);

router.get('/', checkRole('staff', 'admin'), exportController.getExports);
router.post('/', checkRole('staff'), exportController.createExport);
const express = require("express");
const { check } = require("express-validator");

const exportController = require("../controllers/export.controller");
const checkAuth = require("../middleware/check-auth");
const checkRole = require("../middleware/check-role");

const router = express.Router();

// Protected routes
router.use(checkAuth);

// Lấy đơn xuất của chính mình (Staff) - Phải đặt trước route /:id
router.get(
  "/user/me",
  exportController.getMyExports
);

// Lấy đơn xuất theo user (Admin/Manager xem đơn của user khác)
router.get(
  "/user/:userId",
  checkRole("admin", "manager"),
  exportController.getExportsByUser
);

// Tạo đơn xuất - Staff, Manager, Admin đều có thể tạo
router.post(
  "/",
  checkRole("staff", "manager", "admin"),
  [
    check("items").isArray({ min: 1 }).withMessage("Items must be a non-empty array."),
    check("items.*.productId").trim().notEmpty().withMessage("Product ID is required."),
    check("items.*.quantity").isInt({ min: 1 }).withMessage("Quantity must be at least 1."),
  ],
  exportController.createExport
);

// Lấy danh sách đơn xuất - Admin và Manager có thể xem tất cả
router.get(
  "/",
  checkRole("admin", "manager"),
  exportController.getAllExports
);

// Lấy đơn xuất theo ID - Staff chỉ xem được đơn của mình
router.get("/:id", exportController.getExportById);

// Hủy đơn xuất - Chỉ Manager và Admin
router.patch(
  "/:id/cancel",
  checkRole("manager", "admin"),
  exportController.cancelExport
);

module.exports = router;
