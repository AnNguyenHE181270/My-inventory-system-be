const { validationResult } = require('express-validator');
const HttpError = require('../models/http-error.model');
const Product = require('../models/product.model');
const Unit = require('../models/unit.model');

// Tạo sản phẩm mới (chỉ admin)
const createProduct = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new HttpError('Invalid inputs', 422));
  }

  const { name, price, description, image, unit } = req.body;

  try {
    // Kiểm tra unit có tồn tại không
    const unitExists = await Unit.findById(unit);
    if (!unitExists || !unitExists.isActive) {
      return next(new HttpError('Unit not found or inactive.', 404));
    }

    const newProduct = await Product.create({
      name,
      price,
      description,
      image,
      unit,
      createdBy: req.userData.userId
    });

    const populatedProduct = await Product.findById(newProduct._id)
      .populate('unit', 'name symbol')
      .populate('createdBy', 'name email');

    res.status(201).json({
      message: 'Product created successfully.',
      product: populatedProduct
    });
  } catch (err) {
    return next(new HttpError('Creating product failed.', 500));
  }
};

// Lấy tất cả sản phẩm
const getAllProducts = async (req, res, next) => {
  try {
    const products = await Product.find({ isActive: true })
      .populate('unit', 'name symbol')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      products,
      total: products.length
    });
  } catch (err) {
    return next(new HttpError('Lấy danh sách sản phẩm thất bại.', 500));
  }
};

// Lấy sản phẩm theo ID
const getProductById = async (req, res, next) => {
  const { id } = req.params;

  try {
    const product = await Product.findById(id)
      .populate('unit', 'name symbol')
      .populate('createdBy', 'name email');

    if (!product) {
      return next(new HttpError('Product not found.', 404));
    }

    res.json({ product });
  } catch (err) {
    return next(new HttpError('Lấy thông tin sản phẩm thất bại.', 500));
  }
};

// Cập nhật sản phẩm (chỉ admin)
const updateProduct = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new HttpError('Invalid inputs', 422));
  }

  const { id } = req.params;
  const { name, price, description, image, unit } = req.body;

  try {
    const product = await Product.findById(id);

    if (!product) {
      return next(new HttpError('Product not found.', 404));
    }

    // Nếu có thay đổi unit, kiểm tra unit mới
    if (unit && unit !== product.unit.toString()) {
      const unitExists = await Unit.findById(unit);
      if (!unitExists || !unitExists.isActive) {
        return next(new HttpError('Unit not found or inactive.', 404));
      }
      product.unit = unit;
    }

    product.name = name || product.name;
    product.price = price !== undefined ? price : product.price;
    product.description = description !== undefined ? description : product.description;
    product.image = image !== undefined ? image : product.image;

    await product.save();

    const updatedProduct = await Product.findById(id)
      .populate('unit', 'name symbol')
      .populate('createdBy', 'name email');

    res.json({
      message: 'Product updated successfully.',
      product: updatedProduct
    });
  } catch (err) {
    return next(new HttpError('Updating product failed.', 500));
  }
};

// Xóa sản phẩm (soft delete - chỉ admin)
const deleteProduct = async (req, res, next) => {
  const { id } = req.params;

  try {
    const product = await Product.findById(id);

    if (!product) {
      return next(new HttpError('Product not found.', 404));
    }

    product.isActive = false;
    await product.save();

    res.json({
      message: 'Product deleted successfully.'
    });
  } catch (err) {
    return next(new HttpError('Deleting product failed.', 500));
  }
};

exports.createProduct = createProduct;
exports.getAllProducts = getAllProducts;
exports.getProductById = getProductById;
exports.updateProduct = updateProduct;
exports.deleteProduct = deleteProduct;
