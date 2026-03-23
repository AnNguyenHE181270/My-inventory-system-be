const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      unique: true
    },
    totalQuantity: {
      type: Number,
      default: 0,
      min: 0
    },
    availableQuantity: {
      type: Number,
      default: 0,
      min: 0
    },
    minStockLevel: {
      type: Number,
      default: 0,
      min: 0
    },
    batches: {
      type: [
        {
          importId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Import',
            required: true
          },
          batchCode: {
            type: String,
            trim: true,
            default: ''
          },
          quantity: {
            type: Number,
            required: true,
            min: 0
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
          importedAt: {
            type: Date,
            default: Date.now
          },
          importedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
          }
        }
      ],
      default: []
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Inventory', inventorySchema);
