import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { Repo } from '../core/models';
import { Session } from '../core/session';
import { Avatar, RepoCard } from '../shared/ui';

/** Signed out: what ChayYarHub is. Signed in: your repositories and what's new. */
@Component({
  selector: 'cy-home',
  imports: [FormsModule, RouterLink, RepoCard, Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (session.user(); as user) {
      <div class="page stack" style="gap: 24px">
        <div class="cluster">
          <cy-avatar [name]="user.username" [size]="40" />
          <h1 style="font-size: 24px">Welcome back, {{ user.username }}</h1>
        </div>
        <div class="split split-aside">
        <section class="card" aria-labelledby="mine-title">
          <div class="card-head">
            <h2 class="label" id="mine-title">Your repositories</h2><span class="spacer"></span>
            <a class="btn" style="min-height: 36px; padding: 0 12px" routerLink="/new" aria-label="New repository"><i aria-hidden="true" class="ph ph-plus"></i>New</a>
          </div>
          @if (allMine().length > 5) {
            <div style="padding: 10px 12px; border-bottom: 1px solid var(--rule)">
              <input class="input" type="search" name="find" [(ngModel)]="find" placeholder="Find a repository…" aria-label="Find one of your repositories" />
            </div>
          }
          <div class="rows">
            @for (r of mine(); track r.id) {
              <a class="row" [routerLink]="['/', r.owner, r.name]">
                <i aria-hidden="true" class="ph ph-book-bookmark faint"></i><span class="grow">{{ r.name }}</span>
                @if (r.private) {
                  <i aria-hidden="true" class="ph ph-lock-simple faint" title="Private"></i><span class="sr-only">(private)</span>
                }
              </a>
            } @empty {
              <div class="empty" style="padding: 24px">
                @if (find()) {
                  Nothing matches “{{ find() }}”.
                } @else {
                  No repositories yet.<br /><a class="link" routerLink="/new">Create your first one</a>
                }
              </div>
            }
          </div>
        </section>
        <section class="stack">
          <h2 class="label">Recently updated on ChayYarHub</h2>
          <div class="card rows">
            @for (r of recent(); track r.id) {
              <div class="row" style="padding: 14px 20px"><cy-repo-card [repo]="r" /></div>
            } @empty {
              <div class="empty"><i aria-hidden="true" class="ph ph-footprints"></i>Nothing public yet. Push something and it shows up here.</div>
            }
          </div>
        </section>
        </div>
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
              <a class="btn btn-grad" style="min-height: 48px; padding: 0 24px" routerLink="/signup">Create your account <i aria-hidden="true" class="ph ph-arrow-right"></i></a>
              <a class="btn btn-glass" style="min-height: 48px; padding: 0 22px" routerLink="/explore"><i aria-hidden="true" class="ph ph-compass"></i>Explore repositories</a>
            </div>
          </div>
          <div class="terminal" role="img" aria-label="A terminal pushing a repository to ChayYarHub: git remote add origin, then git push -u origin main">
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
              <div class="empty"><i aria-hidden="true" class="ph ph-footprints"></i>No public repositories yet. Be the first.</div>
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
  protected readonly allMine = computed(() => (this.profile.hasValue() ? this.profile.value().repos : []));
  protected readonly find = signal('');
  protected readonly mine = computed(() => {
    const q = this.find().trim().toLowerCase();
    return q ? this.allMine().filter((r) => r.name.toLowerCase().includes(q)) : this.allMine();
  });
}
