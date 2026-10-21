// SQLite: users, sessions, repositories, stars, and issues with their
// comments. Pull requests are issues with a head and base branch, so the two
// share one number sequence per repository, as on GitHub.

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Config } from './config.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
-- AUTOINCREMENT: ids name folders on disk, so a deleted repository's id is never reused.
CREATE TABLE IF NOT EXISTS repos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL COLLATE NOCASE,
  description TEXT NOT NULL DEFAULT '',
  private     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  pushed_at   INTEGER,
  UNIQUE (owner_id, name)
);
CREATE TABLE IF NOT EXISTS stars (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, repo_id)
);
CREATE TABLE IF NOT EXISTS issues (
  id         INTEGER PRIMARY KEY,
  repo_id    INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  number     INTEGER NOT NULL,
  author_id  INTEGER NOT NULL REFERENCES users(id),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  state      TEXT NOT NULL DEFAULT 'open',  -- open, closed or merged
  is_pull    INTEGER NOT NULL DEFAULT 0,
  head       TEXT,                          -- pull requests: the branch to merge
  base       TEXT,                          -- pull requests: the branch to merge into
  merged_sha TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (repo_id, number)
);
CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY,
  issue_id   INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  author_id  INTEGER NOT NULL REFERENCES users(id),
  kind       TEXT NOT NULL DEFAULT 'comment',  -- comment, closed, reopened or merged
  body       TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
