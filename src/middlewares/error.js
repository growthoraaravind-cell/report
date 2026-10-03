import { logger } from '../utils/logger.js';
export const notFound = (req, res) => res.status(404).json({ success: false, message: 'We could not find that page', data: null });
export const errorHandler = (err, req, res, _next) => {
  let status = err.status || (err.name === 'MulterError' ? 400 : 500);
  let message = err.message;
  if (err.code === 'LIMIT_FILE_SIZE') { status = 413; message = 'File is too large'; }
  if (err.name === 'CastError') { status = 400; message = 'Invalid id'; }
  if (err.code === 11000) { status = 409; message = 'This record already exists'; }
  if (status >= 500) { logger.error(err); message = 'Something went wrong on our side. Please try again'; }
  res.status(status).json({ success: false, message, data: null, meta: err.errors ? { errors: err.errors } : undefined });
};
