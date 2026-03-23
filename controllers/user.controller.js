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
      status: 'pending',
      isVerify: false
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

  if (!existingUser.isVerify || existingUser.status !== 'active') {
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

    if (!existingUser.isVerify) {
      existingUser.isVerify = true;
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

    if (!existingUser.isVerify) {
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
