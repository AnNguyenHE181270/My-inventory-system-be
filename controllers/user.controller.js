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
    return next(new HttpError('Invalid inputs', 422));
  }

  let existingUser;

  try {
    existingUser = await User.findOne({ email });

    if (existingUser) {
      return next(
        new HttpError("User exists already, please login instead.", 422)
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
      message: 'Dang ky thanh cong. Vui long kiem tra Gmail de lay ma xac thuc.'
    });

  } catch (error) {
    return next(new HttpError('Signup failed, please try again.', 500));
  }
};

const login = async (req, res, next) => {
  const { email, password } = req.body;
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return next(new HttpError('Invalid inputs passed, please check your data.', 422));
  }

  if (!JWT_SECRET) {
    return next(new HttpError('Missing JWT secret in environment variables.', 500));
  }

  let existingUser;

  try {
    existingUser = await User.findOne({ email: email });
  } catch (err) {
    return next(
      new HttpError('Logging in failed, please try again later.', 500),
    );
  }

  if (!existingUser) {
    return next(
      new HttpError('Invalid credentials, could not log you in.', 401),
    );
  }

  if (existingUser.status !== 'active') {
    return next(
      new HttpError('Tai khoan chua duoc xac minh email.', 403)
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
      new HttpError('Invalid credentials, could not log you in.', 401),
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
      'Logging in failed, please try again later',
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
    return next(new HttpError("Email and OTP are required.", 400));
  }

  try {
    const otpRecord = await Otp.findOne({
      email,
      purpose: OTP_PURPOSES.verifyEmail
    });
    if (!otpRecord) {
      return next(new HttpError("OTP expired or not found.", 400));
    }

    const isMatch = await bcrypt.compare(otp, otpRecord.otp);
    if (!isMatch) {
      return next(new HttpError("Invalid OTP.", 400));
    }

    const existingUser = await User.findOne({ email });
    if (!existingUser) {
      return next(new HttpError("User not found.", 404));
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
      message: "Email verified successfully.",
      userId: existingUser._id,
      email: existingUser.email,
      role: existingUser.role,
      expiration: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      token
    });
  } catch (err) {
    return next(new HttpError("Verification failed.", 500));
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
      return next(new HttpError('Email khong ton tai trong he thong.', 404));
    }

    if (existingUser.status !== 'active') {
      return next(new HttpError('Tai khoan chua duoc xac minh email.', 403));
    }

    await createAndSendOtp(email, OTP_PURPOSES.resetPassword);

    return res.status(200).json({
      email,
      message: 'Da gui ma OTP ve email cua ban.'
    });
  } catch (err) {
    return next(new HttpError('Khong the gui ma OTP luc nay.', 500));
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
      return next(new HttpError('Email khong ton tai trong he thong.', 404));
    }

    const otpRecord = await Otp.findOne({
      email,
      purpose: OTP_PURPOSES.resetPassword
    });
    if (!otpRecord) {
      return next(new HttpError('OTP da het han hoac khong ton tai.', 400));
    }

    const isMatch = await bcrypt.compare(otp, otpRecord.otp);
    if (!isMatch) {
      return next(new HttpError('Ma OTP khong dung.', 400));
    }

    existingUser.password = await bcrypt.hash(newPassword, 12);
    await existingUser.save();

    await Otp.deleteMany({ email, purpose: OTP_PURPOSES.resetPassword });

    return res.status(200).json({
      message: 'Doi mat khau thanh cong. Ban co the dang nhap lai.'
    });
  } catch (err) {
    return next(new HttpError('Khong the dat lai mat khau.', 500));
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
    return next(new HttpError('Fetching users failed.', 500));
  }
};

// Lấy user theo ID (chỉ admin)
const getUserById = async (req, res, next) => {
  const { id } = req.params;

  try {
    const user = await User.findById(id).select('-password');

    if (!user) {
      return next(new HttpError('User not found.', 404));
    }

    res.json({ user });
  } catch (err) {
    return next(new HttpError('Fetching user failed.', 500));
  }
};

// Cập nhật user (chỉ admin)
const updateUser = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new HttpError('Invalid inputs', 422));
  }

  const { id } = req.params;
  const { name, email, role, status } = req.body;

  try {
    const user = await User.findById(id);

    if (!user) {
      return next(new HttpError('User not found.', 404));
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
      return next(new HttpError('User not found.', 404));
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
    return next(new HttpError('Invalid inputs', 422));
  }

  const { currentPassword, newPassword } = req.body;

  try {
    const user = await User.findById(req.userData.userId);

    if (!user) {
      return next(new HttpError('User not found.', 404));
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
