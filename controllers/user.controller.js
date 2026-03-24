const { validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const HttpError = require('../models/http-error.model');
const User = require('../models/user.model');
const Otp = require('../models/otp.model');
const { sendOtpEmail } = require('../services/email.service');

const JWT_SECRET = process.env.JWT;
const OTP_TTL_HOURS = 3;
const OTP_TTL_MS = OTP_TTL_HOURS * 60 * 60 * 1000;

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
    purpose,
    expiresAt: new Date(Date.now() + OTP_TTL_MS)
  });

  await sendOtpEmail(email, otp, {
    purpose,
    expiresInHours: OTP_TTL_HOURS
  });
};

const buildAuthPayload = user => ({
  userId: user.id || user._id,
  email: user.email,
  role: user.role
});

const issueToken = user => {
  if (!JWT_SECRET) {
    throw new Error('Thiếu JWT secret trong biến môi trường.');
  }

  return jwt.sign(buildAuthPayload(user), JWT_SECRET, { expiresIn: '1h' });
};

const createPendingUser = async ({ name, email, password, role }) => {
  const existingUser = await User.findOne({ email, isDeleted: { $ne: true } });
  if (existingUser) {
    throw new HttpError('Email đã tồn tại trong hệ thống.', 422);
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

  return createdUser;
};

const signup = async (_req, _res, next) => {
  return next(
    new HttpError('Tài khoản nội bộ do admin tạo. Vui lòng liên hệ admin để được cấp tài khoản.', 403)
  );
};

const createInternalUser = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new HttpError('Dữ liệu đầu vào không hợp lệ.', 422));
  }

  const { name, email, password, role } = req.body;

  try {
    const createdUser = await createPendingUser({ name, email, password, role });
    const safeUser = await User.findById(createdUser._id).select('-password');

    return res.status(201).json({
      message: 'Admin đã tạo tài khoản thành công. Nhân viên cần kiểm tra Gmail và nhập OTP trong 3 giờ để kích hoạt.',
      user: safeUser,
      email: createdUser.email
    });
  } catch (error) {
    return next(error instanceof HttpError ? error : new HttpError('Tạo tài khoản nội bộ thất bại.', 500));
  }
};

const login = async (req, res, next) => {
  const { email, password } = req.body;
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return next(new HttpError('Dữ liệu đầu vào không hợp lệ, vui lòng kiểm tra lại.', 422));
  }

  let existingUser;

  try {
    existingUser = await User.findOne({ email, isDeleted: { $ne: true } });
  } catch (_err) {
    return next(new HttpError('Đăng nhập thất bại, vui lòng thử lại sau.', 500));
  }

  if (!existingUser) {
    return next(new HttpError('Thông tin đăng nhập không đúng.', 401));
  }

  if (existingUser.status !== 'active') {
    return next(new HttpError('Tài khoản chưa được kích hoạt. Vui lòng kiểm tra Gmail và xác minh OTP.', 403));
  }

  let isValidPassword = false;

  try {
    isValidPassword = await bcrypt.compare(password, existingUser.password);
  } catch (_err) {
    return next(new HttpError('Không thể đăng nhập lúc này, vui lòng thử lại.', 500));
  }

  if (!isValidPassword) {
    return next(new HttpError('Thông tin đăng nhập không đúng.', 401));
  }

  try {
    const token = issueToken(existingUser);

    return res.json({
      userId: existingUser.id,
      email: existingUser.email,
      role: existingUser.role,
      expiration: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      token
    });
  } catch (err) {
    return next(new HttpError(err.message || 'Đăng nhập thất bại, vui lòng thử lại sau.', 500));
  }
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

    if (otpRecord.expiresAt && otpRecord.expiresAt.getTime() < Date.now()) {
      await Otp.deleteOne({ _id: otpRecord._id });
      return next(new HttpError('OTP đã hết hạn. Vui lòng liên hệ admin để được cấp lại mã.', 400));
    }

    const isMatch = await bcrypt.compare(otp, otpRecord.otp);
    if (!isMatch) {
      return next(new HttpError('Mã OTP không đúng.', 400));
    }

    const existingUser = await User.findOne({ email, isDeleted: { $ne: true } });
    if (!existingUser) {
      return next(new HttpError('Không tìm thấy người dùng.', 404));
    }

    existingUser.status = 'active';
    await existingUser.save();

    await Otp.deleteMany({ email, purpose: OTP_PURPOSES.verifyEmail });

    const token = issueToken(existingUser);

    return res.status(200).json({
      message: 'Xác minh email thành công.',
      userId: existingUser._id,
      email: existingUser.email,
      role: existingUser.role,
      expiration: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      token
    });
  } catch (_err) {
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
    const existingUser = await User.findOne({ email, isDeleted: { $ne: true } });

    if (!existingUser) {
      return next(new HttpError('Email không tồn tại trong hệ thống.', 404));
    }

    if (existingUser.status !== 'active') {
      return next(new HttpError('Tài khoản chưa được kích hoạt.', 403));
    }

    await createAndSendOtp(email, OTP_PURPOSES.resetPassword);

    return res.status(200).json({
      email,
      message: 'Đã gửi mã OTP về email của bạn. Mã có hiệu lực trong 3 giờ.'
    });
  } catch (_err) {
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
    const existingUser = await User.findOne({ email, isDeleted: { $ne: true } });
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

    if (otpRecord.expiresAt && otpRecord.expiresAt.getTime() < Date.now()) {
      await Otp.deleteOne({ _id: otpRecord._id });
      return next(new HttpError('OTP đã hết hạn. Vui lòng yêu cầu mã mới.', 400));
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
  } catch (_err) {
    return next(new HttpError('Không thể đặt lại mật khẩu.', 500));
  }
};

