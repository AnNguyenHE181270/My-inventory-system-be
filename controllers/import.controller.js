const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

const HttpError = require('../models/http-error.model');
const Import = require('../models/import.model');
const Product = require('../models/product.model');
const Inventory = require('../models/inventory.model');

const importPopulate = [
  { path: 'items.product', select: 'name sku barcode price unit' },
  { path: 'importedBy', select: 'name email role' },
  { path: 'approvedBy', select: 'name email role' },
  { path: 'rejectedBy', select: 'name email role' },
  { path: 'cancelledBy', select: 'name email role' }
];

const ensurePendingImport = importRecord => {
  if (!importRecord) {
    throw new HttpError('Không tìm thấy phiếu nhập.', 404);
  }

  if (importRecord.status !== 'pending') {
    throw new HttpError('Chỉ phiếu nhập chờ duyệt mới có thể thay đổi.', 409);
  }
};

const populateImport = importId => Import.findById(importId).populate(importPopulate);

const normalizeItems = async items => {
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new HttpError('Items must not be empty.', 422);
  }

  const normalizedItems = [];
  let totalAmount = 0;

  for (const item of items) {
    if (!mongoose.Types.ObjectId.isValid(item.product)) {
      throw new HttpError('Mã sản phẩm không hợp lệ.', 422);
    }

    const productExists = await Product.findById(item.product);
    if (!productExists || !productExists.isActive) {
      throw new HttpError('Product not found or inactive.', 404);
    }

    const quantity = Number(item.quantity);
    const importPrice = Number(item.importPrice);

    if (!quantity || quantity < 1) {
      throw new HttpError('Quantity must be at least 1.', 422);
    }

    if (Number.isNaN(importPrice) || importPrice < 0) {
      throw new HttpError('Import price must be valid.', 422);
    }

    if (item.expiryDate && new Date(item.expiryDate) <= new Date()) {
      throw new HttpError('Expiry date must be in the future.', 422);
    }

    if (
      item.manufactureDate &&
      item.expiryDate &&
      new Date(item.manufactureDate) >= new Date(item.expiryDate)
    ) {
      throw new HttpError('Manufacture date must be before expiry date.', 422);
    }

    const lineTotal = quantity * importPrice;
    totalAmount += lineTotal;

    normalizedItems.push({
      product: item.product,
      quantity,
      importPrice,
      manufactureDate: item.manufactureDate || null,
      expiryDate: item.expiryDate || null,
      batchCode: item.batchCode || '',
      lineTotal
    });
  }

  return { normalizedItems, totalAmount };
};

const applyInventoryForImport = async (importRecord, actorId) => {
  for (const item of importRecord.items) {
    let inventory = await Inventory.findOne({ product: item.product });

    if (!inventory) {
      inventory = await Inventory.create({
        product: item.product,
        totalQuantity: 0,
        availableQuantity: 0,
        minStockLevel: 0,
        batches: []
      });
    }

    inventory.batches.push({
      importId: importRecord._id,
      batchCode: item.batchCode || '',
      quantity: item.quantity,
      importPrice: item.importPrice,
      manufactureDate: item.manufactureDate,
      expiryDate: item.expiryDate,
      importedAt: new Date(),
      importedBy: actorId
    });

    inventory.totalQuantity += item.quantity;
    inventory.availableQuantity += item.quantity;
    await inventory.save();
  }
};

const createImport = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new HttpError('Dữ liệu đầu vào không hợp lệ.', 422));
  }

  const {
    importCode,
    supplierName,
    supplierPhone,
    supplierEmail,
    items,
    note
  } = req.body;

  try {
    const { normalizedItems, totalAmount } = await normalizeItems(items);

    const newImport = await Import.create({
      importCode,
      supplierName,
      supplierPhone,
      supplierEmail,
      items: normalizedItems,
      totalAmount,
      status: 'pending',
      importedBy: req.user._id,
      note
    });

    const populatedImport = await populateImport(newImport._id);

    res.status(201).json({
      message: 'Tạo phiếu nhập thành công và đang chờ admin duyệt.',
      import: populatedImport
    });
  } catch (err) {
    return next(err instanceof HttpError ? err : new HttpError('Tạo phiếu nhập thất bại.', 500));
  }
};

const updateImport = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new HttpError('Dữ liệu đầu vào không hợp lệ.', 422));
  }

  const { id } = req.params;
  const {
    importCode,
    supplierName,
    supplierPhone,
    supplierEmail,
    items,
    note
  } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new HttpError('Mã phiếu nhập không hợp lệ.', 422));
  }

  try {
    const importRecord = await Import.findById(id);
    ensurePendingImport(importRecord);

    if (String(importRecord.importedBy) !== String(req.user._id)) {
      return next(new HttpError('Bạn chỉ có thể sửa phiếu nhập chờ duyệt do chính mình tạo.', 403));
    }

    const { normalizedItems, totalAmount } = await normalizeItems(items);

    importRecord.importCode = importCode;
    importRecord.supplierName = supplierName || '';
    importRecord.supplierPhone = supplierPhone || '';
    importRecord.supplierEmail = supplierEmail || '';
    importRecord.items = normalizedItems;
    importRecord.totalAmount = totalAmount;
    importRecord.note = note || '';
    await importRecord.save();

    const populatedImport = await populateImport(importRecord._id);

    res.json({
      message: 'Cập nhật phiếu nhập chờ duyệt thành công.',
      import: populatedImport
    });
  } catch (err) {
    return next(err instanceof HttpError ? err : new HttpError('Cập nhật phiếu nhập thất bại.', 500));
  }
};

