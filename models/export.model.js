const mongoose = require('mongoose');

const exportItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    productNameSnapshot: {
      type: String,
      required: true,
      trim: true
    },
    skuSnapshot: {
      type: String,
      default: '',
      trim: true
    },
    barcodeSnapshot: {
      type: String,
      default: '',
      trim: true
    },
    unitNameSnapshot: {
      type: String,
      default: '',
      trim: true
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    discount: {
      type: Number,
      default: 0,
      min: 0
    },
    lineTotal: {
      type: Number,
      required: true,
      min: 0
    }
  },
  { _id: false }
);

const exportSchema = new mongoose.Schema(
  {
    exportCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true
    },
    customerName: {
      type: String,
      default: '',
      trim: true
    },
    note: {
      type: String,
      default: '',
      trim: true
    },
    items: {
      type: [exportItemSchema],
      required: true,
      default: []
    },
    subtotal: {
      type: Number,
      default: 0,
      min: 0
    },
    discountTotal: {
      type: Number,
      default: 0,
      min: 0
    },
    totalAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    changeAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    status: {
      type: String,
      enum: ['draft', 'completed', 'cancelled'],
      default: 'completed'
    },
    exportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Export', exportSchema);
