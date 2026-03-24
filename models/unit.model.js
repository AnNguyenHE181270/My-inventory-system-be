const mongoose = require("mongoose");

const unitSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // ví dụ: kg, chai
    description: { type: String, default: "" },
    isActive: { type: Boolean, default: true },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // chủ quán tạo
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Unit", unitSchema);
