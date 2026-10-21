// `git clone`/`git push` over HTTP, and raw file downloads. For git we check
// who may do what, then hand the request to `git http-backend` (git's own
// CGI program), which handles protocol v2, gzip bodies and chunked pushes.

import { Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { spawn } from 'node:child_process';
import { basicCredentials, verifyPassword } from './auth.js';
import { Config } from './config.js';
import { DbService, type Repo, type User } from './db.service.js';
import * as git from './git.js';
import { Access, type ViewerRequest } from './http.js';

type Service = 'info/refs' | 'git-upload-pack' | 'git-receive-pack';

function unauthorized(res: Response, message: string) {
  res.status(401).setHeader('WWW-Authenticate', 'Basic realm="ChayYarHub"').type('text/plain').send(message);
}

/** Find where a CGI reply's headers end: a blank line, CRLF or LF style. */
function headerEnd(buf: Buffer): { headers: number; body: number } | null {
  const crlf = buf.indexOf('\r\n\r\n');
  const lf = buf.indexOf('\n\n');
  if (crlf >= 0 && (lf < 0 || crlf < lf)) return { headers: crlf, body: crlf + 4 };
  return lf >= 0 ? { headers: lf, body: lf + 2 } : null;
}

function rawType(path: string, bytes: Buffer): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const images: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
  };
  if (ext && images[ext]) return images[ext];
  return bytes.subarray(0, 8000).includes(0) ? 'application/octet-stream' : 'text/plain; charset=utf-8';
}

@Controller()
export class GitHttpController {
  constructor(
    private readonly db: DbService,
    private readonly config: Config,
    private readonly access: Access,
  ) {}

  @Get(':owner/:repo/info/refs')
  refs(@Param('owner') owner: string, @Param('repo') repo: string, @Req() req: Request, @Res() res: Response) {
    return this.git(owner, repo, 'info/refs', req, res);
  }

  @Post(':owner/:repo/git-upload-pack')
  uploadPack(@Param('owner') owner: string, @Param('repo') repo: string, @Req() req: Request, @Res() res: Response) {
    return this.git(owner, repo, 'git-upload-pack', req, res);
  }

  @Post(':owner/:repo/git-receive-pack')
  receivePack(@Param('owner') owner: string, @Param('repo') repo: string, @Req() req: Request, @Res() res: Response) {
    return this.git(owner, repo, 'git-receive-pack', req, res);
  }

  /** Who is asking, from HTTP basic auth. Undefined if anonymous; null if the password is wrong. */
  private async gitUser(req: Request): Promise<User | undefined | null> {
    const creds = basicCredentials(req.headers.authorization);
    if (!creds) return undefined;
    const found = this.db.loginLookup(creds.username);
    return found && (await verifyPassword(creds.password, found.hash)) ? found.user : null;
  }

  private async git(owner: string, name: string, service: Service, req: Request, res: Response) {
    const push = service === 'git-receive-pack' || req.query.service === 'git-receive-pack';
    const user = await this.gitUser(req);
    if (user === null) return unauthorized(res, 'Invalid username or password.');
    const isOwner = (r: Repo) => !!user && user.id === r.owner_id;
    const repo = this.db.findRepo(owner, name.replace(/\.git$/, ''));
    if (!repo || (repo.private && !isOwner(repo))) {
      // Ask anonymous clients to sign in: the repository may be private.
      if (!user) return unauthorized(res, 'Sign in to reach this repository.');
      return res.status(404).type('text/plain').send('Repository not found.');
    }
    if (push && !user) return unauthorized(res, 'Sign in to push.');
    if (push && !isOwner(repo)) return res.status(403).type('text/plain').send(`You don't have permission to push to ${repo.owner}/${repo.name}.`);

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GIT_PROJECT_ROOT: this.config.reposDir,
      GIT_HTTP_EXPORT_ALL: '1',
      PATH_INFO: `/${repo.id}.git/${service}`,
      REQUEST_METHOD: req.method,
      QUERY_STRING: new URL(req.originalUrl, 'http://x').search.slice(1),
      REMOTE_ADDR: req.socket.remoteAddress ?? '127.0.0.1',
    };
    const copy: Record<string, string> = {
      'content-type': 'CONTENT_TYPE',
      'content-length': 'CONTENT_LENGTH',
      'content-encoding': 'HTTP_CONTENT_ENCODING',
      'git-protocol': 'HTTP_GIT_PROTOCOL',
    };
    for (const [header, variable] of Object.entries(copy)) {
      const value = req.headers[header];
      if (typeof value === 'string') env[variable] = value;
    }
    // http-backend only allows pushes when it knows who is pushing.
    if (user) env.REMOTE_USER = user.username;

    const child = spawn('git', ['http-backend'], { env, stdio: ['pipe', 'pipe', 'inherit'] });
    child.on('error', (e) => {
      if (!res.headersSent) res.status(500).type('text/plain').send(`Could not run git http-backend: ${e.message}`);
    });
    child.stdin.on('error', () => {}); // git may stop reading early; that's not our error.
    req.pipe(child.stdin);

    // A CGI reply: header lines, a blank line, then the body.
    let pending = Buffer.alloc(0);
    let started = false;
    const onData = (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      const end = headerEnd(pending);
      if (!end) return;
      child.stdout.off('data', onData);
      started = true;
      for (const line of pending.subarray(0, end.headers).toString().split(/\r?\n/)) {
        const colon = line.indexOf(':');
        if (colon < 0) continue;
        const key = line.slice(0, colon).trim();
        const value = line.slice(colon + 1).trim();
        if (key.toLowerCase() === 'status') res.status(Number(value.slice(0, 3)) || 500);
        else res.setHeader(key, value);
      }
      res.write(pending.subarray(end.body));
      child.stdout.pipe(res);
    };
    child.stdout.on('data', onData);
    child.stdout.on('end', () => {
      if (!started && !res.headersSent) res.status(502).type('text/plain').send('git http-backend ended early.');
    });
    child.on('close', (code) => {
      if (service === 'git-receive-pack' && code === 0) {
        git.ensureHead(this.config.repoDir(repo.id)).catch(() => {});
        this.db.touchPushed(repo.id);
      }
    });
  }

  /**
   * A file's bytes, like raw.githubusercontent.com. They come from users and
   * share our origin, so the sandbox CSP stops an HTML or SVG file from
   * running script as us.
   */
  @Get(':owner/:repo/raw/*path')
  async raw(@Param('owner') owner: string, @Param('repo') name: string, @Req() req: ViewerRequest, @Res() res: Response) {
    const ctx = this.access.repo(req.viewer, owner, name);
    const prefix = `/${owner}/${name}/raw/`;
    const segs = req.path.slice(prefix.length).split('/').map((s) => decodeURIComponent(s));
    // The ref may itself contain slashes (feature/x), so try each split.
    for (let i = 1; i < segs.length; i++) {
      const sha = await git.resolve(ctx.dir, segs.slice(0, i).join('/'));
      const path = segs.slice(i).join('/');
      if (sha && (await git.objectKind(ctx.dir, sha, path)) === 'blob') {
        const bytes = await git.blob(ctx.dir, sha, path);
        res.setHeader('Content-Type', rawType(path, bytes));
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'");
        res.setHeader('Cache-Control', 'no-cache');
        return res.send(bytes);
      }
    }
    res.status(404).type('text/plain').send('Not found.');
  }
}
