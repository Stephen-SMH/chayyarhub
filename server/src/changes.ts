// Making a change readable: what each changed file is for (code, tests,
// docs…), which changes are noise (generated files, renames, spacing), and
// which functions and classes were added, changed or removed.

import * as git from './git.js';

export type Group = 'code' | 'tests' | 'config' | 'docs' | 'assets' | 'generated';

/** Why a file can be skipped on a first read; null when it's a real change. */
export type Noise = 'generated' | 'rename' | 'whitespace' | 'mode' | null;

export interface SymbolChange {
  name: string;
  kind: string;
  /** Where it starts in the new version (the old one, when removed). */
  line: number;
}

export interface Symbols {
  added: SymbolChange[];
  changed: SymbolChange[];
  removed: SymbolChange[];
}

export interface AnalyzedFile extends git.FileDiff {
  group: Group;
  noise: Noise;
  symbols: Symbols | null;
}

const LOCKFILES = new Set([
  'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'Cargo.lock', 'poetry.lock', 'Pipfile.lock',
  'uv.lock', 'Gemfile.lock', 'composer.lock', 'go.sum', 'pubspec.lock', 'Podfile.lock', 'flake.lock', 'mix.lock',
]);
const GENERATED_DIRS = /(^|\/)(dist|build|out|vendor|node_modules|coverage|\.next|target|__generated__|generated)\//;
const TEST_PATH = /(^|\/)(tests?|__tests__|spec|e2e|testdata|fixtures)\/|[._-](test|spec|e2e-spec)\.[a-z0-9]+$|(^|\/)test_[^/]+\.py$|_test\.(go|py|rb|exs?)$|\.snap$/i;
const DOC_EXT = /\.(md|markdown|mdx|rst|txt|adoc|org)$/i;
const DOC_NAME = /(^|\/)(README|CHANGELOG|CONTRIBUTING|LICENSE|LICENCE|AUTHORS|NOTICE|CODE_OF_CONDUCT)(\.[a-z]+)?$/i;
const CONFIG_EXT = /\.(json|jsonc|ya?ml|toml|ini|cfg|conf|properties|env|xml|plist|gradle|editorconfig|lock)$/i;
const CONFIG_NAME = /(^|\/)(\.[^/]+|Dockerfile|Containerfile|Makefile|Procfile|Gemfile|Rakefile|Pipfile|package\.json|tsconfig[^/]*\.json|[^/]+\.config\.[cm]?[jt]s)$/;
const ASSET_EXT = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?|mp3|wav|ogg|mp4|webm|mov|woff2?|ttf|otf|eot|pdf|zip|gz)$/i;

/** What a file is for, judged from its path alone. */
export function groupOf(path: string): Group {
  const name = path.split('/').pop() ?? path;
  if (LOCKFILES.has(name) || GENERATED_DIRS.test(path) || /\.(min\.(js|css)|map)$/.test(name) || /\.pb\.go$|_pb2\.py$|\.g\.dart$/.test(name)) {
    return 'generated';
  }
  if (TEST_PATH.test(path)) return 'tests';
  if (ASSET_EXT.test(name)) return 'assets';
  if (DOC_EXT.test(name) || DOC_NAME.test(path) || /(^|\/)docs?\//.test(path)) return 'docs';
  if (CONFIG_EXT.test(name) || CONFIG_NAME.test(path) || path.startsWith('.github/')) return 'config';
  return 'code';
}

export interface GroupStat {
  files: number;
  additions: number;
  deletions: number;
}

/** Totals per group, for a snapshot's one-line summary. */
export function summarize(files: { path: string; additions: number; deletions: number }[]) {
  const groups: Partial<Record<Group, GroupStat>> = {};
  let additions = 0;
  let deletions = 0;
  for (const f of files) {
    const g = (groups[groupOf(f.path)] ??= { files: 0, additions: 0, deletions: 0 });
    g.files++;
    g.additions += f.additions;
    g.deletions += f.deletions;
    additions += f.additions;
    deletions += f.deletions;
  }
  return { files: files.length, additions, deletions, groups };
}

// ---- functions and classes ----

interface Decl {
  name: string;
  kind: string;
  indent: number;
  start: number;
  end: number;
}

type Rule = [RegExp, string];

const JS_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'with', 'else', 'do', 'try', 'constructor']);

