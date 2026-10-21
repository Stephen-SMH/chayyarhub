import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { errorText } from '../core/api';
import { Session } from '../core/session';

@Component({
  selector: 'cy-auth',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page" style="max-width: 440px; padding-top: 56px">
      <div class="stack" style="align-items: center; text-align: center; margin-bottom: 24px">
        <span class="brand-mark" style="width: 54px; height: 54px; border-radius: 17px; font-size: 30px"><i class="ph-fill ph-footprints"></i></span>
        <h1 style="font-size: 26px">{{ mode() === 'login' ? 'Sign in to ChayYarHub' : 'Create your account' }}</h1>
      </div>
      <form class="card card-body stack" (ngSubmit)="submit()">
        @if (error()) {
          <div class="alert" role="alert">{{ error() }}</div>
        }
        <label class="field">
          <span>Username</span>
          <input class="input" name="username" [(ngModel)]="username" autocomplete="username" autocapitalize="off" spellcheck="false" required />
          @if (mode() === 'signup') {
            <small>Letters, digits and single hyphens. This is your address: {{ origin }}/{{ username() || 'you' }}</small>
          }
        </label>
        <label class="field">
          <span>Password</span>
          <input
            class="input"
            type="password"
            name="password"
            [(ngModel)]="password"
            [attr.autocomplete]="mode() === 'login' ? 'current-password' : 'new-password'"
            required
          />
          @if (mode() === 'signup') {
            <small>At least 8 characters. You'll also use it for git push.</small>
          }
        </label>
        <button class="btn btn-grad" type="submit" [disabled]="busy() || !username() || !password()">
          {{ busy() ? 'One moment…' : mode() === 'login' ? 'Sign in' : 'Create account' }}
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
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  private readonly session = inject(Session);
  private readonly router = inject(Router);

  protected async submit() {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.session.signIn(this.mode(), this.username().trim(), this.password());
      const next = this.next();
      this.router.navigateByUrl(next?.startsWith('/') && !next.startsWith('//') ? next : '/');
    } catch (e) {
      this.error.set(errorText(e));
    } finally {
      this.busy.set(false);
    }
  }
}
