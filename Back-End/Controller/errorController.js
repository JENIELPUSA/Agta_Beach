const CustomError = require('../Utils/CustomError');

const devErrors = (res, error) => {
  res.status(error.statusCode).json({
    status: error.statusCode,
    message: error.message,
    stackTrace: error.stack,
    error: error,
  });
};

const castErrorHandler = (err) => {
  const msg = `This ID: ${err.value} is not found!`;
  return new CustomError(msg, 400);
};

const duplicateErrorHandler = (err) => {
  const field = Object.keys(err.keyValue)[0];
  const value = err.keyValue[field];
  const msg = `Duplicate value: '${value}' for field '${field}'.`;
  return new CustomError(msg, 400);
};

const validationErrorHandler = (err) => {
  const errors = Object.values(err.errors).map((val) => val.message);
  const msg = errors.join('. ');
  return new CustomError(msg, 400);
};

const handleExpiredJWT = () => {
  return new CustomError('JWT has expired. Please login again.', 401);
};

const handleJWTError = () => {
  return new CustomError('Invalid token. Please login again.', 401);
};

const prodErrors = (res, error) => {
  if (error.isOperational) {
    res.status(error.statusCode).json({
      status: error.statusCode,
      message: error.message,
    });
  } else {
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong! Please try again later...',
    });
  }
};

module.exports = (error, req, res, next) => {
  if (res.headersSent) {
    return next(error); // ✅ Prevent double response
  }

  error.statusCode = error.statusCode || 500;
  error.status = error.status || 'error';

  // JWT handling (global)
  if (error.name === 'TokenExpiredError') error = handleExpiredJWT();
  if (error.name === 'JsonWebTokenError') error = handleJWTError();

  if (process.env.NODE_ENV === 'development') {
    devErrors(res, error);
  } else if (process.env.NODE_ENV === 'production') {
    // Transform known errors
    if (error.name === 'CastError') error = castErrorHandler(error);
    if (error.code === 11000) error = duplicateErrorHandler(error);
    if (error.name === 'ValidationError') error = validationErrorHandler(error);
    if (error.name === 'TokenExpiredError') error = handleExpiredJWT();
    if (error.name === 'JsonWebTokenError') error = handleJWTError();

    prodErrors(res, error);
  }
};
