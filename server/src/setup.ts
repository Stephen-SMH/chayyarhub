import { ArgumentsHost, Catch, ExceptionFilter, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Response } from 'express';
import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { Config } from './config.js';
import { GitError } from './git.js';
import { WebAppFallback } from './http.js';

/** Git failures carry a message worth showing, unlike other unexpected errors. */
@Catch(GitError)
class GitErrorFilter implements ExceptionFilter {
  catch(error: GitError, host: ArgumentsHost) {
    host.switchToHttp().getResponse<Response>().status(500).json({ statusCode: 500, message: error.message });
  }
}

/** Angular puts a content hash in built file names (main-ABCD1234.js), so those never change. */
const HASHED = /-[A-Z0-9]{8}\.[a-z0-9]+$/;

/** Everything main.ts and the tests both need on top of the module. */
export function setup(app: NestExpressApplication) {
  const config = app.get(Config);
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: '1mb' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.useGlobalFilters(new GitErrorFilter(), new WebAppFallback(config.webDist));
  if (existsSync(config.webDist)) {
    app.useStaticAssets(config.webDist, {
      index: false,
      setHeaders: (res, path) => res.setHeader('Cache-Control', HASHED.test(basename(path)) ? 'public, max-age=31536000, immutable' : 'no-cache'),
    });
  }
}
