// End to end: a real server on a random port, driven over HTTP and by the
// real `git` client, the way people will use it.

import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { setup } from '../src/setup.js';

const exec = promisify(execFile);
const tmp = mkdtempSync(join(tmpdir(), 'chayyar-e2e-'));
process.env.CHAYYAR_DATA = join(tmp, 'data');
process.env.CHAYYAR_WEB = join(tmp, 'no-web-build');
process.env.CHAYYAR_KUMAL = 'off'; // never call Claude from tests

/** Git as a user runs it, except it never prompts or touches the real keychain. */
async function git(cwd: string, ...args: string[]): Promise<string> {
  const config = ['credential.helper=', 'user.name=Tester', 'user.email=t@example.com', 'commit.gpgsign=false', 'init.defaultBranch=main'];
  const { stdout } = await exec('git', [...config.flatMap((c) => ['-c', c]), ...args], {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  return stdout;
}

async function gitFails(cwd: string, ...args: string[]): Promise<string> {
  try {
    await git(cwd, ...args);
  } catch (e) {
    return String((e as { stderr?: string }).stderr);
  }
  throw new Error(`git ${args.join(' ')} should have failed`);
}

let app: NestExpressApplication;
let base: string;
const PASSWORD = 'pass:word 1'; // ':' and ' ' must survive basic auth

/** A git URL carrying credentials, or anonymous when `user` is empty. */
const remote = (path: string, user = '') => (user ? base.replace('://', `://${user}:${encodeURIComponent(PASSWORD)}@`) : base) + `/${path}`;

async function signUp(username: string) {
  const agent = request.agent(base);
  await agent.post('/api/signup').send({ username, password: PASSWORD }).expect(201);
  return agent;
}

function workdir(name: string): string {
  const dir = join(tmp, 'work', name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication<NestExpressApplication>();
  setup(app);
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
});

afterAll(async () => {
  await app.close();
  rmSync(tmp, { recursive: true, force: true });
});

describe('accounts', () => {
  it('signs up, in and out, and refuses bad names', async () => {
    const ada = await signUp('ada');
    expect((await ada.get('/api/me')).body.user.username).toBe('ada');

    const anon = request(base);
    expect((await anon.post('/api/signup').send({ username: 'ADA', password: PASSWORD })).status).toBe(409);
    expect((await anon.post('/api/signup').send({ username: 'api', password: PASSWORD })).status).toBe(400);
    expect((await anon.post('/api/signup').send({ username: 'grace', password: 'short' })).status).toBe(400);
    expect((await anon.post('/api/login').send({ username: 'ada', password: 'wrong password' })).status).toBe(401);

    await ada.post('/api/logout').expect(200);
    expect((await ada.get('/api/me')).body.user).toBeNull();
    await ada.post('/api/login').send({ username: 'ada', password: PASSWORD }).expect(200);
    expect((await ada.get('/api/me')).body.user.username).toBe('ada');
  });

  it('refuses writes from other sites', async () => {
    const res = await request(base).post('/api/login').set('Origin', 'https://evil.example').send({ username: 'ada', password: PASSWORD });
    expect(res.status).toBe(403);
  });
});

describe('repositories', () => {
  it('takes a push, shows the code, and serves clones', async () => {
    const ada = request.agent(base);
    await ada.post('/api/login').send({ username: 'ada', password: PASSWORD }).expect(200);
    await ada.post('/api/repos').send({ name: 'weather', description: 'Forecasts' }).expect(201);
    expect((await ada.post('/api/repos').send({ name: 'Weather' })).status).toBe(409);
    expect((await ada.get('/api/repos/ada/weather')).body.default_branch).toBeNull();

    const local = workdir('weather');
    await git(local, 'init', '-q');
    mkdirSync(join(local, 'src'));
    mkdirSync(join(local, 'docs'));
    writeFileSync(join(local, 'README.md'), '# Weather\n\n![logo](docs/logo.png)\n');
    writeFileSync(join(local, 'src', 'main.ts'), 'export const city = "Yangon";\n');
    writeFileSync(join(local, 'docs', 'မြန်မာ.txt'), 'မင်္ဂလာပါ\n');
    writeFileSync(join(local, 'big.bin'), randomBytes(3_000_000)); // bigger than any default body limit
    await git(local, 'add', '-A');
    await git(local, 'commit', '-qm', 'First forecast');
    await git(local, 'push', '-q', remote('ada/weather.git', 'ada'), 'main');

    const meta = (await ada.get('/api/repos/ada/weather')).body;
    expect(meta.default_branch).toBe('main');
    expect(meta.clone_url).toBe(`${base}/ada/weather.git`);
    expect(meta.repo.pushed_at).toBeGreaterThan(0);

    const root = (await ada.get('/api/repos/ada/weather/contents')).body;
    expect(root.entries.map((e: { name: string }) => e.name)).toEqual(['docs', 'src', 'big.bin', 'README.md']);
    expect(root.readme.html).toContain('src="/ada/weather/raw/main/docs/logo.png"');
    const docs = (await ada.get('/api/repos/ada/weather/contents').query({ path: 'docs' })).body;
    expect(docs.entries[0].name).toBe('မြန်မာ.txt');
    const file = (await ada.get('/api/repos/ada/weather/contents').query({ path: 'src/main.ts', ref: 'main' })).body;
    expect(file).toMatchObject({ type: 'file', binary: false, text: 'export const city = "Yangon";\n' });
    expect((await ada.get('/api/repos/ada/weather/contents').query({ path: 'big.bin' })).body.too_large).toBe(true);

    const { commits } = (await ada.get('/api/repos/ada/weather/commits')).body;
    expect(commits.map((c: { summary: string }) => c.summary)).toEqual(['First forecast']);
    const detail = (await ada.get(`/api/repos/ada/weather/commits/${commits[0].sha}`)).body;
    expect(detail.files).toHaveLength(4);

    const raw = await request(base).get('/ada/weather/raw/main/src/main.ts');
    expect(raw.status).toBe(200);
    expect(raw.headers['content-security-policy']).toContain('sandbox');
    expect(raw.text).toContain('Yangon');
    expect((await request(base).get(`/ada/weather/raw/main/docs/${encodeURIComponent('မြန်မာ.txt')}`)).text).toContain('မင်္ဂလာပါ');

    // Anyone can clone a public repository; only its owner can push.
    const clone = join(tmp, 'work', 'weather-clone');
    await git(tmp, 'clone', '-q', remote('ada/weather.git'), clone);
    expect(readFileSync(join(clone, 'src', 'main.ts'), 'utf8')).toContain('Yangon');
    await signUp('bob');
    writeFileSync(join(clone, 'bob.txt'), 'hi');
    await git(clone, 'add', '-A');
    await git(clone, 'commit', '-qm', 'Bob was here');
    expect(await gitFails(clone, 'push', remote('ada/weather.git', 'bob'), 'main')).toContain('403');
    expect(await gitFails(clone, 'push', remote('ada/weather.git'), 'main')).toMatch(/could not read Username/);
  });

  it('hides private repositories from everyone but their owner', async () => {
    const ada = request.agent(base);
    await ada.post('/api/login').send({ username: 'ada', password: PASSWORD }).expect(200);
    await ada.patch('/api/repos/ada/weather').send({ private: true }).expect(200);

    expect((await request(base).get('/api/repos/ada/weather')).status).toBe(404);
    const bob = request.agent(base);
    await bob.post('/api/login').send({ username: 'bob', password: PASSWORD }).expect(200);
    expect((await bob.get('/api/repos/ada/weather')).status).toBe(404);
    expect((await bob.get('/api/users/ada')).body.repos).toEqual([]);
    expect((await ada.get('/api/users/ada')).body.repos).toHaveLength(1);

    expect(await gitFails(tmp, 'clone', '-q', remote('ada/weather.git'), join(tmp, 'work', 'anon'))).toMatch(/could not read Username/);
    expect(await gitFails(tmp, 'clone', '-q', remote('ada/weather.git', 'bob'), join(tmp, 'work', 'bob'))).toContain('Repository not found');
    await git(tmp, 'clone', '-q', remote('ada/weather.git', 'ada'), join(tmp, 'work', 'ada-private'));
    expect(existsSync(join(tmp, 'work', 'ada-private', 'README.md'))).toBe(true);
  });
});

describe('issues and pull requests', () => {
  it('opens, reviews and merges a pull request', async () => {
    const ada = request.agent(base);
    await ada.post('/api/login').send({ username: 'ada', password: PASSWORD }).expect(200);
    const bob = request.agent(base);
    await bob.post('/api/login').send({ username: 'bob', password: PASSWORD }).expect(200);
    await ada.post('/api/repos').send({ name: 'notes', description: 'Ideas', readme: true }).expect(201);

    const local = join(tmp, 'work', 'notes');
    await git(tmp, 'clone', '-q', remote('ada/notes.git', 'ada'), local);
    expect(readFileSync(join(local, 'README.md'), 'utf8')).toBe('# notes\n\nIdeas\n');
    await git(local, 'switch', '-qc', 'feature/hourly');
    writeFileSync(join(local, 'hourly.md'), 'Every hour\n');
    await git(local, 'add', '-A');
    await git(local, 'commit', '-qm', 'Add hourly notes');
    await git(local, 'push', '-q', 'origin', 'feature/hourly');

    const cmp = (await ada.get('/api/repos/ada/notes/compare').query({ base: 'main', head: 'feature/hourly' })).body;
    expect(cmp).toMatchObject({ mergeable: true, existing_pull: null });
    expect(cmp.commits).toHaveLength(1);
    expect(cmp.files[0].path).toBe('hourly.md');

    const pr = (await bob.post('/api/repos/ada/notes/pulls').send({ title: 'Hourly notes', body: 'Please **merge**', base: 'main', head: 'feature/hourly' })).body;
    expect(pr.number).toBe(1);
    expect((await bob.post('/api/repos/ada/notes/pulls').send({ title: 'Again', base: 'main', head: 'feature/hourly' })).status).toBe(409);
    await bob.post('/api/repos/ada/notes/issues/1/comments').send({ body: 'Ready when you are' }).expect(201);
    expect((await bob.post('/api/repos/ada/notes/pulls/1/merge')).status).toBe(403);

    const { merged_sha } = (await ada.post('/api/repos/ada/notes/pulls/1/merge').expect(200)).body;
    const shown = (await ada.get('/api/repos/ada/notes/issues/1')).body;
    expect(shown.issue.state).toBe('merged');
    expect(shown.body_html).toContain('<strong>merge</strong>');
    expect(shown.comments.map((c: { kind: string }) => c.kind)).toEqual(['comment', 'merged']);
    expect(shown.pull.commits.map((c: { summary: string }) => c.summary)).toEqual(['Add hourly notes']);

    await git(local, 'fetch', '-q');
    expect((await git(local, 'rev-parse', 'origin/main')).trim()).toBe(merged_sha);
    expect((await git(local, 'log', '-1', '--format=%P', 'origin/main')).trim().split(' ')).toHaveLength(2);
    const pulls = (await ada.get('/api/repos/ada/notes/issues').query({ pulls: 'true', state: 'closed' })).body;
    expect(pulls).toMatchObject({ open: 0, closed: 1 });

    // Issues share the numbering, and only the author or owner can close one.
    const issue = (await ada.post('/api/repos/ada/notes/issues').send({ title: 'Add radar maps' }).expect(201)).body;
    expect(issue.number).toBe(2);
    expect((await bob.post('/api/repos/ada/notes/issues/2/state').send({ state: 'closed' })).status).toBe(403);
    await ada.post('/api/repos/ada/notes/issues/2/state').send({ state: 'closed' }).expect(200);
    expect((await ada.get('/api/repos/ada/notes/issues/2')).body.issue.state).toBe('closed');
  });

  it('reports conflicts instead of merging', async () => {
    const ada = request.agent(base);
    await ada.post('/api/login').send({ username: 'ada', password: PASSWORD }).expect(200);
    const local = join(tmp, 'work', 'notes');
    await git(local, 'switch', '-qC', 'clash', 'origin/main');
    writeFileSync(join(local, 'README.md'), '# notes\n\nClash\n');
    await git(local, 'commit', '-qam', 'Change the description');
    await git(local, 'push', '-q', 'origin', 'clash');
    await git(local, 'switch', '-qC', 'main', 'origin/main');
    writeFileSync(join(local, 'README.md'), '# notes\n\nMain moved on\n');
    await git(local, 'commit', '-qam', 'Move main on');
    await git(local, 'push', '-q', 'origin', 'main');

    const cmp = (await ada.get('/api/repos/ada/notes/compare').query({ base: 'main', head: 'clash' })).body;
    expect(cmp).toMatchObject({ mergeable: false, conflicts: ['README.md'] });
    await ada.post('/api/repos/ada/notes/pulls').send({ title: 'Clash', base: 'main', head: 'clash' }).expect(201);
    const merge = await ada.post('/api/repos/ada/notes/pulls/3/merge');
    expect(merge.status).toBe(409);
    expect(merge.body.message).toContain('README.md');
  });
});

describe('snapshots', () => {
  it('explains what a snapshot changed, and plays back a file', async () => {
    const ada = request.agent(base);
    await ada.post('/api/login').send({ username: 'ada', password: PASSWORD }).expect(200);
    await ada.post('/api/repos').send({ name: 'shop' }).expect(201);
    const local = workdir('shop');
    await git(local, 'init', '-q');
    mkdirSync(join(local, 'src'));
    writeFileSync(join(local, 'src', 'cart.ts'), 'export function total(items: number[]) {\n  return items.length;\n}\n');
    writeFileSync(join(local, 'package-lock.json'), '{}\n');
    await git(local, 'add', '-A');
    await git(local, 'commit', '-qm', 'Start the cart');
    writeFileSync(join(local, 'src', 'cart.ts'), 'export function total(items: number[]) {\n  return items.reduce((a, b) => a + b, 0);\n}\n\nexport function empty() {\n  return [];\n}\n');
    writeFileSync(join(local, 'package-lock.json'), '{ "lockfileVersion": 3 }\n');
    writeFileSync(join(local, 'README.md'), '# Shop\n');
    await git(local, 'add', '-A');
    await git(local, 'commit', '-qm', 'Add up prices');
    await git(local, 'push', '-q', remote('ada/shop.git', 'ada'), 'main');

    const { commits } = (await ada.get('/api/repos/ada/shop/commits')).body;
    expect(commits[0].stats).toMatchObject({ files: 3, groups: { code: { files: 1 }, generated: { files: 1 }, docs: { files: 1 } } });
    expect(commits[1].stats.files).toBe(2);

    const { files } = (await ada.get(`/api/repos/ada/shop/commits/${commits[0].sha}`)).body;
    const cart = files.find((f: { path: string }) => f.path === 'src/cart.ts');
    expect(cart).toMatchObject({ group: 'code', noise: null });
    expect(cart.symbols.added.map((s: { name: string }) => s.name)).toEqual(['empty']);
    expect(cart.symbols.changed.map((s: { name: string }) => s.name)).toEqual(['total']);
    expect(files.find((f: { path: string }) => f.path === 'package-lock.json')).toMatchObject({ group: 'generated', noise: 'generated' });

    const history = (await ada.get('/api/repos/ada/shop/file-history').query({ path: 'src/cart.ts' })).body;
    expect(history.versions.map((v: { summary: string }) => v.summary)).toEqual(['Add up prices', 'Start the cart']);
    const old = (await ada.get('/api/repos/ada/shop/blame').query({ ref: history.versions[1].sha, path: 'src/cart.ts' })).body;
    expect(old.lines).toHaveLength(3);
    const now = (await ada.get('/api/repos/ada/shop/blame').query({ ref: history.versions[0].sha, path: 'src/cart.ts' })).body;
    const by = now.lines.map((l: { sha: string }) => now.commits[l.sha].summary);
    expect(by).toHaveLength(7);
    expect(by.slice(0, 2)).toEqual(['Start the cart', 'Add up prices']);

    expect((await request(base).post('/api/repos/ada/shop/explain').send({ sha: commits[0].sha })).status).toBe(401);
    expect((await ada.post('/api/repos/ada/shop/explain').send({ sha: commits[0].sha })).status).toBe(503);
  });

  it('marks changes that only touch spacing', async () => {
    const ada = request.agent(base);
    await ada.post('/api/login').send({ username: 'ada', password: PASSWORD }).expect(200);
    const local = join(tmp, 'work', 'shop');
    writeFileSync(join(local, 'src', 'cart.ts'), 'export function total(items: number[]) {\n    return items.reduce((a, b) => a + b, 0);\n}\n\nexport function empty() {\n    return [];\n}\n');
    await git(local, 'commit', '-qam', 'Indent with four spaces');
    await git(local, 'push', '-q', remote('ada/shop.git', 'ada'), 'main');
    const { files } = (await ada.get('/api/repos/ada/shop/commits/main')).body;
    expect(files[0]).toMatchObject({ path: 'src/cart.ts', noise: 'whitespace', symbols: null });
  });
});

describe('web app routes', () => {
  it('sends pages to the web app and unknown API calls a JSON 404', async () => {
    const page = await request(base).get('/ada/notes/pulls');
    expect(page.status).toBe(404);
    expect(page.text).toContain("isn't built");
    const api = await request(base).get('/api/nope');
    expect(api.status).toBe(404);
    expect(api.headers['content-type']).toContain('json');
  });
});
