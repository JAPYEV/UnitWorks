// Environment-based configuration. Fails fast when required values are missing.
const env = process.env;

export function loadConfig(overrides = {}) {
  const driver = overrides.dbDriver ?? env.DB_DRIVER ?? 'postgres';
  const cfg = {
    port: Number(overrides.port ?? env.PORT ?? 4000),
    corsOrigins: String(overrides.corsOrigin ?? env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map(s => s.trim()).filter(Boolean),
    dbDriver: driver,
    databaseUrl: overrides.databaseUrl ?? env.DATABASE_URL,
    databaseSsl: String(overrides.databaseSsl ?? env.DATABASE_SSL ?? 'true') !== 'false',
    pgliteDataDir: overrides.pgliteDataDir ?? env.PGLITE_DATA_DIR ?? './.data/pglite',
    // Supabase project URL: access tokens are verified against its published signing keys (no secret needed)
    supabaseUrl: overrides.supabaseUrl ?? env.SUPABASE_URL
  };
  if (!['postgres', 'pglite'].includes(cfg.dbDriver)) throw new Error(`DB_DRIVER must be "postgres" or "pglite", got "${cfg.dbDriver}"`);
  if (cfg.dbDriver === 'postgres' && !cfg.databaseUrl) {
    throw new Error('DATABASE_URL is required (Supabase → Project Settings → Database → Connection string). See Backend/.env.example.');
  }
  if (!Number.isInteger(cfg.port) || cfg.port < 0) throw new Error('PORT must be a whole number');
  if (!overrides.skipAuthConfig) {
    if (!cfg.supabaseUrl) throw new Error('SUPABASE_URL is required to verify sign-ins (https://<project-ref>.supabase.co). See Backend/.env.example.');
    let u;
    try { u = new URL(cfg.supabaseUrl); } catch { throw new Error('SUPABASE_URL is not a valid URL'); }
    if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') throw new Error('SUPABASE_URL must use https');
  }
  return cfg;
}
