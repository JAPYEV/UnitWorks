import { HttpError, fromDbError } from '../lib/errors.js';

export function notFound(req, res) {
  res.status(404).json({ error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` } });
}

// Central error handler: every failure becomes { error: { code, message, details? } }.
// Express identifies error middleware by its four parameters, so `next` must stay.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed') err = new HttpError(400, 'Request body is not valid JSON.');
  if (err.type === 'entity.too.large') err = new HttpError(413, 'Request body is too large.', { code: 'payload_too_large' });
  const mapped = err instanceof HttpError ? err : fromDbError(err);
  if (!mapped) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    return res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong on the server.' } });
  }
  if (mapped.status >= 500) console.error(`[${req.method} ${req.originalUrl}]`, err.message);
  res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message, ...(mapped.details ? { details: mapped.details } : {}) } });
}
