// Authentication and authorization middleware.
//
// 1. authenticate: requires "Authorization: Bearer <Supabase access token>", verifies its signature
//    against the project's published signing keys (JWKS), issuer, audience and expiry, then loads
//    the user's profile from the database. The role comes only from the database — never from the
//    token's metadata or the request body.
// 2. requirePermission(p): checks the role against the central map in shared/permissions.js.
import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from 'jose';
import { HttpError } from '../lib/errors.js';
import { PERMISSIONS, ROLES, permissionsFor, roleHas } from '../../../shared/permissions.js';

/** Returns async (token) => claims. Throws on any invalid, expired or wrongly issued token. */
export function createTokenVerifier({ supabaseUrl, jwks, issuer, audience = 'authenticated' }) {
  const iss = issuer || `${String(supabaseUrl).replace(/\/+$/, '')}/auth/v1`;
  const keySet = jwks || createRemoteJWKSet(new URL(`${iss}/.well-known/jwks.json`), { cooldownDuration: 30_000, cacheMaxAge: 10 * 60_000 });
  return async token => {
    const { payload } = await jwtVerify(token, keySet, { issuer: iss, audience, algorithms: ['ES256', 'RS256', 'EdDSA'], clockTolerance: 5 });
    if (!payload.sub) throw new joseErrors.JWTClaimValidationFailed('missing "sub" claim', payload, 'sub', 'missing');
    return payload;
  };
}

const unauthenticated = (message, code) => new HttpError(401, message, { code });

export function authenticate({ verifyToken, profiles }) {
  return async (req, res, next) => {
    const m = /^Bearer\s+(\S+)\s*$/i.exec(req.get('authorization') || '');
    if (!m) return next(unauthenticated('Sign in to continue.', 'unauthenticated'));

    let claims;
    try {
      claims = await verifyToken(m[1]);
    } catch (e) {
      if (e instanceof joseErrors.JWTExpired) return next(unauthenticated('Your session has expired. Sign in again.', 'session_expired'));
      if (e instanceof joseErrors.JWKSTimeout || !(e instanceof joseErrors.JOSEError)) {
        // Signing keys could not be fetched (network/Supabase outage): not the client's fault.
        console.error('Token verification unavailable:', e.message);
        return next(new HttpError(503, 'Sign-in could not be verified right now. Try again shortly.', { code: 'auth_unavailable' }));
      }
      return next(unauthenticated('Your session is not valid. Sign in again.', 'invalid_token'));
    }

    let profile;
    try {
      profile = await profiles.get(claims.sub);
    } catch (e) {
      return next(e);
    }
    if (!profile) return next(new HttpError(403, 'Your account has no UnitWorks profile. Ask an administrator for access.', { code: 'no_access' }));
    if (!profile.is_active) return next(new HttpError(403, 'This account has been deactivated. Contact an administrator.', { code: 'account_disabled' }));
    if (!profile.role) return next(new HttpError(403, 'Your account has not been given access to UnitWorks yet. Ask an administrator to assign a role.', { code: 'no_access' }));

    const email = claims.email || profile.email;
    req.user = { id: claims.sub, email, name: profile.full_name || email, role: profile.role, permissions: permissionsFor(profile.role) };
    next();
  };
}

export const requirePermission = permission => {
  if (!PERMISSIONS[permission]) throw new Error(`Unknown permission ${permission}`);
  return (req, res, next) => {
    if (!req.user) return next(unauthenticated('Sign in to continue.', 'unauthenticated'));
    if (roleHas(req.user.role, permission)) return next();
    const label = (ROLES[req.user.role] || {}).label || req.user.role;
    next(new HttpError(403, `${label} accounts cannot ${PERMISSIONS[permission].description.charAt(0).toLowerCase()}${PERMISSIONS[permission].description.slice(1)}.`, { code: 'forbidden' }));
  };
};
