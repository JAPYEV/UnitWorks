// Minimal request validation: describe each field, get back a cleaned object or a 422 with
// per-field messages. Kept dependency-free on purpose.
import { HttpError } from './errors.js';

const isBlank = v => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

function checkField(name, raw, rule) {
  if (isBlank(raw)) {
    if (rule.required) return { error: rule.requiredMessage || `${rule.label || name} is required.` };
    return { value: rule.default };
  }
  const label = rule.label || name;
  switch (rule.type) {
    case 'string': {
      if (typeof raw !== 'string') return { error: `${label} must be text.` };
      const v = raw.trim();
      if (rule.minLength && v.length < rule.minLength) return { error: `${label} must be at least ${rule.minLength} characters.` };
      if (rule.maxLength && v.length > rule.maxLength) return { error: `${label} must be at most ${rule.maxLength} characters.` };
      return { value: v };
    }
    case 'int':
    case 'number': {
      const v = typeof raw === 'string' ? Number(raw.replace(/[,₱\s]/g, '')) : raw;
      if (typeof v !== 'number' || !Number.isFinite(v)) return { error: `${label} must be a number.` };
      if (rule.type === 'int' && !Number.isInteger(v)) return { error: `${label} must be a whole number.` };
      if (rule.min !== undefined && v < rule.min) return { error: rule.minMessage || `${label} must be at least ${rule.min}.` };
      if (rule.max !== undefined && v > rule.max) return { error: rule.maxMessage || `${label} must be at most ${rule.max}.` };
      if (rule.gt !== undefined && !(v > rule.gt)) return { error: `${label} must be greater than ${rule.gt}.` };
      return { value: v };
    }
    case 'boolean':
      if (typeof raw === 'boolean') return { value: raw };
      if (raw === 'true' || raw === 'false') return { value: raw === 'true' };
      return { error: `${label} must be true or false.` };
    case 'enum':
      if (!rule.values.includes(raw)) return { error: `${label} must be one of: ${rule.values.join(', ')}.` };
      return { value: raw };
    case 'object':
      if (typeof raw !== 'object' || Array.isArray(raw)) return { error: `${label} must be an object.` };
      return { value: raw };
    case 'array':
      if (!Array.isArray(raw)) return { error: `${label} must be a list.` };
      if (rule.minItems && raw.length < rule.minItems) return { error: `${label} needs at least ${rule.minItems} item(s).` };
      if (rule.maxItems && raw.length > rule.maxItems) return { error: `${label} allows at most ${rule.maxItems} item(s).` };
      return { value: raw };
    default:
      throw new Error(`Unknown rule type ${rule.type}`);
  }
}

/**
 * @param {object} input request body / query
 * @param {Record<string, object>} schema field rules
 * @param {(out: object, errors: Record<string,string>) => void} [refine] cross-field checks
 */
export function validate(input, schema, refine) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }
  const out = {}, errors = {};
  for (const [name, rule] of Object.entries(schema)) {
    const r = checkField(name, input[name], rule);
    if (r.error) errors[name] = r.error;
    else if (r.value !== undefined) out[name] = r.value;
  }
  if (refine && !Object.keys(errors).length) refine(out, errors);
  if (Object.keys(errors).length) {
    throw new HttpError(422, `Fix ${Object.keys(errors).length} field(s): ${Object.values(errors)[0]}`, { details: errors });
  }
  return out;
}
