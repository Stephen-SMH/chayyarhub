import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { I18n } from '../core/i18n';
import type { AnalyzedFile } from '../core/models';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Squarified treemap (Bruls, Huizing and van Wijk): lay out values in `r`
 * so the boxes stay close to square, which keeps small files clickable.
 */
export function squarify(values: number[], r: Rect): Rect[] {
  const total = values.reduce((a, b) => a + b, 0);
  const out: Rect[] = new Array(values.length);
  if (!total) return values.map(() => ({ ...r, w: 0, h: 0 }));
  const order = values.map((v, i) => ({ v: (v / total) * r.w * r.h, i })).sort((a, b) => b.v - a.v);
  let rest = { ...r };
  let row: typeof order = [];
  const worst = (items: typeof order, side: number) => {
    const sum = items.reduce((a, b) => a + b.v, 0);
    const max = Math.max(...items.map((x) => x.v));
    const min = Math.min(...items.map((x) => x.v));
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
  };
  const place = (items: typeof order) => {
    const sum = items.reduce((a, b) => a + b.v, 0);
    const wide = rest.w >= rest.h;
    const thick = sum / (wide ? rest.h : rest.w);
    let at = wide ? rest.y : rest.x;
    for (const it of items) {
      const len = it.v / thick;
      out[it.i] = wide ? { x: rest.x, y: at, w: thick, h: len } : { x: at, y: rest.y, w: len, h: thick };
      at += len;
    }
    rest = wide ? { x: rest.x + thick, y: rest.y, w: rest.w - thick, h: rest.h } : { x: rest.x, y: rest.y + thick, w: rest.w, h: rest.h - thick };
  };
  for (const it of order) {
    const side = Math.min(rest.w, rest.h);
    if (!row.length || worst([...row, it], side) <= worst(row, side)) row.push(it);
    else {
      place(row);
      row = [it];
    }
  }
  if (row.length) place(row);
  return out;
}

const W = 1000;
const H = 300;
const PAD = 3;

/** How much of the map a file gets: its changed lines, but noise stays small. */
const weight = (f: AnalyzedFile) => (f.noise ? 1 : Math.max(1, f.additions + f.deletions));

/** A map of a change: one box per file, grouped by top-level folder, sized by lines changed. */
@Component({
  selector: 'cy-change-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg class="change-map" [attr.viewBox]="'0 0 ' + W + ' ' + H" role="group" [attr.aria-label]="i18n.t('changeMap')">
      @for (d of boxes(); track d.name) {
        <g>
          <rect class="dir" [attr.x]="d.r.x" [attr.y]="d.r.y" [attr.width]="d.r.w" [attr.height]="d.r.h" rx="10" />
          @if (d.r.w > 70 && d.r.h > 40) {
            <text class="dir-label" [attr.x]="d.r.x + 10" [attr.y]="d.r.y + 18">{{ d.name }}</text>
          }
          @for (b of d.files; track b.f.path) {
            <g
              class="box"
              [class.noise]="!!b.f.noise"
              [class.dim]="!!only() && b.f.group !== only()"
              role="link"
              tabindex="0"
              [attr.aria-label]="b.f.path + ', ' + i18n.t(groupKey(b.f)) + ', +' + b.f.additions + ' −' + b.f.deletions"
              (click)="pick.emit(b.f.path)"
              (keydown.enter)="pick.emit(b.f.path)"
              (keydown.space)="$event.preventDefault(); pick.emit(b.f.path)"
            >
              <title>{{ b.f.path }} (+{{ b.f.additions }} −{{ b.f.deletions }})</title>
              <rect [attr.x]="b.r.x" [attr.y]="b.r.y" [attr.width]="b.r.w" [attr.height]="b.r.h" rx="6" [style.fill]="'var(--g-' + b.f.group + ')'" />
              @if (b.r.w > 64 && b.r.h > 26) {
                <text [attr.x]="b.r.x + 8" [attr.y]="b.r.y + 18">{{ fit(b.f.path.split('/').pop()!, b.r.w) }}</text>
              }
              @if (b.r.w > 64 && b.r.h > 44) {
                <text class="num" [attr.x]="b.r.x + 8" [attr.y]="b.r.y + 36">+{{ b.f.additions }} −{{ b.f.deletions }}</text>
              }
            </g>
          }
        </g>
      }
    </svg>
  `,
})
export class ChangeMap {
  readonly files = input.required<AnalyzedFile[]>();
  /** A group to emphasise; the others fade. */
  readonly only = input<string | null>(null);
  readonly pick = output<string>();
  protected readonly i18n = inject(I18n);
  protected readonly W = W;
  protected readonly H = H;

  protected readonly boxes = computed(() => {
    const dirs = new Map<string, AnalyzedFile[]>();
    for (const f of this.files()) {
      const top = f.path.includes('/') ? f.path.split('/')[0] + '/' : '/';
      dirs.set(top, [...(dirs.get(top) ?? []), f]);
    }
    const names = [...dirs.keys()];
    const outer = squarify(
      names.map((n) => dirs.get(n)!.reduce((a, f) => a + weight(f), 0)),
      { x: 0, y: 0, w: W, h: H },
    );
    return names.map((name, i) => {
      const r = outer[i];
      // Leave room for the folder's name when there is space for it.
      const head = r.w > 70 && r.h > 60 ? 24 : PAD;
      const inner = { x: r.x + PAD, y: r.y + head, w: Math.max(0, r.w - 2 * PAD), h: Math.max(0, r.h - head - PAD) };
      const list = dirs.get(name)!;
      const rects = squarify(list.map(weight), inner);
      return {
        name,
        r: { x: r.x + 1, y: r.y + 1, w: Math.max(0, r.w - 2), h: Math.max(0, r.h - 2) },
        files: list.map((f, j) => ({ f, r: { x: rects[j].x + 1, y: rects[j].y + 1, w: Math.max(0, rects[j].w - 2), h: Math.max(0, rects[j].h - 2) } })),
      };
    });
  });

  protected groupKey(f: AnalyzedFile) {
    return `g_${f.group}` as const;
  }

  /** Shorten a name to roughly fit a box `w` units wide. */
  protected fit(name: string, w: number): string {
    const max = Math.floor((w - 14) / 7.6);
    return name.length <= max ? name : name.slice(0, Math.max(1, max - 1)) + '…';
  }
}
