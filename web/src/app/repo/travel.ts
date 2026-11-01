import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { apiUrl, errorText } from '../core/api';
import { ago, day, splitRefPath } from '../core/format';
import { I18n } from '../core/i18n';
import type { Blame, Version } from '../core/models';
import { highlighter, highlightLines } from '../shared/diff-model';
import { Avatar } from '../shared/ui';
import { RepoContext } from './context';

/** Steps on the age scale: 0 is the newest snapshot of the file, AGE_STEPS - 1 the oldest. */
const AGE_STEPS = 6;

/**
 * Time travel: slide (or play) through every snapshot of one file. Each line
 * is coloured by how long ago it was written, and the lines a snapshot
 * added are marked, so you can watch the file grow.
 */
@Component({
  selector: 'cy-travel',
  imports: [RouterLink, Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'key($event)' },
  template: `
    @let t = i18n;
    <div class="page stack" style="max-width: 1100px">
      <div class="cluster" style="align-items: start">
        <div style="flex: 1; min-width: 0">
          <div class="label" style="margin-bottom: 4px"><i aria-hidden="true" class="ph ph-clock-counter-clockwise"></i> {{ t.t('timeTravel') }}</div>
          <h2 style="font-size: 22px; overflow-wrap: anywhere" class="mono">{{ at()?.path }}</h2>
        </div>
        @if (at(); as a) {
          <a class="btn" [routerLink]="ctx.link('blob', a.ref, a.path)"><i aria-hidden="true" class="ph ph-file-text"></i>{{ t.t('viewFile') }}</a>
        }
      </div>
      <p class="soft" style="margin: 0">{{ t.t('timeTravelHelp') }}</p>

      @if (history.error(); as e) {
        <div class="card empty"><i aria-hidden="true" class="ph ph-footprints"></i>{{ errorText(e) }}</div>
      } @else if (versions().length) {
        @let v = current()!;
        <section class="card travel-controls">
          <div class="card-body stack" style="gap: 12px">
            <div class="cluster" style="gap: 8px">
              <button type="button" class="btn icon-btn" (click)="step(-1)" [disabled]="index() === 0" [attr.aria-label]="t.t('previous')" [title]="t.t('previous') + ' (←)'"><i aria-hidden="true" class="ph ph-skip-back"></i></button>
              <button type="button" class="btn btn-grad" (click)="togglePlay()" [attr.aria-pressed]="playing()">
                <i aria-hidden="true" class="ph-fill" [class.ph-play]="!playing()" [class.ph-pause]="playing()"></i>{{ playing() ? t.t('pause') : t.t('play') }}
              </button>
              <button type="button" class="btn icon-btn" (click)="step(1)" [disabled]="index() === versions().length - 1" [attr.aria-label]="t.t('next')" [title]="t.t('next') + ' (→)'"><i aria-hidden="true" class="ph ph-skip-forward"></i></button>
              <strong style="margin-left: 6px">{{ t.t('versionOf', { i: index() + 1, n: versions().length }) }}</strong>
              <span class="spacer"></span>
              <span class="faint" style="font-size: 13px">{{ day(versions()[0].date) }} → {{ day(versions()[versions().length - 1].date) }}</span>
            </div>
            <div class="travel-track">
              <input
                type="range"
                class="travel-slider"
                min="0"
                [max]="versions().length - 1"
                [value]="index()"
                (input)="pick(+$any($event.target).value)"
                [attr.aria-label]="t.t('timeTravel')"
                [attr.aria-valuetext]="t.t('versionOf', { i: index() + 1, n: versions().length }) + ': ' + v.summary"
              />
              <div class="travel-ticks" aria-hidden="true">
                @for (x of versions(); track x.sha) {
                  <span [class.on]="$index <= index()" [style.left.%]="versions().length > 1 ? ($index / (versions().length - 1)) * 100 : 50"></span>
                }
              </div>
            </div>
            <div class="cluster" style="gap: 10px">
              <cy-avatar [name]="v.author" [size]="28" />
              <div style="flex: 1; min-width: 0">
                <a class="plain" style="font-weight: 600" [routerLink]="ctx.link('commit', v.sha)">{{ v.summary }}</a>
                <div class="faint" style="font-size: 13px">{{ t.t('savedBy', { who: v.author, when: ago(v.date) }) }} · <span class="mono">{{ v.short }}</span></div>
              </div>
              <a class="btn btn-small" [routerLink]="ctx.link('commit', v.sha)"><i aria-hidden="true" class="ph ph-magnifying-glass"></i>{{ t.t('seeChanges') }}</a>
            </div>
            @if (v.path !== at()?.path) {
              <div class="faint" style="font-size: 13px"><i aria-hidden="true" class="ph ph-arrow-right"></i> {{ t.t('renamedFrom', { path: v.path }) }}</div>
            }
          </div>
        </section>

        <div class="cluster" style="gap: 14px; font-size: 13px">
          <span class="label">{{ t.t('lineAge') }}</span>
          <span class="age-legend" aria-hidden="true">
            @for (s of ageSteps; track s) {
              <span [class]="'age-' + s"></span>
            }
          </span>
          <span class="faint">{{ t.t('newest') }} → {{ t.t('oldest') }}</span>
          <span class="spacer"></span>
          <span><span class="new-swatch"></span> {{ t.t('newHere') }}</span>
        </div>

        <section class="card">
          @if (blame.hasValue()) {
            @let b = blame.value();
            @if (b.too_large || b.binary) {
              <div class="empty">{{ t.t('cantPlay') }}</div>
            } @else {
              <div class="card-head"><span class="mono soft" style="font-size: 13px">{{ t.t('linesOf', { n: b.lines.length }) }}</span></div>
              <div class="code">
                <table>
                  <tbody>
                    @for (l of rows(); track $index) {
                      <tr [class.is-new]="l.isNew" [title]="l.title">
                        <td [class]="'age age-' + l.age"></td>
                        <td class="ln">{{ $index + 1 }}</td>
                        <td class="src" [innerHTML]="l.html"></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          } @else if (blame.error(); as e) {
            <div class="empty">{{ errorText(e) }}</div>
          } @else {
            <div class="loading">{{ t.t('loading') }}</div>
          }
        </section>
      } @else {
        <div class="loading">{{ t.t('loading') }}</div>
      }
    </div>
  `,
})
export class TravelPage {
  /** `<ref>/<path>` from the URL. */
  readonly rest = input.required<string>();
  protected readonly ctx = inject(RepoContext);
  protected readonly i18n = inject(I18n);
  protected readonly at = computed(() => {
    const m = this.ctx.info();
    return m ? splitRefPath(this.rest(), m.branches) : null;
  });
  protected readonly history = httpResource<{ versions: Version[] }>(() => {
    const a = this.at();
    return a?.path ? apiUrl(this.ctx.api('/file-history'), { ref: a.ref, path: a.path }) : undefined;
  });
  /** Oldest first, so the slider moves forward in time. */
  protected readonly versions = computed(() => (this.history.hasValue() ? [...this.history.value().versions].reverse() : []));
  /** Starts at the newest snapshot. */
  protected readonly index = linkedSignal(() => Math.max(0, this.versions().length - 1));
  protected readonly current = computed(() => this.versions()[this.index()]);
  protected readonly blame = httpResource<Blame>(() => {
    const v = this.current();
    return v ? apiUrl(this.ctx.api('/blame'), { ref: v.sha, path: v.path }) : undefined;
  });
  private readonly hl = signal<Awaited<ReturnType<typeof highlighter>> | null>(null);
  protected readonly playing = signal(false);
  private timer: ReturnType<typeof setInterval> | undefined;
  protected readonly ageSteps = Array.from({ length: AGE_STEPS }, (_, i) => i);

