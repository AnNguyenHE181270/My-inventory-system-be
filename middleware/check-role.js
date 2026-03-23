const HttpError = require('../models/http-error.model');
const User = require('../models/user.model');

// Middleware kiểm tra role của user
const checkRole = (...allowedRoles) => {
  return async (req, res, next) => {
    try {
      // Lấy thông tin user từ database
      const user = await User.findById(req.userData.userId);

      if (!user) {
        return next(new HttpError('User not found.', 404));
      }

      // Kiểm tra role
      if (!allowedRoles.includes(user.role)) {
        return next(
          new HttpError(
            `Access denied. Required role: ${allowedRoles.join(' or ')}`,
            403
          )
        );
      }

      // Lưu thông tin user vào request để sử dụng sau
      req.user = user;
      next();
    } catch (err) {
      return next(new HttpError('Authorization failed.', 500));
    }
  };
};

module.exports = checkRole;
