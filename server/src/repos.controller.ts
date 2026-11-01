import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { rmSync, existsSync } from 'node:fs';
import { repoNameProblem } from './auth.js';
import { analyze, summarize } from './changes.js';
import { Config } from './config.js';
import { DbService, isUniqueViolation, publicRepo, type User } from './db.service.js';
import { NewRepoDto, RepoSettingsDto } from './dto.js';
import * as git from './git.js';
import { Access, encodePath, escapeHtml, requireUser, Viewer, type RepoCtx } from './http.js';
import { render, type Links } from './markdown.js';

/** Files this big are offered as raw downloads instead of shown. */
const MAX_SHOWN = 1_000_000;
const COMMITS_PER_PAGE = 30;

const isMarkdown = (name: string) => /\.(md|markdown)$/i.test(name);
const isReadme = (name: string) => /^readme(\.md|\.markdown|\.txt)?$/i.test(name);
const parentDir = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')));

/** The commit identity of a user, for merges and new READMEs. */
export const signature = (user: User): git.Signature => ({ name: user.username, email: `${user.username}@users.noreply.chayyarhub` });

/** Where relative links in Markdown inside folder `dir` of the repository at `rev` point. */
export function repoLinks(ctx: RepoCtx, rev: string, dir: string): Links {
  const base = `/${ctx.repo.owner}/${ctx.repo.name}`;
  const at = encodePath(dir ? `${rev}/${dir}/` : `${rev}/`);
  return { blob: `${base}/blob/${at}`, raw: `${base}/raw/${at}` };
}

export function cleanPath(p: string | undefined): string {
  const path = (p ?? '').replace(/^\/+|\/+$/g, '');
  if (path.includes('\0') || path.split('/').some((seg) => seg === '.' || seg === '..')) throw new BadRequestException('Bad path.');
  return path;
}

/** The branch, tag or commit asked for (the default branch if none), and its SHA. */
export async function pickRev(ctx: RepoCtx, rev: string | undefined): Promise<{ rev: string; sha: string }> {
  const name = rev || (await git.defaultBranch(ctx.dir));
  if (!name) throw new NotFoundException('This repository is empty.');
  const sha = await git.resolve(ctx.dir, name);
  if (!sha) throw new NotFoundException(`There's no branch, tag or commit called '${name}'.`);
  return { rev: name, sha };
}

@Controller('api')
export class ReposController {
  constructor(
    private readonly db: DbService,
    private readonly config: Config,
    private readonly access: Access,
  ) {}

