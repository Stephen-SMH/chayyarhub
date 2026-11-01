// Turning a unified diff into something easier to read: lines paired up as
// before and after, the words that changed inside a line, and lines that
// only moved.

import { parseDiff } from './diff';

export type LineKind = 'add' | 'del' | 'ctx' | 'hunk';

export interface DiffLine {
  kind: LineKind;
  text: string;
  old?: number;
  new?: number;
  /** Character ranges [start, end) that changed, when the line pairs with one on the other side. */
  words?: [number, number][];
  moved?: boolean;
  /** The line as safe HTML: highlighted, with its changed words marked. */
  html?: string;
}

/** One row of the before / after view; either side may be empty. */
export interface SideRow {
  hunk?: string;
  left?: DiffLine;
  right?: DiffLine;
}

const TOKEN = /\w+|\s+|[^\w\s]/gu;

/** Longest common subsequence of two token lists, as matched index pairs. */
function lcs(a: string[], b: string[]): [number, number][] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pairs: [number, number][] = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i] === b[j]) pairs.push([i++, j++]);
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

/** Ranges of tokens not in `kept`, merged where they touch. */
function ranges(tokens: string[], kept: Set<number>): [number, number][] {
  const out: [number, number][] = [];
  let at = 0;
  tokens.forEach((tok, i) => {
    if (!kept.has(i)) {
      const last = out.at(-1);
      if (last && last[1] === at) last[1] = at + tok.length;
      else out.push([at, at + tok.length]);
    }
    at += tok.length;
  });
  return out;
}

/**
 * The words that differ between an old and a new line, or null when the two
 * lines have too little in common for word marks to help.
 */
export function wordDiff(oldText: string, newText: string): { old: [number, number][]; new: [number, number][] } | null {
  const a = oldText.match(TOKEN) ?? [];
  const b = newText.match(TOKEN) ?? [];
  if (a.length > 400 || b.length > 400) return null;
  const pairs = lcs(a, b);
  const same = pairs.reduce((n, [i]) => n + (a[i].trim() ? a[i].length : 0), 0);
  const total = Math.max(oldText.trim().length, newText.trim().length);
  if (!total || same / total < 0.4) return null;
  return { old: ranges(a, new Set(pairs.map((p) => p[0]))), new: ranges(b, new Set(pairs.map((p) => p[1]))) };
}

/** Runs of deleted lines followed by added lines, as index ranges into `lines`. */
function changeBlocks(lines: DiffLine[]): { dels: number[]; adds: number[] }[] {
  const blocks: { dels: number[]; adds: number[] }[] = [];
  let cur: { dels: number[]; adds: number[] } | null = null;
  lines.forEach((l, i) => {
    if (l.kind === 'del' || l.kind === 'add') {
      if (!cur || (l.kind === 'del' && cur.adds.length)) blocks.push((cur = { dels: [], adds: [] }));
      (l.kind === 'del' ? cur.dels : cur.adds).push(i);
    } else cur = null;
  });
  return blocks;
}

/** Pair each deleted line with the added line at the same place in its block, and mark the changed words. */
export function markWords(lines: DiffLine[]): void {
  for (const { dels, adds } of changeBlocks(lines)) {
    for (let k = 0; k < Math.min(dels.length, adds.length); k++) {
      const d = lines[dels[k]];
      const a = lines[adds[k]];
      if (d.moved || a.moved) continue;
      const w = wordDiff(d.text, a.text);
      if (w) {
        d.words = w.old;
        a.words = w.new;
      }
    }
  }
}

/** A line worth matching when looking for moved code: not blank, not just a brace. */
const meaningful = (t: string) => t.trim().length >= 6 && /\w/.test(t);

/**
 * Mark lines that were deleted in one place and added unchanged in another,
 * across all files of a change. Only runs of two or more count, so a lone
 * `return null;` isn't called moved.
 */
export function markMoved(files: DiffLine[][]): void {
  const deleted = new Map<string, number>();
  const addedText = new Map<string, number>();
  for (const lines of files) {
    for (const l of lines) {
      if (!meaningful(l.text)) continue;
      if (l.kind === 'del') deleted.set(l.text.trim(), (deleted.get(l.text.trim()) ?? 0) + 1);
      if (l.kind === 'add') addedText.set(l.text.trim(), (addedText.get(l.text.trim()) ?? 0) + 1);
    }
  }
  for (const lines of files) {
    for (const kind of ['del', 'add'] as const) {
      const other = kind === 'del' ? addedText : deleted;
      let run: DiffLine[] = [];
      const flush = () => {
        if (run.length >= 2) for (const l of run) l.moved = true;
        run = [];
      };
      for (const l of lines) {
        if (l.kind === kind && meaningful(l.text) && other.has(l.text.trim())) run.push(l);
        else if (l.kind !== kind || l.text.trim()) flush(); // a blank line inside a run doesn't end it
      }
      flush();
    }
  }
}