const getAllUsers = async (_req, res, next) => {
  try {
    const users = await User.find({ isDeleted: { $ne: true } })
      .select('-password')
      .sort({ createdAt: -1 });

    return res.json({
      users,
      total: users.length
    });
  } catch (_err) {
    return next(new HttpError('Lấy danh sách người dùng thất bại.', 500));
  }
};

const getUserById = async (req, res, next) => {
  const { id } = req.params;

  try {
    const user = await User.findOne({ _id: id, isDeleted: { $ne: true } }).select('-password');

    if (!user) {
      return next(new HttpError('Không tìm thấy người dùng.', 404));
    }

    return res.json({ user });
  } catch (_err) {
    return next(new HttpError('Lấy thông tin người dùng thất bại.', 500));
  }
};

const updateUser = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new HttpError('Dữ liệu đầu vào không hợp lệ.', 422));
  }

  const { id } = req.params;
  const { name, email, role, status } = req.body;

  try {
    const user = await User.findOne({ _id: id, isDeleted: { $ne: true } });

    if (!user) {
      return next(new HttpError('Không tìm thấy người dùng.', 404));
    }

    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email, isDeleted: { $ne: true } });
      if (existingUser) {
        return next(new HttpError('Email đã được sử dụng.', 422));
      }
      user.email = email;
    }

    user.name = name || user.name;
    user.role = role || user.role;
    user.status = status || user.status;

    await user.save();

    const updatedUser = await User.findById(id).select('-password');

    return res.json({
      message: 'Cập nhật người dùng thành công.',
      user: updatedUser
    });
  } catch (_err) {
    return next(new HttpError('Cập nhật người dùng thất bại.', 500));
  }
};

const deleteUser = async (req, res, next) => {
  const { id } = req.params;

  try {
    const user = await User.findOne({ _id: id, isDeleted: { $ne: true } });

    if (!user) {
      return next(new HttpError('Không tìm thấy người dùng.', 404));
    }

    if (user._id.toString() === req.userData.userId) {
      return next(new HttpError('Không thể xóa chính tài khoản admin đang đăng nhập.', 403));
    }

    user.isDeleted = true;
    user.deletedAt = new Date();
    user.status = 'blocked';
    await user.save();

    return res.json({
      message: 'Đã ẩn người dùng khỏi hệ thống.'
    });
  } catch (_err) {
    return next(new HttpError('Xóa người dùng thất bại.', 500));
  }
};

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

    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return next(new HttpError('Mật khẩu hiện tại không đúng.', 401));
    }

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    return res.json({
      message: 'Đổi mật khẩu thành công.'
    });
  } catch (_err) {
    return next(new HttpError('Đổi mật khẩu thất bại.', 500));
  }
};

const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.userData.userId).select('-password');

    if (!user) {
      return next(new HttpError('Không tìm thấy người dùng.', 404));
    }

    return res.json({ user });
  } catch (_err) {
    return next(new HttpError('Lấy thông tin cá nhân thất bại.', 500));
  }
};

exports.login = login;
exports.signup = signup;
exports.createInternalUser = createInternalUser;
exports.verifyEmail = verifyEmail;
exports.forgotPassword = forgotPassword;
exports.resetPassword = resetPassword;
exports.getAllUsers = getAllUsers;
exports.getUserById = getUserById;
exports.updateUser = updateUser;
exports.deleteUser = deleteUser;
exports.changePassword = changePassword;
exports.getProfile = getProfile;
