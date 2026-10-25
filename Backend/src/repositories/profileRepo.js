// User profiles (role + active flag) linked to Supabase Auth users. Roles are read here on every
// authenticated request; nothing in the API writes them.
export function profileRepo(db) {
  return {
    async get(id) {
      const r = await db.query('select id, email, full_name, role, is_active from user_profiles where id = $1', [id]);
      return r.rows[0] || null;
    }
  };
}
