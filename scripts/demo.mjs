// Fill a running ChayYarHub with sample data: two people, a small weather
// app with ten snapshots of history (new code, moved code, a dependency
// update, a spacing-only change, a rename), an open pull request and an issue.
//
//   npm start            # in one terminal
//   npm run demo         # in another; CHAYYAR_URL picks a different hub

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const HUB = (process.env.CHAYYAR_URL ?? 'http://127.0.0.1:4830').replace(/\/+$/, '');
const PASSWORD = 'footprints';
const DAY = 86400;
const start = Math.floor(Date.now() / 1000) - 12 * DAY;

/** A signed-in API client: keeps the session cookie between calls. */
async function account(username) {
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(`${HUB}/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', cookie, origin: HUB },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  };
  let r = await call('POST', '/signup', { username, password: PASSWORD });
  if (r.status === 409) r = await call('POST', '/login', { username, password: PASSWORD });
  if (r.status >= 300) throw new Error(`Couldn't sign in as ${username}: ${JSON.stringify(r.data)}`);
  return call;
}

const work = mkdtempSync(join(tmpdir(), 'chayyar-demo-'));
let clock = start;

function git(...args) {
  const env = {
    ...process.env,
    GIT_AUTHOR_DATE: `${clock} +0630`,
    GIT_COMMITTER_DATE: `${clock} +0630`,
    GIT_TERMINAL_PROMPT: '0',
  };
  const config = ['credential.helper=', 'commit.gpgsign=false', 'init.defaultBranch=main'];
  return execFileSync('git', [...config.flatMap((c) => ['-c', c]), ...args], { cwd: work, env, encoding: 'utf8' });
}

function write(files) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(work, path)), { recursive: true });
    writeFileSync(join(work, path), text.replace(/^\n/, ''));
  }
}

function snapshot(who, message, hours = 20) {
  clock += hours * 3600;
  git('add', '-A');
  git('-c', `user.name=${who}`, '-c', `user.email=${who}@users.noreply.chayyarhub`, 'commit', '-qm', message);
}

/** A lockfile long enough to show why generated files get folded away. */
function lockfile(version) {
  const packages = ['undici', 'zod', 'date-fns', 'kleur', 'vitest', 'typescript', 'tinybench', 'pathe', 'magic-string', 'esbuild'];
  const entries = packages.map((p, i) => `    "node_modules/${p}": {\n      "version": "${version}.${i}.${(i * 7) % 10}",\n      "resolved": "https://registry.npmjs.org/${p}/-/${p}-${version}.${i}.0.tgz",\n      "integrity": "sha512-${Buffer.from(p + version).toString('base64')}"\n    }`);
  return `{\n  "name": "yangon-weather",\n  "lockfileVersion": 3,\n  "packages": {\n${entries.join(',\n')}\n  }\n}\n`;
}

const soe = await account('soe');
const ada = await account('ada');
const created = await soe('POST', '/repos', { name: 'yangon-weather', description: 'Forecasts and rain alerts for Yangon, in English and Burmese' });
if (created.status === 409) {
  console.log('soe/yangon-weather already exists; delete it in its settings to seed again.');
  process.exit(0);
}

git('init', '-q');

write({
  'README.md': `
# Yangon Weather

Forecasts for Yangon, from a public weather API.
`,
  'package.json': `
{
  "name": "yangon-weather",
  "version": "0.1.0",
  "type": "module",
  "scripts": { "start": "node dist/index.js", "test": "vitest run" },
  "dependencies": { "undici": "^6.0.0" }
}
`,
  'package-lock.json': lockfile(1),
  'src/forecast.ts': `
import { request } from 'undici';

export interface Forecast {
  day: string;
  high: number;
  low: number;
  rain: number;
}

/** Daily forecasts for a city, from the weather API. */
export async function fetchForecast(city: string): Promise<Forecast[]> {
  const res = await request(\`https://api.example.com/forecast?city=\${encodeURIComponent(city)}\`);
  const body = (await res.body.json()) as { days: Forecast[] };
  return body.days;
}

/** A temperature as people read it. */
export function formatTemp(celsius: number): string {
  return \`\${Math.round(celsius)}°C\`;
}
`,
  'src/index.ts': `
import { fetchForecast, formatTemp } from './forecast.js';

const days = await fetchForecast('Yangon');
for (const d of days) {
  console.log(d.day, formatTemp(d.high), formatTemp(d.low));
}
`,
});
snapshot('soe', 'Start the weather app');