`;

export interface User {
  id: number;
  username: string;
  created_at: number;
}

export interface Repo {
  id: number;
  owner_id: number;
  owner: string;
  name: string;
  description: string;
  private: boolean;
  created_at: number;
  pushed_at: number | null;
  stars: number;
}

export type IssueState = 'open' | 'closed' | 'merged';

export interface Issue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: IssueState;
  is_pull: boolean;
  head: string | null;
  base: string | null;
  merged_sha: string | null;
  author: string;
  author_id: number;
  created_at: number;
  updated_at: number;
  comments: number;
}

export interface Comment {
  id: number;
  author: string;
  kind: string;
  body: string;
  created_at: number;
}

/** What clients see of a repository or issue: no internal ids. */
export const publicRepo = ({ owner_id: _o, ...r }: Repo) => r;
export const publicIssue = ({ id: _i, author_id: _a, ...i }: Issue) => i;

export const now = () => Math.floor(Date.now() / 1000);

export function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE';
}

const REPO_SELECT = `SELECT r.id, r.owner_id, u.username AS owner, r.name, r.description, r.private, r.created_at, r.pushed_at,
  (SELECT COUNT(*) FROM stars s WHERE s.repo_id = r.id) AS stars
  FROM repos r JOIN users u ON u.id = r.owner_id`;

const ISSUE_SELECT = `SELECT i.id, i.number, i.title, i.body, i.state, i.is_pull, i.head, i.base, i.merged_sha,
  u.username AS author, i.author_id, i.created_at, i.updated_at,
  (SELECT COUNT(*) FROM comments c WHERE c.issue_id = i.id AND c.kind = 'comment') AS comments
  FROM issues i JOIN users u ON u.id = i.author_id`;

type Row = Record<string, unknown>;
// SQLite has no booleans; it stores 0 and 1.
const toRepo = (r: Row) => ({ ...r, private: !!r.private }) as Repo;
const toIssue = (r: Row) => ({ ...r, is_pull: !!r.is_pull }) as Issue;

@Injectable()
export class DbService implements OnModuleDestroy {
  readonly db: Database.Database;

  constructor(config: Config) {
    mkdirSync(config.reposDir, { recursive: true });
    this.db = new Database(join(config.dataDir, 'chayyarhub.db'));
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(SCHEMA);
  }

  onModuleDestroy() {
    this.db.close();
  }

  // ---- users and sessions ----

  createUser(username: string, passwordHash: string): User {
    const created_at = now();
    const { lastInsertRowid } = this.db
      .prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
      .run(username, passwordHash, created_at);
    return { id: Number(lastInsertRowid), username, created_at };
  }

  userByName(name: string): User | undefined {
    return this.db.prepare('SELECT id, username, created_at FROM users WHERE username = ?').get(name) as User | undefined;
  }

  /** The user and their password hash, for signing in. */
  loginLookup(name: string): { user: User; hash: string } | undefined {
    const row = this.db.prepare('SELECT id, username, created_at, password_hash FROM users WHERE username = ?').get(name) as
      | (User & { password_hash: string })
      | undefined;
    if (!row) return undefined;
    const { password_hash, ...user } = row;
    return { user, hash: password_hash };
  }

  createSession(tokenHash: string, userId: number, days: number) {
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
    this.db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(tokenHash, userId, now() + days * 86400);
  }

  sessionUser(tokenHash: string): User | undefined {
    return this.db
      .prepare(
        `SELECT u.id, u.username, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ?`,
      )
      .get(tokenHash, now()) as User | undefined;
  }

  deleteSession(tokenHash: string) {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }

  // ---- repositories ----

  createRepo(ownerId: number, name: string, description: string, isPrivate: boolean): number {
    const { lastInsertRowid } = this.db
      .prepare('INSERT INTO repos (owner_id, name, description, private, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(ownerId, name, description, isPrivate ? 1 : 0, now());
    return Number(lastInsertRowid);
  }

  findRepo(owner: string, name: string): Repo | undefined {
    const row = this.db.prepare(`${REPO_SELECT} WHERE u.username = ? AND r.name = ?`).get(owner, name) as Row | undefined;
    return row && toRepo(row);
  }

  reposOf(ownerId: number, includePrivate: boolean): Repo[] {
    return (
      this.db
        .prepare(`${REPO_SELECT} WHERE r.owner_id = ? AND (? OR r.private = 0) ORDER BY COALESCE(r.pushed_at, r.created_at) DESC`)
        .all(ownerId, includePrivate ? 1 : 0) as Row[]
    ).map(toRepo);
  }

  /** Recently updated public repositories, for the explore page. */
  explore(limit: number): Repo[] {
    return (
      this.db.prepare(`${REPO_SELECT} WHERE r.private = 0 ORDER BY COALESCE(r.pushed_at, r.created_at) DESC LIMIT ?`).all(limit) as Row[]
    ).map(toRepo);
  }

  updateRepo(id: number, description: string, isPrivate: boolean) {
    this.db.prepare('UPDATE repos SET description = ?, private = ? WHERE id = ?').run(description, isPrivate ? 1 : 0, id);
  }

  deleteRepo(id: number) {
    this.db.prepare('DELETE FROM repos WHERE id = ?').run(id);
  }

  touchPushed(id: number) {
    this.db.prepare('UPDATE repos SET pushed_at = ? WHERE id = ?').run(now(), id);
  }

  setStar(userId: number, repoId: number, on: boolean) {
    const sql = on ? 'INSERT OR IGNORE INTO stars (user_id, repo_id) VALUES (?, ?)' : 'DELETE FROM stars WHERE user_id = ? AND repo_id = ?';
    this.db.prepare(sql).run(userId, repoId);
  }

  starred(userId: number, repoId: number): boolean {
    return !!this.db.prepare('SELECT 1 FROM stars WHERE user_id = ? AND repo_id = ?').get(userId, repoId);
  }

  // ---- issues and pull requests ----

  /** Issues or pull requests that are open, or closed (which includes merged). */
  listIssues(repoId: number, pulls: boolean, open: boolean): Issue[] {
    return (
      this.db
        .prepare(`${ISSUE_SELECT} WHERE i.repo_id = ? AND i.is_pull = ? AND (i.state = 'open') = ? ORDER BY i.number DESC LIMIT 200`)
        .all(repoId, pulls ? 1 : 0, open ? 1 : 0) as Row[]
    ).map(toIssue);
  }

  issueCounts(repoId: number, pulls: boolean): { open: number; closed: number } {
    return this.db
      .prepare(
        `SELECT COALESCE(SUM(state = 'open'), 0) AS open, COALESCE(SUM(state != 'open'), 0) AS closed
         FROM issues WHERE repo_id = ? AND is_pull = ?`,
      )
      .get(repoId, pulls ? 1 : 0) as { open: number; closed: number };
  }

  /** Open an issue, or a pull request when `pull` names its branches. Returns its number. */
  createIssue(repoId: number, authorId: number, title: string, body: string, pull?: { head: string; base: string }): number {
    return this.db.transaction(() => {
      const { n } = this.db.prepare('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM issues WHERE repo_id = ?').get(repoId) as { n: number };
      const t = now();
      this.db
        .prepare(
          `INSERT INTO issues (repo_id, number, author_id, title, body, is_pull, head, base, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(repoId, n, authorId, title, body, pull ? 1 : 0, pull?.head ?? null, pull?.base ?? null, t, t);
      return n;
    })();
  }

  getIssue(repoId: number, number: number): Issue | undefined {
    const row = this.db.prepare(`${ISSUE_SELECT} WHERE i.repo_id = ? AND i.number = ?`).get(repoId, number) as Row | undefined;
    return row && toIssue(row);
  }

  openPullFor(repoId: number, head: string, base: string): number | null {
    const row = this.db
      .prepare(`SELECT number FROM issues WHERE repo_id = ? AND is_pull = 1 AND state = 'open' AND head = ? AND base = ?`)
      .get(repoId, head, base) as { number: number } | undefined;
    return row?.number ?? null;
  }

  /** Change state and record who did it in the timeline. */
  setIssueState(issueId: number, actorId: number, state: IssueState, mergedSha?: string) {
    this.db
      .prepare('UPDATE issues SET state = ?, merged_sha = COALESCE(?, merged_sha), updated_at = ? WHERE id = ?')
      .run(state, mergedSha ?? null, now(), issueId);
    this.addComment(issueId, actorId, state === 'open' ? 'reopened' : state, '');
  }

  addComment(issueId: number, authorId: number, kind: string, body: string) {
    this.db.prepare('INSERT INTO comments (issue_id, author_id, kind, body, created_at) VALUES (?, ?, ?, ?, ?)').run(issueId, authorId, kind, body, now());
    this.db.prepare('UPDATE issues SET updated_at = ? WHERE id = ?').run(now(), issueId);
  }

  comments(issueId: number): Comment[] {
    return this.db
      .prepare(
        `SELECT c.id, u.username AS author, c.kind, c.body, c.created_at FROM comments c JOIN users u ON u.id = c.author_id
         WHERE c.issue_id = ? ORDER BY c.id`,
      )
      .all(issueId) as Comment[];
  }
}
