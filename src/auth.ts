import type { User } from './types';
const users: Record<string, User> = {
  nickm: { password: 'securepass123', role: 'admin' },
  janed: { password: 'userpass456',  role: 'user'  }
};
export type LoginResult = { ok: true; role: User['role'] } | { ok: false };
export function checkLogin(username: string, password: string): LoginResult {
  const u = users[username.trim()];
  if (u && u.password === password.trim()) { return { ok: true, role: u.role }; }
  return { ok: false };
}
