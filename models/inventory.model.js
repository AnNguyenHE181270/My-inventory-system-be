const mongoose = require("mongoose");

// Schema cho từng lô hàng trong kho
const batchSchema = new mongoose.Schema({
  importId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Import",
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 0,
  },
  importPrice: {
    type: Number,
    required: true,
  },
  manufactureDate: {
    type: Date,
  },
  expiryDate: {
    type: Date,
    required: true,
  },
  importedAt: {
    type: Date,
    required: true,
  },
  importedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
});

const inventorySchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      unique: true,
    },

    batches: [batchSchema], // Danh sách các lô hàng

    totalQuantity: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Method để lấy các lô hàng sắp hết hạn
inventorySchema.methods.getExpiringBatches = function (daysThreshold = 7) {
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);

  return this.batches.filter(
    (batch) => batch.quantity > 0 && batch.expiryDate <= thresholdDate
  );
};

// Method để lấy các lô hàng đã hết hạn
inventorySchema.methods.getExpiredBatches = function () {
  const now = new Date();
  return this.batches.filter(
    (batch) => batch.quantity > 0 && batch.expiryDate < now
  );
};

// Method để lấy lô hàng cũ nhất (FIFO - First In First Out)
inventorySchema.methods.getOldestBatch = function () {
  const availableBatches = this.batches.filter((batch) => batch.quantity > 0);
  if (availableBatches.length === 0) return null;

  return availableBatches.reduce((oldest, current) =>
    current.importedAt < oldest.importedAt ? current : oldest
  );
};

// Method để cập nhật tổng số lượng
inventorySchema.methods.updateTotalQuantity = function () {
  this.totalQuantity = this.batches.reduce(
    (total, batch) => total + batch.quantity,
    0
  );
};

module.exports = mongoose.model("Inventory", inventorySchema);