const approveImport = async (req, res, next) => {
  const { id } = req.params;
  const { decisionNote } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new HttpError('Mã phiếu nhập không hợp lệ.', 422));
  }

  try {
    const importRecord = await Import.findById(id);
    ensurePendingImport(importRecord);

    await applyInventoryForImport(importRecord, req.user._id);

    importRecord.status = 'approved';
    importRecord.approvedBy = req.user._id;
    importRecord.approvedAt = new Date();
    importRecord.decisionNote = decisionNote || '';
    await importRecord.save();

    const populatedImport = await populateImport(importRecord._id);

    res.json({
      message: 'Duyệt phiếu nhập thành công và đã cập nhật tồn kho.',
      import: populatedImport
    });
  } catch (err) {
    return next(err instanceof HttpError ? err : new HttpError('Duyệt phiếu nhập thất bại.', 500));
  }
};

const rejectImport = async (req, res, next) => {
  const { id } = req.params;
  const { decisionNote } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new HttpError('Mã phiếu nhập không hợp lệ.', 422));
  }

  try {
    const importRecord = await Import.findById(id);
    ensurePendingImport(importRecord);

    importRecord.status = 'rejected';
    importRecord.rejectedBy = req.user._id;
    importRecord.rejectedAt = new Date();
    importRecord.decisionNote = decisionNote || '';
    await importRecord.save();

    const populatedImport = await populateImport(importRecord._id);

    res.json({
      message: 'Từ chối phiếu nhập thành công.',
      import: populatedImport
    });
  } catch (err) {
    return next(err instanceof HttpError ? err : new HttpError('Từ chối phiếu nhập thất bại.', 500));
  }
};

const cancelImport = async (req, res, next) => {
  const { id } = req.params;
  const { decisionNote } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new HttpError('Mã phiếu nhập không hợp lệ.', 422));
  }

  try {
    const importRecord = await Import.findById(id);
    ensurePendingImport(importRecord);

    if (req.user.role !== 'admin' && String(importRecord.importedBy) !== String(req.user._id)) {
      return next(new HttpError('Bạn chỉ có thể hủy phiếu nhập chờ duyệt do chính mình tạo.', 403));
    }

    importRecord.status = 'cancelled';
    importRecord.cancelledBy = req.user._id;
    importRecord.cancelledAt = new Date();
    importRecord.decisionNote = decisionNote || '';
    await importRecord.save();

    const populatedImport = await populateImport(importRecord._id);

    res.json({
      message: 'Hủy phiếu nhập thành công.',
      import: populatedImport
    });
  } catch (err) {
    return next(err instanceof HttpError ? err : new HttpError('Hủy phiếu nhập thất bại.', 500));
  }
};

const getAllImports = async (req, res, next) => {
  try {
    const query = req.user.role === 'manager' ? { importedBy: req.user._id } : {};

    const imports = await Import.find(query)
      .populate(importPopulate)
      .sort({ createdAt: -1 });

    res.json({
      imports,
      total: imports.length
    });
  } catch (err) {
    return next(new HttpError('Lấy danh sách phiếu nhập thất bại.', 500));
  }
};

const getImportById = async (req, res, next) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new HttpError('Mã phiếu nhập không hợp lệ.', 422));
  }

  try {
    const importRecord = await populateImport(id);

    if (!importRecord) {
      return next(new HttpError('Không tìm thấy phiếu nhập.', 404));
    }

    if (req.user.role === 'manager' && String(importRecord.importedBy._id) !== String(req.user._id)) {
      return next(new HttpError('Bạn không có quyền truy cập phiếu nhập này.', 403));
    }

    res.json({ import: importRecord });
  } catch (err) {
    return next(new HttpError('Lấy chi tiết phiếu nhập thất bại.', 500));
  }
};

const getImportsByProduct = async (req, res, next) => {
  const { productId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return next(new HttpError('Mã sản phẩm không hợp lệ.', 422));
  }

  try {
    const query = { 'items.product': productId };
    if (req.user.role === 'manager') {
      query.importedBy = req.user._id;
    }

    const imports = await Import.find(query)
      .populate(importPopulate)
      .sort({ createdAt: -1 });

    res.json({
      imports,
      total: imports.length
    });
  } catch (err) {
    return next(new HttpError('Lấy danh sách phiếu nhập thất bại.', 500));
  }
};

const deleteImport = async (req, res, next) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new HttpError('Mã phiếu nhập không hợp lệ.', 422));
  }

  try {
    const importRecord = await Import.findById(id);
    if (!importRecord) {
      return next(new HttpError('Không tìm thấy phiếu nhập.', 404));
    }

    if (importRecord.status === 'approved') {
       return next(new HttpError('Không thể xóa phiếu nhập đã duyệt vì hệ thống đã ghi nhận tồn kho. Cần phải huỷ hoặc làm thao tác xuất kho.', 409));
    }

    await importRecord.deleteOne();
    res.json({ message: 'Đã dọn dẹp phiếu nhập thành công.' });
  } catch (err) {
    return next(new HttpError('Xóa phiếu nhập thất bại.', 500));
  }
};

exports.createImport = createImport;
exports.updateImport = updateImport;
exports.approveImport = approveImport;
exports.rejectImport = rejectImport;
exports.cancelImport = cancelImport;
exports.getAllImports = getAllImports;
exports.getImportById = getImportById;
exports.getImportsByProduct = getImportsByProduct;
exports.deleteImport = deleteImport;