write({
  'src/forecast.ts': `
import { request } from 'undici';

export interface Forecast {
  day: string;
  high: number;
  low: number;
  rain: number;
}

export interface Hour {
  time: string;
  temp: number;
  rain: number;
}

/** Daily forecasts for a city, from the weather API. */
export async function fetchForecast(city: string): Promise<Forecast[]> {
  const res = await request(\`https://api.example.com/forecast?city=\${encodeURIComponent(city)}\`);
  const body = (await res.body.json()) as { days: Forecast[] };
  return body.days;
}

/** The next 24 hours, hour by hour. */
export async function fetchHourly(city: string): Promise<Hour[]> {
  const res = await request(\`https://api.example.com/hourly?city=\${encodeURIComponent(city)}&hours=24\`);
  const body = (await res.body.json()) as { hours: Hour[] };
  return body.hours;
}

/** A temperature as people read it. */
export function formatTemp(celsius: number): string {
  return \`\${Math.round(celsius)}°C\`;
}
`,
  'test/forecast.spec.ts': `
import { formatTemp } from '../src/forecast.js';

test('rounds temperatures', () => {
  expect(formatTemp(31.6)).toBe('32°C');
});
`,
  'README.md': `
# Yangon Weather

Forecasts for Yangon, from a public weather API: the next week day by day,
and the next 24 hours hour by hour.
`,
});
snapshot('soe', 'Add hourly forecasts', 26);

write({
  'src/forecast.ts': `
import { request } from 'undici';

export interface Forecast {
  day: string;
  high: number;
  low: number;
  rain: number;
}

export interface Hour {
  time: string;
  temp: number;
  rain: number;
}

/** Daily forecasts for a city, from the weather API. */
export async function fetchForecast(city: string): Promise<Forecast[]> {
  const res = await request(\`https://api.example.com/forecast?city=\${encodeURIComponent(city)}\`);
  const body = (await res.body.json()) as { days: Forecast[] };
  return body.days;
}

/** The next 24 hours, hour by hour. */
export async function fetchHourly(city: string): Promise<Hour[]> {
  const res = await request(\`https://api.example.com/hourly?city=\${encodeURIComponent(city)}&hours=24\`);
  const body = (await res.body.json()) as { hours: Hour[] };
  return body.hours;
}

export function toFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

/** A temperature as people read it, in both scales. */
export function formatTemp(celsius: number): string {
  return \`\${Math.round(celsius)}°C (\${Math.round(toFahrenheit(celsius))}°F)\`;
}
`,
  'test/forecast.spec.ts': `
import { formatTemp, toFahrenheit } from '../src/forecast.js';

test('rounds temperatures', () => {
  expect(formatTemp(31.6)).toBe('32°C (89°F)');
});

test('converts to Fahrenheit', () => {
  expect(toFahrenheit(100)).toBe(212);
});
`,
});
snapshot('ada', 'Show temperatures in Fahrenheit too', 30);

