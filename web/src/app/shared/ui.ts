// Small building blocks used across pages.

import { ChangeDetectionStrategy, Component, computed, inject, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { ago } from '../core/format';
import type { Repo } from '../core/models';

/** The design system's per-card hues: pink, violet, indigo, magenta, blue. */
const HUES = [318, 262, 236, 340, 222];

/** A round initial in a gradient picked from the name, so each person keeps their colour. */
@Component({
  selector: 'cy-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span
    class="avatar"
    aria-hidden="true"
    [style.--h]="hue()"
    [style.width.px]="size()"
    [style.height.px]="size()"
    [style.font-size.px]="size() * 0.46"
    >{{ name().charAt(0) }}</span
  >`,
})
export class Avatar {
  readonly name = input.required<string>();
  readonly size = input(24);
  protected readonly hue = computed(() => {
    let h = 0;
    for (const c of this.name()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return HUES[h % HUES.length];
  });
}

/**
 * Rendered Markdown from the server. The server already sanitises it
 * (sanitize-html), and Angular's sanitizer would also strip task-list
 * checkboxes, so it is trusted here. Links within ChayYarHub use the router.
 */
@Component({
  selector: 'cy-markdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="prose" [innerHTML]="safe()" (click)="follow($event)"></div>`,
})
export class MarkdownView {
  readonly html = input.required<string>();
  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);
  protected readonly safe = computed(() => this.sanitizer.bypassSecurityTrustHtml(this.html()));

  protected follow(e: MouseEvent) {
    const a = (e.target as HTMLElement).closest('a');
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || a.target) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.pathname.includes('/raw/')) return;
    e.preventDefault();
    this.router.navigateByUrl(url.pathname + url.search + url.hash);
  }
}

/** A Markdown text box with a Write / Preview switch, like GitHub's comment box. */
@Component({
  selector: 'cy-editor',
  imports: [FormsModule, MarkdownView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card">
      <div class="card-head" style="min-height: 0; padding: 0 8px">
        <button type="button" class="tab" [class.active]="!preview()" (click)="preview.set(false)">Write</button>
        <button type="button" class="tab" [class.active]="preview()" (click)="showPreview()">Preview</button>
      </div>
      @if (preview()) {
        <div class="card-body" style="min-height: 150px">
          @if (html()) {
            <cy-markdown [html]="html()" />
          } @else {
            <span class="faint">Nothing to preview.</span>
          }
        </div>
      } @else {
        <textarea
          class="input"
          style="border: 0; border-radius: 0 0 16px 16px"
          [name]="label()"
          [(ngModel)]="text"
          [placeholder]="placeholder()"
          [attr.aria-label]="label()"
        ></textarea>
      }
    </div>
  `,
})
export class MarkdownEditor {
  readonly text = model('');
  readonly placeholder = input('Leave a comment. Markdown works.');
  readonly label = input('Comment');
  protected readonly preview = signal(false);
  protected readonly html = signal('');
  private readonly api = inject(Api);

  protected async showPreview() {
    this.preview.set(true);
    this.html.set(this.text().trim() ? (await this.api.post<{ html: string }>('/markdown', { text: this.text() })).html : '');
  }
}

/** One repository in a list: name, description, stars, last update. */
@Component({
  selector: 'cy-repo-card',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="repo-card">
      <div class="cluster">
        <h3>
          <a class="link" [routerLink]="['/', repo().owner, repo().name]">
            @if (showOwner()) {
              {{ repo().owner }} /
            }
            {{ repo().name }}
          </a>
        </h3>
        @if (repo().private) {
          <span class="pill"><i class="ph ph-lock-simple"></i>Private</span>
        }
      </div>
      @if (repo().description) {
        <p>{{ repo().description }}</p>
      }
      <div class="meta">
        <span><i class="ph ph-star"></i> {{ repo().stars }}</span>
        <span>Updated {{ ago(repo().pushed_at ?? repo().created_at) }}</span>
      </div>
    </div>
  `,
})
export class RepoCard {
  readonly repo = input.required<Repo>();
  readonly showOwner = input(true);
  protected readonly ago = ago;
}
