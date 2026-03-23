const mongoose = require("mongoose");

// Schema cho từng sản phẩm trong đơn xuất
const exportItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  productName: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  unit: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  totalPrice: {
    type: Number,
    required: true,
  },
  // Lưu thông tin các lô hàng đã xuất (FIFO)
  batchesUsed: [{
    batchId: mongoose.Schema.Types.ObjectId,
    quantity: Number,
    importPrice: Number,
  }],
});

const exportSchema = new mongoose.Schema(
  {
    items: [exportItemSchema],

    totalAmount: {
      type: Number,
      required: true,
    },

    exportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // staff
      required: true,
    },

    note: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: ["completed", "cancelled"],
      default: "completed",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Export", exportSchema);
