exports.notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

exports.errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message;

  if (err.name === 'CastError') { message = 'Resource not found.'; statusCode = 404; }
  if (err.code === 11000) { message = `Duplicate value: ${Object.keys(err.keyValue).join(', ')} already exists.`; statusCode = 400; }
  if (err.name === 'ValidationError') { message = Object.values(err.errors).map(e => e.message).join(', '); statusCode = 400; }

  res.status(statusCode).json({
    message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};
