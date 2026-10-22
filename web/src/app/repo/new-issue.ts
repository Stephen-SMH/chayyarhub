import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, errorText } from '../core/api';
import { MarkdownEditor } from '../shared/ui';
import { RepoContext } from './context';

@Component({
  selector: 'cy-new-issue',
  imports: [FormsModule, RouterLink, MarkdownEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page narrow">
      @if (ctx.info()?.signed_in) {
        <form class="stack" (ngSubmit)="create()">
          <h2 style="font-size: 22px">New issue</h2>
          @if (error()) {
            <div class="alert" role="alert">{{ error() }}</div>
          }
          <label class="field"><span>Title</span><input class="input" name="title" [(ngModel)]="title" required maxlength="256" /></label>
          <cy-editor [(text)]="body" label="Description" placeholder="What happened, or what should change? Markdown works." />
          <div class="cluster">
            <span class="spacer"></span>
            <a class="btn" [routerLink]="ctx.link('issues')">Cancel</a>
            <button class="btn btn-grad" type="submit" [disabled]="busy() || !title().trim()">Open issue</button>
          </div>
        </form>
      } @else {
        <div class="empty">
          <i aria-hidden="true" class="ph ph-lock-simple"></i>
          <a class="link" routerLink="/login" [queryParams]="{ next: here }">Sign in</a> to open an issue.
        </div>
      }
    </div>
  `,
})
export class NewIssuePage {
  protected readonly ctx = inject(RepoContext);
  protected readonly title = signal('');
  protected readonly body = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly here = location.pathname;
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  protected async create() {
    this.busy.set(true);
    this.error.set(null);
    try {
      const { number } = await this.api.post<{ number: number }>(this.ctx.api('/issues'), { title: this.title(), body: this.body() });
      this.ctx.meta.reload();
      this.router.navigate(this.ctx.link('issues', String(number)));
    } catch (e) {
      this.error.set(errorText(e));
    } finally {
      this.busy.set(false);
    }
  }
}
