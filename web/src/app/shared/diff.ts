interface Line {
  kind: 'add' | 'del' | 'ctx' | 'hunk';
  text: string;
  old?: number;
  new?: number;
}

/** Turn one file's unified diff into numbered rows, dropping its headers. */
export function parseDiff(patch: string): Line[] {
  const lines: Line[] = [];
  let oldNo = 0;
  let newNo = 0;
  let inHunk = false;
  for (const raw of patch.split('\n')) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      oldNo = Number(hunk[1]);
      newNo = Number(hunk[2]);
      inHunk = true;
      lines.push({ kind: 'hunk', text: raw });
    } else if (!inHunk) {
      continue;
    } else if (raw.startsWith('+')) {
      lines.push({ kind: 'add', text: raw.slice(1), new: newNo++ });
    } else if (raw.startsWith('-')) {
      lines.push({ kind: 'del', text: raw.slice(1), old: oldNo++ });
    } else if (raw.startsWith(' ')) {
      lines.push({ kind: 'ctx', text: raw.slice(1), old: oldNo++, new: newNo++ });
    }
  }
  return lines;
}
