/** Default user for analytics when auth is disabled (override via VITE_GLOBAL_USER_ID). */
export const GLOBAL_USER_ID = import.meta.env.VITE_GLOBAL_USER_ID || '1';

/**
 * Returns the global analytics user id and persists it for BIWorkspace / API query params.
 * No login request is made.
 */
export function getGlobalUserId() {
  const id = String(GLOBAL_USER_ID);
  if (typeof window !== 'undefined') {
    localStorage.setItem('userId', id);
    localStorage.setItem('isAuthenticated', 'true');
  }
  return id;
}
