import {
  basicCredentials,
  hashPassword,
  passwordProblem,
  repoNameProblem,
  sessionToken,
  usernameProblem,
  verifyPassword,
} from './auth.js';
import { declarations, groupOf, summarize, symbolChanges } from './changes.js';
import { parsePatch, validRef } from './git.js';
import { render } from './markdown.js';

describe('git', () => {
  it('accepts refs from URLs but nothing git could misread', () => {
    for (const ok of ['main', 'feature/x', 'v1.0', '0a1b2c3']) expect(validRef(ok)).toBe(true);
    for (const bad of ['', '-n', 'a..b', 'HEAD~1', 'main^', 'x:y', 'main@{1}', 'a b', 'a\nb']) expect(validRef(bad)).toBe(false);
  });

  it('splits a patch by file', () => {
    const patch = [
      'diff --git a/new file.txt b/new file.txt',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/new file.txt\t',
      '@@ -0,0 +1,2 @@',
      '+hello',
      '+world',
      'diff --git a/old.txt b/renamed.txt',
      'similarity index 90%',
      'rename from old.txt',
      'rename to renamed.txt',
      '@@ -1 +1 @@',
      '-a',
      '+b',
      'diff --git a/gone.rs b/gone.rs',
      'deleted file mode 100644',
      '--- a/gone.rs',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-fn main() {}',
      'diff --git a/logo.png b/logo.png',
      'Binary files a/logo.png and b/logo.png differ',
      '',
    ].join('\n');
    const files = parsePatch(patch);
    expect(files.map((f) => [f.path, f.kind, f.additions, f.deletions, f.binary])).toEqual([
      ['new file.txt', 'new', 2, 0, false],
      ['renamed.txt', 'renamed', 1, 1, false],
      ['gone.rs', 'deleted', 0, 1, false],
      ['logo.png', 'modified', 0, 0, true],
    ]);
    expect(files[1].old_path).toBe('old.txt');
    expect(files[0].patch).toContain('+hello');
    expect(files[0].patch).not.toContain('renamed.txt');
    expect(files[3].patch).toBeNull();
  });
});

describe('markdown', () => {
  it('sanitises what users write', () => {
    const html = render('Hi <script>alert(1)</script> [x](javascript:alert(1)) <img src=x onerror=alert(1)>');
    expect(html).not.toMatch(/<script|javascript:|onerror/);
    const tasks = render('- [x] done\n- [ ] todo\n\n<input type="text">');
    expect(tasks).toContain('type="checkbox"');
    expect(tasks).toContain('aria-label="Done"');
    expect(tasks).toContain('aria-label="Not done"');
    expect(tasks).not.toContain('type="text"');
  });

  it('starts user headings below the page heading', () => {
    expect(render('# Title\n\n## Part')).toMatch(/<h2[^>]*>Title<\/h2>[\s\S]*<h3[^>]*>Part<\/h3>/);
  });

  it('points relative links into the repository', () => {
    const html = render('![logo](logo.png) [guide](guide.md) [site](https://example.com) [top](#intro)', {
      blob: '/ada/weather/blob/main/docs/',
      raw: '/ada/weather/raw/main/docs/',
    });
    expect(html).toContain('src="/ada/weather/raw/main/docs/logo.png"');
    expect(html).toContain('href="/ada/weather/blob/main/docs/guide.md"');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('href="#intro"');
  });
});

describe('auth', () => {
  it('hashes and checks passwords', async () => {
    const hash = await hashPassword('correct horse');
    expect(await verifyPassword('correct horse', hash)).toBe(true);
    expect(await verifyPassword('wrong horse', hash)).toBe(false);
    expect(await verifyPassword('x', 'not a hash')).toBe(false);
  });

  it('reads cookies and basic auth', () => {
    expect(sessionToken('theme=dark; chayyar_session=abc123')).toBe('abc123');
    // The password may itself contain ':'.
    expect(basicCredentials('Basic ' + Buffer.from('ada:secret:part').toString('base64'))).toEqual({ username: 'ada', password: 'secret:part' });
    expect(basicCredentials('Bearer x')).toBeUndefined();
  });

  it('applies the naming rules', () => {
    expect(usernameProblem('soe-moe')).toBeNull();
    for (const bad of ['', '-soe', 'soe-', 'so--e', 's o', 'api', 'Login', 'a'.repeat(40)]) expect(usernameProblem(bad)).not.toBeNull();
    expect(repoNameProblem('weather-app.v2')).toBeNull();
    for (const bad of ['', '.hidden', 'repo.git', 'a/b', 'a b']) expect(repoNameProblem(bad)).not.toBeNull();
    expect(passwordProblem('short')).not.toBeNull();
  });
});