const JS: Rule[] = [
  [/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/, 'function'],
  [/^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, 'class'],
  [/^\s*(?:export\s+)?(?:declare\s+)?(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/, 'type'],
  [/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*(?::[^=]+)?=>|[A-Za-z_$][\w$]*\s*=>)/, 'function'],
  [/^\s+(?:(?:public|private|protected|static|readonly|async|override|get|set)\s+)*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\([^;]*\)\s*(?::\s*[^{;=]+)?\{\s*$/, 'method'],
];

const LANGS: Record<string, Rule[]> = {
  js: JS,
  py: [
    [/^\s*(?:async\s+)?def\s+(\w+)/, 'function'],
    [/^\s*class\s+(\w+)/, 'class'],
  ],
  go: [
    [/^func\s+(?:\([^)]*\)\s*)?(\w+)/, 'function'],
    [/^type\s+(\w+)/, 'type'],
  ],
  rs: [
    [/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:const\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+(\w+)/, 'function'],
    [/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum|trait|union)\s+(\w+)/, 'type'],
    [/^\s*impl(?:<[^>]*>)?\s+(?:[\w:<>]+\s+for\s+)?(\w+)/, 'impl'],
  ],
  rb: [
    [/^\s*def\s+(?:self\.)?(\w+[?!=]?)/, 'function'],
    [/^\s*(?:class|module)\s+([\w:]+)/, 'class'],
  ],
  php: [
    [/^\s*(?:(?:public|private|protected|static|abstract|final)\s+)*function\s+(\w+)/, 'function'],
    [/^\s*(?:abstract\s+|final\s+)?(?:class|interface|trait|enum)\s+(\w+)/, 'class'],
  ],
  // Java, Kotlin, C#, Swift, Scala, Dart: close enough to share rules.
  jvm: [
    [/^\s*(?:[\w@]+\s+)*(?:class|interface|enum|struct|record|object|protocol|extension)\s+(\w+)/, 'class'],
    [/^\s*(?:[\w@]+\s+)*(?:fun|func|def)\s+(?:<[^>]*>\s*)?(?:[\w.]+\.)?(\w+)/, 'function'],
    [/^\s+(?:(?:public|private|protected|internal|static|final|abstract|synchronized|override|virtual|async|open)\s+)+[\w<>[\],.? ]+?\s+(\w+)\s*\([^;]*$/, 'method'],
  ],
  c: [
    [/^(?:struct|class|union|enum)\s+(\w+)\s*[:{]?[^;]*$/, 'type'],
    [/^(?:[\w:*&<>]+\s+)+\**([A-Za-z_]\w*(?:::~?\w+)?)\s*\([^;]*\)?\s*(?:const\s*)?\{?\s*$/, 'function'],
  ],
};

const EXT_LANG: Record<string, string> = {
  js: 'js', jsx: 'js', mjs: 'js', cjs: 'js', ts: 'js', tsx: 'js', mts: 'js', cts: 'js', vue: 'js', svelte: 'js',
  py: 'py', go: 'go', rs: 'rs', rb: 'rb', php: 'php',
  java: 'jvm', kt: 'jvm', kts: 'jvm', cs: 'jvm', swift: 'jvm', scala: 'jvm', dart: 'jvm', groovy: 'jvm',
  c: 'c', h: 'c', cc: 'c', cpp: 'c', cxx: 'c', hpp: 'c', hh: 'c', m: 'c', mm: 'c',
};

export function languageOf(path: string): string | null {
  return EXT_LANG[path.split('.').pop()?.toLowerCase() ?? ''] ?? null;
}

const COMMENT = /^\s*(\/\/|\/\*|\*|#(?!include|define)|--|;)/;

/** Declarations in a file, each spanning until the next one at the same or a shallower indent. */
export function declarations(text: string, lang: string): Decl[] {
  const rules = LANGS[lang];
  if (!rules) return [];
  const lines = text.split('\n');
  const decls: Decl[] = [];
  lines.forEach((line, i) => {
    if (COMMENT.test(line) || line.length > 400) return;
    for (const [re, kind] of rules) {
      const m = re.exec(line);
      if (!m) continue;
      const name = m[1];
      if (JS_KEYWORDS.has(name)) break;
      const indent = /^\s*/.exec(line)![0].replace(/\t/g, '    ').length;
      decls.push({ name, kind: kind === 'function' && indent > 0 && lang === 'py' ? 'method' : kind, indent, start: i + 1, end: lines.length });
      break;
    }
  });
  for (let i = 0; i < decls.length; i++) {
    const next = decls.slice(i + 1).find((d) => d.indent <= decls[i].indent);
    if (next) decls[i].end = next.start - 1;
    // Blank lines and the next declaration's doc comment belong to neither.
    while (decls[i].end > decls[i].start && (!lines[decls[i].end - 1].trim() || COMMENT.test(lines[decls[i].end - 1]))) decls[i].end--;
  }
  return decls;
}

/** Old line numbers removed and new line numbers added, from one file's patch. */
export function changedLines(patch: string): { removed: Set<number>; added: Set<number> } {
  const removed = new Set<number>();
  const added = new Set<number>();
  let oldNo = 0;
  let newNo = 0;
  let inHunk = false;
  for (const line of patch.split('\n')) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      oldNo = Number(hunk[1]);
      newNo = Number(hunk[2]);
      inHunk = true;
    } else if (!inHunk) continue;
    else if (line.startsWith('+')) added.add(newNo++);
    else if (line.startsWith('-')) removed.add(oldNo++);
    else if (line.startsWith(' ')) {
      oldNo++;
      newNo++;
    }
  }
  return { removed, added };
}

/** Name each declaration uniquely, so overloads and repeats line up between versions. */
function keyed(decls: Decl[]): Map<string, Decl> {
  const seen = new Map<string, number>();
  const out = new Map<string, Decl>();
  for (const d of decls) {
    const n = seen.get(d.name) ?? 0;
    seen.set(d.name, n + 1);
    out.set(n ? `${d.name}#${n}` : d.name, d);
  }
  return out;
}

/** Which declarations a change added, removed or edited. */
export function symbolChanges(oldText: string | null, newText: string | null, patch: string, lang: string): Symbols {
  const before = keyed(oldText === null ? [] : declarations(oldText, lang));
  const after = keyed(newText === null ? [] : declarations(newText, lang));
  const { removed, added } = changedLines(patch);
  const touches = (d: Decl, lines: Set<number>) => {
    for (let n = d.start; n <= d.end; n++) if (lines.has(n)) return true;
    return false;
  };
  // A class whose methods changed counts as changed too, but listing it
  // beside its methods says nothing new, so only leaves are kept.
  const isLeaf = (d: Decl, all: Map<string, Decl>, lines: Set<number>) =>
    ![...all.values()].some((o) => o !== d && o.start > d.start && o.end <= d.end && touches(o, lines));
  const result: Symbols = { added: [], changed: [], removed: [] };
  for (const [key, d] of after) {
    const old = before.get(key);
    if (!old) result.added.push({ name: d.name, kind: d.kind, line: d.start });
    else if ((touches(d, added) && isLeaf(d, after, added)) || (touches(old, removed) && isLeaf(old, before, removed))) {
      result.changed.push({ name: d.name, kind: d.kind, line: d.start });
    }
  }
  for (const [key, d] of before) if (!after.has(key)) result.removed.push({ name: d.name, kind: d.kind, line: d.start });
  // A declaration nested in an added one is part of that addition.
  const outer = (list: SymbolChange[], decls: Map<string, Decl>) => {
    const spans = list.map((s) => [...decls.values()].find((d) => d.name === s.name && d.start === s.line)!);
    return list.filter((_, i) => !spans.some((p, j) => j !== i && p.start < spans[i].start && p.end >= spans[i].end));
  };
  result.added = outer(result.added, after);
  result.removed = outer(result.removed, before);
  return result;
}

/** How many files get a function summary; past this, a change is too big for one to help. */
const MAX_SYMBOL_FILES = 80;

/**
 * Add group, noise and function changes to the files of a diff from `from`
 * (a commit, or the empty tree) to `to`.
 */
export async function analyze(repo: string, files: git.FileDiff[], from: string, to: string): Promise<AnalyzedFile[]> {
  const spacing = files.some((f) => f.kind === 'modified') ? await git.changesIgnoringSpace(repo, from, to) : new Map<string, number>();
  let budget = MAX_SYMBOL_FILES;
  const out: AnalyzedFile[] = [];
  for (const f of files) {
    const group = groupOf(f.path);
    let noise: Noise = null;
    if (group === 'generated') noise = 'generated';
    else if (f.kind === 'renamed' && f.additions + f.deletions === 0) noise = 'rename';
    else if (!f.binary && f.additions + f.deletions === 0) noise = 'mode';
    else if (f.kind === 'modified' && !f.binary && (spacing.get(f.path) ?? 0) === 0) noise = 'whitespace';

    let symbols: Symbols | null = null;
    const lang = languageOf(f.path);
    if (lang && f.patch && !noise && (group === 'code' || group === 'tests') && budget-- > 0) {
      const oldText = f.kind === 'new' || from === git.EMPTY_TREE ? null : await git.textAt(repo, from, f.old_path ?? f.path);
      const newText = f.kind === 'deleted' ? null : await git.textAt(repo, to, f.path);
      symbols = symbolChanges(oldText, newText, f.patch, lang);
    }
    out.push({ ...f, group, noise, symbols });
  }
  return out;
}
