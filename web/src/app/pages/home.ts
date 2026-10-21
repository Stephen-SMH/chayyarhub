import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Repo } from '../core/models';
import { Session } from '../core/session';
import { Avatar, RepoCard } from '../shared/ui';

/** Signed out: what ChayYarHub is. Signed in: your repositories and what's new. */
@Component({
  selector: 'cy-home',
  imports: [RouterLink, RepoCard, Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (session.user(); as user) {
      <div class="page split" style="grid-template-columns: 320px minmax(0, 1fr)">
        <aside class="stack">
          <div class="cluster">
            <cy-avatar [name]="user.username" [size]="36" />
            <strong>{{ user.username }}</strong>
          </div>
          <section class="card">
            <div class="card-head">
              <span class="label">Your repositories</span><span class="spacer"></span>
              <a class="btn" style="min-height: 36px; padding: 0 12px" routerLink="/new"><i class="ph ph-plus"></i>New</a>
            </div>
            <div class="rows">
              @for (r of mine(); track r.id) {
                <a class="row" [routerLink]="['/', r.owner, r.name]">
                  <i class="ph ph-book-bookmark faint"></i><span class="grow">{{ r.name }}</span>
                  @if (r.private) {
                    <i class="ph ph-lock-simple faint" title="Private"></i>
                  }
                </a>
              } @empty {
                <div class="empty" style="padding: 24px">No repositories yet.<br /><a class="link" routerLink="/new">Create your first one</a></div>
              }
            </div>
          </section>
        </aside>
        <section class="stack">
          <h1 style="font-size: 24px">Welcome back, {{ user.username }}</h1>
          <h2 class="label">Recently updated on ChayYarHub</h2>
          <div class="card rows">
            @for (r of recent(); track r.id) {
              <div class="row" style="padding: 14px 20px"><cy-repo-card [repo]="r" /></div>
            } @empty {
              <div class="empty"><i class="ph ph-footprints"></i>Nothing public yet. Push something and it shows up here.</div>
            }
          </div>
        </section>
      </div>
    } @else {
      <div class="page stack" style="gap: 40px">
        <section class="panel-dark hero">
          <div>
            <span class="chip"><span class="mono">ခြေရာ</span> chay-yar · footprints</span>
            <h1>Every commit leaves a footprint.</h1>
            <p>
              ChayYarHub hosts your git repositories. Push over HTTP, browse code and history, track issues and merge pull requests, on a server you run
              yourself.
            </p>
            <div class="cluster" style="margin-top: 28px">
              <a class="btn btn-grad" style="min-height: 48px; padding: 0 24px" routerLink="/signup">Create your account <i class="ph ph-arrow-right"></i></a>
              <a class="btn btn-glass" style="min-height: 48px; padding: 0 22px" routerLink="/explore"><i class="ph ph-compass"></i>Explore repositories</a>
            </div>
          </div>
          <div class="terminal" aria-label="Pushing a repository to ChayYarHub">
            <div class="dots"><span></span><span></span><span></span></div>
            <div><span class="p">$</span> git remote add origin {{ origin }}/ada/weather.git</div>
            <div><span class="p">$</span> git push -u origin main</div>
            <div class="o">Writing objects: 100% (24/24), done.</div>
            <div class="o">To {{ origin }}/ada/weather.git</div>
            <div><span class="c">* [new branch]</span> main → main</div>
            <div><span class="p">$</span> <span class="cursor"></span></div>
          </div>
        </section>
        <section class="stack">
          <h2 class="label">Recently updated</h2>
          <div class="card rows">
            @for (r of recent(); track r.id) {
              <div class="row" style="padding: 14px 20px"><cy-repo-card [repo]="r" /></div>
            } @empty {
              <div class="empty"><i class="ph ph-footprints"></i>No public repositories yet. Be the first.</div>
            }
          </div>
        </section>
      </div>
    }
  `,
})
export class HomePage {
  protected readonly session = inject(Session);
  protected readonly origin = location.origin;
  private readonly explore = httpResource<{ repos: Repo[] }>(() => '/api/explore');
  private readonly profile = httpResource<{ repos: Repo[] }>(() => {
    const user = this.session.user();
    return user ? `/api/users/${user.username}` : undefined;
  });
  protected readonly recent = computed(() => (this.explore.hasValue() ? this.explore.value().repos : []));
  protected readonly mine = computed(() => (this.profile.hasValue() ? this.profile.value().repos : []));
}
