const express = require('express');

const inventoryController = require('../controllers/inventory.controller');
const checkAuth = require('../middleware/check-auth');
const checkRole = require('../middleware/check-role');

const router = express.Router();

router.use(checkAuth);

router.get('/products-in-stock', checkRole('staff', 'admin', 'manager'), inventoryController.getProductsInStock);
router.get('/', checkRole('admin', 'manager'), inventoryController.getAllInventories);
router.get('/product/:productId', checkRole('admin', 'manager'), inventoryController.getInventoryByProduct);
router.get('/expiring/batches', checkRole('admin', 'manager'), inventoryController.getExpiringBatches);
router.get('/expired/batches', checkRole('admin', 'manager'), inventoryController.getExpiredBatches);
// Protected routes
router.use(checkAuth); // Kiểm tra authentication

// Route cho Staff - Lấy sản phẩm có trong kho (để bán hàng)
// QUAN TRỌNG: Route này phải đặt TRƯỚC checkRole để staff có thể truy cập
router.get('/products-in-stock', inventoryController.getProductsInStock);

// Routes cho Admin và Manager - Áp dụng checkRole cho từng route cụ thể
// Lấy tất cả inventory
router.get('/', checkRole('admin', 'manager'), inventoryController.getAllInventories);

// Lấy inventory theo sản phẩm
router.get('/product/:productId', checkRole('admin', 'manager'), inventoryController.getInventoryByProduct);

// Lấy các lô hàng sắp hết hạn (có thể truyền ?days=7)
router.get('/expiring/batches', checkRole('admin', 'manager'), inventoryController.getExpiringBatches);

// Lấy các lô hàng đã hết hạn
router.get('/expired/batches', checkRole('admin', 'manager'), inventoryController.getExpiredBatches);

// Lấy thống kê tồn kho
router.get('/stats/summary', checkRole('admin', 'manager'), inventoryController.getInventoryStats);

module.exports = router;
