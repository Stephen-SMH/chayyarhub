import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiUrl, errorText } from '../core/api';
import { ago } from '../core/format';
import type { BranchRow } from '../core/models';
import { RepoContext } from './context';

@Component({
  selector: 'cy-branches',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page narrow stack">
      <h2 style="font-size: 22px">Branches</h2>
      @if (data.hasValue()) {
        <div class="card rows">
          @for (row of data.value().branches; track row.branch.name) {
            <div class="row hover" style="padding: 12px 16px; flex-wrap: wrap">
              <div style="flex: 1; min-width: 200px">
                <a class="ref plain" [routerLink]="ctx.link('tree', row.branch.name)">{{ row.branch.name }}</a>
                @if (row.is_default) {
                  <span class="pill" style="margin-left: 6px">default</span>
                }
                <div class="faint" style="font-size: 13px; margin-top: 4px">Updated {{ ago(row.branch.date) }} by {{ row.branch.author }}</div>
              </div>
              @if (!row.is_default) {
                <span class="mono faint" style="font-size: 13px" [title]="row.behind + ' behind, ' + row.ahead + ' ahead of ' + data.value().default_branch">
                  <span class="dels">{{ row.behind }}</span> behind · <span class="adds">{{ row.ahead }}</span> ahead
                </span>
                @if (row.pull) {
                  <a class="btn" style="min-height: 36px" [routerLink]="ctx.link('pull', '' + row.pull)"><i aria-hidden="true" class="ph ph-git-pull-request state-open"></i>#{{ row.pull }}</a>
                } @else if (row.ahead) {
                  <a class="btn" style="min-height: 36px" [routerLink]="ctx.link('compare')" [queryParams]="{ base: data.value().default_branch, head: row.branch.name }">New pull request</a>
                }
              }
            </div>
          } @empty {
            <div class="empty">No branches yet.</div>
          }
        </div>
      } @else if (data.error(); as e) {
        <div class="card empty">{{ errorText(e) }}</div>
      } @else {
        <div class="loading">Loading…</div>
      }
    </div>
  `,
})
export class BranchesPage {
  protected readonly ctx = inject(RepoContext);
  protected readonly data = httpResource<{ default_branch: string | null; branches: BranchRow[] }>(() => apiUrl(this.ctx.api('/branches')));
  protected readonly ago = ago;
  protected readonly errorText = errorText;
}
