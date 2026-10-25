export class HttpError extends Error {
  constructor(status, message, { code, details } = {}) {
    super(message);
    this.status = status;
    this.code = code || defaultCode(status);
    this.details = details;
  }
}

const defaultCode = s => ({ 400: 'bad_request', 404: 'not_found', 409: 'conflict', 422: 'validation_failed', 503: 'database_unavailable' }[s] || 'internal_error');

const UNIQUE_MESSAGES = {
  inventory_items_active_name_uq: 'A product with this name already exists.',
  inventory_items_sku_key: 'A product with this SKU already exists.',
  inventory_items_pkey: 'A product with this ID already exists.'
};

// Translate Postgres / custom SQLSTATE errors from the database functions into HTTP errors.
export function fromDbError(err) {
  if (err instanceof HttpError) return err;
  const code = err && err.code;
  const msg = err && err.message;
  switch (code) {
    case 'UW404': return new HttpError(404, msg);
    case 'UW409': return new HttpError(409, msg, { code: 'conflict' });
    case 'UW422': return new HttpError(422, msg);
    case '23505': return new HttpError(409, UNIQUE_MESSAGES[err.constraint] || 'This record already exists.', { code: 'duplicate' });
    case '23514': return new HttpError(422, `Value violates a database rule${err.constraint ? ` (${err.constraint})` : ''}.`);
    case '23503': return new HttpError(422, 'Referenced record does not exist.');
    case '23502': return new HttpError(422, `Missing required value${err.column ? `: ${err.column}` : ''}.`);
    case '22P02': case '22003': case '22007': return new HttpError(422, 'Invalid value format.');
    case 'ECONNREFUSED': case 'ENOTFOUND': case 'ETIMEDOUT': case '57P01': case '53300': case '08006': case '08001':
      return new HttpError(503, 'The database is unavailable. Try again shortly.');
    default: return null;
  }
}
