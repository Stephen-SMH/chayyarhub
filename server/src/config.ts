import { Injectable } from '@nestjs/common';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Settings come from the environment and are read once at startup. */
@Injectable()
export class Config {
  readonly port = Number(process.env.PORT ?? 4830);
  readonly host = process.env.HOST ?? '127.0.0.1';
  /** Accounts and repositories; by default chayyarhub-data/ in the project, wherever it is started from. */
  readonly dataDir = resolve(process.env.CHAYYAR_DATA ?? fileURLToPath(new URL('../../chayyarhub-data/', import.meta.url)));
  readonly reposDir = resolve(this.dataDir, 'repos');
  /** The address people use, when it differs from the Host header (for example behind HTTPS). */
  readonly publicUrl = process.env.CHAYYAR_URL?.replace(/\/+$/, '') || undefined;
  readonly secureCookies = !!this.publicUrl?.startsWith('https://');
  /** The built Angular app. This file sits in server/src or server/dist, two levels below the project. */
  /** KuMal, the plain-language explainer: off when CHAYYAR_KUMAL=off. */
  readonly kumal = process.env.CHAYYAR_KUMAL !== 'off';
  readonly kumalModel = process.env.CHAYYAR_KUMAL_MODEL || 'claude-opus-5-5';
  readonly webDist = process.env.CHAYYAR_WEB ?? fileURLToPath(new URL('../../web/dist/', import.meta.url));

  repoDir(id: number): string {
    return resolve(this.reposDir, `${id}.git`);
  }
}
