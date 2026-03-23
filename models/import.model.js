const mongoose = require("mongoose");

const importSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
    },

    importPrice: {
      type: Number,
      required: true,
    },

    manufactureDate: {
      type: Date,
    },

    expiryDate: {
      type: Date, // ngày hết hạn
      required: true,
    },

    importedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // manager
      required: true,
    },

    note: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Import", importSchema);
