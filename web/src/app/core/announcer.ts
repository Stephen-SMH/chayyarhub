import { Injectable, signal } from '@angular/core';

/**
 * Tells screen reader users what just happened ("Pull request merged")
 * without moving their focus. App renders the one status region it fills.
 */
@Injectable({ providedIn: 'root' })
export class Announcer {
  readonly message = signal('');

  announce(text: string) {
    // Clearing first makes the same message announce again when it repeats.
    this.message.set('');
    setTimeout(() => this.message.set(text), 50);
  }
}
