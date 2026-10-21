import { httpResource } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { segs } from '../core/format';
import type { Issue, RepoMeta } from '../core/models';

const enc = encodeURIComponent;
const encPath = (p: string) => p.split('/').map(enc).join('/');

/**
 * The repository a page is showing, shared by the repository shell and its
 * pages. Provided by RepoShell, so it reads that route's :owner/:repo.
 */
@Injectable()
export class RepoContext {
  private readonly params = toSignal(inject(ActivatedRoute).paramMap, { requireSync: true });
  readonly owner = computed(() => this.params().get('owner') ?? '');
  readonly name = computed(() => this.params().get('repo') ?? '');
  readonly meta = httpResource<RepoMeta>(() => (this.owner() && this.name() ? `/api${this.api('')}` : undefined));
  /** The loaded metadata; undefined while loading or after an error. */
  readonly info = computed(() => (this.meta.hasValue() ? this.meta.value() : undefined));
  readonly base = computed(() => ['/', this.owner(), this.name()]);

  /** Router link to a page of this repository, e.g. link('tree', 'feature/x', 'src'). */
  link(...parts: (string | null | undefined)[]): string[] {
    return [...this.base(), ...segs(...parts)];
  }

  /** API path for this repository, without the /api prefix. */
  api(path: string): string {
    return `/repos/${enc(this.owner())}/${enc(this.name())}${path}`;
  }

  /** The server's raw-file URL (not an Angular page). */
  rawUrl(ref: string, path: string): string {
    return `/${enc(this.owner())}/${enc(this.name())}/raw/${encPath(ref)}/${encPath(path)}`;
  }
}

/** Icon and colour for an issue or pull request in a given state. */
export function issueIcon(issue: Pick<Issue, 'is_pull' | 'state'>): string {
  if (!issue.is_pull) return issue.state === 'open' ? 'ph ph-record state-open' : 'ph ph-check-circle state-done';
  if (issue.state === 'merged') return 'ph ph-git-merge state-done';
  return issue.state === 'open' ? 'ph ph-git-pull-request state-open' : 'ph ph-git-pull-request state-closed';
}

export function statePill(issue: Pick<Issue, 'is_pull' | 'state'>): string {
  if (issue.state === 'open') return 'pill pill-lg pill-open';
  return issue.state === 'merged' || !issue.is_pull ? 'pill pill-lg pill-done' : 'pill pill-lg pill-closed';
}
