import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { errorText } from '../core/api';
import { Session } from '../core/session';

/** The server's username rule (server/src/auth.ts), checked here so mistakes show before submitting. */
const USERNAME = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

@Component({
  selector: 'cy-auth',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page" style="max-width: 440px; padding-top: 56px">
      <div class="stack" style="align-items: center; text-align: center; margin-bottom: 24px">
        <span class="brand-mark" style="width: 54px; height: 54px; border-radius: 17px; font-size: 30px"><i aria-hidden="true" class="ph-fill ph-footprints"></i></span>
        <h1 style="font-size: 26px">{{ mode() === 'login' ? 'Sign in to ChayYarHub' : 'Create your account' }}</h1>
      </div>
      <form class="card card-body stack" (ngSubmit)="submit()" novalidate>
        @if (error()) {
          <div class="alert" role="alert" tabindex="-1">{{ error() }}</div>
        }
        <div class="field">
          <label for="username">Username</label>
          <input
            id="username"
            class="input"
            name="username"
            [(ngModel)]="username"
            (blur)="leftUsername.set(true)"
            autocomplete="username"
            autocapitalize="off"
            spellcheck="false"
            required
            [attr.aria-invalid]="usernameError() ? true : null"
            [attr.aria-describedby]="describe('username', usernameError())"
          />
          @if (usernameError(); as e) {
            <small class="field-error" id="username-error">{{ e }}</small>
          }
          @if (mode() === 'signup') {
            <small id="username-help">Letters, digits and single hyphens. Your page will be {{ origin }}/{{ username().trim() || 'you' }}</small>
          }
        </div>
        <div class="field">
          <label for="password">Password</label>
          <div class="with-button">
            <input
              id="password"
              class="input"
              [type]="showPassword() ? 'text' : 'password'"
              name="password"
              [(ngModel)]="password"
              (blur)="leftPassword.set(true)"
              [attr.autocomplete]="mode() === 'login' ? 'current-password' : 'new-password'"
              required
              [attr.aria-invalid]="passwordError() ? true : null"
              [attr.aria-describedby]="describe('password', passwordError())"
            />
            <button
              type="button"
              class="inside"
              (click)="showPassword.set(!showPassword())"
              [attr.aria-pressed]="showPassword()"
              aria-label="Show password"
              [title]="showPassword() ? 'Hide password' : 'Show password'"
            >
              <i aria-hidden="true" class="ph" [class.ph-eye]="!showPassword()" [class.ph-eye-slash]="showPassword()"></i>
            </button>
          </div>
          @if (passwordError(); as e) {
            <small class="field-error" id="password-error">{{ e }}</small>
          }
          @if (mode() === 'signup') {
            <small id="password-help">At least 8 characters. You'll also use it when you git push.</small>
          }
        </div>
        <button class="btn btn-grad" type="submit" [disabled]="busy() || !username().trim() || !password()">
          {{ busy() ? (mode() === 'login' ? 'Signing in…' : 'Creating your account…') : mode() === 'login' ? 'Sign in' : 'Create account' }}
        </button>
      </form>
      <p class="soft" style="text-align: center">
        @if (mode() === 'login') {
          New to ChayYarHub? <a class="link" routerLink="/signup">Create an account</a>
        } @else {
          Already have an account? <a class="link" routerLink="/login">Sign in</a>
        }
      </p>
    </div>
  `,
})
export class AuthPage {
  readonly mode = input<'login' | 'signup'>('login');
  /** Where to go afterwards (?next=/ada/weather). */
  readonly next = input<string>();
  protected readonly origin = location.origin;
  protected readonly username = signal('');
  protected readonly password = signal('');
  protected readonly showPassword = signal(false);
  /** Field errors wait until the person has left the field, not while they type. */
  protected readonly leftUsername = signal(false);
  protected readonly leftPassword = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Say exactly what's wrong with the name, so it's clear what to change. */
  protected readonly usernameError = computed(() => {
    const name = this.username().trim();
    if (this.mode() !== 'signup' || !this.leftUsername() || !name || USERNAME.test(name)) return null;
    if (/[^A-Za-z0-9-]/.test(name)) return 'Use only letters, digits and hyphens: no spaces or other symbols.';
    if (name.length > 39) return `That's ${name.length} characters; the most is 39.`;
    if (name.startsWith('-') || name.endsWith('-')) return "A username can't start or end with a hyphen.";
    return 'Use single hyphens, not two in a row.';
  });
  protected readonly passwordError = computed(() => {
    const missing = 8 - this.password().length;
    if (this.mode() !== 'signup' || !this.leftPassword() || !this.password() || missing <= 0) return null;
    return `Add ${missing} more character${missing === 1 ? '' : 's'}: passwords need at least 8.`;
  });

  /** aria-describedby: the field's error, if any, then its hint (sign up only). */
  protected describe(field: string, error: string | null): string | null {
    const ids = [error ? `${field}-error` : '', this.mode() === 'signup' ? `${field}-help` : ''].filter(Boolean);
    return ids.length ? ids.join(' ') : null;
  }

  protected async submit() {
    this.leftUsername.set(true);
    this.leftPassword.set(true);
    if (this.usernameError() || this.passwordError()) {
      this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.session.signIn(this.mode(), this.username().trim(), this.password());
      const next = this.next();
      this.router.navigateByUrl(next?.startsWith('/') && !next.startsWith('//') ? next : '/');
    } catch (e) {
      this.error.set(errorText(e));
      setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.alert')?.focus());
    } finally {
      this.busy.set(false);
    }
  }
}
