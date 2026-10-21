import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiUrl, errorText } from '../core/api';
import { ago } from '../core/format';
import type { Issue } from '../core/models';
import { RepoContext, issueIcon } from './context';

/** The issue list, or the pull request list (route data `pulls`). */
@Component({
  selector: 'cy-issues',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page stack">
      <div class="cluster">
        <h1 style="font-size: 22px">{{ pulls() ? 'Pull requests' : 'Issues' }}</h1>
        <span class="spacer"></span>
        @if (pulls()) {
          <a class="btn btn-grad" [routerLink]="ctx.link('compare')"><i class="ph ph-git-pull-request"></i>New pull request</a>
        } @else {
          <a class="btn btn-grad" [routerLink]="ctx.link('issues', 'new')"><i class="ph ph-plus"></i>New issue</a>
        }
      </div>
      <section class="card">
        <div class="card-head" style="padding: 0 8px">
          <a class="tab" [class.active]="!closed()" [routerLink]="[]" [queryParams]="{ state: null }">
            <i [class]="pulls() ? 'ph ph-git-pull-request' : 'ph ph-record'"></i>{{ counts().open }} Open
          </a>
          <a class="tab" [class.active]="closed()" [routerLink]="[]" [queryParams]="{ state: 'closed' }"><i class="ph ph-check"></i>{{ counts().closed }} Closed</a>
        </div>
        @if (data.hasValue()) {
          <div class="rows">
            @for (i of data.value().issues; track i.number) {
              <div class="row hover" style="padding: 10px 16px; align-items: start">
                <i [class]="icon(i)" style="font-size: 20px; margin-top: 2px"></i>
                <div style="flex: 1; min-width: 0">
                  <a class="plain" style="font-weight: 550; overflow-wrap: anywhere" [routerLink]="ctx.link(i.is_pull ? 'pull' : 'issues', '' + i.number)">{{ i.title }}</a>
                  <div class="faint" style="font-size: 13px; margin-top: 2px">
                    #{{ i.number }} opened {{ ago(i.created_at) }} by {{ i.author }}
                    @if (i.is_pull) {
                      · <span class="ref">{{ i.head }}</span> → <span class="ref">{{ i.base }}</span>
                    }
                  </div>
                </div>
                @if (i.comments) {
                  <span class="faint" style="font-size: 13px; white-space: nowrap"><i class="ph ph-chat-circle"></i> {{ i.comments }}</span>
                }
              </div>
            } @empty {
              <div class="empty">
                <i [class]="pulls() ? 'ph ph-git-pull-request' : 'ph ph-record'"></i>
                No {{ closed() ? 'closed' : 'open' }} {{ pulls() ? 'pull requests' : 'issues' }}.
              </div>
            }
          </div>
        } @else if (data.error(); as e) {
          <div class="empty">{{ errorText(e) }}</div>
        } @else {
          <div class="loading">Loading…</div>
        }
      </section>
    </div>
  `,
})
export class IssuesPage {
  readonly pulls = input(false);
  readonly state = input<string>();
  protected readonly ctx = inject(RepoContext);
  protected readonly closed = computed(() => this.state() === 'closed');
  protected readonly data = httpResource<{ issues: Issue[]; open: number; closed: number }>(() =>
    apiUrl(this.ctx.api('/issues'), { state: this.closed() ? 'closed' : undefined, pulls: this.pulls() || undefined }),
  );
  protected readonly counts = computed(() => (this.data.hasValue() ? this.data.value() : { open: 0, closed: 0 }));
  protected readonly icon = issueIcon;
  protected readonly ago = ago;
  protected readonly errorText = errorText;
}
