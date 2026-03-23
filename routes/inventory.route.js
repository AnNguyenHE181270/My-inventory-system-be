const express = require('express');

const inventoryController = require('../controllers/inventory.controller');
const checkAuth = require('../middleware/check-auth');
const checkRole = require('../middleware/check-role');

const router = express.Router();

// Protected routes - Admin và Manager có thể xem
router.use(checkAuth); // Kiểm tra authentication
router.use(checkRole('admin', 'manager')); // Chỉ admin và manager

// Lấy tất cả inventory
router.get('/', inventoryController.getAllInventories);

// Lấy inventory theo sản phẩm
router.get('/product/:productId', inventoryController.getInventoryByProduct);

// Lấy các lô hàng sắp hết hạn (có thể truyền ?days=7)
router.get('/expiring/batches', inventoryController.getExpiringBatches);

// Lấy các lô hàng đã hết hạn
router.get('/expired/batches', inventoryController.getExpiredBatches);

// Lấy thống kê tồn kho
router.get('/stats/summary', inventoryController.getInventoryStats);

module.exports = router;
