const { validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const HttpError = require('../models/http-error.model');
const User = require('../models/user.model');
const Otp = require('../models/otp.model');
const { sendOtpEmail } = require('../services/email.service');

const JWT_SECRET = process.env.JWT;
const OTP_PURPOSES = {
  verifyEmail: 'verify-email',
  resetPassword: 'reset-password'
};

const createAndSendOtp = async (email, purpose) => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const hashedOtp = await bcrypt.hash(otp, 12);

  await Otp.findOneAndDelete({ email, purpose });
  await Otp.create({
    email,
    otp: hashedOtp,
    purpose
  });

  await sendOtpEmail(email, otp);
};

const signup = async (req, res, next) => {
  const { name, email, password, role } = req.body;

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new HttpError('Dữ liệu đầu vào không hợp lệ.', 422));
  }

  let existingUser;

  try {
    existingUser = await User.findOne({ email });

    if (existingUser) {
      return next(
        new HttpError('Người dùng đã tồn tại, vui lòng đăng nhập.', 422)
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const createdUser = await User.create({
      name,
      email,
      password: hashedPassword,
      avatar: null,
      role,
      status: 'pending'
    });

    await createAndSendOtp(email, OTP_PURPOSES.verifyEmail);

    res.status(201).json({
      userId: createdUser._id,
      email: createdUser.email,
      message: 'Đăng ký thành công. Vui lòng kiểm tra Gmail để lấy mã xác thực.'
    });

  } catch (error) {
    return next(new HttpError('Đăng ký thất bại, vui lòng thử lại.', 500));
  }
};

const login = async (req, res, next) => {
  const { email, password } = req.body;
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return next(new HttpError('Dữ liệu đầu vào không hợp lệ, vui lòng kiểm tra lại.', 422));
  }

  if (!JWT_SECRET) {
    return next(new HttpError('Thiếu JWT secret trong biến môi trường.', 500));
  }

  let existingUser;

  try {
    existingUser = await User.findOne({ email: email });
  } catch (err) {
    return next(
      new HttpError('Đăng nhập thất bại, vui lòng thử lại sau.', 500),
    );
  }

  if (!existingUser) {
    return next(
      new HttpError('Thông tin đăng nhập không đúng.', 401),
    );
  }

  if (existingUser.status !== 'active') {
    return next(
      new HttpError('Tài khoản chưa được xác minh email.', 403)
    );
  }

  let isValidPassword = false;

  try {
    isValidPassword = await bcrypt.compare(password, existingUser.password);
  } catch (err) {
    return next(new HttpError('Could not log you in, please try again.', 500));
  }

  if (!isValidPassword) {
    return next(
      new HttpError('Thông tin đăng nhập không đúng.', 401),
    );
  }

  let token;

  try {
    token = jwt.sign(
      { userId: existingUser.id, email: existingUser.email, role: existingUser.role },
      JWT_SECRET,
      { expiresIn: "1h" },
    );
  } catch (err) {
    const error = new HttpError(
      'Đăng nhập thất bại, vui lòng thử lại sau.',
      500
    )
    return next(error);
  }

  res.json({
    userId: existingUser.id,
    email: existingUser.email,
    role: existingUser.role,
    expiration: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    token: token
  });
};


const verifyEmail = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new HttpError(errors.array()[0].msg, 422));
  }

  const { email, otp } = req.body;
  if (!email || !otp) {
    return next(new HttpError('Email và OTP là bắt buộc.', 400));
  }

  try {
    const otpRecord = await Otp.findOne({
      email,
      purpose: OTP_PURPOSES.verifyEmail
    });
    if (!otpRecord) {
      return next(new HttpError('OTP đã hết hạn hoặc không tồn tại.', 400));
    }

    const isMatch = await bcrypt.compare(otp, otpRecord.otp);
    if (!isMatch) {
      return next(new HttpError('Mã OTP không đúng.', 400));
    }

    const existingUser = await User.findOne({ email });
    if (!existingUser) {
      return next(new HttpError('Không tìm thấy người dùng.', 404));
    }

    existingUser.status = 'active';
    await existingUser.save();

    await Otp.deleteMany({ email, purpose: OTP_PURPOSES.verifyEmail });

    const token = jwt.sign(
      {
        userId: existingUser._id,
        email: existingUser.email,
        role: existingUser.role
      },
      JWT_SECRET,
      { expiresIn: "1h" },
    );

    return res.status(200).json({
      message: 'Xác minh email thành công.',
      userId: existingUser._id,
      email: existingUser.email,
      role: existingUser.role,
      expiration: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      token
    });
  } catch (err) {
    return next(new HttpError('Xác minh email thất bại.', 500));
  }
};

