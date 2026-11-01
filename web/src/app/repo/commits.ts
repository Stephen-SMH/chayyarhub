import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { apiUrl, errorText } from '../core/api';
import { ago, day } from '../core/format';
import { I18n } from '../core/i18n';
import type { AnalyzedFile, Commit, Group, Snapshot } from '../core/models';
import { ChangesView, GROUP_ORDER } from '../shared/changes';
import { Avatar } from '../shared/ui';
import { RepoContext } from './context';

/** "What is a snapshot?", until someone says they've got it. */
@Component({
  selector: 'cy-snapshot-help',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (show()) {
      <aside class="notice cluster" style="align-items: start; gap: 12px">
        <i aria-hidden="true" class="ph ph-camera" style="font-size: 22px; color: var(--accent)"></i>
        <div style="flex: 1; min-width: 220px">
          <strong>{{ i18n.t('whatIsSnapshot') }}</strong>
          <p style="margin: 4px 0 0">{{ i18n.t('snapshotHelp') }}</p>
        </div>
        <button type="button" class="btn" style="min-height: 36px" (click)="dismiss()">{{ i18n.t('gotIt') }}</button>
      </aside>
    }
  `,
})
export class SnapshotHelp {
  protected readonly i18n = inject(I18n);
  protected readonly show = signal(SnapshotHelp.unseen());

  private static unseen(): boolean {
    try {
      return localStorage.getItem('snapshot-help') !== 'seen';
    } catch {
      return true;
    }
  }

  protected dismiss() {
    this.show.set(false);
    try {
      localStorage.setItem('snapshot-help', 'seen');
    } catch {
      /* storage blocked; it shows again next time */
    }
  }
}

/** A branch's history (optionally of one path) as a timeline of snapshots, each saying what kind of change it was. */
@Component({
  selector: 'cy-commits',
  imports: [RouterLink, Avatar, SnapshotHelp],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let m = ctx.info()!;
    @let t = i18n;
    <div class="page stack" style="max-width: 1040px">
      <div class="cluster">
        @if (ref(); as r) {
          <details class="dropdown">
            <summary class="btn"><i aria-hidden="true" class="ph ph-git-branch"></i><span class="mono" style="font-size: 13.5px">{{ r }}</span><i aria-hidden="true" class="ph ph-caret-down"></i></summary>
            <div class="menu">
              <div class="menu-title label">Switch branch</div>
              @for (b of m.branches; track b) {
                <a [routerLink]="ctx.link('commits', b)" [queryParams]="path() ? { path: path() } : {}" [class.sel]="b === r">
                  <i aria-hidden="true" class="ph" [class.ph-check]="b === r"></i><span class="mono">{{ b }}</span>
                </a>
              }
            </div>
          </details>
        }
        <h2 style="font-size: 22px">
          {{ t.t('snapshots') }}
          @if (path()) {
            <span class="soft" style="font-weight: 400">{{ t.t('inPath') }} <span class="mono">{{ path() }}</span></span>
          }
        </h2>
      </div>
      <cy-snapshot-help />

      @if (!ref()) {
        <div class="card empty"><i aria-hidden="true" class="ph ph-camera"></i>{{ t.t('noSnapshots') }}</div>
      } @else if (data.error(); as e) {
        <div class="card empty"><i aria-hidden="true" class="ph ph-footprints"></i>{{ errorText(e) }}</div>
      } @else if (data.hasValue()) {
        @for (g of days(); track g.day) {
          <section class="stack" style="gap: 10px">
            <h3 class="label"><i aria-hidden="true" class="ph ph-calendar-blank"></i> {{ t.t('snapshotsOn', { day: g.day }) }}</h3>
            <ol class="timeline-snaps">
              @for (c of g.snapshots; track c.sha) {
                <li class="snap">
                  <span class="snap-dot" aria-hidden="true"><i class="ph-fill ph-footprints"></i></span>
                  <article class="card snap-card">
                    <div class="card-body stack" style="gap: 10px">
                      <div class="cluster" style="align-items: start; gap: 8px">
                        <a class="plain snap-title" [routerLink]="ctx.link('commit', c.sha)">{{ c.summary }}</a>
                        <span class="ref" [title]="c.sha">{{ c.short }}</span>
                      </div>
                      <div class="cluster faint" style="gap: 6px; font-size: 13px">
                        <cy-avatar [name]="c.author" [size]="18" />
                        <span>{{ t.t('savedBy', { who: c.author, when: ago(c.date) }) }}</span>
                        @if (c.parents.length > 1) {
                          <span class="pill"><i aria-hidden="true" class="ph ph-git-merge"></i>merge</span>
                        }
                      </div>
                      @if (c.stats.files) {
                        <div class="snap-bar" role="img" [attr.aria-label]="describe(c)">
                          @for (s of bar(c); track s.group) {
                            <span [style.flex-grow]="s.weight" [style.background]="'var(--g-' + s.group + ')'" [title]="t.t(gk(s.group)) + ': ' + s.files"></span>
                          }
                        </div>
                        <div class="cluster" style="gap: 6px 14px; font-size: 13px">
                          @for (s of bar(c); track s.group) {
                            <span class="soft"><span class="dot" [style.background]="'var(--g-' + s.group + ')'"></span> {{ t.t(gk(s.group)) }} <strong>{{ s.files }}</strong></span>
                          }
                          <span class="spacer"></span>
                          <span><span class="adds">+{{ c.stats.additions }}</span> <span class="dels">−{{ c.stats.deletions }}</span></span>
                        </div>
                      }
                      <div class="cluster" style="gap: 8px">
                        <a class="btn btn-small" [routerLink]="ctx.link('commit', c.sha)"><i aria-hidden="true" class="ph ph-magnifying-glass"></i>{{ t.t('seeChanges') }}</a>
                        <a class="btn btn-small" [routerLink]="ctx.link('tree', c.sha)"><i aria-hidden="true" class="ph ph-folder-open"></i><span class="hide-sm">{{ t.t('browseThen') }}</span></a>
                      </div>
                    </div>
                  </article>
                </li>
              }
            </ol>
          </section>
        } @empty {
          <div class="card empty">{{ t.t('noSnapshotsHere') }}</div>
        }
        <nav class="cluster" style="justify-content: center" [attr.aria-label]="t.t('snapshots')">
          <button type="button" class="btn" [disabled]="!pageNo()" (click)="goToPage(pageNo() - 1)"><i aria-hidden="true" class="ph ph-arrow-left"></i>{{ t.t('newer') }}</button>
          <button type="button" class="btn" [disabled]="!data.value().has_more" (click)="goToPage(pageNo() + 1)">{{ t.t('older') }}<i aria-hidden="true" class="ph ph-arrow-right"></i></button>
        </nav>
      } @else {
        <div class="loading">{{ t.t('loading') }}</div>
      }
    </div>
  `,
})
export class CommitsPage {
  /** The branch or commit, from /commits/<ref>. */
  readonly rest = input<string>();
  readonly page = input<string>();
  readonly path = input<string>();
  protected readonly ctx = inject(RepoContext);
  protected readonly i18n = inject(I18n);
  protected readonly ref = computed(() => this.rest() || this.ctx.info()?.default_branch || null);
  protected readonly pageNo = computed(() => Math.max(0, Number(this.page()) || 0));
  protected readonly data = httpResource<{ commits: Snapshot[]; has_more: boolean }>(() => {
    const ref = this.ref();
    return ref ? apiUrl(this.ctx.api('/commits'), { ref, path: this.path(), page: this.pageNo() || undefined }) : undefined;
  });
  protected readonly days = computed(() => {
    const out: { day: string; snapshots: Snapshot[] }[] = [];
    for (const c of this.data.hasValue() ? this.data.value().commits : []) {
      const d = day(c.date);
      if (out.at(-1)?.day !== d) out.push({ day: d, snapshots: [] });
      out.at(-1)!.snapshots.push(c);
    }
    return out;
  });
  protected readonly ago = ago;
  protected readonly errorText = errorText;
  private readonly router = inject(Router);

