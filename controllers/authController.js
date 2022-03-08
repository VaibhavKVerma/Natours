const { promisify } = require('util');
const User = require('../models/userModel');
const catchAsync = require('../utils/catchError');
const jwt = require('jsonwebtoken');
const AppError = require('../utils/appError');
const sendEmail = require('../utils/email');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

// IMPORTANT
const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);

  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    // secure: true,
    httpOnly: true,
  };

  res.cookie('jwt', token, cookieOptions);

  user.password = undefined;

  res.status(statusCode).json({
    status: 'Success',
    token,
    data: {
      user,
    },
  });
};

exports.signUp = catchAsync(async (req, res, next) => {
  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
    role: req.body.role,
  });
  createSendToken(newUser, 201, res);
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  //1 Check email & password exists
  if (!email || !password)
    return next(new AppError('Please provide email and password', 400));
  //2 Check if user exists & password is correct
  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError('Incorrect email or password', 401));
  }

  //3 If everything is correct send token
  createSendToken(user, 200, res);
});

exports.logout = (req, res) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now()),
    httpOnly: true,
  });
  res.status(200).json({
    status: 'success',
  });
};

exports.protect = catchAsync(async (req, res, next) => {
  //1 Getting token and check if it exists
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }
  // console.log(token);
  if (!token) {
    return next(new AppError('You are not logged in!Please LOGIN'), 401);
  }
  //2 Verify token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  //3 Check user still exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser)
    return next(new AppError('The user with token is invalid'), 401);
  //4 Check if user changes password after token was issued
  if (currentUser.changedPasswordAfter(decoded.iat) === true) {
    return next(new AppError('The user changed the password'), 401);
  }
  //GRANT ACCESS TO PROTECTED ROUTE
  req.user = currentUser;
  res.locals.user = currentUser;
  next();
});

//Only for render pages
exports.isLoggedIn = async (req, res, next) => {
  if (req.cookies.jwt) {
    //1 Verify token
    try {
      const decoded = await promisify(jwt.verify)(
        req.cookies.jwt,
        process.env.JWT_SECRET
      );

      //2 Check user still exists
      const currentUser = await User.findById(decoded.id);
      if (!currentUser) return next();

      //4 Check if user changes password after token was issued
      if (currentUser.changedPasswordAfter(decoded.iat) === true) {
        return next();
      }

      //User logged in
      res.locals.user = currentUser;
      return next();
    } catch (error) {
      return next();
    }
  }
  next();
};

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError('Permission not allowed'), 403);
    }
    next();
  };
};

exports.forgotPassword = catchAsync(async (req, res, next) => {
  //1 Get User based on posted email
  const user = await User.findOne({ email: req.body.email });
  if (!user) return next(new AppError('No User exist with this email id'), 404);

  //2 Generate random token
  const resetToken = user.createPasswordResetToken();
  // console.log(resetToken);
  await user.save({ validateBeforeSave: false });
  // console.log(user);
  //3 Send it to user's email
  const resetURL = `${req.protocol}://${req.get(
    'host'
  )}api/v1/users/resetPassword/${resetToken}`;

  const message = `Forgot Your Password? Submit a PATCH request with your new Password and new Password Confirm to ${resetURL}.\nIf you didn't forget your password please ignore this email!`;

  try {
    await sendEmail({
      email: user.email,
      subject: 'Your password reset token (valid for 10mins)',
      message,
    });
    res.status(200).json({
      status: 'success',
      message: 'Token sent to email',
    });
  } catch (error) {
    user.createPasswordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });
    return next(new AppError('Error sending email! Try again later!', 500));
  }
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  // 1 Get user based on the token
  const hashedToken = crypto
    .createHash('sha256', req.params.token)
    .digest('hex');

  // console.log(req.params.token, hashedToken);
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });
  // 2 If token has not expired and there is user set the new password
  if (!user) return next(new AppError('Invalid token or expired'), 400);
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.createPasswordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();
  // 3 Update changedPasswordAt  property of the user

  // 4 Log the user in send JWT
  createSendToken(user, 200, res);
});

exports.updatePassword = catchAsync(async (req, res, next) => {
  // 1 User from collection
  const user = await User.findById(req.user.id).select('+password');

  // 2 Check if Post current pass is correct
  if (!(await user.correctPassword(req.body.passwordCurrent, user.password))) {
    return next(new AppError('Password invalid'), 400);
  }
  // 3 If so,update Password
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  await user.save();
  // 4 Log in send JWT
  createSendToken(user, 200, res);
});
