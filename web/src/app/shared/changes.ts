import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, errorText } from '../core/api';
import { Announcer } from '../core/announcer';
import { I18n, type Lang, type WordKey } from '../core/i18n';
import type { AnalyzedFile, Group, SymbolChange } from '../core/models';
import { Session } from '../core/session';
import { RepoContext } from '../repo/context';
import { ChangeMap } from './change-map';
import { type DiffLine, diffLines, highlighter, highlightLines, markMoved, markRanges, markWords, sideBySide } from './diff-model';
import { MarkdownView } from './ui';

export const GROUP_ORDER: Group[] = ['code', 'tests', 'config', 'docs', 'assets', 'generated'];

/** Line HTML for one side of a file: highlighted as a whole, then with its changed words marked. */
function colour(lines: DiffLine[], path: string, hl: Awaited<ReturnType<typeof highlighter>> | null) {
  const oldSide = lines.filter((l) => l.kind === 'ctx' || l.kind === 'del');
  const newSide = lines.filter((l) => l.kind === 'ctx' || l.kind === 'add');
  const oldHtml = highlightLines(hl, oldSide.map((l) => l.text), path);
  const newHtml = highlightLines(hl, newSide.map((l) => l.text), path);
  oldSide.forEach((l, i) => l.kind === 'del' && (l.html = markRanges(oldHtml[i], l.words ?? [])));
  newSide.forEach((l, i) => (l.html = l.kind === 'add' ? markRanges(newHtml[i], l.words ?? []) : newHtml[i]));
}

let anchors = 0;

/**
 * A change, made readable: what it touched at a glance (groups, a map,
 * functions), then each file shown before / after, with changed words and
 * moved lines marked, real changes first and noise folded away.
 */
