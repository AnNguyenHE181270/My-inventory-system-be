const mongoose = require('mongoose');

const importSchema = new mongoose.Schema(
  {
    importCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true
    },
    supplierName: {
      type: String,
      default: '',
      trim: true
    },
    supplierPhone: {
      type: String,
      default: '',
      trim: true
    },
    supplierEmail: {
      type: String,
      default: '',
      trim: true
    },
    items: {
      type: [
        {
          product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
          },
          quantity: {
            type: Number,
            required: true,
            min: 1
          },
          importPrice: {
            type: Number,
            required: true,
            min: 0
          },
          manufactureDate: {
            type: Date
          },
          expiryDate: {
            type: Date
          },
          batchCode: {
            type: String,
            trim: true,
            default: ''
          },
          lineTotal: {
            type: Number,
            required: true,
            min: 0
          }
        }
      ],
      default: []
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending'
    },
    importedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    approvedAt: {
      type: Date,
      default: null
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    rejectedAt: {
      type: Date,
      default: null
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    cancelledAt: {
      type: Date,
      default: null
    },
    decisionNote: {
      type: String,
      default: '',
      trim: true
    },
    note: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Import', importSchema);
