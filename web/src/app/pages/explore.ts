import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import type { Repo } from '../core/models';
import { RepoCard } from '../shared/ui';

@Component({
  selector: 'cy-explore',
  imports: [RepoCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page narrow stack">
      <div>
        <h1 style="font-size: 26px">Explore</h1>
        <p class="soft" style="margin: 6px 0 0">Public repositories, most recently updated first.</p>
      </div>
      @if (repos.hasValue()) {
        <div class="card rows">
          @for (r of repos.value().repos; track r.id) {
            <div class="row" style="padding: 14px 20px"><cy-repo-card [repo]="r" /></div>
          } @empty {
            <div class="empty"><i class="ph ph-footprints"></i>No public repositories yet.</div>
          }
        </div>
      } @else if (repos.isLoading()) {
        <div class="loading">Loading…</div>
      }
    </div>
  `,
})
export class ExplorePage {
  protected readonly repos = httpResource<{ repos: Repo[] }>(() => '/api/explore');
}
