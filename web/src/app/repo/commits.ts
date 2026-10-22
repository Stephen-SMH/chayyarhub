import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { apiUrl, errorText } from '../core/api';
import { ago, day } from '../core/format';
import type { Commit, FileDiff } from '../core/models';
import { DiffView } from '../shared/diff';
import { Avatar } from '../shared/ui';
import { RepoContext } from './context';

/** History of a branch (optionally of one path), grouped by day. */
@Component({
  selector: 'cy-commits',
  imports: [RouterLink, Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let m = ctx.info()!;
    <div class="page stack">
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
          Commits
          @if (path()) {
            <span class="soft" style="font-weight: 400">in <span class="mono">{{ path() }}</span></span>
          }
        </h2>
      </div>

      @if (!ref()) {
        <div class="card empty"><i aria-hidden="true" class="ph ph-git-commit"></i>No commits yet.</div>
      } @else if (data.error(); as e) {
        <div class="card empty"><i aria-hidden="true" class="ph ph-footprints"></i>{{ errorText(e) }}</div>
      } @else if (data.hasValue()) {
        @for (g of groups(); track g.day) {
          <section class="stack" style="gap: 8px">
            <h3 class="label"><i aria-hidden="true" class="ph ph-git-commit"></i> Commits on {{ g.day }}</h3>
            <div class="card rows">
              @for (c of g.commits; track c.sha) {
                <div class="row hover" style="padding: 10px 16px">
                  <div style="flex: 1; min-width: 0">
                    <a class="plain" style="font-weight: 550; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap" [routerLink]="ctx.link('commit', c.sha)">{{ c.summary }}</a>
                    <div class="cluster faint" style="gap: 6px; font-size: 13px; margin-top: 2px">
                      <cy-avatar [name]="c.author" [size]="18" /><strong class="soft">{{ c.author }}</strong> committed {{ ago(c.date) }}
                    </div>
                  </div>
                  <a class="ref plain" [routerLink]="ctx.link('commit', c.sha)" [title]="c.sha">{{ c.short }}</a>
                  <a class="btn icon-btn" style="min-height: 36px; width: 36px" [routerLink]="ctx.link('tree', c.sha)" title="Browse the files at this commit" aria-label="Browse files at this commit">
                    <i aria-hidden="true" class="ph ph-code"></i>
                  </a>
                </div>
              }
            </div>
          </section>
        } @empty {
          <div class="card empty">No commits touch this path.</div>
        }
        <nav class="cluster" style="justify-content: center" aria-label="Pages of commits">
          <button type="button" class="btn" [disabled]="!pageNo()" (click)="goToPage(pageNo() - 1)"><i aria-hidden="true" class="ph ph-arrow-left"></i>Newer</button>
          <button type="button" class="btn" [disabled]="!data.value().has_more" (click)="goToPage(pageNo() + 1)">Older<i aria-hidden="true" class="ph ph-arrow-right"></i></button>
        </nav>
      } @else {
        <div class="loading">Loading…</div>
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
  protected readonly ref = computed(() => this.rest() || this.ctx.info()?.default_branch || null);
  protected readonly pageNo = computed(() => Math.max(0, Number(this.page()) || 0));
  protected readonly data = httpResource<{ commits: Commit[]; has_more: boolean }>(() => {
    const ref = this.ref();
    return ref ? apiUrl(this.ctx.api('/commits'), { ref, path: this.path(), page: this.pageNo() || undefined }) : undefined;
  });
  protected readonly groups = computed(() => {
    const out: { day: string; commits: Commit[] }[] = [];
    for (const c of this.data.hasValue() ? this.data.value().commits : []) {
      const d = day(c.date);
      if (out.at(-1)?.day !== d) out.push({ day: d, commits: [] });
      out.at(-1)!.commits.push(c);
    }
    return out;
  });
  protected readonly ago = ago;
  protected readonly errorText = errorText;
  private readonly router = inject(Router);

  protected goToPage(page: number) {
    this.router.navigate([], { queryParams: { page: page || null }, queryParamsHandling: 'merge' });
  }
}

/** One commit: its message, author, parents and changes. */
@Component({
  selector: 'cy-commit',
  imports: [RouterLink, Avatar, DiffView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page stack">
      @if (data.hasValue()) {
        @let c = data.value().commit;
        <section class="card">
          <div class="card-body stack" style="gap: 10px">
            <div class="cluster" style="align-items: start">
              <h2 style="font-size: 22px; flex: 1; min-width: 0; overflow-wrap: anywhere">{{ c.summary }}</h2>
              <a class="btn" [routerLink]="ctx.link('tree', c.sha)"><i aria-hidden="true" class="ph ph-code"></i>Browse files</a>
            </div>
            @if (c.body) {
              <pre class="mono soft" style="margin: 0; white-space: pre-wrap; font-size: 13.5px">{{ c.body }}</pre>
            }
          </div>
          <div class="card-head" style="border-radius: 0 0 16px 16px; border-top: 1px solid var(--rule); border-bottom: 0">
            <cy-avatar [name]="c.author" />
            <span><strong>{{ c.author }}</strong> <span class="soft">committed {{ ago(c.date) }}</span></span>
            <span class="spacer"></span>
            @for (p of c.parents; track p) {
              <span class="faint hide-sm" style="font-size: 13px">{{ $first ? 'parent' : '+' }}</span>
              <a class="ref plain" [routerLink]="ctx.link('commit', p)">{{ p.slice(0, 7) }}</a>
            }
            <span class="faint" style="font-size: 13px">commit</span><span class="sha">{{ c.sha.slice(0, 12) }}</span>
          </div>
        </section>
        <cy-diff [files]="data.value().files" />
      } @else if (data.error(); as e) {
        <div class="card empty"><i aria-hidden="true" class="ph ph-footprints"></i>{{ errorText(e) }}</div>
      } @else {
        <div class="loading">Loading…</div>
      }
    </div>
  `,
})
export class CommitPage {
  readonly sha = input.required<string>();
  protected readonly ctx = inject(RepoContext);
  protected readonly data = httpResource<{ commit: Commit; files: FileDiff[] }>(() => apiUrl(this.ctx.api(`/commits/${encodeURIComponent(this.sha())}`)));
  protected readonly ago = ago;
  protected readonly errorText = errorText;
}
