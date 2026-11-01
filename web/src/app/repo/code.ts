import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiUrl, errorText } from '../core/api';
import { ago, copyText, day, plural, size, splitRefPath } from '../core/format';
import type { Contents, Entry } from '../core/models';
import { Avatar, MarkdownView } from '../shared/ui';
import { Announcer } from '../core/announcer';
import { I18n } from '../core/i18n';
import { highlighter, highlightLines } from '../shared/diff-model';
import { RepoContext } from './context';

/** The file browser: folders, files and READMEs, at any branch, tag or commit. */
@Component({
  selector: 'cy-code',
  imports: [RouterLink, Avatar, MarkdownView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let m = ctx.info()!;
    @if (!m.default_branch) {
      <div class="page narrow stack">
        <section class="card">
          <div class="card-head"><strong>Quick setup</strong><span class="faint">This repository is empty.</span></div>
          <div class="card-body stack">
            <div class="copy-row" style="margin: 0">
              <input class="input" readonly [value]="m.clone_url" aria-label="Clone URL" />
              <button type="button" class="btn icon-btn" (click)="copy(m.clone_url, 'Clone URL copied')" [title]="copied() ? 'Copied' : 'Copy URL'" aria-label="Copy clone URL">
                <i aria-hidden="true" class="ph" [class.ph-copy]="!copied()" [class.ph-check]="copied()"></i>
              </button>
            </div>
            @if (m.is_owner) {
              <div>
                <h2 style="font-size: 15px">Push an existing repository from the command line</h2>
                <pre class="cmd">git remote add origin {{ m.clone_url }}
git branch -M main
git push -u origin main</pre>
              </div>
              <div>
                <h2 style="font-size: 15px">Or start a new one</h2>
                <pre class="cmd">echo "# {{ m.repo.name }}" >> README.md
git init
git add README.md
git commit -m "First commit"
git branch -M main
git remote add origin {{ m.clone_url }}
git push -u origin main</pre>
              </div>
              <p class="soft" style="margin: 0">When you push, git asks for your ChayYarHub username and password.</p>
            } @else {
              <p class="soft" style="margin: 0">Nothing has been pushed yet.</p>
            }
          </div>
        </section>
      </div>
    } @else {
      @let a = at()!;
      <div class="page" [class.split]="isRoot()">
        <div class="stack" style="min-width: 0">
          <div class="cluster">
            <details class="dropdown">
              <summary class="btn" title="Switch branch"><i aria-hidden="true" class="ph ph-git-branch"></i><span class="mono" style="font-size: 13.5px">{{ shortRef(a.ref) }}</span><i aria-hidden="true" class="ph ph-caret-down"></i></summary>
              <div class="menu">
                <div class="menu-title label">Switch branch</div>
                @for (b of m.branches; track b) {
                  <a [routerLink]="ctx.link(file() ? 'blob' : 'tree', b, a.path)" [class.sel]="b === a.ref">
                    <i aria-hidden="true" class="ph" [class.ph-check]="b === a.ref"></i><span class="mono">{{ b }}</span>
                    @if (b === m.default_branch) {
                      <span class="pill" style="margin-left: auto">default</span>
                    }
                  </a>
                }
              </div>
            </details>
            @if (a.path) {
              <nav class="crumbs" aria-label="Path">
                <a [routerLink]="ctx.link('tree', a.ref)">{{ m.repo.name }}</a>
                @for (c of crumbs(); track c.path) {
                  <span class="sep">/</span>
                  @if ($last) {
                    <strong>{{ c.name }}</strong>
                  } @else {
                    <a [routerLink]="ctx.link('tree', a.ref, c.path)">{{ c.name }}</a>
                  }
                }
              </nav>
            }
            <span class="spacer"></span>
            @if (isRoot()) {
              <a class="btn hide-sm" [routerLink]="ctx.link('branches')"><i aria-hidden="true" class="ph ph-git-branch"></i>{{ m.branches.length }} {{ m.branches.length === 1 ? 'branch' : 'branches' }}</a>
            }
            <details class="dropdown">
              <summary class="btn btn-grad"><i aria-hidden="true" class="ph ph-code"></i>Code<i aria-hidden="true" class="ph ph-caret-down"></i></summary>
              <div class="menu right clone">
                <div class="label">Clone with HTTP</div>
                <div class="copy-row">
                  <input class="input" readonly [value]="m.clone_url" aria-label="Clone URL" />
                  <button type="button" class="btn icon-btn" (click)="copy(m.clone_url, 'Clone URL copied')" [title]="copied() ? 'Copied' : 'Copy URL'" aria-label="Copy clone URL">
                    <i aria-hidden="true" class="ph" [class.ph-copy]="!copied()" [class.ph-check]="copied()"></i>
                  </button>
                </div>
                <pre class="cmd">git clone {{ m.clone_url }}</pre>
                <p class="faint" style="font-size: 13px; margin: 8px 0 0">Pushing (or cloning a private repository) asks for your ChayYarHub username and password.</p>
              </div>
            </details>
          </div>

          @if (contents.error(); as e) {
            <div class="card empty"><i aria-hidden="true" class="ph ph-footprints"></i>{{ errorText(e) }}</div>
          } @else if (dir(); as d) {
            <section class="card">
              @if (d.last_commit; as c) {
                <div class="card-head commit-bar">
                  <cy-avatar [name]="c.author" />
                  <strong>{{ c.author }}</strong>
                  <a class="msg plain soft" [routerLink]="ctx.link('commit', c.sha)" [title]="c.summary">{{ c.summary }}</a>
                  <a class="sha plain hide-sm" [routerLink]="ctx.link('commit', c.sha)">{{ c.short }}</a>
                  <span class="faint hide-sm">{{ ago(c.date) }}</span>
                  <a class="btn" style="min-height: 36px; padding: 0 12px" [routerLink]="ctx.link('commits', d.ref)" [queryParams]="d.path ? { path: d.path } : {}" aria-label="Commit history">
                    <i aria-hidden="true" class="ph ph-clock-counter-clockwise"></i><span class="hide-sm">History</span>
                  </a>
                </div>
              }
              <div class="rows">
                @if (d.path) {
                  <a class="row entry" [routerLink]="ctx.link('tree', d.ref, parent(d.path))" aria-label="Up one folder"><i aria-hidden="true" class="ph ph-folder-simple dir"></i>..</a>
                }
                @for (e of d.entries; track e.path) {
                  @if (e.kind === 'submodule') {
                    <div class="row entry"><i aria-hidden="true" class="ph ph-folder-simple-dashed"></i><span class="grow">{{ e.name }}</span><span class="faint">submodule</span></div>
                  } @else {
                    <a class="row entry" [routerLink]="ctx.link(e.kind === 'dir' ? 'tree' : 'blob', d.ref, e.path)">
                      <i aria-hidden="true" [class]="icon(e)"></i>
                      <span class="grow"><span class="sr-only">{{ e.kind === 'dir' ? 'Folder' : 'File' }}: </span>{{ e.name }}</span>
                      @if (e.kind === 'file') {
                        <span class="faint mono hide-sm" style="font-size: 12.5px">{{ size(e.size) }}</span>
                      }
                    </a>
                  }
                }
              </div>
            </section>
            @if (d.readme; as r) {
              <section class="card">
                <div class="card-head"><i aria-hidden="true" class="ph ph-book-open"></i><strong>{{ r.name }}</strong></div>
                <div class="card-body" style="padding: 24px clamp(18px, 3vw, 36px)"><cy-markdown [html]="r.html" /></div>
              </section>
            }
          } @else if (file(); as f) {
            <section class="card">
              <div class="card-head">
                <span class="mono soft" style="font-size: 13px">
                  @if (f.text !== null) {
                    {{ plural(lines().length, 'line') }} ·
                  }
                  {{ size(f.size) }}
                </span>
                <span class="spacer"></span>
                @if (f.html !== null) {
                  <div class="segmented" role="group" aria-label="Show this file as">
                    <button type="button" [attr.aria-pressed]="!showSource()" (click)="showSource.set(false)">Preview</button>
                    <button type="button" [attr.aria-pressed]="showSource()" (click)="showSource.set(true)">Code</button>
                  </div>
                }
                @if (f.text !== null) {
                  <a class="btn" style="min-height: 36px" [routerLink]="ctx.link('travel', f.ref, f.path)" [title]="i18n.t('timeTravelHelp')"><i aria-hidden="true" class="ph ph-clock-counter-clockwise"></i><span class="hide-sm">{{ i18n.t('timeTravel') }}</span></a>
                }
                <a class="btn" style="min-height: 36px" [href]="ctx.rawUrl(f.ref, f.path)" target="_blank" rel="noopener">Raw</a>
                @if (f.text !== null) {
                  <button type="button" class="btn icon-btn" style="min-height: 36px; width: 36px" (click)="copy(f.text, 'File contents copied')" title="Copy file contents" aria-label="Copy file contents">
                    <i aria-hidden="true" class="ph" [class.ph-copy]="!copied()" [class.ph-check]="copied()"></i>
                  </button>
                }
              </div>
              @if (isImage()) {
                <div class="card-body" style="text-align: center"><img [src]="ctx.rawUrl(f.ref, f.path)" [alt]="f.path" style="max-width: 100%" /></div>
              } @else if (f.too_large) {
                <div class="empty">This file is too big to show here. <a class="link" [href]="ctx.rawUrl(f.ref, f.path)">View it raw</a></div>
              } @else if (f.binary) {
                <div class="empty">This is a binary file. <a class="link" [href]="ctx.rawUrl(f.ref, f.path)">Download it</a></div>
              } @else if (f.html !== null && !showSource()) {
                <div class="card-body" style="padding: 24px clamp(18px, 3vw, 36px)"><cy-markdown [html]="f.html" /></div>
              } @else {
                <div class="code">
                  <table>
                    <tbody>
                      @for (l of lines(); track $index) {
                        <tr>
                          <td class="ln">{{ $index + 1 }}</td>
                          <td class="src" [innerHTML]="coloured()[$index]"></td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </section>
          } @else {
            <div class="loading">Loading…</div>
          }
        </div>

        @if (isRoot()) {
          <aside class="card card-body stack" style="gap: 12px">
            <h2 class="label">About</h2>
            <p style="margin: 0">{{ m.repo.description || 'No description yet.' }}</p>
            <div class="meta" style="flex-direction: column; align-items: start; gap: 10px; margin: 0">
              <span><i aria-hidden="true" class="ph ph-star"></i> {{ plural(m.repo.stars, 'star') }}</span>
              <a class="plain" [routerLink]="ctx.link('branches')"><i aria-hidden="true" class="ph ph-git-branch"></i> {{ m.branches.length }} {{ m.branches.length === 1 ? 'branch' : 'branches' }}</a>
              <a class="plain" [routerLink]="ctx.link('commits', a.ref)"><i aria-hidden="true" class="ph ph-clock-counter-clockwise"></i> Commit history</a>
              <span><i aria-hidden="true" class="ph ph-footprints"></i> Created {{ day(m.repo.created_at) }}</span>
            </div>
          </aside>
        }
      </div>
    }
  `,
})
export class CodePage {
  /** `<ref>/<path>` from a /tree/… or /blob/… URL; empty on the repository's front page. */
  readonly rest = input<string>();
  protected readonly ctx = inject(RepoContext);
  private readonly announcer = inject(Announcer);

  protected readonly at = computed(() => {
    const m = this.ctx.info();
    if (!m?.default_branch) return null;
    const rest = this.rest();
    return rest ? splitRefPath(rest, m.branches) : { ref: m.default_branch, path: '' };
  });
  protected readonly contents = httpResource<Contents>(() => {
    const a = this.at();
    return a ? apiUrl(this.ctx.api('/contents'), { ref: a.ref, path: a.path }) : undefined;
  });
  private readonly data = computed(() => (this.contents.hasValue() ? this.contents.value() : undefined));
  protected readonly dir = computed(() => {
    const d = this.data();
    return d?.type === 'dir' ? d : undefined;
  });
  protected readonly file = computed(() => {
    const d = this.data();
    return d?.type === 'file' ? d : undefined;
  });
  protected readonly isRoot = computed(() => !this.at()?.path && !!this.dir());
  protected readonly crumbs = computed(() => {
    const parts = (this.at()?.path ?? '').split('/').filter(Boolean);
    return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join('/') }));
  });
  protected readonly lines = computed(() => {
    const f = this.file();
    return f?.text != null ? f.text.replace(/\n$/, '').split('\n') : [];
  });
  private readonly hl = signal<Awaited<ReturnType<typeof highlighter>> | null>(null);
  /** The file's lines as HTML, coloured once highlight.js has loaded. */
  protected readonly coloured = computed(() => highlightLines(this.hl(), this.lines(), this.file()?.path ?? ''));
  protected readonly i18n = inject(I18n);
  protected readonly isImage = computed(() => /\.(png|jpe?g|gif|webp|svg|ico)$/i.test(this.file()?.path ?? ''));
  protected readonly showSource = signal(false);
  protected readonly copied = signal(false);
  protected readonly ago = ago;
  protected readonly day = day;
  protected readonly size = size;
  protected readonly plural = plural;
  protected readonly errorText = errorText;

  constructor() {
    highlighter().then((h) => this.hl.set(h));
  }

  protected icon(e: Entry): string {
    if (e.kind === 'dir') return 'ph ph-folder-simple dir';
    if (e.kind === 'symlink') return 'ph ph-link';
    return /\.(md|markdown|txt)$/i.test(e.name) ? 'ph ph-file-text' : 'ph ph-file';
  }

  protected parent(path: string): string {
    return path.slice(0, Math.max(0, path.lastIndexOf('/')));
  }

  /** A SHA is long; show it like git does. */
  protected shortRef(ref: string): string {
    return /^[0-9a-f]{40}$/.test(ref) ? ref.slice(0, 7) : ref;
  }

  protected async copy(text: string, done: string) {
    await copyText(text);
    this.copied.set(true);
    this.announcer.announce(done);
    setTimeout(() => this.copied.set(false), 1500);
  }
}
