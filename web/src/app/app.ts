import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { Announcer } from './core/announcer';
import { I18n } from './core/i18n';
import { Session, Theme } from './core/session';
import { Avatar } from './shared/ui';

@Component({
  selector: 'cy-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'closeMenus($event)', '(document:keydown.escape)': 'closeOnEscape()' },
  template: `
    <a class="skip-link" href="#main" (click)="$event.preventDefault(); focusMain()">Skip to content</a>
    <header class="site-header">
      <div class="inner">
        <a class="brand" routerLink="/" aria-label="ChayYarHub home">
          <span class="brand-mark"><i aria-hidden="true" class="ph-fill ph-footprints"></i></span>
          ChayYarHub <small>ခြေရာ</small>
        </a>
        <a class="nav-link" routerLink="/explore" routerLinkActive="active" ariaCurrentWhenActive="page" [attr.aria-label]="i18n.t('explore')"
          ><i aria-hidden="true" class="ph ph-compass"></i><span class="hide-sm">{{ i18n.t('explore') }}</span></a
        >
        <span class="spacer"></span>
        <button type="button" class="btn lang-btn" (click)="i18n.toggle()" [attr.aria-label]="i18n.t('switchLanguage')" [title]="i18n.t('switchLanguage')">
          <span [attr.lang]="i18n.lang() === 'en' ? 'my' : 'en'">{{ i18n.lang() === 'en' ? 'မြန်မာ' : 'EN' }}</span>
        </button>
        <button
          type="button"
          class="btn icon-btn"
          (click)="theme.toggle()"
          [attr.aria-label]="'Switch to ' + (theme.mode() === 'dark' ? 'light' : 'dark') + ' mode'"
          [title]="'Switch to ' + (theme.mode() === 'dark' ? 'light' : 'dark') + ' mode'"
        >
          <i aria-hidden="true" class="ph" [class.ph-sun]="theme.mode() === 'dark'" [class.ph-moon]="theme.mode() === 'light'"></i>
        </button>
        @if (session.user(); as user) {
          <a class="btn btn-grad" routerLink="/new" [title]="i18n.t('newRepo')"><i aria-hidden="true" class="ph ph-plus"></i><span class="hide-sm">{{ i18n.t('new') }}</span></a>
          <details class="dropdown">
            <summary class="btn icon-btn" aria-label="Account menu" title="Account"><cy-avatar [name]="user.username" [size]="30" /></summary>
            <div class="menu right">
              <div class="menu-title faint">{{ i18n.t('signedInAs') }} <strong class="soft">{{ user.username }}</strong></div>
              <a [routerLink]="['/', user.username]"><i aria-hidden="true" class="ph ph-user"></i>{{ i18n.t('yourProfile') }}</a>
              <a routerLink="/new"><i aria-hidden="true" class="ph ph-plus"></i>{{ i18n.t('newRepo') }}</a>
              <button type="button" class="item" (click)="signOut()"><i aria-hidden="true" class="ph ph-sign-out"></i>{{ i18n.t('signOut') }}</button>
            </div>
          </details>
        } @else {
          <a class="btn" routerLink="/login">{{ i18n.t('signIn') }}</a>
          <a class="btn btn-grad hide-sm" routerLink="/signup">{{ i18n.t('signUp') }}</a>
        }
      </div>
    </header>

    <main id="main" tabindex="-1"><router-outlet /></main>
    <div class="sr-only" role="status" aria-atomic="true">{{ announcer.message() }}</div>

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
  protected readonly i18n = inject(I18n);
  protected readonly announcer = inject(Announcer);
  private readonly router = inject(Router);
  protected readonly year = new Date().getFullYear();

  constructor() {
    // A new page moves keyboard and screen reader focus to its content, as a
    // full page load would. Query-only changes (a tab, the next page) don't.
    let path = location.pathname;
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        if (location.pathname === path) return;
        path = location.pathname;
        setTimeout(() => this.focusMain());
      });
  }

  protected focusMain() {
    document.getElementById('main')?.focus({ preventScroll: true });
  }

  /** Menus are <details> elements: close them on a click outside, or on picking an item. */
  protected closeMenus(e: MouseEvent) {
    const target = e.target as HTMLElement;
    for (const menu of document.querySelectorAll('details.dropdown[open]')) {
      if (!menu.contains(target) || target.closest('.menu a, .menu .item')) menu.removeAttribute('open');
    }
  }

  /** Escape closes an open menu and puts focus back on its button. */
  protected closeOnEscape() {
    const open = document.querySelector('details.dropdown[open]');
    if (!open) return;
    open.removeAttribute('open');
    open.querySelector('summary')?.focus();
  }

  protected async signOut() {
    await this.session.signOut();
    this.router.navigateByUrl('/');
  }
}
