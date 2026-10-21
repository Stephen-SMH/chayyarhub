import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Session, Theme } from './core/session';
import { Avatar } from './shared/ui';

@Component({
  selector: 'cy-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'closeMenus($event)' },
  template: `
    <header class="site-header">
      <div class="inner">
        <a class="brand" routerLink="/" aria-label="ChayYarHub home">
          <span class="brand-mark"><i class="ph-fill ph-footprints"></i></span>
          ChayYarHub <small>ခြေရာ</small>
        </a>
        <a class="nav-link" routerLink="/explore" routerLinkActive="active"><i class="ph ph-compass"></i><span class="hide-sm">Explore</span></a>
        <span class="spacer"></span>
        <button
          type="button"
          class="btn icon-btn"
          (click)="theme.toggle()"
          [attr.aria-label]="'Switch to ' + (theme.mode() === 'dark' ? 'light' : 'dark') + ' mode'"
          [title]="'Switch to ' + (theme.mode() === 'dark' ? 'light' : 'dark') + ' mode'"
        >
          <i class="ph" [class.ph-sun]="theme.mode() === 'dark'" [class.ph-moon]="theme.mode() === 'light'"></i>
        </button>
        @if (session.user(); as user) {
          <a class="btn btn-grad" routerLink="/new" title="New repository"><i class="ph ph-plus"></i><span class="hide-sm">New</span></a>
          <details class="dropdown">
            <summary class="btn icon-btn" aria-label="Account menu" title="Account"><cy-avatar [name]="user.username" [size]="30" /></summary>
            <div class="menu right">
              <div class="menu-title faint">Signed in as <strong class="soft">{{ user.username }}</strong></div>
              <a [routerLink]="['/', user.username]"><i class="ph ph-user"></i>Your profile</a>
              <a routerLink="/new"><i class="ph ph-plus"></i>New repository</a>
              <button type="button" class="item" (click)="signOut()"><i class="ph ph-sign-out"></i>Sign out</button>
            </div>
          </details>
        } @else {
          <a class="btn" routerLink="/login">Sign in</a>
          <a class="btn btn-grad hide-sm" routerLink="/signup">Sign up</a>
        }
      </div>
    </header>

    <main><router-outlet /></main>

    <footer class="site-footer">
      <div class="hairline"></div>
      <div class="inner">
        <span>ChayYarHub · ခြေရာ, where every commit leaves a footprint.</span>
        <span class="spacer"></span>
        <a routerLink="/explore">Explore</a>
        <a href="https://github.com/Stephen-SMH/gitdesk" target="_blank" rel="noopener">GitDesk, the desktop app</a>
        <span>© {{ year }} Soe Moe Htet</span>
      </div>
    </footer>
  `,
})
export class App {
  protected readonly session = inject(Session);
  protected readonly theme = inject(Theme);
  private readonly router = inject(Router);
  protected readonly year = new Date().getFullYear();

  /** Menus are <details> elements: close them on a click outside, or on picking an item. */
  protected closeMenus(e: MouseEvent) {
    const target = e.target as HTMLElement;
    for (const menu of document.querySelectorAll('details.dropdown[open]')) {
      if (!menu.contains(target) || target.closest('.menu a, .menu .item')) menu.removeAttribute('open');
    }
  }

  protected async signOut() {
    await this.session.signOut();
    this.router.navigateByUrl('/');
  }
}
