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
  }
};

exports.createExport = createExport;
exports.getExports = getExports;
