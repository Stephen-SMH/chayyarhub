import { ChangeDetectionStrategy, Component, inject, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Api, errorText } from '../core/api';
import { RepoContext } from './context';

@Component({
  selector: 'cy-settings',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let m = ctx.info()!;
    <div class="page narrow stack" style="gap: 24px">
      <h1 style="font-size: 22px">Settings</h1>
      @if (!m.is_owner) {
        <div class="card empty">Only the owner can change this repository's settings.</div>
      } @else {
        @if (error()) {
          <div class="alert" role="alert">{{ error() }}</div>
        }
        @if (saved()) {
          <div class="notice" role="status">{{ saved() }}</div>
        }
        <section class="card card-body stack">
          <h2 class="label">General</h2>
          <label class="field">
            <span>Description</span>
            <input class="input" name="description" [(ngModel)]="description" maxlength="350" />
          </label>
          <div><button type="button" class="btn btn-grad" [disabled]="busy()" (click)="save({ description: description() }, 'Description saved.')">Save</button></div>
        </section>
        <section class="card card-body stack">
          <h2 class="label">Visibility</h2>
          <p style="margin: 0">
            This repository is <strong>{{ m.repo.private ? 'private' : 'public' }}</strong>.
            {{ m.repo.private ? 'Only you can see it.' : 'Anyone can see and clone it.' }}
          </p>
          <div>
            <button type="button" class="btn" [disabled]="busy()" (click)="save({ private: !m.repo.private }, 'Visibility changed.')">
              <i [class]="m.repo.private ? 'ph ph-globe-simple' : 'ph ph-lock-simple'"></i>Make {{ m.repo.private ? 'public' : 'private' }}
            </button>
          </div>
        </section>
        <section class="card card-body stack" style="border-color: color-mix(in srgb, var(--destructive) 45%, transparent)">
          <h2 class="label" style="color: var(--bad)">Danger zone</h2>
          <p style="margin: 0">Deleting removes the repository, its history, issues and pull requests for good.</p>
          <label class="field">
            <span>To confirm, type <span class="mono">{{ m.repo.owner }}/{{ m.repo.name }}</span></span>
            <input class="input mono" name="confirm" [(ngModel)]="confirm" autocomplete="off" spellcheck="false" />
          </label>
          <div>
            <button type="button" class="btn btn-danger" [disabled]="busy() || confirm() !== m.repo.owner + '/' + m.repo.name" (click)="remove()">
              <i class="ph ph-trash"></i>Delete this repository
            </button>
          </div>
        </section>
      }
    </div>
  `,
})
export class SettingsPage {
  protected readonly ctx = inject(RepoContext);
  protected readonly description = linkedSignal(() => this.ctx.info()?.repo.description ?? '');
  protected readonly confirm = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal<string | null>(null);
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  protected async save(change: { description?: string; private?: boolean }, message: string) {
    this.busy.set(true);
    this.error.set(null);
    this.saved.set(null);
    try {
      await this.api.patch(this.ctx.api(''), change);
      this.ctx.meta.reload();
      this.saved.set(message);
    } catch (e) {
      this.error.set(errorText(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove() {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.delete(this.ctx.api(''));
      this.router.navigate(['/', this.ctx.owner()]);
    } catch (e) {
      this.error.set(errorText(e));
      this.busy.set(false);
    }
  }
}
