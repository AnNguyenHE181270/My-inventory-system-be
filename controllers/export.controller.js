const Export = require('../models/export.model');
const HttpError = require('../models/http-error.model');
const Inventory = require('../models/inventory.model');
const Product = require('../models/product.model');

const buildExportCode = () => `PX${Date.now().toString().slice(-8)}`;

const consumeBatches = (inventory, quantity) => {
  let remaining = quantity;
  const sortedBatches = [...inventory.batches].sort(
    (a, b) => new Date(a.importedAt || 0).getTime() - new Date(b.importedAt || 0).getTime()
  );

  sortedBatches.forEach(batch => {
    if (remaining <= 0) return;
    const usable = Math.min(batch.quantity, remaining);
    batch.quantity -= usable;
    remaining -= usable;
  });

  inventory.batches = sortedBatches.filter(batch => batch.quantity > 0);
  return remaining;
};

const createExport = async (req, res, next) => {
  const { items = [], customerName = '', note = '', discountTotal = 0, paidAmount = 0 } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return next(new HttpError('Giỏ hàng không được để trống.', 422));
  }

  try {
    const productIds = items.map(item => item.productId || item.product).filter(Boolean);
    const products = await Product.find({ _id: { $in: productIds }, isActive: true }).populate('unit', 'name symbol');
    const inventories = await Inventory.find({ product: { $in: productIds } });

    const productMap = new Map(products.map(product => [String(product._id), product]));
    const inventoryMap = new Map(inventories.map(inventory => [String(inventory.product), inventory]));

    const normalizedItems = [];
    let subtotal = 0;

    for (const rawItem of items) {
      const productId = String(rawItem.productId || rawItem.product || '');
      const quantity = Number(rawItem.quantity || 0);
      const itemDiscount = Number(rawItem.discount || 0);

      const product = productMap.get(productId);
      const inventory = inventoryMap.get(productId);

      if (!product || !inventory) {
        return next(new HttpError('Có sản phẩm không tồn tại trong kho.', 404));
      }

      if (!quantity || quantity < 1) {
        return next(new HttpError('Số lượng bán phải lớn hơn 0.', 422));
      }

      if (inventory.availableQuantity < quantity) {
        return next(new HttpError(`Sản phẩm ${product.name} chỉ còn ${inventory.availableQuantity} trong kho.`, 422));
      }

      const price = Number(rawItem.price != null ? rawItem.price : product.price || 0);
      const lineTotal = Math.max(0, price * quantity - itemDiscount);

      normalizedItems.push({
        product: product._id,
        productNameSnapshot: product.name,
        skuSnapshot: product.sku || '',
        barcodeSnapshot: product.barcode || '',
        unitNameSnapshot: product.unit?.name || product.unit?.symbol || '',
        price,
        quantity,
        discount: itemDiscount,
        lineTotal
      });

      subtotal += lineTotal;
    }

    for (const item of normalizedItems) {
      const inventory = inventoryMap.get(String(item.product));
      const remaining = consumeBatches(inventory, item.quantity);

      if (remaining > 0) {
        return next(new HttpError('Dữ liệu lô hàng không đủ để xuất kho.', 500));
      }

      inventory.availableQuantity = Math.max(0, inventory.availableQuantity - item.quantity);
      inventory.totalQuantity = Math.max(0, inventory.totalQuantity - item.quantity);
      await inventory.save();
    }

    const totalAmount = Math.max(0, subtotal - Number(discountTotal || 0));
    const numericPaidAmount = Number(paidAmount || 0);
    const changeAmount = Math.max(0, numericPaidAmount - totalAmount);

    const exportRecord = await Export.create({
      exportCode: buildExportCode(),
      customerName,
      note,
      items: normalizedItems,
      subtotal,
      discountTotal: Number(discountTotal || 0),
      totalAmount,
      paidAmount: numericPaidAmount,
      changeAmount,
      status: 'completed',
      exportedBy: req.userData.userId
    });

    const populatedExport = await Export.findById(exportRecord._id)
      .populate('exportedBy', 'name email')
      .populate('items.product', 'name sku barcode');

    res.status(201).json({
      message: 'Thanh toán và xuất kho thành công.',
      exportRecord: populatedExport
    });
  } catch (err) {
    return next(new HttpError(err.message || 'Tạo phiếu xuất thất bại.', 500));
  }
};

