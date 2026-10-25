/* Central role → permission map. The Express API enforces it on every route; the frontend only uses
   the permission list the API returns for the signed-in user (GET /api/me) to hide controls.
   To change who can do what, edit this file: both sides pick it up. */

export const ROLES = {
  admin: { label: 'Administrator' },
  staff: { label: 'Staff' }
};

const BOTH = ['admin', 'staff'];
const ADMIN = ['admin'];

export const PERMISSIONS = {
  'dashboard:view': { roles: BOTH, description: 'View dashboard statistics and stock alerts' },
  'inventory:view': { roles: BOTH, description: 'View products, stock levels and specifications' },
  'inventory:manage': { roles: ADMIN, description: 'Add, edit and archive products' },
  'inventory:adjust': { roles: ADMIN, description: 'Receive, remove and count stock' },
  'movements:view': { roles: ADMIN, description: 'View the stock movement history' },
  'catalog:view': { roles: BOTH, description: 'View component categories and component details' },
  'builds:run': { roles: BOTH, description: 'Check compatibility and run the backtracking search' },
  'builds:view': { roles: BOTH, description: 'View saved PC builds' },
  'builds:save': { roles: ADMIN, description: 'Save and delete PC builds' },
  'optimizer:run': { roles: BOTH, description: 'Run the build optimizer' },
  'optimizer:view': { roles: BOTH, description: 'View saved optimizer runs' },
  'optimizer:save': { roles: ADMIN, description: 'Save optimizer runs and their builds' },
  'restock:view': { roles: BOTH, description: 'Generate restock recommendations and view saved plans' },
  'restock:save': { roles: ADMIN, description: 'Save restock plans' },
  'restock:receive': { roles: ADMIN, description: 'Receive restock plans into stock' }
};

export const permissionsFor = role => Object.keys(PERMISSIONS).filter(p => role && PERMISSIONS[p].roles.includes(role));
export const roleHas = (role, permission) => !!(role && PERMISSIONS[permission] && PERMISSIONS[permission].roles.includes(role));