/** A file's patch as lines, ready to mark. */
export function diffLines(patch: string): DiffLine[] {
  return parseDiff(patch);
}

/** Lay lines out as before / after rows: context on both sides, each change block side by side. */
export function sideBySide(lines: DiffLine[]): SideRow[] {
  const rows: SideRow[] = [];
  let dels: DiffLine[] = [];
  let adds: DiffLine[] = [];
  const flush = () => {
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) rows.push({ left: dels[k], right: adds[k] });
    dels = [];
    adds = [];
  };
  for (const l of lines) {
    if (l.kind === 'del') {
      if (adds.length) flush();
      dels.push(l);
    } else if (l.kind === 'add') adds.push(l);
    else {
      flush();
      rows.push(l.kind === 'hunk' ? { hunk: l.text } : { left: l, right: l });
    }
  }
  flush();
  return rows;
}

// ---- syntax highlighting ----

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c]);

/**
 * Split highlighted HTML into one string per line. Highlighting is done on
 * the whole text so a comment or string spanning lines stays coloured; a
 * span open at a line break is closed there and reopened on the next line.
 */
export function splitHighlighted(html: string): string[] {
  const lines: string[] = [];
  const open: string[] = [];
  let cur = '';
  for (const part of html.split(/(<span[^>]*>|<\/span>|\n)/)) {
    if (!part) continue;
    if (part === '\n') {
      lines.push(cur + '</span>'.repeat(open.length));
      cur = open.join('');
    } else if (part.startsWith('<span')) {
      open.push(part);
      cur += part;
    } else if (part === '</span>') {
      open.pop();
      cur += part;
    } else cur += part;
  }
  lines.push(cur + '</span>'.repeat(open.length));
  return lines;
}

/**
 * Wrap character ranges of highlighted HTML in <mark>, counting only text
 * (an entity counts as one character) and closing the mark around tags.
 */
export function markRanges(html: string, marks: [number, number][]): string {
  if (!marks.length) return html;
  const inMark = (i: number) => marks.some(([s, e]) => i >= s && i < e);
  let out = '';
  let pos = 0;
  let open = false;
  for (const part of html.split(/(<[^>]+>|&[#\w]+;)/)) {
    if (!part) continue;
    if (part.startsWith('<')) {
      if (open) out += '</mark>';
      open = false;
      out += part;
      continue;
    }
    const chars = part.startsWith('&') && part.endsWith(';') ? [part] : [...part];
    for (const ch of chars) {
      const want = inMark(pos);
      if (want && !open) out += '<mark>';
      if (!want && open) out += '</mark>';
      open = want;
      out += ch;
      pos += ch.length > 1 && ch.startsWith('&') ? 1 : ch.length;
    }
  }
  return open ? out + '</mark>' : out;
}

/** highlight.js language names by file extension; the rest show as plain text. */
const LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  json: 'json', py: 'python', go: 'go', rs: 'rust', rb: 'ruby', php: 'php', java: 'java', kt: 'kotlin', kts: 'kotlin', cs: 'csharp', swift: 'swift',
  c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', m: 'objectivec', css: 'css', scss: 'scss', less: 'less', html: 'xml', htm: 'xml',
  xml: 'xml', svg: 'xml', vue: 'xml', md: 'markdown', markdown: 'markdown', yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini', sh: 'bash',
  bash: 'bash', zsh: 'bash', sql: 'sql', lua: 'lua', r: 'r', pl: 'perl', graphql: 'graphql', diff: 'diff', mk: 'makefile', dart: 'dart',
};

export function languageFor(path: string): string | null {
  const name = path.split('/').pop() ?? '';
  if (name === 'Makefile') return 'makefile';
  if (name === 'Dockerfile') return 'bash';
  return LANG[name.split('.').pop()?.toLowerCase() ?? ''] ?? null;
}

interface Highlighter {
  highlight(code: string, opts: { language: string; ignoreIllegals: boolean }): { value: string };
  getLanguage(name: string): unknown;
}

let loading: Promise<Highlighter> | null = null;

/** highlight.js, loaded the first time a page needs it so the first page stays small. */
export function highlighter(): Promise<Highlighter> {
  return (loading ??= import('highlight.js/lib/common').then((m) => m.default as unknown as Highlighter));
}

/** Each line of `text` as safe HTML, coloured when the language is known. */
export function highlightLines(hl: Highlighter | null, text: string[], path: string): string[] {
  const lang = languageFor(path);
  if (!hl || !lang || !hl.getLanguage(lang) || text.length > 20000) return text.map(escapeHtml);
  const lines = splitHighlighted(hl.highlight(text.join('\n'), { language: lang, ignoreIllegals: true }).value);
  return lines.length === text.length ? lines : text.map(escapeHtml);
}
