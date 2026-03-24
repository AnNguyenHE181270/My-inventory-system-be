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
router.get('/stats/summary', checkRole('admin', 'manager'), inventoryController.getInventoryStats);

module.exports = router;
