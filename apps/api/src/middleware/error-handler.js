function sendError(req, res, status, code, message) {
  res.status(status).json({
    success: false,
    error: { code, message },
    requestId: req.requestId,
  });
}

export function notFound(req, res) {
  sendError(req, res, 404, 'NOT_FOUND', 'Endpoint not found.');
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error.type === 'entity.parse.failed') {
    return sendError(
      req,
      res,
      400,
      'INVALID_JSON',
      'The request body must be valid JSON.',
    );
  }
  if (error.type === 'entity.too.large') {
    return sendError(
      req,
      res,
      413,
      'PAYLOAD_TOO_LARGE',
      'The request body is too large.',
    );
  }
  console.error('Request failed', {
    requestId: req.requestId,
    stack: error.stack,
  });
  return sendError(
    req,
    res,
    500,
    'INTERNAL_ERROR',
    'Something went wrong. Please try again.',
  );
}
