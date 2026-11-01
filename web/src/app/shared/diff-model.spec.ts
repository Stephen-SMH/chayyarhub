import { squarify } from './change-map';
import { diffLines, markMoved, markRanges, markWords, sideBySide, splitHighlighted, wordDiff } from './diff-model';

describe('word diff', () => {
  it('marks only the words that changed', () => {
    const w = wordDiff('  return items.length;', '  return items.reduce(sum, 0);')!;
    const old = '  return items.length;';
    const now = '  return items.reduce(sum, 0);';
    expect(w.old.map(([s, e]) => old.slice(s, e))).toEqual(['length']);
    expect(w.new.map(([s, e]) => now.slice(s, e))).toEqual(['reduce(sum, 0)']);
  });

  it('gives up on lines with little in common', () => {
    expect(wordDiff('const a = 1;', 'throw new Error("nope");')).toBeNull();
  });
});

describe('diff layout', () => {
  const patch = ['@@ -1,3 +1,3 @@', ' keep', '-const total = a + b;', '+const total = a + b + c;', ' end', ''].join('\n');

  it('pairs a changed line with its new version, side by side', () => {
    const lines = diffLines(patch);
    markWords(lines);
    const rows = sideBySide(lines);
    expect(rows.map((r) => [r.hunk ?? r.left?.text, r.right?.text])).toEqual([
      ['@@ -1,3 +1,3 @@', undefined],
      ['keep', 'keep'],
      ['const total = a + b;', 'const total = a + b + c;'],
      ['end', 'end'],
    ]);
    expect(rows[2].right!.words).toEqual([[19, 23]]);
  });

  it('marks code that moved between files, but not one-line coincidences', () => {
    const from = diffLines(['@@ -1,4 +1,1 @@', ' top', '-function helper() {', '-  return compute(42);', '-}', '-return null;', ''].join('\n'));
    const to = diffLines(['@@ -1,1 +1,4 @@', ' other', '+function helper() {', '+  return compute(42);', '+}', '+return null;', ''].join('\n'));
    markMoved([from, to]);
    expect(from.filter((l) => l.moved).map((l) => l.text)).toEqual(['function helper() {', '  return compute(42);']);
    expect(to.filter((l) => l.moved)).toHaveLength(2);
  });
});

describe('highlighted html', () => {
  it('splits highlighted html into lines, reopening spans', () => {
    const html = '<span class="hljs-comment">/* a\nb */</span> x';
    expect(splitHighlighted(html)).toEqual(['<span class="hljs-comment">/* a</span>', '<span class="hljs-comment">b */</span> x']);
  });

  it('marks text ranges across tags and entities', () => {
    expect(markRanges('<span class="k">a&lt;b</span>c', [[1, 4]])).toBe('<span class="k">a<mark>&lt;b</mark></span><mark>c</mark>');
  });
});

describe('change map', () => {
  it('fills the area with boxes in proportion to their values', () => {
    const rects = squarify([6, 6, 4, 3, 2, 2, 1], { x: 0, y: 0, w: 600, h: 400 });
    const area = rects.reduce((a, r) => a + r.w * r.h, 0);
    expect(Math.round(area)).toBe(240000);
    expect(Math.round(rects[0].w * rects[0].h)).toBe(Math.round((240000 * 6) / 24));
  });
});
