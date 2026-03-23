const { validationResult } = require('express-validator');
const HttpError = require('../models/http-error.model');
const Unit = require('../models/unit.model');

// Tạo đơn vị mới (chỉ admin)
const createUnit = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new HttpError('Invalid inputs', 422));
  }

  const { name, symbol, description } = req.body;

  try {
    const existingUnit = await Unit.findOne({ name });
    if (existingUnit) {
      return next(new HttpError('Unit already exists.', 422));
    }

    const newUnit = await Unit.create({
      name,
      symbol,
      description,
      createdBy: req.userData.userId
    });

    res.status(201).json({
      message: 'Unit created successfully.',
      unit: newUnit
    });
  } catch (err) {
    return next(new HttpError('Creating unit failed.', 500));
  }
};

// Lấy tất cả đơn vị
const getAllUnits = async (req, res, next) => {
  try {
    const units = await Unit.find({ isActive: true })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      units,
      total: units.length
    });
  } catch (err) {
    return next(new HttpError('Lấy danh sách đơn vị thất bại.', 500));
  }
};

// Lấy đơn vị theo ID
const getUnitById = async (req, res, next) => {
  const { id } = req.params;

  try {
    const unit = await Unit.findById(id).populate('createdBy', 'name email');

    if (!unit) {
      return next(new HttpError('Unit not found.', 404));
    }

    res.json({ unit });
  } catch (err) {
    return next(new HttpError('Lấy thông tin đơn vị thất bại.', 500));
  }
};

// Cập nhật đơn vị (chỉ admin)
const updateUnit = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new HttpError('Invalid inputs', 422));
  }

  const { id } = req.params;
  const { name, symbol, description } = req.body;

  try {
    const unit = await Unit.findById(id);

    if (!unit) {
      return next(new HttpError('Unit not found.', 404));
    }

    unit.name = name || unit.name;
    unit.symbol = symbol || unit.symbol;
    unit.description = description || unit.description;

    await unit.save();

    res.json({
      message: 'Unit updated successfully.',
      unit
    });
  } catch (err) {
    return next(new HttpError('Updating unit failed.', 500));
  }
};

// Xóa đơn vị (soft delete - chỉ admin)
const deleteUnit = async (req, res, next) => {
  const { id } = req.params;

  try {
    const unit = await Unit.findById(id);

    if (!unit) {
      return next(new HttpError('Unit not found.', 404));
    }

    unit.isActive = false;
    await unit.save();

    res.json({
      message: 'Unit deleted successfully.'
    });
  } catch (err) {
    return next(new HttpError('Deleting unit failed.', 500));
  }
};

exports.createUnit = createUnit;
exports.getAllUnits = getAllUnits;
exports.getUnitById = getUnitById;
exports.updateUnit = updateUnit;
exports.deleteUnit = deleteUnit;
