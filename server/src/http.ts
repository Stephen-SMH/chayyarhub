// Request plumbing shared by the controllers: who is signed in, the
// cross-site check, the web app fallback, and repository access.

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  ExecutionContext,
  Injectable,
  NestMiddleware,
  NotFoundException,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { sessionToken, tokenHash } from './auth.js';
import { Config } from './config.js';
import { DbService, type Repo, type User } from './db.service.js';

export type ViewerRequest = Request & { viewer?: User };

/** Attach the signed-in user, from the session cookie, to every request. */
@Injectable()
export class ViewerMiddleware implements NestMiddleware {
  constructor(private readonly db: DbService) {}

  use(req: ViewerRequest, _res: Response, next: NextFunction) {
    const token = sessionToken(req.headers.cookie);
    req.viewer = token ? this.db.sessionUser(tokenHash(token)) : undefined;
    next();
  }
}

/**
 * Browsers send our session cookie with requests from other pages too, so a
 * write must come from a page on this server. (SameSite=Lax alone would let a
 * page on another port of the same host through.)
 */
@Injectable()
export class SameOriginMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const origin = req.headers.origin;
    if (req.method !== 'GET' && req.method !== 'HEAD' && origin && origin.split('://')[1] !== req.headers.host) {
      res.status(403).json({ statusCode: 403, message: 'Cross-site request refused.' });
      return;
    }
    next();
  }
}

/** The signed-in user, or undefined. */
export const Viewer = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<ViewerRequest>().viewer);

export function requireUser(viewer: User | undefined): User {
  if (!viewer) throw new UnauthorizedException('Sign in to do that.');
  return viewer;
}

/**
 * Any path no route handles is a page of the Angular app, so it gets
 * index.html and the app's router takes over. (Express sets `req.route` only
 * when a route matched, so a handler's own 404 still comes back as JSON.)
 */
@Catch(NotFoundException)
export class WebAppFallback implements ExceptionFilter {
  constructor(private readonly webDist: string) {}

  catch(error: NotFoundException, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest<Request>();
    const res = host.switchToHttp().getResponse<Response>();
    if (!req.route && (req.method === 'GET' || req.method === 'HEAD') && !req.path.startsWith('/api/')) {
      const index = join(this.webDist, 'index.html');
      if (existsSync(index)) {
        res.setHeader('Cache-Control', 'no-cache');
        return res.sendFile(index);
      }
      return res.status(404).type('text/plain').send("The ChayYarHub web app isn't built. Run `npm run build` in the chayyarhub folder, then reload.");
    }
    res.status(404).json(error.getResponse());
  }
}

export interface RepoCtx {
  repo: Repo;
  viewer?: User;
  dir: string;
  isOwner: boolean;
}

@Injectable()
export class Access {
  constructor(
    private readonly db: DbService,
    private readonly config: Config,
  ) {}

  /** A repository the viewer may see. Private ones look missing to everyone but their owner, as on GitHub. */
  repo(viewer: User | undefined, owner: string, name: string): RepoCtx {
    const repo = this.db.findRepo(owner, name);
    const isOwner = !!viewer && !!repo && viewer.id === repo.owner_id;
    if (!repo || (repo.private && !isOwner)) throw new NotFoundException('Repository not found.');
    return { repo, viewer, dir: this.config.repoDir(repo.id), isOwner };
  }

  /** The address people reach this server at, for clone URLs. */
  baseUrl(req: Request): string {
    if (this.config.publicUrl) return this.config.publicUrl;
    const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'http';
    return `${proto}://${req.headers.host ?? '127.0.0.1'}`;
  }
}

/** Percent-encode a path for a URL, keeping its slashes. */
export function encodePath(p: string): string {
  return p.split('/').map(encodeURIComponent).join('/');
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
