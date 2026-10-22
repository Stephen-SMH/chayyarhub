import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { Api, apiUrl, errorText } from '../core/api';
import { ago, plural } from '../core/format';
import type { IssueDetail } from '../core/models';
import { DiffView } from '../shared/diff';
import { Avatar, MarkdownEditor, MarkdownView } from '../shared/ui';
import { Announcer } from '../core/announcer';
import { RepoContext, issueIcon, statePill } from './context';

const EVENTS: Record<string, { icon: string; text: string }> = {
  closed: { icon: 'ph ph-check-circle state-done', text: 'closed this' },
  reopened: { icon: 'ph ph-record state-open', text: 'reopened this' },
  merged: { icon: 'ph ph-git-merge state-done', text: 'merged this' },
};

/** An issue or a pull request: the conversation, and for a pull request its commits, files and merge box. */
@Component({
  selector: 'cy-issue',
  imports: [RouterLink, Avatar, MarkdownView, MarkdownEditor, DiffView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page stack" style="max-width: 1040px">
      @if (data.hasValue()) {
        @let d = data.value();
        @let i = d.issue;
        <header class="stack" style="gap: 10px; padding-bottom: 16px; border-bottom: 1px solid var(--rule)">
          <h2 style="font-size: 28px; font-weight: 500; overflow-wrap: anywhere">{{ i.title }} <span class="faint" style="font-weight: 300">#{{ i.number }}</span></h2>
          <div class="cluster" style="gap: 8px">
            <span [class]="statePill(i)"><i aria-hidden="true" [class]="stateIcon(i)" style="color: inherit"></i>{{ stateLabel() }}</span>
            <span class="soft">
              <strong>{{ i.author }}</strong>
              @if (i.is_pull) {
                {{ i.state === 'merged' ? 'merged' : 'wants to merge' }} {{ plural(d.pull?.commits?.length ?? 0, 'commit') }} into
                <span class="ref">{{ i.base }}</span> from <span class="ref">{{ i.head }}</span>
              } @else {
                opened this {{ ago(i.created_at) }} · {{ plural(i.comments, 'comment') }}
              }
            </span>
          </div>
        </header>

        @if (i.is_pull) {
          <div class="tabs" style="margin-top: 0; border-bottom: 1px solid var(--rule)" role="tablist" aria-label="Pull request" (keydown)="moveTab($event)">
            @for (t of TABS; track t.id) {
              <button
                type="button"
                class="tab"
                role="tab"
                [id]="'tab-' + t.id"
                aria-controls="pull-panel"
                [class.active]="tab() === t.id"
                [attr.aria-selected]="tab() === t.id"
                [tabIndex]="tab() === t.id ? 0 : -1"
                (click)="tab.set(t.id)"
              >
                <i aria-hidden="true" [class]="'ph ' + t.icon"></i>{{ t.label }}
                @if (t.id === 'commits') {
                  <span class="count">{{ d.pull?.commits?.length ?? 0 }}</span>
                } @else if (t.id === 'files') {
                  <span class="count">{{ d.pull?.files?.length ?? 0 }}</span>
                }
              </button>
            }
          </div>
        }

        @if (error()) {
          <div class="alert" role="alert">{{ error() }}</div>
        }

        <div id="pull-panel" [attr.role]="i.is_pull ? 'tabpanel' : null" [attr.aria-labelledby]="i.is_pull ? 'tab-' + tab() : null">
        @if (tab() === 'commits' && d.pull) {
          <div class="card rows">
            @for (c of d.pull.commits; track c.sha) {
              <div class="row hover" style="padding: 10px 16px">
                <cy-avatar [name]="c.author" />
                <a class="plain grow" style="font-weight: 550" [routerLink]="ctx.link('commit', c.sha)">{{ c.summary }}</a>
                <span class="faint hide-sm" style="font-size: 13px">{{ c.author }} · {{ ago(c.date) }}</span>
                <a class="ref plain" [routerLink]="ctx.link('commit', c.sha)">{{ c.short }}</a>
              </div>
            } @empty {
              <div class="empty">No commits to show.</div>
            }
          </div>
        } @else if (tab() === 'files' && d.pull) {
          <cy-diff [files]="d.pull.files" />
        } @else {
          <div class="timeline">
            <div class="comment">
              <cy-avatar [name]="i.author" [size]="40" />
              <section class="card">
                <div class="card-head" style="min-height: 44px"><strong>{{ i.author }}</strong><span class="faint">opened {{ ago(i.created_at) }}</span></div>
                <div class="card-body">
                  @if (i.body) {
                    <cy-markdown [html]="d.body_html" />
                  } @else {
                    <span class="faint">No description provided.</span>
                  }
                </div>
              </section>
            </div>
            @for (c of d.comments; track c.id) {
              @if (c.kind === 'comment') {
                <div class="comment">
                  <cy-avatar [name]="c.author" [size]="40" />
                  <section class="card">
                    <div class="card-head" style="min-height: 44px"><strong>{{ c.author }}</strong><span class="faint">commented {{ ago(c.created_at) }}</span></div>
                    <div class="card-body"><cy-markdown [html]="c.html" /></div>
                  </section>
                </div>
              } @else {
                <div class="event">
                  <span class="dot"><i aria-hidden="true" [class]="event(c.kind).icon"></i></span>
                  <cy-avatar [name]="c.author" [size]="20" /><strong>{{ c.author }}</strong> {{ event(c.kind).text }} {{ ago(c.created_at) }}
                </div>
              }
            }

            @if (i.is_pull && d.pull) {
              <section class="card" style="margin-left: 52px">
                <div class="card-body cluster" style="gap: 14px; align-items: start">
                  @if (i.state === 'merged') {
                    <i aria-hidden="true" class="ph ph-git-merge state-done" style="font-size: 28px"></i>
                    <div style="flex: 1"><strong>Merged</strong><br /><span class="soft">{{ i.head }} was merged into {{ i.base }}.</span></div>
                  } @else if (i.state === 'closed') {
                    <i aria-hidden="true" class="ph ph-git-pull-request state-closed" style="font-size: 28px"></i>
                    <div style="flex: 1"><strong>Closed without merging</strong><br /><span class="soft">Reopen it to merge.</span></div>
                  } @else if (!d.pull.head_exists || !d.pull.base_exists) {
                    <i aria-hidden="true" class="ph ph-warning" style="font-size: 28px; color: var(--warn-ink)"></i>
                    <div style="flex: 1"><strong>A branch is missing</strong><br /><span class="soft">{{ d.pull.head_exists ? i.base : i.head }} no longer exists.</span></div>
                  } @else if (d.pull.mergeable === false) {
                    <i aria-hidden="true" class="ph ph-warning" style="font-size: 28px; color: var(--warn-ink)"></i>
                    <div style="flex: 1; min-width: 0">
                      <strong>This branch has conflicts that must be resolved</strong><br />
                      <span class="soft">Conflicting files: </span><span class="mono" style="font-size: 13px">{{ d.pull.conflicts.join(', ') }}</span>
                      <pre class="cmd">git fetch origin
git switch {{ i.head }}
git merge origin/{{ i.base }}
# fix the conflicts, commit, then
git push</pre>
                    </div>
                  } @else if (!d.pull.commits.length) {
                    <i aria-hidden="true" class="ph ph-check-circle state-done" style="font-size: 28px"></i>
                    <div style="flex: 1"><strong>Nothing left to merge</strong><br /><span class="soft">{{ i.base }} already has these commits.</span></div>
                  } @else {
                    <i aria-hidden="true" class="ph ph-check-circle state-open" style="font-size: 28px"></i>
                    <div style="flex: 1; min-width: 200px">
                      <strong>No conflicts with the base branch</strong><br />
                      <span class="soft">{{ d.can_merge ? 'Merging creates a merge commit on ' + i.base + '.' : 'Only the repository owner can merge.' }}</span>
                    </div>
                    @if (d.can_merge) {
                      <button type="button" class="btn btn-grad" [disabled]="busy()" (click)="merge()"><i aria-hidden="true" class="ph ph-git-merge"></i>Merge pull request</button>
                    }
                  }
                </div>
              </section>
            }

            @if (d.signed_in) {
              <div class="comment">
                <span></span>
                <div class="stack" style="gap: 10px">
                  <cy-editor [(text)]="comment" />
                  <div class="cluster">
                    <span class="spacer"></span>
                    @if (d.can_close && i.state !== 'merged') {
                      <button type="button" class="btn" [disabled]="busy()" (click)="setState(i.state === 'open' ? 'closed' : 'open')">
                        <i aria-hidden="true" [class]="i.state === 'open' ? 'ph ph-check-circle state-done' : 'ph ph-record state-open'"></i>
                        {{ i.state === 'open' ? 'Close' : 'Reopen' }} {{ i.is_pull ? 'pull request' : 'issue' }}
                      </button>
                    }
                    <button type="button" class="btn btn-grad" [disabled]="busy() || !comment().trim()" (click)="postComment()">Comment</button>
                  </div>
                </div>
              </div>
            } @else {
              <div class="notice" style="margin-left: 52px">
                <a class="link" routerLink="/login" [queryParams]="{ next: here }">Sign in</a> to join the conversation.
              </div>
            }
          </div>
        }
        </div>
      } @else if (data.error(); as e) {
        <div class="card empty"><i aria-hidden="true" class="ph ph-footprints"></i>{{ errorText(e) }}</div>
      } @else {
        <div class="loading">Loading…</div>
      }
    </div>
  `,
})
export class IssuePage {
  readonly number = input.required<string>();
  protected readonly ctx = inject(RepoContext);
  protected readonly data = httpResource<IssueDetail>(() => apiUrl(this.ctx.api(`/issues/${encodeURIComponent(this.number())}`)));
  protected readonly tab = signal<'talk' | 'commits' | 'files'>('talk');
  protected readonly comment = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly here = location.pathname;
  protected readonly stateLabel = computed(() => {
    const s = this.data.hasValue() ? this.data.value().issue.state : 'open';
    return s.charAt(0).toUpperCase() + s.slice(1);
  });
  protected readonly stateIcon = issueIcon;
  protected readonly statePill = statePill;
  protected readonly ago = ago;
  protected readonly plural = plural;
  protected readonly errorText = errorText;
  private readonly api = inject(Api);
  private readonly announcer = inject(Announcer);

  constructor() {
    const title = inject(Title);
    effect(() => {
      if (this.data.hasValue()) {
        const i = this.data.value().issue;
        title.setTitle(`${i.title} · ${i.is_pull ? 'Pull request' : 'Issue'} #${i.number} · ${this.ctx.owner()}/${this.ctx.name()}`);
      }
    });
  }

  protected readonly TABS = [
    { id: 'talk', label: 'Conversation', icon: 'ph-chat-circle' },
    { id: 'commits', label: 'Commits', icon: 'ph-git-commit' },
    { id: 'files', label: 'Files changed', icon: 'ph-file' },
  ] as const;

  /** Arrow keys, Home and End move between tabs, as in any tab list. */
  protected moveTab(e: KeyboardEvent) {
    const ids = this.TABS.map((t) => t.id);
    const at = ids.indexOf(this.tab());
    const next = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: ids.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const id = ids[(next + ids.length) % ids.length];
    this.tab.set(id);
    setTimeout(() => document.getElementById(`tab-${id}`)?.focus());
  }

  protected event(kind: string) {
    return EVENTS[kind] ?? { icon: 'ph ph-record', text: kind };
  }

  private async act(job: () => Promise<unknown>, done: string) {
    this.busy.set(true);
    this.error.set(null);
    try {
      await job();
      this.data.reload();
      this.ctx.meta.reload();
      this.announcer.announce(done);
    } catch (e) {
      this.error.set(errorText(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected postComment() {
    return this.act(async () => {
      await this.api.post(this.ctx.api(`/issues/${this.number()}/comments`), { body: this.comment() });
      this.comment.set('');
    }, 'Comment posted');
  }

  protected setState(state: 'open' | 'closed') {
    const what = this.data.hasValue() && this.data.value().issue.is_pull ? 'Pull request' : 'Issue';
    return this.act(() => this.api.post(this.ctx.api(`/issues/${this.number()}/state`), { state }), `${what} ${state === 'open' ? 'reopened' : 'closed'}`);
  }

  protected merge() {
    return this.act(() => this.api.post(this.ctx.api(`/pulls/${this.number()}/merge`)), 'Pull request merged');
  }
}
