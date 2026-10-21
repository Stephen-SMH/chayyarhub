import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { Api, errorText } from '../core/api';
import { RepoContext } from './context';

/** The header every repository page shares: name, visibility, star, tabs. */
@Component({
  selector: 'cy-repo',
  imports: [RouterOutlet, RouterLink],
  providers: [RepoContext],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="repo-head">
      <div class="page">
        <div class="cluster" style="justify-content: space-between">
          <h1 class="repo-title">
            <i class="ph ph-book-bookmark faint"></i>
            <a class="plain" [routerLink]="['/', ctx.owner()]">{{ ctx.owner() }}</a>
            <span class="faint">/</span>
            <a class="plain" [routerLink]="ctx.base()"><strong>{{ ctx.name() }}</strong></a>
            @if (ctx.info(); as m) {
              <span class="pill">
                @if (m.repo.private) {
                  <i class="ph ph-lock-simple"></i>Private
                } @else {
                  Public
                }
              </span>
            }
          </h1>
          @if (ctx.info(); as m) {
            <button type="button" class="btn" (click)="toggleStar()" [attr.aria-pressed]="m.starred">
              <i [class]="m.starred ? 'ph-fill ph-star' : 'ph ph-star'" [style.color]="m.starred ? 'var(--warning)' : null"></i>
              {{ m.starred ? 'Starred' : 'Star' }}
              <span class="count">{{ m.repo.stars }}</span>
            </button>
          }
        </div>
        @if (ctx.info()?.repo?.description; as description) {
          <p class="soft" style="margin: 8px 0 0">{{ description }}</p>
        }
        <nav class="tabs" aria-label="Repository">
          <a class="tab" [class.active]="section() === 'code'" [routerLink]="ctx.base()"><i class="ph ph-code"></i>Code</a>
          <a class="tab" [class.active]="section() === 'issues'" [routerLink]="ctx.link('issues')">
            <i class="ph ph-record"></i>Issues
            @if (ctx.info(); as m) {
              <span class="count">{{ m.open_issues }}</span>
            }
          </a>
          <a class="tab" [class.active]="section() === 'pulls'" [routerLink]="ctx.link('pulls')">
            <i class="ph ph-git-pull-request"></i>Pull requests
            @if (ctx.info(); as m) {
              <span class="count">{{ m.open_pulls }}</span>
            }
          </a>
          @if (ctx.info()?.is_owner) {
            <a class="tab" [class.active]="section() === 'settings'" [routerLink]="ctx.link('settings')"><i class="ph ph-gear"></i>Settings</a>
          }
        </nav>
      </div>
    </div>
    @if (ctx.info()) {
      <router-outlet />
    } @else if (ctx.meta.error(); as e) {
      <div class="page empty"><i class="ph ph-footprints"></i>{{ errorText(e) }}</div>
    } @else {
      <div class="loading">Loading…</div>
    }
  `,
})
export class RepoShell {
  protected readonly ctx = inject(RepoContext);
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  /** Which tab the current page belongs to (/owner/repo/<section>/…). */
  protected readonly section = computed(() => {
    const first = this.url().split(/[?#]/)[0].split('/')[3] ?? '';
    if (first === 'issues') return 'issues';
    if (first === 'pulls' || first === 'pull' || first === 'compare') return 'pulls';
    return first === 'settings' ? 'settings' : 'code';
  });
  protected readonly errorText = errorText;

  constructor() {
    const title = inject(Title);
    effect(() => title.setTitle(`${this.ctx.owner()}/${this.ctx.name()} · ChayYarHub`));
  }

  protected async toggleStar() {
    const m = this.ctx.info();
    if (!m) return;
    if (!m.signed_in) {
      this.router.navigate(['/login'], { queryParams: { next: this.router.url } });
      return;
    }
    await (m.starred ? this.api.delete(this.ctx.api('/star')) : this.api.put(this.ctx.api('/star')));
    this.ctx.meta.reload();
  }
}
