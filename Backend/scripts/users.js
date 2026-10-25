// Server-side account administration. Runs with the backend's database credentials, so only someone
// with access to Backend/.env can use it; there is deliberately no API endpoint for changing roles.
//
//   npm run users -- list
//   npm run users -- grant  --email person@example.com --role admin|staff [--name "Full Name"]
//   npm run users -- revoke --email person@example.com        (removes the role: no access)
//   npm run users -- disable --email person@example.com       (blocks sign-in to UnitWorks immediately)
//   npm run users -- enable  --email person@example.com
//
// Accounts themselves are created in Supabase (Dashboard → Authentication → Users → Add user);
// a profile with no role is created automatically for every new account.
// On a database without Supabase Auth (local PGlite), pass --id <auth user uuid> to create the profile.
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/lib/db.js';
import { ROLES } from '../../shared/permissions.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function runUsersCommand(db, argv, log = console.log) {
  const { positionals, values } = parseArgs({
    args: argv, allowPositionals: true,
    options: { email: { type: 'string' }, role: { type: 'string' }, name: { type: 'string' }, id: { type: 'string' } }
  });
  const cmd = positionals[0];

  if (cmd === 'list' || !cmd) {
    const r = await db.query('select email, role, is_active, full_name, created_at from user_profiles order by created_at');
    if (!r.rows.length) log('No user profiles yet. Create an account in Supabase → Authentication → Users.');
    for (const u of r.rows) log(`${u.email.padEnd(36)} ${String(u.role || 'no access').padEnd(10)} ${u.is_active ? 'active' : 'DISABLED'}${u.full_name ? '  ' + u.full_name : ''}`);
    return r.rows;
  }
  if (!['grant', 'revoke', 'disable', 'enable'].includes(cmd)) throw new Error(`Unknown command "${cmd}". Use list, grant, revoke, disable or enable.`);
  if (!values.email) throw new Error('--email is required');
  if (cmd === 'grant' && !Object.keys(ROLES).includes(values.role)) throw new Error(`--role must be one of: ${Object.keys(ROLES).join(', ')}`);
  if (values.id && !UUID.test(values.id)) throw new Error('--id must be a UUID');

  const hasAuth = (await db.query("select to_regclass('auth.users') is not null as ok")).rows[0].ok;
  let id = values.id;
  if (!id) {
    const r = hasAuth
      ? await db.query('select id from auth.users where lower(email) = lower($1)', [values.email])
      : await db.query('select id from user_profiles where lower(email) = lower($1)', [values.email]);
    if (!r.rows.length) {
      throw new Error(hasAuth
        ? `No Supabase account uses ${values.email}. Create it first: Supabase Dashboard → Authentication → Users → Add user.`
        : `No profile uses ${values.email}. On a database without Supabase Auth, pass --id <auth user uuid>.`);
    }
    id = r.rows[0].id;
  }

  const set = { grant: 'role = excluded.role', revoke: 'role = null', disable: 'is_active = false', enable: 'is_active = true' }[cmd];
  const r = await db.query(
    `insert into user_profiles (id, email, full_name, role, is_active)
     values ($1::uuid, $2::text, $4::text, $3::text, ${cmd === 'disable' ? 'false' : 'true'})
     on conflict (id) do update set ${set}, full_name = coalesce($4, user_profiles.full_name), email = $2
     returning email, role, is_active`,
    [id, values.email, cmd === 'grant' ? values.role : null, values.name ?? null]);
  const u = r.rows[0];
  log(`${u.email}: ${u.role ? ROLES[u.role].label : 'no access'}, ${u.is_active ? 'active' : 'disabled'}`);
  return u;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const db = await createDb(loadConfig({ skipAuthConfig: true }));
  try {
    await runUsersCommand(db, process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}
