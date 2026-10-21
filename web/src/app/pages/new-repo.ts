import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, errorText } from '../core/api';
import { Session } from '../core/session';
import { Avatar } from '../shared/ui';

@Component({
  selector: 'cy-new-repo',
  imports: [FormsModule, RouterLink, Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page narrow">
      @if (session.user(); as user) {
        <form class="stack" (ngSubmit)="create()">
          <div>
            <h1 style="font-size: 26px">Create a new repository</h1>
            <p class="soft" style="margin: 6px 0 0">A repository holds a project's files and every version of them.</p>
          </div>
          @if (error()) {
            <div class="alert" role="alert">{{ error() }}</div>
          }
          <div class="cluster" style="align-items: end">
            <div class="field">
              <span>Owner</span>
              <div class="input cluster" style="width: auto; gap: 8px"><cy-avatar [name]="user.username" />{{ user.username }}</div>
            </div>
            <span style="font-size: 22px; padding-bottom: 8px" class="faint">/</span>
            <label class="field" style="flex: 1; min-width: 220px">
              <span>Repository name</span>
              <input class="input" name="name" [(ngModel)]="name" required autocomplete="off" spellcheck="false" placeholder="weather-app" />
            </label>
          </div>
          <label class="field">
            <span>Description <span class="faint">(optional)</span></span>
            <input class="input" name="description" [(ngModel)]="description" maxlength="350" />
          </label>
          <fieldset class="stack" style="border: 0; padding: 0; margin: 0; gap: 10px">
            <legend class="label" style="margin-bottom: 10px">Visibility</legend>
            <label class="choice">
              <input type="radio" name="visibility" [value]="false" [(ngModel)]="isPrivate" />
              <i class="ph ph-globe-simple"></i>
              <span><strong>Public</strong><br /><span class="soft">Anyone can see and clone it. Only you can push.</span></span>
            </label>
            <label class="choice">
              <input type="radio" name="visibility" [value]="true" [(ngModel)]="isPrivate" />
              <i class="ph ph-lock-simple"></i>
              <span><strong>Private</strong><br /><span class="soft">Only you can see it.</span></span>
            </label>
          </fieldset>
          <label class="choice">
            <input type="checkbox" name="readme" [(ngModel)]="readme" />
            <span><strong>Add a README file</strong><br /><span class="soft">Starts the repository with one commit, so you can clone it right away.</span></span>
          </label>
          <div><button class="btn btn-grad" type="submit" [disabled]="busy() || !name().trim()">Create repository</button></div>
        </form>
      } @else {
        <div class="empty">
          <i class="ph ph-lock-simple"></i>
          <a class="link" routerLink="/login" [queryParams]="{ next: '/new' }">Sign in</a> to create a repository.
        </div>
      }
    </div>
  `,
})
export class NewRepoPage {
  protected readonly session = inject(Session);
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly isPrivate = signal(false);
  protected readonly readme = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  protected async create() {
    this.busy.set(true);
    this.error.set(null);
    try {
      const r = await this.api.post<{ owner: string; name: string }>('/repos', {
        name: this.name().trim(),
        description: this.description(),
        private: this.isPrivate(),
        readme: this.readme(),
      });
      this.router.navigate(['/', r.owner, r.name]);
    } catch (e) {
      this.error.set(errorText(e));
    } finally {
      this.busy.set(false);
    }
  }
}