const getExports = async (req, res, next) => {
  try {
    const exports = await Export.find({ exportedBy: req.userData.userId })
      .populate('exportedBy', 'name email')
      .populate('items.product', 'name sku barcode')
      .sort({ createdAt: -1 });

    res.json({ exports });
  } catch (err) {
    return next(new HttpError('Lấy danh sách phiếu xuất thất bại.', 500));
const { validationResult } = require("express-validator");
const mongoose = require("mongoose");

const HttpError = require("../models/http-error.model");
const Export = require("../models/export.model");
const Inventory = require("../models/inventory.model");
const Product = require("../models/product.model");

// Tạo đơn xuất kho (bán hàng)
const createExport = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new HttpError("Invalid inputs passed.", 422));
  }

  const { items, note } = req.body;
  const exportedBy = req.userData.userId;

  if (!items || items.length === 0) {
    return next(new HttpError("Items list cannot be empty.", 422));
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const exportItems = [];
    let totalAmount = 0;

    // Xử lý từng sản phẩm trong đơn
    for (const item of items) {
      const { productId, quantity } = item;

      // Kiểm tra sản phẩm
      const product = await Product.findById(productId)
        .populate("unit")
        .session(session);

      if (!product) {
        throw new HttpError(`Product ${productId} not found.`, 404);
      }

      if (!product.isActive) {
        throw new HttpError(`Product ${product.name} is not active.`, 400);
      }

      // Kiểm tra tồn kho
      const inventory = await Inventory.findOne({ product: productId }).session(
        session
      );

      if (!inventory || inventory.totalQuantity < quantity) {
        throw new HttpError(
          `Insufficient stock for ${product.name}. Available: ${
            inventory ? inventory.totalQuantity : 0
          }, Requested: ${quantity}`,
          400
        );
      }

      // Xuất kho theo FIFO (First In First Out)
      let remainingQuantity = quantity;
      const batchesUsed = [];

      // Sắp xếp các lô hàng theo thời gian nhập (cũ nhất trước)
      const availableBatches = inventory.batches
        .filter((batch) => batch.quantity > 0)
        .sort((a, b) => a.importedAt - b.importedAt);

      for (const batch of availableBatches) {
        if (remainingQuantity <= 0) break;

        const quantityToTake = Math.min(batch.quantity, remainingQuantity);

        batchesUsed.push({
          batchId: batch._id,
          quantity: quantityToTake,
          importPrice: batch.importPrice,
        });

        batch.quantity -= quantityToTake;
        remainingQuantity -= quantityToTake;
      }

      // Cập nhật tổng số lượng trong kho
      inventory.updateTotalQuantity();
      await inventory.save({ session });

      // Tính tổng tiền cho sản phẩm này
      const itemTotalPrice = product.price * quantity;
      totalAmount += itemTotalPrice;

      exportItems.push({
        product: productId,
        productName: product.name,
        quantity,
        unit: product.unit.name,
        price: product.price,
        totalPrice: itemTotalPrice,
        batchesUsed,
      });
    }

    // Tạo đơn xuất
    const newExport = new Export({
      items: exportItems,
      totalAmount,
      exportedBy,
      note: note || "",
      status: "completed",
    });

    await newExport.save({ session });
    await session.commitTransaction();

    res.status(201).json({
      message: "Export created successfully.",
      export: newExport,
    });
  } catch (err) {
    await session.abortTransaction();
    return next(
      err instanceof HttpError
        ? err
        : new HttpError("Creating export failed.", 500)
    );
  } finally {
    session.endSession();
  }
};

// Lấy tất cả đơn xuất
const getAllExports = async (req, res, next) => {
  try {
    const exports = await Export.find()
      .populate("exportedBy", "name email")
      .sort({ createdAt: -1 });

    res.json({
      exports: exports.map((exp) => exp.toObject({ getters: true })),
    });
  } catch (err) {
    return next(new HttpError("Fetching exports failed.", 500));
  }
};

// Lấy đơn xuất theo ID
const getExportById = async (req, res, next) => {
  const exportId = req.params.id;

  try {
    const exportDoc = await Export.findById(exportId)
      .populate("exportedBy", "name email")
      .populate("items.product");

    if (!exportDoc) {
      return next(new HttpError("Export not found.", 404));
    }

    res.json({ export: exportDoc.toObject({ getters: true }) });
  } catch (err) {
    return next(new HttpError("Fetching export failed.", 500));
  }
};

// Lấy đơn xuất theo người xuất
const getExportsByUser = async (req, res, next) => {
  const userId = req.params.userId;

  try {
    const exports = await Export.find({ exportedBy: userId })
      .populate("exportedBy", "name email")
      .sort({ createdAt: -1 });

    res.json({
      exports: exports.map((exp) => exp.toObject({ getters: true })),
    });
  } catch (err) {
    return next(new HttpError("Fetching exports failed.", 500));
  }
};

// Lấy đơn xuất của chính mình (cho Staff)
const getMyExports = async (req, res, next) => {
  const userId = req.userData.userId; // Lấy từ token

  try {
    const exports = await Export.find({ exportedBy: userId })
      .populate("exportedBy", "name email")
      .sort({ createdAt: -1 });

    res.json({
      exports: exports.map((exp) => exp.toObject({ getters: true })),
    });
  } catch (err) {
    return next(new HttpError("Fetching exports failed.", 500));
  }
};

// Hủy đơn xuất (chỉ có thể hủy trong thời gian ngắn sau khi tạo)
const cancelExport = async (req, res, next) => {
  const exportId = req.params.id;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const exportDoc = await Export.findById(exportId).session(session);

    if (!exportDoc) {
      throw new HttpError("Export not found.", 404);
    }

    if (exportDoc.status === "cancelled") {
      throw new HttpError("Export already cancelled.", 400);
    }

    // Hoàn trả số lượng vào kho
    for (const item of exportDoc.items) {
      const inventory = await Inventory.findOne({
        product: item.product,
      }).session(session);

      if (inventory) {
        // Hoàn trả số lượng vào các lô hàng đã xuất
        for (const batchUsed of item.batchesUsed) {
          const batch = inventory.batches.id(batchUsed.batchId);
          if (batch) {
            batch.quantity += batchUsed.quantity;
          }
        }

        inventory.updateTotalQuantity();
        await inventory.save({ session });
      }
    }

    exportDoc.status = "cancelled";
    await exportDoc.save({ session });

    await session.commitTransaction();

    res.json({
      message: "Export cancelled successfully.",
      export: exportDoc.toObject({ getters: true }),
    });
  } catch (err) {
    await session.abortTransaction();
    return next(
      err instanceof HttpError
        ? err
        : new HttpError("Cancelling export failed.", 500)
    );
  } finally {
    session.endSession();
  }
};

exports.createExport = createExport;
exports.getExports = getExports;
exports.getAllExports = getAllExports;
exports.getExportById = getExportById;
exports.getExportsByUser = getExportsByUser;
exports.getMyExports = getMyExports;
exports.cancelExport = cancelExport;
