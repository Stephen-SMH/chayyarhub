import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { errorText } from '../core/api';
import { day } from '../core/format';
import type { Repo, User } from '../core/models';
import { Avatar, RepoCard } from '../shared/ui';

@Component({
  selector: 'cy-profile',
  imports: [RouterLink, Avatar, RepoCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      @if (data.hasValue()) {
        @let d = data.value();
        <div class="split split-aside" style="--cols: 280px minmax(0, 1fr)">
          <aside class="stack">
            <cy-avatar class="profile-avatar" [name]="d.user.username" [size]="200" />
            <h1 style="font-size: 26px">{{ d.user.username }}</h1>
            <p class="soft" style="margin: 0"><i aria-hidden="true" class="ph ph-footprints"></i> Joined {{ day(d.user.created_at) }}</p>
          </aside>
          <section class="stack">
            <div class="cluster">
              <h2 class="label">Repositories <span class="count">{{ d.repos.length }}</span></h2>
              <span class="spacer"></span>
              @if (d.is_me) {
                <a class="btn btn-grad" routerLink="/new"><i aria-hidden="true" class="ph ph-plus"></i>New</a>
              }
            </div>
            <div class="card rows">
              @for (r of d.repos; track r.id) {
                <div class="row" style="padding: 14px 20px"><cy-repo-card [repo]="r" [showOwner]="false" /></div>
              } @empty {
                <div class="empty"><i aria-hidden="true" class="ph ph-book-bookmark"></i>{{ d.user.username }} has no public repositories yet.</div>
              }
            </div>
          </section>
        </div>
      } @else if (data.error()) {
        <div class="empty"><i aria-hidden="true" class="ph ph-warning"></i>{{ errorText(data.error()) }}</div>
      } @else {
        <div class="loading">Loading…</div>
      }
    </div>
  `,
})
export class ProfilePage {
  readonly owner = input.required<string>();
  protected readonly data = httpResource<{ user: User; repos: Repo[]; is_me: boolean }>(() => `/api/users/${encodeURIComponent(this.owner())}`);
  protected readonly day = day;
  protected readonly errorText = errorText;

  constructor() {
    const title = inject(Title);
    effect(() => title.setTitle(`${this.owner()} · ChayYarHub`));
  }
}
