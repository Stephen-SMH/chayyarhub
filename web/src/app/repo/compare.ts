import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, apiUrl, errorText } from '../core/api';
import { ago, plural } from '../core/format';
import type { Comparison } from '../core/models';
import { ChangesView } from '../shared/changes';
import { Avatar, MarkdownEditor } from '../shared/ui';
import { RepoContext } from './context';

/** Pick two branches, see what would change, and open a pull request. */
@Component({
  selector: 'cy-compare',
  imports: [FormsModule, RouterLink, Avatar, MarkdownEditor, ChangesView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let m = ctx.info()!;
    <div class="page stack" style="max-width: 1040px">
      <div>
        <h2 style="font-size: 22px">Open a pull request</h2>
        <p class="soft" style="margin: 6px 0 0">Choose the branch with your changes and the branch to merge them into.</p>
      </div>
      <section class="card card-body cluster">
        <i aria-hidden="true" class="ph ph-git-pull-request faint" style="font-size: 20px"></i>
        <label class="cluster" style="gap: 8px">
          <span class="faint">base:</span>
          <select class="input mono" style="width: auto" [ngModel]="base()" (ngModelChange)="choose($event, head())">
            @for (b of m.branches; track b) {
              <option [value]="b">{{ b }}</option>
            }
          </select>
        </label>
        <i aria-hidden="true" class="ph ph-arrow-left faint"></i>
        <label class="cluster" style="gap: 8px">
          <span class="faint">compare:</span>
          <select class="input mono" style="width: auto" [ngModel]="head()" (ngModelChange)="choose(base(), $event)">
            @for (b of m.branches; track b) {
              <option [value]="b">{{ b }}</option>
            }
          </select>
        </label>
        @if (cmp.hasValue()) {
          @let c = cmp.value();
          @if (c.commits.length) {
            @if (c.mergeable) {
              <span class="state-open"><i aria-hidden="true" class="ph ph-check"></i> Able to merge.</span>
            } @else {
              <span style="color: var(--warn-ink)"><i aria-hidden="true" class="ph ph-warning"></i> Can't merge automatically: {{ c.conflicts.join(', ') }}</span>
            }
          }
        }
      </section>

      @if (m.branches.length < 2) {
        <div class="card empty"><i aria-hidden="true" class="ph ph-git-branch"></i>Push a second branch to open a pull request.</div>
      } @else if (base() === head()) {
        <div class="card empty">Choose two different branches.</div>
      } @else if (cmp.error(); as e) {
        <div class="card empty">{{ errorText(e) }}</div>
      } @else if (cmp.hasValue()) {
        @let c = cmp.value();
        @if (c.existing_pull) {
          <div class="notice">
            There's already an open pull request for these branches: <a class="link" [routerLink]="ctx.link('pull', '' + c.existing_pull)">#{{ c.existing_pull }}</a>
          </div>
        } @else if (!c.commits.length) {
          <div class="card empty"><i aria-hidden="true" class="ph ph-check-circle"></i>{{ base() }} already has everything in {{ head() }}. There isn't anything to compare.</div>
        } @else if (m.signed_in) {
          <form class="stack" (ngSubmit)="create()">
            @if (error()) {
              <div class="alert" role="alert">{{ error() }}</div>
            }
            <label class="field"><span>Title</span><input class="input" name="title" [(ngModel)]="title" required maxlength="256" /></label>
            <cy-editor [(text)]="body" label="Description" placeholder="What does this change, and why? Markdown works." />
            <div class="cluster">
              <span class="spacer"></span>
              <button class="btn btn-grad" type="submit" [disabled]="busy() || !title().trim()"><i aria-hidden="true" class="ph ph-git-pull-request"></i>Create pull request</button>
            </div>
          </form>
        } @else {
          <div class="notice"><a class="link" routerLink="/login" [queryParams]="{ next: here }">Sign in</a> to open a pull request.</div>
        }
        @if (c.commits.length) {
          <h3 class="label"><i aria-hidden="true" class="ph ph-git-commit"></i> {{ plural(c.commits.length, 'commit') }}</h3>
          <div class="card rows">
            @for (k of c.commits; track k.sha) {
              <div class="row hover" style="padding: 10px 16px">
                <cy-avatar [name]="k.author" />
                <a class="plain grow" style="font-weight: 550" [routerLink]="ctx.link('commit', k.sha)">{{ k.summary }}</a>
                <span class="faint hide-sm" style="font-size: 13px">{{ ago(k.date) }}</span>
                <a class="ref plain" [routerLink]="ctx.link('commit', k.sha)">{{ k.short }}</a>
              </div>
            }
          </div>
          <cy-changes [files]="c.files" [at]="head()" />
        }
      } @else {
        <div class="loading">Comparing…</div>
      }
    </div>
  `,
})
export class ComparePage {
  readonly baseParam = input<string>(undefined, { alias: 'base' });
  readonly headParam = input<string>(undefined, { alias: 'head' });
  protected readonly ctx = inject(RepoContext);
  protected readonly base = computed(() => this.baseParam() || this.ctx.info()?.default_branch || '');
  protected readonly head = computed(() => this.headParam() || this.ctx.info()?.branches.find((b) => b !== this.base()) || this.base());
  protected readonly cmp = httpResource<Comparison & { existing_pull: number | null }>(() =>
    this.base() && this.head() && this.base() !== this.head() ? apiUrl(this.ctx.api('/compare'), { base: this.base(), head: this.head() }) : undefined,
  );
  /** Suggested title: the only commit's summary, or the branch name made readable. */
  protected readonly title = linkedSignal(() => {
    const commits = this.cmp.hasValue() ? this.cmp.value().commits : [];
    if (commits.length === 1) return commits[0].summary;
    const name = this.head().split('/').pop() ?? '';
    return name.charAt(0).toUpperCase() + name.slice(1).replace(/[-_]+/g, ' ');
  });
  protected readonly body = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly here = location.pathname;
  protected readonly ago = ago;
  protected readonly plural = plural;
  protected readonly errorText = errorText;
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  protected choose(base: string, head: string) {
    this.router.navigate(this.ctx.link('compare'), { queryParams: { base, head }, replaceUrl: true });
  }

  protected async create() {
    this.busy.set(true);
    this.error.set(null);
    try {
      const { number } = await this.api.post<{ number: number }>(this.ctx.api('/pulls'), {
        title: this.title(),
        body: this.body(),
        base: this.base(),
        head: this.head(),
      });
      this.ctx.meta.reload();
      this.router.navigate(this.ctx.link('pull', String(number)));
    } catch (e) {
      this.error.set(errorText(e));
    } finally {
      this.busy.set(false);
    }
  }
}