write({
  'src/forecast.ts': `
import { request } from 'undici';

export interface Forecast {
  day: string;
  high: number;
  low: number;
  rain: number;
}

export interface Hour {
  time: string;
  temp: number;
  rain: number;
}

/** Daily forecasts for a city, from the weather API. */
export async function fetchForecast(city: string): Promise<Forecast[]> {
  const res = await request(\`https://api.example.com/forecast?city=\${encodeURIComponent(city)}\`);
  const body = (await res.body.json()) as { days: Forecast[] };
  return body.days;
}

/** The next 24 hours, hour by hour. */
export async function fetchHourly(city: string): Promise<Hour[]> {
  const res = await request(\`https://api.example.com/hourly?city=\${encodeURIComponent(city)}&hours=24\`);
  const body = (await res.body.json()) as { hours: Hour[] };
  return body.hours;
}
`,
  'src/format.ts': `
export function toFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

/** A temperature as people read it, in both scales. */
export function formatTemp(celsius: number): string {
  return \`\${Math.round(celsius)}°C (\${Math.round(toFahrenheit(celsius))}°F)\`;
}
`,
  'src/index.ts': `
import { fetchForecast } from './forecast.js';
import { formatTemp } from './format.js';

const days = await fetchForecast('Yangon');
for (const d of days) {
  console.log(d.day, formatTemp(d.high), formatTemp(d.low));
}
`,
  'test/forecast.spec.ts': `
import { formatTemp, toFahrenheit } from '../src/format.js';

test('rounds temperatures', () => {
  expect(formatTemp(31.6)).toBe('32°C (89°F)');
});

test('converts to Fahrenheit', () => {
  expect(toFahrenheit(100)).toBe(212);
});
`,
});
snapshot('soe', 'Move temperature formatting into its own file', 22);

write({
  'package.json': `
{
  "name": "yangon-weather",
  "version": "0.2.0",
  "type": "module",
  "scripts": { "start": "node dist/index.js", "test": "vitest run" },
  "dependencies": { "undici": "^7.2.0" },
  "devDependencies": { "vitest": "^4.0.0", "typescript": "^6.0.0" }
}
`,
  'package-lock.json': lockfile(2),
});
snapshot('ada', 'Update dependencies', 18);

write({
  'src/index.ts': `
import { fetchForecast } from './forecast.js';
import { formatTemp } from './format.js';

const days = await fetchForecast('Yangon');
for (const d of days) {
    console.log(d.day, formatTemp(d.high), formatTemp(d.low));
}
`,
});
snapshot('ada', 'Indent with four spaces', 5);

renameSync(join(work, 'src/index.ts'), join(work, 'src/main.ts'));
write({
  'package.json': `
{
  "name": "yangon-weather",
  "version": "0.2.0",
  "type": "module",
  "scripts": { "start": "node dist/main.js", "test": "vitest run" },
  "dependencies": { "undici": "^7.2.0" },
  "devDependencies": { "vitest": "^4.0.0", "typescript": "^6.0.0" }
}
`,
});
snapshot('soe', 'Call the entry point main.ts', 28);

write({
  'src/alerts.ts': `
import type { Hour } from './forecast.js';

export type Level = 'none' | 'light' | 'heavy';

/** Warns when rain is on its way, so nobody gets caught on the way home. */
export class RainAlert {
  constructor(private readonly threshold = 0.6) {}

  /** How bad the rain will be in the coming hours. */
  level(hours: Hour[]): Level {
    const worst = Math.max(0, ...hours.map((h) => h.rain));
    if (worst >= 0.85) return 'heavy';
    return worst >= this.threshold ? 'light' : 'none';
  }

  /** The first hour rain is likely, or null. */
  firstRainyHour(hours: Hour[]): Hour | null {
    return hours.find((h) => h.rain >= this.threshold) ?? null;
  }
}
`,
  'src/main.ts': `
import { RainAlert } from './alerts.js';
import { fetchForecast, fetchHourly } from './forecast.js';
import { formatTemp } from './format.js';

const days = await fetchForecast('Yangon');
for (const d of days) {
    console.log(d.day, formatTemp(d.high), formatTemp(d.low));
}

const alert = new RainAlert();
const hours = await fetchHourly('Yangon');
const rain = alert.firstRainyHour(hours);
if (rain) console.log(\`Rain likely from \${rain.time} (\${alert.level(hours)})\`);
`,
  'test/alerts.spec.ts': `
import { RainAlert } from '../src/alerts.js';

const hour = (rain: number) => ({ time: '15:00', temp: 30, rain });

test('rates the rain', () => {
  const alert = new RainAlert();
  expect(alert.level([hour(0.1)])).toBe('none');
  expect(alert.level([hour(0.7)])).toBe('light');
  expect(alert.level([hour(0.9)])).toBe('heavy');
});
`,
  'docs/alerts.md': `
# Rain alerts

When rain is likely in the next 24 hours, the app says from what time, and how
heavy it will be: light (60% or more) or heavy (85% or more).
`,
  'public/rain.svg': `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M7 16a5 5 0 1 1 1-9.9A6 6 0 0 1 19 9a4 4 0 0 1-1 7.9" fill="none" stroke="#5aa9f0" stroke-width="2"/></svg>
`,
});
snapshot('ada', 'Add rain alerts', 34);

