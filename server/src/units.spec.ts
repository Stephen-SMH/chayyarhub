import {
  basicCredentials,
  hashPassword,
  passwordProblem,
  repoNameProblem,
  sessionToken,
  usernameProblem,
  verifyPassword,
} from './auth.js';
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