  /** Each line with its colour, its age step, and whether this snapshot wrote it. */
  protected readonly rows = computed(() => {
    if (!this.blame.hasValue()) return [];
    const b = this.blame.value();
    const v = this.current();
    // Age by position in the file's own history, so a young file still spans the whole scale.
    const order = new Map(this.versions().map((x, i) => [x.sha, i]));
    const html = highlightLines(this.hl(), b.lines.map((l) => l.text), b.path);
    return b.lines.map((l, i) => {
      const c = b.commits[l.sha];
      const at = this.index();
      const pos = Math.min(order.get(l.sha) ?? 0, at);
      const age = Math.round(((at - pos) / Math.max(1, at)) * (AGE_STEPS - 1));
      return { html: html[i], age, isNew: l.sha === v?.sha, title: c ? `${c.short} · ${c.author} · ${day(c.date)} · ${c.summary}` : '' };
    });
  });

  protected readonly ago = ago;
  protected readonly day = day;
  protected readonly errorText = errorText;

  constructor() {
    highlighter().then((h) => this.hl.set(h));
    const title = inject(Title);
    effect(() => title.setTitle(`${this.i18n.t('timeTravel')}: ${this.at()?.path ?? ''} · ${this.ctx.owner()}/${this.ctx.name()}`));
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
  }

  protected pick(i: number) {
    this.index.set(Math.max(0, Math.min(this.versions().length - 1, i)));
  }

  protected step(d: number) {
    this.stop();
    this.pick(this.index() + d);
  }

  protected togglePlay() {
    if (this.playing()) return this.stop();
    // Playing from the end starts over from the first snapshot.
    if (this.index() === this.versions().length - 1) this.pick(0);
    this.playing.set(true);
    this.timer = setInterval(() => {
      if (this.index() >= this.versions().length - 1) return this.stop();
      this.pick(this.index() + 1);
    }, 1600);
  }

  private stop() {
    clearInterval(this.timer);
    this.playing.set(false);
  }

  /** ← and → step through snapshots, unless focus is in a text field or on the slider (which handles them itself). */
  protected key(e: KeyboardEvent) {
    const el = e.target as HTMLElement;
    if (el.matches('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowLeft') this.step(-1);
    else if (e.key === 'ArrowRight') this.step(1);
  }
}