  @Post('repos')
  async create(@Body() b: NewRepoDto, @Viewer() viewer?: User) {
    const user = requireUser(viewer);
    const name = b.name.trim();
    const description = (b.description ?? '').trim();
    const problem = repoNameProblem(name);
    if (problem) throw new BadRequestException(problem);
    let id: number;
    try {
      id = this.db.createRepo(user.id, name, description, !!b.private);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`You already have a repository called ${name}.`);
      throw e;
    }
    const dir = this.config.repoDir(id);
    try {
      if (existsSync(dir)) throw new git.GitError(`${dir} already exists on disk.`);
      await git.initBare(dir);
      if (b.readme) {
        await git.initWithReadme(dir, description ? `# ${name}\n\n${description}\n` : `# ${name}\n`, signature(user));
        this.db.touchPushed(id);
      }
    } catch (e) {
      this.db.deleteRepo(id);
      rmSync(dir, { recursive: true, force: true });
      throw e;
    }
    return { owner: user.username, name };
  }

  @Get('repos/:owner/:repo')
  async repo(@Param('owner') owner: string, @Param('repo') name: string, @Req() req: Request, @Viewer() viewer?: User) {
    const ctx = this.access.repo(viewer, owner, name);
    return {
      repo: publicRepo(ctx.repo),
      clone_url: `${this.access.baseUrl(req)}/${ctx.repo.owner}/${ctx.repo.name}.git`,
      default_branch: await git.defaultBranch(ctx.dir),
      branches: await git.branchNames(ctx.dir),
      starred: viewer ? this.db.starred(viewer.id, ctx.repo.id) : false,
      is_owner: ctx.isOwner,
      signed_in: !!viewer,
      open_issues: this.db.issueCounts(ctx.repo.id, false).open,
      open_pulls: this.db.issueCounts(ctx.repo.id, true).open,
    };
  }

  @Patch('repos/:owner/:repo')
  update(@Param('owner') owner: string, @Param('repo') name: string, @Body() b: RepoSettingsDto, @Viewer() viewer?: User) {
    const ctx = this.access.repo(viewer, owner, name);
    if (!ctx.isOwner) throw new ForbiddenException('Only the owner can change settings.');
    const description = b.description?.trim() ?? ctx.repo.description;
    const isPrivate = b.private ?? ctx.repo.private;
    this.db.updateRepo(ctx.repo.id, description, isPrivate);
    return { description, private: isPrivate };
  }

  @Delete('repos/:owner/:repo')
  remove(@Param('owner') owner: string, @Param('repo') name: string, @Viewer() viewer?: User) {
    const ctx = this.access.repo(viewer, owner, name);
    if (!ctx.isOwner) throw new ForbiddenException('Only the owner can delete a repository.');
    this.db.deleteRepo(ctx.repo.id);
    rmSync(ctx.dir, { recursive: true, force: true });
    return { ok: true };
  }

  private star(owner: string, name: string, viewer: User | undefined, on: boolean) {
    const ctx = this.access.repo(viewer, owner, name);
    this.db.setStar(requireUser(viewer).id, ctx.repo.id, on);
    return { starred: on, stars: this.db.findRepo(owner, name)?.stars ?? 0 };
  }

  @Put('repos/:owner/:repo/star')
  addStar(@Param('owner') owner: string, @Param('repo') name: string, @Viewer() viewer?: User) {
    return this.star(owner, name, viewer, true);
  }

  @Delete('repos/:owner/:repo/star')
  removeStar(@Param('owner') owner: string, @Param('repo') name: string, @Viewer() viewer?: User) {
    return this.star(owner, name, viewer, false);
  }

  @Get('repos/:owner/:repo/contents')
  async contents(
    @Param('owner') owner: string,
    @Param('repo') name: string,
    @Query('ref') ref?: string,
    @Query('path') rawPath?: string,
    @Viewer() viewer?: User,
  ) {
    const ctx = this.access.repo(viewer, owner, name);
    const { rev, sha } = await pickRev(ctx, ref);
    const path = cleanPath(rawPath);
    const [lastCommit = null] = await git.log(ctx.dir, sha, path || null, 0, 1);
    const kind = await git.objectKind(ctx.dir, sha, path);
    if (kind === 'tree') {
      const entries = await git.tree(ctx.dir, sha, path);
      const readmeEntry = entries.find((e) => e.kind === 'file' && isReadme(e.name));
      let readme = null;
      if (readmeEntry) {
        const text = (await git.blob(ctx.dir, sha, readmeEntry.path)).toString('utf8');
        const html = isMarkdown(readmeEntry.name) ? render(text, repoLinks(ctx, rev, path)) : `<pre>${escapeHtml(text)}</pre>`;
        readme = { name: readmeEntry.name, path: readmeEntry.path, html };
      }
      return { type: 'dir', ref: rev, sha, path, entries, readme, last_commit: lastCommit };
    }
    if (kind === 'blob') {
      const size = await git.blobSize(ctx.dir, sha, path);
      let text: string | null = null;
      let html: string | null = null;
      let binary = false;
      if (size <= MAX_SHOWN) {
        const bytes = await git.blob(ctx.dir, sha, path);
        binary = bytes.subarray(0, 8000).includes(0);
        if (!binary) {
          text = bytes.toString('utf8');
          if (isMarkdown(path)) html = render(text, repoLinks(ctx, rev, parentDir(path)));
        }
      }
      return { type: 'file', ref: rev, sha, path, size, binary, too_large: size > MAX_SHOWN, text, html, last_commit: lastCommit };
    }
    throw new NotFoundException(`'${path}' doesn't exist at ${rev}.`);
  }

  @Get('repos/:owner/:repo/commits')
  async commits(
    @Param('owner') owner: string,
    @Param('repo') name: string,
    @Query('ref') ref?: string,
    @Query('path') rawPath?: string,
    @Query('page') page?: string,
    @Viewer() viewer?: User,
  ) {
    const ctx = this.access.repo(viewer, owner, name);
    const { rev, sha } = await pickRev(ctx, ref);
    const skip = Math.max(0, Number(page) || 0) * COMMITS_PER_PAGE;
    const list = await git.logWithStats(ctx.dir, sha, cleanPath(rawPath) || null, skip, COMMITS_PER_PAGE + 1);
    // Each snapshot carries totals per group instead of its file list.
    const commits = list.slice(0, COMMITS_PER_PAGE).map(({ files, ...c }) => ({ ...c, stats: summarize(files) }));
    return { ref: rev, commits, has_more: list.length > COMMITS_PER_PAGE };
  }

  @Get('repos/:owner/:repo/commits/:sha')
  async commit(@Param('owner') owner: string, @Param('repo') name: string, @Param('sha') rev: string, @Viewer() viewer?: User) {
    const ctx = this.access.repo(viewer, owner, name);
    const sha = await git.resolve(ctx.dir, rev);
    if (!sha) throw new NotFoundException('No such commit.');
    const commit = await git.commit(ctx.dir, sha);
    const files = await analyze(ctx.dir, await git.commitDiff(ctx.dir, sha), commit.parents[0] ?? git.EMPTY_TREE, sha);
    return { commit, files };
  }

  @Get('repos/:owner/:repo/branches')
  async branches(@Param('owner') owner: string, @Param('repo') name: string, @Viewer() viewer?: User) {
    const ctx = this.access.repo(viewer, owner, name);
    const defaultBranch = await git.defaultBranch(ctx.dir);
    const rows = [];
    for (const branch of await git.branches(ctx.dir)) {
      const isDefault = branch.name === defaultBranch;
      const [ahead, behind] = defaultBranch && !isDefault ? await git.aheadBehind(ctx.dir, defaultBranch, branch.name) : [0, 0];
      const pull = defaultBranch && !isDefault ? this.db.openPullFor(ctx.repo.id, branch.name, defaultBranch) : null;
      rows.push({ branch, is_default: isDefault, ahead, behind, pull });
    }
    return { default_branch: defaultBranch, branches: rows };
  }

  @Get('repos/:owner/:repo/compare')
  async compare(
    @Param('owner') owner: string,
    @Param('repo') name: string,
    @Query('base') base: string,
    @Query('head') head: string,
    @Viewer() viewer?: User,
  ) {
    const ctx = this.access.repo(viewer, owner, name);
    const result = await compareShas(ctx, await branchSha(ctx, base), await branchSha(ctx, head), true);
    return { ...result, base, head, existing_pull: this.db.openPullFor(ctx.repo.id, head, base) };
  }
}

export async function branchSha(ctx: RepoCtx, name: string | undefined): Promise<string> {
  const sha = name ? await git.resolveBranch(ctx.dir, name) : null;
  if (!sha) throw new NotFoundException(`There's no branch called '${name ?? ''}'.`);
  return sha;
}

/** Commits, changed files and (optionally) mergeability of `head` against `base`. */
export async function compareShas(ctx: RepoCtx, base: string, head: string, checkMerge: boolean) {
  const commits = await git.commitsBetween(ctx.dir, base, head);
  const files = commits.length ? await analyze(ctx.dir, await git.rangeDiff(ctx.dir, base, head), await git.mergeBase(ctx.dir, base, head), head) : [];
  let mergeable: boolean | null = null;
  let conflicts: string[] = [];
  if (checkMerge && commits.length) {
    const merged = await git.mergeTree(ctx.dir, base, head);
    mergeable = 'tree' in merged;
    conflicts = 'conflicts' in merged ? merged.conflicts : [];
  }
  return { commits, files, mergeable, conflicts };
}