const forgotPassword = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new HttpError(errors.array()[0].msg, 422));
  }

  const { email } = req.body;

  try {
    const existingUser = await User.findOne({ email });

    if (!existingUser) {
      return next(new HttpError('Email không tồn tại trong hệ thống.', 404));
    }

    if (existingUser.status !== 'active') {
      return next(new HttpError('Tài khoản chưa được xác minh email.', 403));
    }

    await createAndSendOtp(email, OTP_PURPOSES.resetPassword);

    return res.status(200).json({
      email,
      message: 'Đã gửi mã OTP về email của bạn.'
    });
  } catch (err) {
    return next(new HttpError('Không thể gửi mã OTP lúc này.', 500));
  }
};

const resetPassword = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new HttpError(errors.array()[0].msg, 422));
  }

  const { email, otp, newPassword } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (!existingUser) {
      return next(new HttpError('Email không tồn tại trong hệ thống.', 404));
    }

    const otpRecord = await Otp.findOne({
      email,
      purpose: OTP_PURPOSES.resetPassword
    });
    if (!otpRecord) {
      return next(new HttpError('OTP đã hết hạn hoặc không tồn tại.', 400));
    }

    const isMatch = await bcrypt.compare(otp, otpRecord.otp);
    if (!isMatch) {
      return next(new HttpError('Mã OTP không đúng.', 400));
    }

    existingUser.password = await bcrypt.hash(newPassword, 12);
    await existingUser.save();

    await Otp.deleteMany({ email, purpose: OTP_PURPOSES.resetPassword });

    return res.status(200).json({
      message: 'Đổi mật khẩu thành công. Bạn có thể đăng nhập lại.'
    });
  } catch (err) {
    return next(new HttpError('Không thể đặt lại mật khẩu.', 500));
  }
};

exports.login = login;
exports.signup = signup;
exports.verifyEmail = verifyEmail;
exports.forgotPassword = forgotPassword;
exports.resetPassword = resetPassword;


// Lấy tất cả users (chỉ admin)
const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({
      users,
      total: users.length
    });
  } catch (err) {
    return next(new HttpError('Lấy danh sách người dùng thất bại.', 500));
  }
};

// Lấy user theo ID (chỉ admin)
const getUserById = async (req, res, next) => {
  const { id } = req.params;

  try {
    const user = await User.findById(id).select('-password');

    if (!user) {
      return next(new HttpError('Không tìm thấy người dùng.', 404));
    }

    res.json({ user });
  } catch (err) {
    return next(new HttpError('Lấy thông tin người dùng thất bại.', 500));
  }
};

// Cập nhật user (chỉ admin)
const updateUser = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new HttpError('Dữ liệu đầu vào không hợp lệ.', 422));
  }

  const { id } = req.params;
  const { name, email, role, status } = req.body;

  try {
    const user = await User.findById(id);

    if (!user) {
      return next(new HttpError('Không tìm thấy người dùng.', 404));
    }

    // Kiểm tra email mới có bị trùng không
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return next(new HttpError('Email already in use.', 422));
      }
      user.email = email;
    }

    user.name = name || user.name;
    user.role = role || user.role;
    user.status = status || user.status;

    await user.save();

    const updatedUser = await User.findById(id).select('-password');

    res.json({
      message: 'User updated successfully.',
      user: updatedUser
    });
  } catch (err) {
    return next(new HttpError('Updating user failed.', 500));
  }
};

// Xóa user (chỉ admin)
const deleteUser = async (req, res, next) => {
  const { id } = req.params;

  try {
    const user = await User.findById(id);

    if (!user) {
      return next(new HttpError('Không tìm thấy người dùng.', 404));
    }

    // Không cho phép xóa chính mình
    if (user._id.toString() === req.userData.userId) {
      return next(new HttpError('Cannot delete your own account.', 403));
    }

    await User.findByIdAndDelete(id);

    res.json({
      message: 'User deleted successfully.'
    });
  } catch (err) {
    return next(new HttpError('Deleting user failed.', 500));
  }
};

// Thay đổi mật khẩu (user tự thay đổi)
const changePassword = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new HttpError('Dữ liệu đầu vào không hợp lệ.', 422));
  }

  const { currentPassword, newPassword } = req.body;

  try {
    const user = await User.findById(req.userData.userId);

    if (!user) {
      return next(new HttpError('Không tìm thấy người dùng.', 404));
    }

    // Kiểm tra mật khẩu hiện tại
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return next(new HttpError('Current password is incorrect.', 401));
    }

    // Cập nhật mật khẩu mới
    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    res.json({
      message: 'Password changed successfully.'
    });
  } catch (err) {
    return next(new HttpError('Changing password failed.', 500));
  }
};

exports.getAllUsers = getAllUsers;
exports.getUserById = getUserById;
exports.updateUser = updateUser;
exports.deleteUser = deleteUser;
exports.changePassword = changePassword;