describe('changes', () => {
  it('sorts files by what they are for', () => {
    const cases: [string, string][] = [
      ['src/api.ts', 'code'],
      ['src/api.spec.ts', 'tests'],
      ['tests/test_api.py', 'tests'],
      ['package-lock.json', 'generated'],
      ['web/dist/main.js', 'generated'],
      ['package.json', 'config'],
      ['.github/workflows/ci.yml', 'config'],
      ['README.md', 'docs'],
      ['docs/guide.html', 'docs'],
      ['public/logo.png', 'assets'],
    ];
    for (const [path, group] of cases) expect([path, groupOf(path)]).toEqual([path, group]);
  });

  it('totals a snapshot by group', () => {
    const s = summarize([
      { path: 'a.ts', additions: 3, deletions: 1 },
      { path: 'b.ts', additions: 2, deletions: 0 },
      { path: 'yarn.lock', additions: 400, deletions: 300 },
    ]);
    expect(s).toMatchObject({ files: 3, additions: 405, deletions: 301 });
    expect(s.groups.code).toEqual({ files: 2, additions: 5, deletions: 1 });
    expect(s.groups.generated?.files).toBe(1);
  });

  it('names the functions a change added, changed and removed', () => {
    const before = ['export function keep() {', '  return 1;', '}', '', 'function edit() {', '  return 1;', '}', '', 'function gone() {}', ''].join('\n');
    const after = ['export function keep() {', '  return 1;', '}', '', 'function edit() {', '  return 2;', '}', '', 'const fresh = async () => {', '  return 3;', '};', ''].join('\n');
    const patch = [
      '@@ -5,5 +5,7 @@',
      ' function edit() {',
      '-  return 1;',
      '+  return 2;',
      ' }',
      ' ',
      '-function gone() {}',
      '+const fresh = async () => {',
      '+  return 3;',
      '+};',
      '',
    ].join('\n');
    const s = symbolChanges(before, after, patch, 'js');
    expect(s.added.map((x) => x.name)).toEqual(['fresh']);
    expect(s.changed.map((x) => x.name)).toEqual(['edit']);
    expect(s.removed.map((x) => x.name)).toEqual(['gone']);
  });

  it("doesn't count a neighbour's doc comment as part of a function", () => {
    const before = 'function a() {\n  return 1;\n}\n\nfunction c() {}\n';
    const after = 'function a() {\n  return 1;\n}\n\n/** New. */\nfunction b() {}\n\nfunction c() {}\n';
    const patch = '@@ -4,0 +5,3 @@\n+/** New. */\n+function b() {}\n+\n';
    expect(symbolChanges(before, after, patch, 'js')).toEqual({ added: [{ name: 'b', kind: 'function', line: 6 }], changed: [], removed: [] });
  });

  it('finds methods inside classes and Python defs', () => {
    const ts = declarations('export class Store {\n  async load(id: string): Promise<void> {\n    if (id) {\n    }\n  }\n}\n', 'js');
    expect(ts.map((d) => [d.kind, d.name])).toEqual([['class', 'Store'], ['method', 'load']]);
    const py = declarations('class Store:\n    def load(self):\n        pass\n\ndef main():\n    pass\n', 'py');
    expect(py.map((d) => [d.kind, d.name, d.start, d.end])).toEqual([['class', 'Store', 1, 3], ['method', 'load', 2, 3], ['function', 'main', 5, 6]]);
  });
});
