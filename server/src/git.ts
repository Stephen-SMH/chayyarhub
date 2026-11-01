// Server-side git: bare repositories in the data folder, driven through the
// system `git` binary (as GitDesk does on the desktop). Anything that came
// from a URL is resolved to a SHA by `resolve` before other commands see it.

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class GitError extends Error {}

/** Who a server-made commit (first README, merge) is attributed to. */
export interface Signature {
  name: string;
  email: string;
}

interface Output {
  code: number;
  stdout: Buffer;
  stderr: string;
}

function exec(repo: string, args: string[], opts: { input?: string; sig?: Signature } = {}): Promise<Output> {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' };
  if (opts.sig) {
    env.GIT_AUTHOR_NAME = env.GIT_COMMITTER_NAME = opts.sig.name;
    env.GIT_AUTHOR_EMAIL = env.GIT_COMMITTER_EMAIL = opts.sig.email;
  }
  return new Promise((resolve, reject) => {
    // Show non-ASCII paths (Burmese file names) as they are, not as octal escapes.
    const child = spawn('git', ['-c', 'core.quotepath=off', ...args], {
      cwd: repo,
      env,
      stdio: [opts.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout!.on('data', (d: Buffer) => out.push(d));
    child.stderr!.on('data', (d: Buffer) => err.push(d));
    child.on('error', (e) => reject(new GitError(`Could not run git: ${e.message}. Is git installed and on PATH?`)));
    child.on('close', (code) =>
      resolve({ code: code ?? -1, stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString().trim() }),
    );
    if (opts.input !== undefined) child.stdin?.end(opts.input);
  });
}

function check(out: Output, args: string[]): Output {
  if (out.code !== 0) throw new GitError(out.stderr || `git ${args[0]} failed`);
  return out;
}

async function runBytes(repo: string, args: string[]): Promise<Buffer> {
  return check(await exec(repo, args), args).stdout;
}

async function run(repo: string, args: string[], opts: { input?: string; sig?: Signature } = {}): Promise<string> {
  return check(await exec(repo, args, opts), args).stdout.toString('utf8');
}

/**
 * A branch, tag or SHA as it appears in a URL. Rejects anything git could
 * read as an option or a revision expression (`-x`, `a..b`, `HEAD~2`, `@{u}`).
 */
export function validRef(r: string): boolean {
  return (
    r.length > 0 &&
    r.length <= 255 &&
    !r.startsWith('-') &&
    !r.includes('..') &&
    !r.includes('@{') &&
    // eslint-disable-next-line no-control-regex
    !/[\x00-\x1f\x7f ~^:?*[\\]/.test(r)
  );
}

async function revParse(repo: string, spec: string): Promise<string | null> {
  const out = await exec(repo, ['rev-parse', '--verify', '-q', spec]);
  return out.code === 0 ? out.stdout.toString().trim() : null;
}

/** The commit that a branch, tag or SHA names. */
export async function resolve(repo: string, rev: string): Promise<string | null> {
  return validRef(rev) ? revParse(repo, `${rev}^{commit}`) : null;
}

/** The commit a branch points to; unlike `resolve`, tags and SHAs don't count. */
export async function resolveBranch(repo: string, name: string): Promise<string | null> {
  return validRef(name) ? revParse(repo, `refs/heads/${name}^{commit}`) : null;
}

export async function initBare(path: string): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  await run(dirname(path), ['init', '--bare', '-q', '-b', 'main', path]);
}

/**
 * Give a new repository a first commit holding just README.md, without a
 * working tree: blob, tree, commit, then point `main` at it.
 */
export async function initWithReadme(repo: string, readme: string, sig: Signature): Promise<string> {
  const blob = (await run(repo, ['hash-object', '-w', '--stdin'], { input: readme })).trim();
  const tree = (await run(repo, ['mktree'], { input: `100644 blob ${blob}\tREADME.md\n` })).trim();
  const commit = (await run(repo, ['commit-tree', '--no-gpg-sign', tree, '-m', 'Initial commit'], { sig })).trim();
  await run(repo, ['update-ref', 'refs/heads/main', commit]);
  return commit;
}

export async function branchNames(repo: string): Promise<string[]> {
  const out = await run(repo, ['for-each-ref', '--sort=-committerdate', '--format=%(refname:lstrip=2)', 'refs/heads']);
  return out.split('\n').filter(Boolean);
}

/** The branch HEAD names, if that branch exists. */
export async function defaultBranch(repo: string): Promise<string | null> {
  const out = await exec(repo, ['symbolic-ref', '--short', '-q', 'HEAD']);
  const name = out.stdout.toString().trim();
  return out.code === 0 && (await resolveBranch(repo, name)) ? name : null;
}

/**
 * Like GitHub: if HEAD names a branch that doesn't exist (HEAD is `main` but
 * the first push was `master`), point it at `main` or the first branch.
 */
export async function ensureHead(repo: string): Promise<void> {
  if (await defaultBranch(repo)) return;
  const names = await branchNames(repo);
  const pick = names.find((b) => b === 'main') ?? names[0];
  if (pick) await run(repo, ['symbolic-ref', 'HEAD', `refs/heads/${pick}`]);
}

export interface Branch {
  name: string;
  sha: string;
  summary: string;
  author: string;
  date: number;
}

export async function branches(repo: string): Promise<Branch[]> {
  const format = '--format=%(refname:lstrip=2)%1f%(objectname)%1f%(contents:subject)%1f%(authorname)%1f%(committerdate:unix)';
  const out = await run(repo, ['for-each-ref', '--sort=-committerdate', format, 'refs/heads']);
  return out
    .split('\n')
    .map((l) => l.split('\x1f'))
    .filter((f) => f.length === 5)
    .map(([name, sha, summary, author, date]) => ({ name, sha, summary, author, date: Number(date) }));
}

/** [commits head has that base lacks, commits base has that head lacks]. */
export async function aheadBehind(repo: string, base: string, head: string): Promise<[number, number]> {
  const out = await run(repo, ['rev-list', '--left-right', '--count', `${head}...${base}`]);
  const [ahead = 0, behind = 0] = out.trim().split(/\s+/).map(Number);
  return [ahead, behind];
}

export interface Entry {
  name: string;
  path: string;
  kind: 'dir' | 'file' | 'symlink' | 'submodule';
  size: number | null;
}

/** What `path` is at commit `sha`: "tree", "blob" or "commit" (a submodule). */
export async function objectKind(repo: string, sha: string, path: string): Promise<string | null> {
  if (!path) return 'tree';
  const out = await exec(repo, ['cat-file', '-t', `${sha}:${path}`]);
  return out.code === 0 ? out.stdout.toString().trim() : null;
}

/** The entries of folder `dir` at commit `sha`, folders first. */
export async function tree(repo: string, sha: string, dir: string): Promise<Entry[]> {
  const out = await run(repo, ['ls-tree', '-z', '-l', `${sha}:${dir}`]);
  const entries: Entry[] = [];
  for (const rec of out.split('\0')) {
    const tab = rec.indexOf('\t');
    if (tab < 0) continue;
    const [mode, type, , size] = rec.slice(0, tab).split(/\s+/);
    const name = rec.slice(tab + 1);
    entries.push({
      name,
      path: dir ? `${dir}/${name}` : name,
      kind: type === 'tree' ? 'dir' : type === 'commit' ? 'submodule' : mode === '120000' ? 'symlink' : 'file',
      size: size === '-' ? null : Number(size),
    });
  }
  return entries.sort((a, b) =>
    a.kind === 'dir' && b.kind !== 'dir' ? -1 : b.kind === 'dir' && a.kind !== 'dir' ? 1 : a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
  );
}

export async function blobSize(repo: string, sha: string, path: string): Promise<number> {
  return Number((await run(repo, ['cat-file', '-s', `${sha}:${path}`])).trim());
}

export async function blob(repo: string, sha: string, path: string): Promise<Buffer> {
  return runBytes(repo, ['cat-file', 'blob', `${sha}:${path}`]);
}

export interface Commit {
  sha: string;
  short: string;
  summary: string;
  body: string;
  author: string;
  email: string;
  date: number;
  parents: string[];
}

const LOG_FORMAT = '--format=%H%x1f%h%x1f%s%x1f%an%x1f%ae%x1f%at%x1f%P%x1f%b%x1e';

function parseLog(out: string): Commit[] {
  return out
    .split('\x1e')
    .map((rec) => rec.replace(/^\n/, '').split('\x1f'))
    .filter((f) => f.length >= 8)
    .map((f) => ({
      sha: f[0],
      short: f[1],
      summary: f[2],
      author: f[3],
      email: f[4],
      date: Number(f[5]),
      parents: f[6].split(' ').filter(Boolean),
      body: f[7].trim(),
    }));
}

/** History of commit `sha`, optionally only the commits touching `path`. */
export async function log(repo: string, sha: string, path: string | null, skip: number, limit: number): Promise<Commit[]> {
  const args = ['log', LOG_FORMAT, `--skip=${skip}`, `-n${limit}`, sha];
  if (path) args.push('--', path);
  return parseLog(await run(repo, args));
}

export async function commit(repo: string, sha: string): Promise<Commit> {
  const [c] = await log(repo, sha, null, 0, 1);
  if (!c) throw new GitError('No such commit.');
  return c;
}

/** Commits reachable from `head` but not `base`, oldest first (a pull request's commits). */
export async function commitsBetween(repo: string, base: string, head: string): Promise<Commit[]> {
  return parseLog(await run(repo, ['log', LOG_FORMAT, '--reverse', '-n250', `${base}..${head}`]));
}

export interface FileDiff {
  path: string;
  old_path: string | null;
  kind: 'new' | 'deleted' | 'renamed' | 'modified';
  additions: number;
  deletions: number;
  binary: boolean;
  /** This file's part of the unified diff; null when it's too big to show. */
  patch: string | null;
}

/** What a commit changed against its first parent (everything, for a root commit). */
export async function commitDiff(repo: string, sha: string): Promise<FileDiff[]> {
  const args = ['show', '--format=', '--patch', '-M', '--no-color', '--no-ext-diff', '--diff-merges=first-parent', sha];
  return parsePatch(await run(repo, args));
}

/** What `head` changed since it split from `base`, as a pull request shows it. */
export async function rangeDiff(repo: string, base: string, head: string): Promise<FileDiff[]> {
  return parsePatch(await run(repo, ['diff', '-M', '--no-color', '--no-ext-diff', `${base}...${head}`]));
}

const MAX_FILE_PATCH = 400_000;

/** Split `git diff` output into one entry per file. */
export function parsePatch(text: string): FileDiff[] {
  const files: FileDiff[] = [];
  let patch: string[] = [];
  let size = 0;
  let inHunk = false;
  const finish = () => {
    const f = files.at(-1);
    if (f) f.patch = size <= MAX_FILE_PATCH && !f.binary ? patch.join('\n') + '\n' : null;
    patch = [];
    size = 0;
  };
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      finish();
      inHunk = false;
      files.push({ path: pathFromGitLine(line.slice(11)), old_path: null, kind: 'modified', additions: 0, deletions: 0, binary: false, patch: null });
    }
    const f = files.at(-1);
    if (!f) continue;
    if (size <= MAX_FILE_PATCH) patch.push(line);
    size += line.length + 1;
    if (inHunk) {
      if (line.startsWith('+')) f.additions++;
      else if (line.startsWith('-')) f.deletions++;
    } else if (line.startsWith('@@')) inHunk = true;
    else if (line.startsWith('new file mode')) f.kind = 'new';
    else if (line.startsWith('deleted file mode')) f.kind = 'deleted';
    else if (line.startsWith('rename from ')) {
      f.old_path = line.slice(12);
      f.kind = 'renamed';
    } else if (line.startsWith('rename to ')) f.path = line.slice(10);
    // Git ends the name with a tab when it contains a space.
    else if (line.startsWith('+++ b/')) f.path = line.slice(6).replace(/\t$/, '');
    else if (line.startsWith('Binary files ')) f.binary = true;
  }
  // The text ends with a newline, which leaves one empty "line" behind.
  if (patch.at(-1) === '') patch.pop();
  finish();
  return files;
}

/**
 * `a/x b/x` -> `x`. The halves match unless the file was renamed, and then
 * `rename to` supplies the real name.
 */
function pathFromGitLine(rest: string): string {
  const n = (rest.length - 5) / 2;
  if (Number.isInteger(n) && rest.startsWith('a/') && rest.slice(n + 2, n + 5) === ' b/' && rest.slice(2, n + 2) === rest.slice(n + 5)) {
    return rest.slice(2, n + 2);
  }
  const i = rest.lastIndexOf(' b/');
  return i >= 0 ? rest.slice(i + 3) : rest;
}

/** Is commit `a` already part of `b`'s history? */
export async function isAncestor(repo: string, a: string, b: string): Promise<boolean> {
  const out = await exec(repo, ['merge-base', '--is-ancestor', a, b]);
  if (out.code > 1 || out.code < 0) throw new GitError(out.stderr || 'git merge-base failed');
  return out.code === 0;
}

/**
 * Merge `head` into `base` in memory, with no working tree (git 2.38+).
 * Returns the merged tree, or the conflicting files.
 */
export async function mergeTree(repo: string, base: string, head: string): Promise<{ tree: string } | { conflicts: string[] }> {
  const args = ['merge-tree', '--write-tree', '--name-only', '--no-messages', base, head];
  const out = await exec(repo, args);
  const lines = out.stdout.toString().split('\n');
  if (out.code === 0) return { tree: lines[0] };
  if (out.code === 1) {
    const rest = lines.slice(1);
    const end = rest.indexOf('');
    return { conflicts: end < 0 ? rest : rest.slice(0, end) };
  }
  throw new GitError(out.stderr || 'git merge-tree failed');
}

/**
 * Merge branch `head` into branch `base` with a merge commit, like GitHub's
 * "Create a merge commit". Fails if `base` moved while we worked.
 */
export async function merge(repo: string, base: string, head: string, message: string, sig: Signature): Promise<string> {
  const baseSha = await resolveBranch(repo, base);
  const headSha = await resolveBranch(repo, head);
  if (!baseSha) throw new GitError(`Branch ${base} no longer exists.`);
  if (!headSha) throw new GitError(`Branch ${head} no longer exists.`);
  if (await isAncestor(repo, headSha, baseSha)) throw new GitError(`${base} already contains every commit from ${head}.`);
  const merged = await mergeTree(repo, baseSha, headSha);
  if ('conflicts' in merged) throw new GitError(`This branch has conflicts that must be resolved: ${merged.conflicts.join(', ')}`);
  const commitSha = (
    await run(repo, ['commit-tree', '--no-gpg-sign', merged.tree, '-p', baseSha, '-p', headSha, '-m', message], { sig })
  ).trim();
  await run(repo, ['update-ref', `refs/heads/${base}`, commitSha, baseSha]);
  return commitSha;
}

/** The tree of an empty repository: what a root commit is compared against. */
export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/** The commit `base` and `head` last shared: the "before" side of a pull request. */
export async function mergeBase(repo: string, base: string, head: string): Promise<string> {
  return (await run(repo, ['merge-base', base, head])).trim();
}

/** A file's text at a commit, or null when it isn't there or is too big. */
export async function textAt(repo: string, rev: string, path: string, max = 500_000): Promise<string | null> {
  const size = await exec(repo, ['cat-file', '-s', `${rev}:${path}`]);
  if (size.code !== 0 || Number(size.stdout.toString()) > max) return null;
  const bytes = await runBytes(repo, ['cat-file', 'blob', `${rev}:${path}`]);
  return bytes.subarray(0, 8000).includes(0) ? null : bytes.toString('utf8');
}

/**
 * Lines changed per file when whitespace is ignored, keyed by path. A file
 * with changes that drops to 0 here only had its spacing touched.
 */
export async function changesIgnoringSpace(repo: string, from: string, to: string): Promise<Map<string, number>> {
  const out = await run(repo, ['diff', '-w', '--numstat', '--no-renames', '-z', from, to]);
  const counts = new Map<string, number>();
  for (const rec of out.split('\0')) {
    const [adds, dels, ...path] = rec.split('\t');
    if (path.length) counts.set(path.join('\t'), (Number(adds) || 0) + (Number(dels) || 0));
  }
  return counts;
}

export interface FileStat {
  path: string;
  additions: number;
  deletions: number;
}

/** A commit with the files it touched, for the snapshot timeline. */
export interface CommitWithStats extends Commit {
  files: FileStat[];
}

/** Like `log`, with each commit's changed files (merges against their first parent). */
export async function logWithStats(repo: string, sha: string, path: string | null, skip: number, limit: number): Promise<CommitWithStats[]> {
  const args = [
    'log',
    '--format=%x1e%H%x1f%h%x1f%s%x1f%an%x1f%ae%x1f%at%x1f%P%x1f%b%x1d',
    '--numstat',
    '--no-renames',
    '--diff-merges=first-parent',
    `--skip=${skip}`,
    `-n${limit}`,
    sha,
  ];
  if (path) args.push('--', path);
  const out = await run(repo, args);
  const commits: CommitWithStats[] = [];
  for (const rec of out.split('\x1e')) {
    const end = rec.indexOf('\x1d');
    if (end < 0) continue;
    const f = rec.slice(0, end).split('\x1f');
    if (f.length < 8) continue;
    const files = rec
      .slice(end + 1)
      .split('\n')
      .map((l) => l.split('\t'))
      .filter((p) => p.length >= 3)
      .map(([a, d, ...p]) => ({ path: p.join('\t'), additions: Number(a) || 0, deletions: Number(d) || 0 }));
    commits.push({
      sha: f[0],
      short: f[1],
      summary: f[2],
      author: f[3],
      email: f[4],
      date: Number(f[5]),
      parents: f[6].split(' ').filter(Boolean),
      body: f[7].trim(),
      files,
    });
  }
  return commits;
}

export interface Version {
  sha: string;
  short: string;
  summary: string;
  author: string;
  date: number;
  /** The file's name at this commit; it can change when the file was renamed. */
  path: string;
}

/** Every commit that changed a file, newest first, following renames. Deletions are left out. */
export async function fileVersions(repo: string, sha: string, path: string, limit = 200): Promise<Version[]> {
  const out = await run(repo, ['log', '--follow', '--name-status', `-n${limit}`, '--format=%x1e%H%x1f%h%x1f%s%x1f%an%x1f%at', sha, '--', path]);
  const versions: Version[] = [];
  for (const rec of out.split('\x1e')) {
    const [head, ...rest] = rec.split('\n');
    const f = head.split('\x1f');
    if (f.length < 5) continue;
    const status = rest.find((l) => l.trim());
    if (!status || status.startsWith('D')) continue;
    const parts = status.split('\t');
    versions.push({ sha: f[0], short: f[1], summary: f[2], author: f[3], date: Number(f[4]), path: parts[parts.length - 1] });
  }
  return versions;
}

export interface BlameLine {
  text: string;
  sha: string;
}

export interface BlameCommit {
  short: string;
  summary: string;
  author: string;
  date: number;
}

/** Which commit last changed each line of a file at commit `sha`. */
export async function blame(repo: string, sha: string, path: string): Promise<{ lines: BlameLine[]; commits: Record<string, BlameCommit> }> {
  const out = await run(repo, ['blame', '--porcelain', sha, '--', path]);
  const lines: BlameLine[] = [];
  const commits: Record<string, BlameCommit> = {};
  let current = '';
  for (const line of out.split('\n')) {
    if (line.startsWith('\t')) {
      lines.push({ text: line.slice(1), sha: current });
      continue;
    }
    const header = /^([0-9a-f]{40}) \d+ \d+/.exec(line);
    if (header) {
      current = header[1];
      commits[current] ??= { short: current.slice(0, 7), summary: '', author: '', date: 0 };
      continue;
    }
    const space = line.indexOf(' ');
    const key = line.slice(0, space);
    const value = line.slice(space + 1);
    const c = commits[current];
    if (!c) continue;
    if (key === 'author') c.author = value;
    else if (key === 'author-time') c.date = Number(value);
    else if (key === 'summary') c.summary = value;
  }
  return { lines, commits };
}

/** A commit's message and patch as text, for KuMal to read. */
export async function showPatch(repo: string, from: string, to: string): Promise<string> {
  return run(repo, ['diff', '-M', '--stat', '--patch', '--no-color', '--no-ext-diff', from, to]);
}
