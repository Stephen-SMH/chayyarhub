import { Injectable, inject, signal } from '@angular/core';
import { Api } from './api';
import type { User } from './models';

/** Who is signed in. Loaded once before the first page renders. */
@Injectable({ providedIn: 'root' })
export class Session {
  private readonly api = inject(Api);
  readonly user = signal<User | null>(null);

  async load() {
    try {
      this.user.set((await this.api.get<{ user: User | null }>('/me')).user);
    } catch {
      this.user.set(null);
    }
  }

  async signIn(mode: 'login' | 'signup', username: string, password: string) {
    this.user.set((await this.api.post<{ user: User }>(`/${mode}`, { username, password })).user);
  }

  async signOut() {
    await this.api.post('/logout');
    this.user.set(null);
  }
}

/** Light or dark, as set on <html data-theme> (index.html picks the first one). */
@Injectable({ providedIn: 'root' })
export class Theme {
  readonly mode = signal<'dark' | 'light'>(document.documentElement.dataset['theme'] === 'light' ? 'light' : 'dark');

  toggle() {
    const next = this.mode() === 'dark' ? 'light' : 'dark';
    this.mode.set(next);
    document.documentElement.dataset['theme'] = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* storage blocked; the choice lasts until reload */
    }
  }
}
