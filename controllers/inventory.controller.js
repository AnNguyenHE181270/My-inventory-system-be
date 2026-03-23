const HttpError = require('../models/http-error.model');
const Inventory = require('../models/inventory.model');
const Product = require('../models/product.model');

// Lấy tất cả inventory
const getAllInventories = async (req, res, next) => {
  try {
    const inventories = await Inventory.find()
      .populate({
        path: 'product',
        select: 'name price unit',
        populate: { path: 'unit', select: 'name symbol' }
      })
      .populate('batches.importedBy', 'name email');

    res.json({
      inventories,
      total: inventories.length
    });
  } catch (err) {
    return next(new HttpError('Fetching inventories failed.', 500));
  }
};

// Lấy inventory theo sản phẩm
const getInventoryByProduct = async (req, res, next) => {
  const { productId } = req.params;

  try {
    const inventory = await Inventory.findOne({ product: productId })
      .populate({
        path: 'product',
        select: 'name price unit',
        populate: { path: 'unit', select: 'name symbol' }
      })
      .populate('batches.importedBy', 'name email');

    if (!inventory) {
      return next(new HttpError('Inventory not found.', 404));
    }

    res.json({ inventory });
  } catch (err) {
    return next(new HttpError('Fetching inventory failed.', 500));
  }
};

// Lấy các lô hàng sắp hết hạn
const getExpiringBatches = async (req, res, next) => {
  const { days = 7 } = req.query;

  try {
    const inventories = await Inventory.find()
      .populate({
        path: 'product',
        select: 'name price unit',
        populate: { path: 'unit', select: 'name symbol' }
      })
      .populate('batches.importedBy', 'name email');

    const expiringItems = [];

    inventories.forEach(inventory => {
      const expiringBatches = inventory.getExpiringBatches(parseInt(days));
      if (expiringBatches.length > 0) {
        expiringItems.push({
          product: inventory.product,
          batches: expiringBatches
        });
      }
    });

    res.json({
      expiringItems,
      total: expiringItems.length,
      daysThreshold: parseInt(days)
    });
  } catch (err) {
    return next(new HttpError('Fetching expiring batches failed.', 500));
  }
};

// Lấy các lô hàng đã hết hạn
const getExpiredBatches = async (req, res, next) => {
  try {
    const inventories = await Inventory.find()
      .populate({
        path: 'product',
        select: 'name price unit',
        populate: { path: 'unit', select: 'name symbol' }
      })
      .populate('batches.importedBy', 'name email');

    const expiredItems = [];

    inventories.forEach(inventory => {
      const expiredBatches = inventory.getExpiredBatches();
      if (expiredBatches.length > 0) {
        expiredItems.push({
          product: inventory.product,
          batches: expiredBatches
        });
      }
    });

    res.json({
      expiredItems,
      total: expiredItems.length
    });
  } catch (err) {
    return next(new HttpError('Fetching expired batches failed.', 500));
  }
};

// Lấy thống kê tồn kho
const getInventoryStats = async (req, res, next) => {
  try {
    const inventories = await Inventory.find()
      .populate('product', 'name price');

    let totalProducts = 0;
    let totalQuantity = 0;
    let expiringCount = 0;
    let expiredCount = 0;

    inventories.forEach(inventory => {
      totalProducts++;
      totalQuantity += inventory.totalQuantity;
      
      const expiring = inventory.getExpiringBatches(7);
      const expired = inventory.getExpiredBatches();
      
      if (expiring.length > 0) expiringCount++;
      if (expired.length > 0) expiredCount++;
    });

    res.json({
      stats: {
        totalProducts,
        totalQuantity,
        expiringProducts: expiringCount,
        expiredProducts: expiredCount
      }
    });
  } catch (err) {
    return next(new HttpError('Fetching inventory stats failed.', 500));
  }
};

exports.getAllInventories = getAllInventories;
exports.getInventoryByProduct = getInventoryByProduct;
exports.getExpiringBatches = getExpiringBatches;
exports.getExpiredBatches = getExpiredBatches;
exports.getInventoryStats = getInventoryStats;