  protected gk(g: Group) {
    return `g_${g}` as const;
  }

  /** The snapshot's groups in reading order, sized by lines changed (at least a sliver each). */
  protected bar(c: Snapshot) {
    return GROUP_ORDER.flatMap((group) => {
      const s = c.stats.groups[group];
      return s ? [{ group, files: s.files, weight: Math.max(1, Math.sqrt(s.additions + s.deletions)) }] : [];
    });
  }

  protected describe(c: Snapshot): string {
    return this.bar(c)
      .map((s) => `${this.i18n.t(this.gk(s.group))}: ${s.files}`)
      .join(', ');
  }

  protected goToPage(page: number) {
    this.router.navigate([], { queryParams: { page: page || null }, queryParamsHandling: 'merge' });
  }
}

/** One snapshot: its message and author, KuMal, and what changed. */
@Component({
  selector: 'cy-commit',
  imports: [RouterLink, Avatar, ChangesView, SnapshotHelp],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let t = i18n;
    <div class="page stack">
      @if (data.hasValue()) {
        @let c = data.value().commit;
        <cy-snapshot-help />
        <section class="card">
          <div class="card-body stack" style="gap: 10px">
            <div class="cluster" style="align-items: start">
              <div style="flex: 1; min-width: 0">
                <div class="label" style="margin-bottom: 4px"><i aria-hidden="true" class="ph ph-camera"></i> {{ t.t('snapshot') }} <span class="mono">{{ c.short }}</span></div>
                <h2 style="font-size: 22px; overflow-wrap: anywhere">{{ c.summary }}</h2>
              </div>
              <a class="btn" [routerLink]="ctx.link('tree', c.sha)"><i aria-hidden="true" class="ph ph-folder-open"></i><span class="hide-sm">{{ t.t('browseThen') }}</span></a>
            </div>
            @if (c.body) {
              <pre class="mono soft" style="margin: 0; white-space: pre-wrap; font-size: 13.5px">{{ c.body }}</pre>
            }
          </div>
          <div class="card-head" style="border-radius: 0 0 16px 16px; border-top: 1px solid var(--rule); border-bottom: 0">
            <cy-avatar [name]="c.author" />
            <span>{{ t.t('savedBy', { who: c.author, when: ago(c.date) }) }}</span>
            <span class="spacer"></span>
            @if (c.parents[0]; as p) {
              <a class="btn btn-small" [routerLink]="ctx.link('commit', p)"><i aria-hidden="true" class="ph ph-arrow-left"></i>{{ t.t('previousSnapshot') }}</a>
            } @else {
              <span class="faint" style="font-size: 13px">{{ t.t('firstSnapshot') }}</span>
            }
            <span class="sha hide-sm">{{ c.sha.slice(0, 12) }}</span>
          </div>
        </section>
        <cy-changes [files]="data.value().files" [explain]="{ sha: c.sha }" [at]="c.sha" />
      } @else if (data.error(); as e) {
        <div class="card empty"><i aria-hidden="true" class="ph ph-footprints"></i>{{ errorText(e) }}</div>
      } @else {
        <div class="loading">{{ t.t('loading') }}</div>
      }
    </div>
  `,
})
export class CommitPage {
  readonly sha = input.required<string>();
  protected readonly ctx = inject(RepoContext);
  protected readonly i18n = inject(I18n);
  protected readonly data = httpResource<{ commit: Commit; files: AnalyzedFile[] }>(() => apiUrl(this.ctx.api(`/commits/${encodeURIComponent(this.sha())}`)));
  protected readonly ago = ago;
  protected readonly errorText = errorText;
}
