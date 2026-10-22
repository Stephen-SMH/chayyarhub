import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Repo } from '../core/models';
import { RepoCard } from '../shared/ui';

@Component({
  selector: 'cy-explore',
  imports: [FormsModule, RepoCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page narrow stack">
      <div>
        <h1 style="font-size: 26px">Explore</h1>
        <p class="soft" style="margin: 6px 0 0">Public repositories, most recently updated first.</p>
      </div>
      <label class="field">
        <span class="sr-only">Find a repository</span>
        <input class="input" type="search" name="find" [(ngModel)]="find" placeholder="Find a repository by name, owner or description…" />
      </label>
      @if (repos.hasValue()) {
        <h2 class="sr-only">{{ shown().length }} {{ shown().length === 1 ? 'repository' : 'repositories' }}</h2>
        <div class="card rows">
          @for (r of shown(); track r.id) {
            <div class="row" style="padding: 14px 20px"><cy-repo-card [repo]="r" /></div>
          } @empty {
            <div class="empty">
              <i aria-hidden="true" class="ph ph-footprints"></i>
              {{ find() ? 'Nothing matches “' + find() + '”.' : 'No public repositories yet.' }}
            </div>
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
  protected readonly find = signal('');
  protected readonly shown = computed(() => {
    const all = this.repos.hasValue() ? this.repos.value().repos : [];
    const q = this.find().trim().toLowerCase();
    return q ? all.filter((r) => `${r.owner}/${r.name} ${r.description}`.toLowerCase().includes(q)) : all;
  });
}
