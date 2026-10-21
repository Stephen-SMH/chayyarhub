import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { AppModule } from './app.module.js';
import { Config } from './config.js';
import { setup } from './setup.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn'] });
  setup(app);
  const config = app.get(Config);

  // Merging pull requests uses `git merge-tree --write-tree`, new in git 2.38.
  const version = /(\d+)\.(\d+)/.exec(spawnSync('git', ['--version'], { encoding: 'utf8' }).stdout ?? '');
  if (!version) console.warn('git was not found on PATH; ChayYarHub needs it.');
  else if (Number(version[1]) * 1000 + Number(version[2]) < 2038) console.warn(`git ${version[0]} is too old to merge pull requests; install git 2.38 or newer.`);
  if (!existsSync(config.webDist)) console.warn(`The web app isn't built (looked in ${config.webDist}). Run \`npm run build\`.`);

  await app.listen(config.port, config.host);
  console.log(`ChayYarHub is running at http://${config.host}:${config.port}/`);
  console.log(`Accounts and repositories live in ${config.dataDir}`);
}

await bootstrap();
