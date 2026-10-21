// Small formatting helpers shared by the pages.

const UNITS: [number, string][] = [
  [31536000, 'year'],
  [2592000, 'month'],
  [86400, 'day'],
  [3600, 'hour'],
  [60, 'minute'],
];

/** "3 days ago" for a Unix time in seconds. */
export function ago(unix: number | null | undefined): string {
  if (!unix) return 'never';
  const s = Date.now() / 1000 - unix;
  for (const [n, unit] of UNITS) {
    if (s >= n) {
      const k = Math.floor(s / n);
      return `${k} ${unit}${k === 1 ? '' : 's'} ago`;
    }
  }
  return 'just now';
}

export function day(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function size(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * The part of a /tree/… or /blob/… URL after the repository is "<ref>/<path>",
 * and a ref can contain slashes (feature/x). Take the longest branch name
 * that fits, else the first segment (a SHA or a tag).
 */
export function splitRefPath(rest: string, branches: string[]): { ref: string; path: string } {
  const match = branches.filter((b) => rest === b || rest.startsWith(b + '/')).sort((a, b) => b.length - a.length)[0];
  const ref = match ?? rest.split('/')[0];
  return { ref, path: rest.slice(ref.length).replace(/^\//, '') };
}

/** Router link segments for "a/b/c" style values, dropping empty parts. */
export function segs(...parts: (string | null | undefined)[]): string[] {
  return parts.flatMap((p) => (p ?? '').split('/')).filter(Boolean);
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}