@Component({
  selector: 'cy-changes',
  imports: [RouterLink, ChangeMap, MarkdownView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let t = i18n;
    <div class="stack" style="gap: 20px">
      @if (explain(); as target) {
        <section class="card kumal">
          <div class="card-body cluster" style="gap: 12px; align-items: start">
            <span class="kumal-mark" aria-hidden="true"><i class="ph-fill ph-sparkle"></i></span>
            <div style="flex: 1; min-width: 220px">
              <h3 style="font-size: 16px">{{ t.t('kumal') }} <span class="faint" style="font-weight: 400">· ကူမယ်</span></h3>
              <p class="soft" style="margin: 2px 0 0; font-size: 14px">{{ t.t('kumalHelp') }}</p>
            </div>
            @if (session.user()) {
              <label class="cluster" style="gap: 6px; font-size: 14px">
                <span class="faint">{{ t.t('explainIn') }}</span>
                <select class="input" style="width: auto; min-height: 38px; padding: 0 10px" [value]="kumalLang()" (change)="kumalLang.set($any($event.target).value)">
                  <option value="en">English</option>
                  <option value="my">မြန်မာ</option>
                </select>
              </label>
              <button type="button" class="btn btn-grad" [disabled]="kumalBusy()" (click)="askKumal(target)"><i aria-hidden="true" class="ph ph-sparkle"></i>{{ t.t('explain') }}</button>
            } @else {
              <a class="link" routerLink="/login" [queryParams]="{ next: here }">{{ t.t('signInForKumal') }}</a>
            }
          </div>
          @if (kumalBusy()) {
            <div class="card-body kumal-out"><span class="soft">{{ t.t('explaining') }}</span></div>
          } @else if (kumalError()) {
            <div class="card-body kumal-out"><div class="alert" role="alert" style="margin: 0">{{ kumalError() }}</div></div>
          } @else if (kumalHtml()) {
            <div class="card-body kumal-out" [attr.lang]="kumalShownLang()">
              <cy-markdown [html]="kumalHtml()!" />
              <p class="faint" style="margin: 12px 0 0; font-size: 13px"><i aria-hidden="true" class="ph ph-info"></i> {{ t.t('aiNote') }}</p>
            </div>
          }
        </section>
      }

      @if (!files().length) {
        <div class="card empty"><i aria-hidden="true" class="ph ph-check-circle"></i>{{ t.t('nothingChanged') }}</div>
      } @else {
        <section class="card" aria-labelledby="what-changed">
          <div class="card-body stack" style="gap: 14px">
            <div class="cluster" style="align-items: baseline">
              <h3 id="what-changed" style="font-size: 18px">{{ t.t('whatChanged') }}</h3>
              <span class="soft" style="font-size: 14px">
                {{ t.t('filesInGroups', { files: count(files().length, 'file', 'files'), groups: count(groupStats().length, 'group', 'groups') }) }} ·
                <span class="adds">+{{ totals().additions }}</span> <span class="dels">−{{ totals().deletions }}</span>
              </span>
            </div>
            <div class="cluster" style="gap: 8px" role="group" [attr.aria-label]="t.t('whatChanged')">
              @for (g of groupStats(); track g.group) {
                <button type="button" class="group-chip" [attr.aria-pressed]="only() === g.group" (click)="only.set(only() === g.group ? null : g.group)" [title]="t.t('showGroup', { group: t.t(gk(g.group)) })">
                  <span class="dot" [style.background]="'var(--g-' + g.group + ')'"></span>{{ t.t(gk(g.group)) }}
                  <span class="count">{{ g.files }}</span>
                  <span class="adds">+{{ g.additions }}</span><span class="dels">−{{ g.deletions }}</span>
                </button>
              }
              @if (only()) {
                <button type="button" class="btn" style="min-height: 34px" (click)="only.set(null)">{{ t.t('showAll') }}</button>
              }
            </div>
            <div class="overview">
              <figure style="margin: 0; min-width: 0">
                <cy-change-map [files]="files()" [only]="only()" (pick)="jump($event)" />
                <figcaption class="faint" style="font-size: 13px; margin-top: 6px">{{ t.t('changeMap') }}: {{ t.t('changeMapHelp') }}</figcaption>
              </figure>
              @if (symbolSummary(); as s) {
                <div class="stack" style="gap: 10px; min-width: 0">
                  <h4 class="label">{{ t.t('functions') }}</h4>
                  @for (part of s; track part.key) {
                    <div>
                      <div class="soft" style="font-size: 13px; margin-bottom: 4px"><i aria-hidden="true" [class]="part.icon"></i> {{ t.t(part.key) }} <span class="count">{{ part.items.length }}</span></div>
                      <div class="cluster" style="gap: 6px">
                        @for (it of part.items.slice(0, 14); track it.path + it.sym.name + it.sym.line) {
                          <button type="button" [class]="'sym sym-' + part.key" (click)="jump(it.path)" [title]="it.path + ':' + it.sym.line + ' (' + it.sym.kind + ')'">{{ it.sym.name }}{{ it.sym.kind === 'function' || it.sym.kind === 'method' ? '()' : '' }}</button>
                        }
                        @if (part.items.length > 14) {
                          <span class="faint" style="font-size: 13px">+{{ part.items.length - 14 }}</span>
                        }
                      </div>
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        </section>

        <div class="cluster">
          <div class="segmented" role="group" [attr.aria-label]="t.t('showAs')">
            <button type="button" [attr.aria-pressed]="mode() === 'split'" (click)="mode.set('split')"><i aria-hidden="true" class="ph ph-columns"></i> {{ t.t('beforeAfter') }}</button>
            <button type="button" [attr.aria-pressed]="mode() === 'unified'" (click)="mode.set('unified')"><i aria-hidden="true" class="ph ph-rows"></i> {{ t.t('unified') }}</button>
          </div>
          <span class="spacer"></span>
          <span class="legend hide-sm"><mark>abc</mark> {{ t.t('legendWords') }}</span>
          <span class="legend hide-sm"><span class="moved-swatch"></span> {{ t.t('legendMoved') }}</span>
        </div>

        <div class="changes-layout">
          <nav class="file-tree card" [attr.aria-label]="t.t('changedFiles')">
            @for (sec of treeSections(); track sec.key) {
              <div class="tree-sec">
                <div class="label tree-title">
                  @if (sec.group) {
                    <span class="dot" [style.background]="'var(--g-' + sec.group + ')'"></span>
                  }
                  {{ sec.title }}
                </div>
                @for (p of sec.files; track p.f.path) {
                  <a [href]="'#' + p.id" class="tree-file" [class.dim]="!!only() && p.f.group !== only()" (click)="$event.preventDefault(); jump(p.f.path)" [title]="p.f.path">
                    <i aria-hidden="true" [class]="kindIcon(p.f)"></i>
                    <span class="grow"><span class="faint">{{ dirOf(p.f.path) }}</span>{{ baseOf(p.f.path) }}</span>
                    @if (p.f.noise) {
                      <span class="faint" style="font-size: 12px">{{ t.t(nk(p.f)) }}</span>
                    } @else {
                      <span class="adds">+{{ p.f.additions }}</span><span class="dels">−{{ p.f.deletions }}</span>
                    }
                  </a>
                }
              </div>
            }
          </nav>

          <div class="stack" style="min-width: 0">
            @for (p of visible(); track p.f.path) {
              <section class="card diff-file" [id]="p.id" [class.is-noise]="!!p.f.noise">
                <div class="card-head" style="flex-wrap: wrap; row-gap: 6px">
                  <button type="button" class="btn icon-btn fold" (click)="toggle(p.f.path)" [attr.aria-expanded]="!folded().has(p.f.path)" [attr.aria-label]="(folded().has(p.f.path) ? t.t('show') : t.t('hide')) + ' ' + p.f.path">
                    <i aria-hidden="true" class="ph" [class.ph-caret-down]="!folded().has(p.f.path)" [class.ph-caret-right]="folded().has(p.f.path)"></i>
                  </button>
                  <span class="dot" [style.background]="'var(--g-' + p.f.group + ')'" [title]="t.t(gk(p.f.group))"></span>
                  <span class="mono" style="font-size: 13.5px; overflow-wrap: anywhere; flex: 1 1 220px; min-width: 0">
                    @if (p.f.old_path) {
                      <span class="faint">{{ p.f.old_path }} → </span>
                    }
                    {{ p.f.path }}
                  </span>
                  <span class="kind">{{ t.t(kk(p.f)) }}</span>
                  @if (p.f.noise) {
                    <span class="pill noise-pill"><i aria-hidden="true" class="ph ph-eye-slash"></i>{{ t.t(nk(p.f)) }}</span>
                  }
                  <span class="adds">+{{ p.f.additions }}</span>
                  <span class="dels">−{{ p.f.deletions }}</span>
                  @if (ctx && at() && p.f.kind !== 'deleted') {
                    <a class="btn icon-btn small" [routerLink]="ctx.link('travel', at(), p.f.path)" [title]="t.t('timeTravel')" [attr.aria-label]="t.t('timeTravel') + ': ' + p.f.path"><i aria-hidden="true" class="ph ph-clock-counter-clockwise"></i></a>
                    <a class="btn icon-btn small" [routerLink]="ctx.link('blob', at(), p.f.path)" [title]="t.t('viewFile')" [attr.aria-label]="t.t('viewFile') + ': ' + p.f.path"><i aria-hidden="true" class="ph ph-file-text"></i></a>
                  }
                </div>
                @if (p.f.symbols && (p.f.symbols.added.length || p.f.symbols.changed.length || p.f.symbols.removed.length)) {
                  <div class="file-syms cluster">
                    @for (s of p.f.symbols.added; track s.name + s.line) {
                      <span class="sym sym-added" [title]="t.t('added')">+ {{ s.name }}</span>
                    }
                    @for (s of p.f.symbols.changed; track s.name + s.line) {
                      <span class="sym sym-changed" [title]="t.t('changed')">~ {{ s.name }}</span>
                    }
                    @for (s of p.f.symbols.removed; track s.name + s.line) {
                      <span class="sym sym-removed" [title]="t.t('removed')">− {{ s.name }}</span>
                    }
                  </div>
                }
                @if (!folded().has(p.f.path)) {
                  @if (p.f.binary) {
                    <div class="empty">{{ t.t('binaryFile') }}</div>
                  } @else if (p.f.patch === null) {
                    <div class="empty">{{ t.t('tooLarge') }}</div>
                  } @else if (!p.lines.length) {
                    <div class="empty">{{ t.t('noContent') }}</div>
                  } @else if (mode() === 'split') {
                    <div class="sbs" role="table" [attr.aria-label]="p.f.path">
                      <div class="sr sr-head" role="row">
                        <span role="columnheader">{{ t.t('before') }}</span><span role="columnheader">{{ t.t('after') }}</span>
                      </div>
                      @for (r of p.rows; track $index) {
                        @if (r.hunk) {
                          <div class="sr sr-hunk" role="row"><span role="cell">{{ r.hunk }}</span></div>
                        } @else {
                          <div class="sr" role="row">
                            @for (side of [r.left, r.right]; track $index) {
                              @if (side) {
                                <div role="cell" [class]="'half h-' + side.kind" [class.moved]="side.moved" [title]="side.moved ? t.t('movedLine') : ''">
                                  <span class="n">{{ $index === 0 ? side.old : side.new }}</span>
                                  <span class="s">@if (side.moved) {<i aria-hidden="true" class="ph ph-arrows-down-up"></i>} @else { {{ side.kind === 'add' ? '+' : side.kind === 'del' ? '−' : '' }} }</span>
                                  <span class="t" [innerHTML]="side.html ?? ''"></span>
                                </div>
                              } @else {
                                <div role="cell" class="half h-none"></div>
                              }
                            }
                          </div>
                        }
                      }
                    </div>
                  } @else {
                    <div class="code">
                      @for (l of p.lines; track $index) {
                        <div [class]="'dl dl-' + l.kind" [class.moved]="l.moved" [title]="l.moved ? t.t('movedLine') : ''">
                          @if (l.kind === 'hunk') {
                            <span class="t">{{ l.text }}</span>
                          } @else {
                            <span class="n">{{ l.old ?? '' }}</span>
                            <span class="n">{{ l.new ?? '' }}</span>
                            <span class="s">@if (l.moved) {<i aria-hidden="true" class="ph ph-arrows-down-up"></i>} @else { {{ l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : '' }} }</span>
                            <span class="t" [innerHTML]="l.html ?? ''"></span>
                          }
                        </div>
                      }
                    </div>
                  }
                }
              </section>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class ChangesView {
  readonly files = input.required<AnalyzedFile[]>();
  /** What KuMal explains: a snapshot or a pull request. No KuMal box when null. */
  readonly explain = input<{ sha?: string; pull?: number } | null>(null);
  /** The revision files are opened at from here ("View file", time travel). */
  readonly at = input<string | null>(null);

  protected readonly i18n = inject(I18n);
  protected readonly session = inject(Session);
  protected readonly ctx = inject(RepoContext, { optional: true });
  private readonly api = inject(Api);
  private readonly announcer = inject(Announcer);
  protected readonly here = location.pathname;
  private readonly prefix = `chg${anchors++}-`;

  protected readonly mode = signal<'split' | 'unified'>(matchMedia('(min-width: 1000px)').matches ? 'split' : 'unified');
  protected readonly only = signal<Group | null>(null);
  /** Noise starts folded: it's there if you want it, out of the way if you don't. */
  protected readonly folded = linkedSignal(() => new Set(this.files().filter((f) => f.noise).map((f) => f.path)));
  private readonly hl = signal<Awaited<ReturnType<typeof highlighter>> | null>(null);

  protected readonly kumalLang = linkedSignal<Lang>(() => this.i18n.lang());
  protected readonly kumalShownLang = signal<Lang>('en');
  protected readonly kumalBusy = signal(false);
  protected readonly kumalHtml = signal<string | null>(null);
  protected readonly kumalError = signal<string | null>(null);

  constructor() {
    highlighter().then((h) => this.hl.set(h));
  }

  /** Real changes first, by group, then noise; each with its lines marked and coloured. */
  protected readonly prepared = computed(() => {
    const rank = (f: AnalyzedFile) => (f.noise ? 100 : 0) + GROUP_ORDER.indexOf(f.group);
    const files = [...this.files()].sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
    const lines = files.map((f) => (f.patch ? diffLines(f.patch) : []));
    markMoved(lines.filter((_, i) => !files[i].noise));
    const hl = this.hl();
    return files.map((f, i) => {
      markWords(lines[i]);
      colour(lines[i], f.path, hl);
      return { f, lines: lines[i], rows: sideBySide(lines[i]), id: this.prefix + i };
    });
  });

  protected readonly visible = computed(() => {
    const only = this.only();
    return only ? this.prepared().filter((p) => p.f.group === only) : this.prepared();
  });

  protected readonly totals = computed(() => ({
    additions: this.files().reduce((n, f) => n + f.additions, 0),
    deletions: this.files().reduce((n, f) => n + f.deletions, 0),
  }));

  protected readonly groupStats = computed(() =>
    GROUP_ORDER.map((group) => {
      const fs = this.files().filter((f) => f.group === group);
      return { group, files: fs.length, additions: fs.reduce((n, f) => n + f.additions, 0), deletions: fs.reduce((n, f) => n + f.deletions, 0) };
    }).filter((g) => g.files),
  );

  /**
   * Every added, changed and removed declaration across the change. One
   * removed from a file and added to another under the same name was moved.
   */
  protected readonly symbolSummary = computed(() => {
    const all = (key: 'added' | 'changed' | 'removed') =>
      this.files().flatMap((f) => (f.symbols?.[key] ?? []).map((sym: SymbolChange) => ({ path: f.path, sym })));
    const added = all('added');
    const removed = all('removed');
    const movedTo = added.filter((a) => removed.some((r) => r.sym.name === a.sym.name && r.path !== a.path));
    const moved = new Set(movedTo.map((m) => m.sym.name));
    const items = {
      added: added.filter((a) => !moved.has(a.sym.name)),
      movedSym: movedTo,
      changed: all('changed'),
      removed: removed.filter((r) => !moved.has(r.sym.name)),
    };
    const icons = { added: 'ph ph-plus-circle state-open', movedSym: 'ph ph-arrows-down-up state-done', changed: 'ph ph-pencil-simple', removed: 'ph ph-minus-circle' };
    const parts = (['added', 'movedSym', 'changed', 'removed'] as const).map((key) => ({ key, icon: icons[key], items: items[key] }));
    const shown = parts.filter((p) => p.items.length);
    return shown.length ? shown : null;
  });

  protected readonly treeSections = computed(() => {
    const ps = this.prepared();
    const real = GROUP_ORDER.map((group) => ({
      key: group,
      group,
      title: this.i18n.t(this.gk(group)),
      files: ps.filter((p) => !p.f.noise && p.f.group === group),
    })).filter((s) => s.files.length);
    const noise = ps.filter((p) => p.f.noise);
    return noise.length ? [...real, { key: 'noise', group: null, title: this.i18n.t('probablySkip'), files: noise }] : real;
  });

  protected gk(g: Group): WordKey {
    return `g_${g}`;
  }
  protected nk(f: AnalyzedFile): WordKey {
    return `n_${f.noise ?? 'mode'}`;
  }
  protected kk(f: AnalyzedFile): WordKey {
    return `k_${f.kind}`;
  }

  protected count(n: number, one: WordKey, many: WordKey): string {
    return `${n} ${this.i18n.t(n === 1 ? one : many)}`;
  }

  protected kindIcon(f: AnalyzedFile): string {
    return { new: 'ph ph-plus-square state-open', deleted: 'ph ph-minus-square dels', renamed: 'ph ph-arrow-right faint', modified: 'ph ph-pencil-simple faint' }[f.kind];
  }

  protected dirOf(path: string): string {
    const i = path.lastIndexOf('/');
    return i < 0 ? '' : path.slice(0, i + 1);
  }
  protected baseOf(path: string): string {
    return path.slice(path.lastIndexOf('/') + 1);
  }

  protected toggle(path: string) {
    const next = new Set(this.folded());
    if (!next.delete(path)) next.add(path);
    this.folded.set(next);
  }

  /** Scroll to a file, unfolding it and showing its group, and move focus to it. */
  protected jump(path: string) {
    const p = this.prepared().find((x) => x.f.path === path);
    if (!p) return;
    if (this.only() && this.only() !== p.f.group) this.only.set(null);
    if (this.folded().has(path)) this.toggle(path);
    setTimeout(() => {
      const el = document.getElementById(p.id);
      el?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      el?.querySelector<HTMLElement>('.fold')?.focus({ preventScroll: true });
    });
  }

  protected async askKumal(target: { sha?: string; pull?: number }) {
    if (!this.ctx) return;
    this.kumalBusy.set(true);
    this.kumalError.set(null);
    const lang = this.kumalLang();
    try {
      const r = await this.api.post<{ html: string }>(this.ctx.api('/explain'), { ...target, lang });
      this.kumalHtml.set(r.html);
      this.kumalShownLang.set(lang);
      this.announcer.announce(this.i18n.t('kumal'));
    } catch (e) {
      this.kumalError.set(errorText(e));
    } finally {
      this.kumalBusy.set(false);
    }
  }
}
