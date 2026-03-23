const { validationResult } = require('express-validator');
const HttpError = require('../models/http-error.model');
const Import = require('../models/import.model');
const Product = require('../models/product.model');
const Inventory = require('../models/inventory.model');

// Tạo phiếu nhập kho (chỉ manager)
const createImport = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new HttpError('Invalid inputs', 422));
  }

  const { product, quantity, importPrice, manufactureDate, expiryDate, note } = req.body;

  try {
    // Kiểm tra sản phẩm có tồn tại không
    const productExists = await Product.findById(product);
    if (!productExists || !productExists.isActive) {
      return next(new HttpError('Product not found or inactive.', 404));
    }

    // Kiểm tra ngày hết hạn phải sau ngày hiện tại
    if (new Date(expiryDate) <= new Date()) {
      return next(new HttpError('Expiry date must be in the future.', 422));
    }

    // Tạo phiếu nhập
    const newImport = await Import.create({
      product,
      quantity,
      importPrice,
      manufactureDate,
      expiryDate,
      importedBy: req.userData.userId,
      note
    });

    // Cập nhật inventory
    let inventory = await Inventory.findOne({ product });

    if (!inventory) {
      // Tạo mới inventory nếu chưa có
      inventory = await Inventory.create({
        product,
        batches: [],
        totalQuantity: 0
      });
    }

    // Thêm batch mới vào inventory
    inventory.batches.push({
      importId: newImport._id,
      quantity,
      importPrice,
      manufactureDate,
      expiryDate,
      importedAt: new Date(),
      importedBy: req.userData.userId
    });

    // Cập nhật tổng số lượng
    inventory.updateTotalQuantity();
    await inventory.save();

    const populatedImport = await Import.findById(newImport._id)
      .populate('product', 'name price')
      .populate('importedBy', 'name email');

    res.status(201).json({
      message: 'Import created successfully.',
      import: populatedImport,
      inventory: {
        totalQuantity: inventory.totalQuantity,
        batchesCount: inventory.batches.length
      }
    });
  } catch (err) {
    return next(new HttpError('Creating import failed.', 500));
  }
};

// Lấy tất cả phiếu nhập
const getAllImports = async (req, res, next) => {
  try {
    const imports = await Import.find()
      .populate('product', 'name price')
      .populate('importedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      imports,
      total: imports.length
    });
  } catch (err) {
    return next(new HttpError('Fetching imports failed.', 500));
  }
};

// Lấy phiếu nhập theo ID
const getImportById = async (req, res, next) => {
  const { id } = req.params;

  try {
    const importRecord = await Import.findById(id)
      .populate('product', 'name price unit')
      .populate('importedBy', 'name email');

    if (!importRecord) {
      return next(new HttpError('Import not found.', 404));
    }

    res.json({ import: importRecord });
  } catch (err) {
    return next(new HttpError('Fetching import failed.', 500));
  }
};

// Lấy phiếu nhập theo sản phẩm
const getImportsByProduct = async (req, res, next) => {
  const { productId } = req.params;

  try {
    const imports = await Import.find({ product: productId })
      .populate('importedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      imports,
      total: imports.length
    });
  } catch (err) {
    return next(new HttpError('Fetching imports failed.', 500));
  }
};

// Cập nhật phiếu nhập (chỉ manager)
const updateImport = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new HttpError('Invalid inputs', 422));
  }

  const { id } = req.params;
  const { quantity, importPrice, manufactureDate, expiryDate, note } = req.body;

  try {
    const importRecord = await Import.findById(id);

    if (!importRecord) {
      return next(new HttpError('Import not found.', 404));
    }

    // Lưu số lượng cũ để cập nhật inventory
    const oldQuantity = importRecord.quantity;

    importRecord.quantity = quantity !== undefined ? quantity : importRecord.quantity;
    importRecord.importPrice = importPrice !== undefined ? importPrice : importRecord.importPrice;
    importRecord.manufactureDate = manufactureDate || importRecord.manufactureDate;
    importRecord.expiryDate = expiryDate || importRecord.expiryDate;
    importRecord.note = note !== undefined ? note : importRecord.note;

    await importRecord.save();

    // Cập nhật inventory nếu thông tin phụ tùng (số lượng, giá, ngày tháng) thay đổi
    const needsInventoryUpdate = 
      quantity !== undefined || 
      importPrice !== undefined || 
      manufactureDate !== undefined || 
      expiryDate !== undefined;

    if (needsInventoryUpdate) {
      const inventory = await Inventory.findOne({ product: importRecord.product });
      if (inventory) {
        const batch = inventory.batches.find(
          b => b.importId.toString() === id
        );
        if (batch) {
          batch.quantity = importRecord.quantity;
          batch.importPrice = importRecord.importPrice;
          batch.manufactureDate = importRecord.manufactureDate;
          batch.expiryDate = importRecord.expiryDate;

          inventory.updateTotalQuantity();
          await inventory.save();
        }
      }
    }

    const updatedImport = await Import.findById(id)
      .populate('product', 'name price')
      .populate('importedBy', 'name email');

    res.json({
      message: 'Import updated successfully.',
      import: updatedImport
    });
  } catch (err) {
    return next(new HttpError('Updating import failed.', 500));
  }
};

exports.createImport = createImport;
exports.getAllImports = getAllImports;
exports.getImportById = getImportById;
exports.getImportsByProduct = getImportsByProduct;
exports.updateImport = updateImport;
