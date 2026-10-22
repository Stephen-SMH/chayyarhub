import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { plural } from '../core/format';
import type { FileDiff } from '../core/models';

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

/** Every changed file of a commit or pull request, each one foldable. */
@Component({
  selector: 'cy-diff',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack">
      <p class="soft" style="margin: 0; font-size: 14px">
        Showing <strong>{{ plural(files().length, 'changed file') }}</strong> with
        <span class="adds">+{{ additions() }}</span> and <span class="dels">−{{ deletions() }}</span>
      </p>
      @for (f of parsed(); track f.path) {
        <section class="card diff-file">
          <div class="card-head">
            <button
              type="button"
              class="btn icon-btn"
              style="min-height: 36px; width: 36px; border: 0; background: none"
              (click)="toggle(f.path)"
              [attr.aria-expanded]="!folded().has(f.path)"
              [attr.aria-label]="(folded().has(f.path) ? 'Show ' : 'Hide ') + f.path"
            >
              <i aria-hidden="true" class="ph" [class.ph-caret-down]="!folded().has(f.path)" [class.ph-caret-right]="folded().has(f.path)"></i>
            </button>
            <span class="kind">{{ f.kind }}</span>
            <span class="mono" style="font-size: 13.5px; overflow-wrap: anywhere; flex: 1; min-width: 0">
              @if (f.old_path) {
                <span class="faint">{{ f.old_path }} → </span>
              }
              {{ f.path }}
            </span>
            <span class="adds">+{{ f.additions }}</span>
            <span class="dels">−{{ f.deletions }}</span>
          </div>
          @if (!folded().has(f.path)) {
            @if (f.binary) {
              <div class="empty">Binary file not shown.</div>
            } @else if (f.patch === null) {
              <div class="empty">This diff is too large to show.</div>
            } @else if (!f.lines.length) {
              <div class="empty">No content changes (an empty file, or only its mode changed).</div>
            } @else {
              <div class="code">
                @for (l of f.lines; track $index) {
                  <div [class]="'dl dl-' + l.kind">
                    @if (l.kind === 'hunk') {
                      <span class="t">{{ l.text }}</span>
                    } @else {
                      <span class="n">{{ l.old ?? '' }}</span>
                      <span class="n">{{ l.new ?? '' }}</span>
                      <span class="s">{{ l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : '' }}</span>
                      <span class="t">{{ l.text || ' ' }}</span>
                    }
                  </div>
                }
              </div>
            }
          }
        </section>
      }
    </div>
  `,
})
export class DiffView {
  readonly files = input.required<FileDiff[]>();
  protected readonly parsed = computed(() => this.files().map((f) => ({ ...f, lines: f.patch ? parseDiff(f.patch) : [] })));
  protected readonly additions = computed(() => this.files().reduce((n, f) => n + f.additions, 0));
  protected readonly deletions = computed(() => this.files().reduce((n, f) => n + f.deletions, 0));
  protected readonly folded = signal(new Set<string>());
  protected readonly plural = plural;

  protected toggle(path: string) {
    const next = new Set(this.folded());
    if (!next.delete(path)) next.add(path);
    this.folded.set(next);
  }
}