write({
  'docs/alerts.my.md': `
# မိုးသတိပေးချက်

နောက် ၂၄ နာရီအတွင်း မိုးရွာနိုင်ရင် ဘယ်အချိန်ကစပြီး ရွာမလဲ၊ ဘယ်လောက် သည်းမလဲ ဆိုတာ ပြောပြပါတယ်။
`,
  'README.md': `
# Yangon Weather

Forecasts for Yangon, from a public weather API: the next week day by day,
and the next 24 hours hour by hour, with rain alerts.

ရန်ကုန်မြို့ ရာသီဥတု ခန့်မှန်းချက်နှင့် မိုးသတိပေးချက်။

See [docs/alerts.md](docs/alerts.md).
`,
});
snapshot('soe', 'Explain rain alerts in Burmese', 9);

git('push', '-q', HUB.replace('://', `://soe:${PASSWORD}@`) + '/soe/yangon-weather.git', 'main');

// A branch with work in progress, for a pull request.
git('switch', '-qc', 'feature/air-quality');
write({
  'src/air.ts': `
export interface Air {
  pm25: number;
}

/** The air quality band for a PM2.5 reading, as the city's signs show it. */
export function airBand(air: Air): 'good' | 'moderate' | 'unhealthy' {
  if (air.pm25 <= 12) return 'good';
  return air.pm25 <= 35 ? 'moderate' : 'unhealthy';
}
`,
  'src/main.ts': `
import { airBand } from './air.js';
import { RainAlert } from './alerts.js';
import { fetchForecast, fetchHourly } from './forecast.js';
import { formatTemp } from './format.js';

const days = await fetchForecast('Yangon');
for (const d of days) {
    console.log(d.day, formatTemp(d.high), formatTemp(d.low));
}

const alert = new RainAlert();
const hours = await fetchHourly('Yangon');
const rain = alert.firstRainyHour(hours);
if (rain) console.log(\`Rain likely from \${rain.time} (\${alert.level(hours)})\`);

console.log('Air today:', airBand({ pm25: 28 }));
`,
});
snapshot('ada', 'Show the air quality band', 6);
git('push', '-q', HUB.replace('://', `://soe:${PASSWORD}@`) + '/soe/yangon-weather.git', 'feature/air-quality');

await ada('POST', '/repos/soe/yangon-weather/pulls', {
  title: 'Show the air quality band',
  body: 'Adds a PM2.5 reading to the morning summary.\n\n- [x] Bands match the city signs\n- [ ] Fetch real readings instead of the sample value',
  base: 'main',
  head: 'feature/air-quality',
});
const issue = await ada('POST', '/repos/soe/yangon-weather/issues', {
  title: 'Hourly forecast shows UTC instead of Myanmar time',
  body: 'At 9 in the morning the first hour says **02:30**. Myanmar is UTC+6:30.',
});
await soe('POST', `/repos/soe/yangon-weather/issues/${issue.data.number}/comments`, { body: 'Good catch. The API sends UTC; we should convert in `fetchHourly`.' });
await soe('PUT', '/repos/soe/yangon-weather/star');
await ada('PUT', '/repos/soe/yangon-weather/star');

rmSync(work, { recursive: true, force: true });
console.log(`Sample data is ready at ${HUB}/soe/yangon-weather`);
console.log(`Sign in as soe or ada, password "${PASSWORD}".`);
