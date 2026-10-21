// Passwords, sessions, and the naming rules for users and repositories.

import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'chayyar_session';
export const SESSION_DAYS = 30;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${(await derive(password, salt)).toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, salt, key] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await derive(password, Buffer.from(salt, 'base64'));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A new session token. Only its hash is stored, so a leaked database can't sign anyone in. */
export function newToken(): string {
  return randomBytes(32).toString('hex');
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function sessionToken(cookieHeader: string | undefined): string | undefined {
  for (const part of (cookieHeader ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === COOKIE && value.length) return value.join('=');
  }
  return undefined;
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`;
}

export function clearCookie(secure: boolean): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

/** `Authorization: Basic …`, which is how `git` sends a username and password. */
export function basicCredentials(header: string | undefined): { username: string; password: string } | undefined {
  const m = /^basic\s+(.+)$/i.exec(header ?? '');
  if (!m) return undefined;
  const decoded = Buffer.from(m[1].trim(), 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  return colon < 0 ? undefined : { username: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
}

/** Top-level paths the web app uses, so nobody can be called that. */
const RESERVED = new Set([
  'api', 'assets', 'about', 'admin', 'explore', 'favicon.ico', 'help', 'index.html', 'login', 'logout', 'media', 'new',
  'raw', 'settings', 'signup', 'static',
]);

/** Like GitHub: letters, digits and single hyphens, not at either end. Returns a problem, or null. */
export function usernameProblem(name: string): string | null {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(name)) {
    return 'Usernames use letters, digits and single hyphens (not at the start or end), up to 39 characters.';
  }
  return RESERVED.has(name.toLowerCase()) ? `'${name}' is reserved. Pick another username.` : null;
}

export function passwordProblem(password: string): string | null {
  return password.length < 8 ? 'Passwords need at least 8 characters.' : null;
}

export function repoNameProblem(name: string): string | null {
  const ok = /^[A-Za-z0-9_.-]{1,100}$/.test(name) && !name.startsWith('.') && !name.toLowerCase().endsWith('.git');
  return ok ? null : "Repository names use letters, digits, '-', '_' and '.', and can't start with '.' or end in '.git'.";
}
