const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

exports.sendOtpEmail = async (to, otp, options = {}) => {
  const { purpose = 'verify-email', expiresInHours = 3 } = options;
  const isResetPassword = purpose === 'reset-password';

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject: isResetPassword ? 'Mã OTP đặt lại mật khẩu' : 'Mã OTP kích hoạt tài khoản nội bộ',
    text: isResetPassword
      ? `Mã OTP đặt lại mật khẩu của bạn là ${otp}. Mã có hiệu lực trong ${expiresInHours} giờ.`
      : `Admin đã tạo tài khoản nội bộ cho bạn. Mã OTP kích hoạt là ${otp}. Mã có hiệu lực trong ${expiresInHours} giờ.`
  });
};
