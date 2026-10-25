// Wrap async route handlers so rejected promises reach the error middleware.
export const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const sendData = (res, data, { status = 200, meta } = {}) => res.status(status).json(meta ? { data, meta } : { data });

// JSON cannot represent Infinity/-Infinity/NaN (the algorithms use them for "no value"); send null.
export const jsonReplacer = (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v);
