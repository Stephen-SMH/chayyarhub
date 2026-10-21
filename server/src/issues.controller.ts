import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { DbService, publicIssue, type Issue, type User } from './db.service.js';
import { CommentDto, NewIssueDto, StateDto } from './dto.js';
import * as git from './git.js';
import { Access, requireUser, Viewer, type RepoCtx } from './http.js';
import { render } from './markdown.js';
import { branchSha, compareShas, signature } from './repos.controller.js';

function checkTitle(title: string): string {
  const t = title.trim();
  if (!t || t.length > 256) throw new BadRequestException('A title is required (up to 256 characters).');
  return t;
}

/** Issues and pull requests (a pull request is an issue with two branches). */
@Controller('api/repos/:owner/:repo')
export class IssuesController {
  constructor(
    private readonly db: DbService,
    private readonly access: Access,
  ) {}

  private find(ctx: RepoCtx, number: number): Issue {
    const issue = this.db.getIssue(ctx.repo.id, number);
    if (!issue) throw new NotFoundException(`There's no issue or pull request #${number}.`);
    return issue;
  }

  @Get('issues')
  list(@Param('owner') owner: string, @Param('repo') name: string, @Query('state') state?: string, @Query('pulls') pulls?: string, @Viewer() viewer?: User) {
    const ctx = this.access.repo(viewer, owner, name);
    const isPulls = pulls === 'true';
    return {
      ...this.db.issueCounts(ctx.repo.id, isPulls),
      issues: this.db.listIssues(ctx.repo.id, isPulls, state !== 'closed').map(publicIssue),
    };
  }

  @Post('issues')
  create(@Param('owner') owner: string, @Param('repo') name: string, @Body() b: NewIssueDto, @Viewer() viewer?: User) {
    const ctx = this.access.repo(viewer, owner, name);
    const user = requireUser(viewer);
    return { number: this.db.createIssue(ctx.repo.id, user.id, checkTitle(b.title), (b.body ?? '').trim()) };
  }

  @Post('pulls')
  async createPull(@Param('owner') owner: string, @Param('repo') name: string, @Body() b: NewIssueDto, @Viewer() viewer?: User) {
    const ctx = this.access.repo(viewer, owner, name);
    const user = requireUser(viewer);
    const title = checkTitle(b.title);
    const { base, head } = b;
    if (!base || !head) throw new BadRequestException('Choose a base and a compare branch.');
    if (base === head) throw new BadRequestException('Choose two different branches.');
    if (!(await git.commitsBetween(ctx.dir, await branchSha(ctx, base), await branchSha(ctx, head))).length) {
      throw new BadRequestException(`${head} has no commits that ${base} doesn't already have.`);
    }
    const existing = this.db.openPullFor(ctx.repo.id, head, base);
    if (existing) throw new ConflictException(`Pull request #${existing} is already open for ${head} into ${base}.`);
    return { number: this.db.createIssue(ctx.repo.id, user.id, title, (b.body ?? '').trim(), { head, base }) };
  }

  /**
   * What a pull request contains. A merged one is read from its merge commit,
   * because its branches may have moved on or been deleted since.
   */
  private async pullInfo(ctx: RepoCtx, issue: Issue) {
    const head = issue.head ? await git.resolveBranch(ctx.dir, issue.head) : null;
    if (issue.merged_sha) {
      const { parents } = await git.commit(ctx.dir, issue.merged_sha);
      if (parents.length === 2) return { ...(await compareShas(ctx, parents[0], parents[1], false)), head_exists: !!head, base_exists: true };
    }
    const base = issue.base ? await git.resolveBranch(ctx.dir, issue.base) : null;
    const result = base && head ? await compareShas(ctx, base, head, issue.state === 'open') : { commits: [], files: [], mergeable: null, conflicts: [] };
    return { ...result, head_exists: !!head, base_exists: !!base };
  }

  @Get('issues/:number')
  async show(@Param('owner') owner: string, @Param('repo') name: string, @Param('number', ParseIntPipe) number: number, @Viewer() viewer?: User) {
    const ctx = this.access.repo(viewer, owner, name);
    const issue = this.find(ctx, number);
    return {
      issue: publicIssue(issue),
      body_html: render(issue.body),
      comments: this.db.comments(issue.id).map((c) => ({ ...c, html: render(c.body) })),
      pull: issue.is_pull ? await this.pullInfo(ctx, issue) : null,
      can_close: viewer?.id === issue.author_id || ctx.isOwner,
      can_merge: ctx.isOwner,
      signed_in: !!viewer,
    };
  }

  @Post('issues/:number/comments')
  comment(
    @Param('owner') owner: string,
    @Param('repo') name: string,
    @Param('number', ParseIntPipe) number: number,
    @Body() b: CommentDto,
    @Viewer() viewer?: User,
  ) {
    const ctx = this.access.repo(viewer, owner, name);
    const user = requireUser(viewer);
    const body = b.body.trim();
    if (!body) throw new BadRequestException('Write something first.');
    this.db.addComment(this.find(ctx, number).id, user.id, 'comment', body);
    return { ok: true };
  }

  @Post('issues/:number/state')
  @HttpCode(200)
  setState(
    @Param('owner') owner: string,
    @Param('repo') name: string,
    @Param('number', ParseIntPipe) number: number,
    @Body() b: StateDto,
    @Viewer() viewer?: User,
  ) {
    const ctx = this.access.repo(viewer, owner, name);
    const user = requireUser(viewer);
    const issue = this.find(ctx, number);
    if (user.id !== issue.author_id && !ctx.isOwner) throw new ForbiddenException('Only its author or the repository owner can do that.');
    if (issue.state === 'merged') throw new BadRequestException("A merged pull request can't be reopened or closed.");
    if (b.state !== issue.state) this.db.setIssueState(issue.id, user.id, b.state);
    return { state: b.state };
  }

  @Post('pulls/:number/merge')
  @HttpCode(200)
  async merge(@Param('owner') owner: string, @Param('repo') name: string, @Param('number', ParseIntPipe) number: number, @Viewer() viewer?: User) {
    const ctx = this.access.repo(viewer, owner, name);
    const user = requireUser(viewer);
    if (!ctx.isOwner) throw new ForbiddenException('Only the repository owner can merge.');
    const issue = this.find(ctx, number);
    if (!issue.head || !issue.base || issue.state !== 'open') throw new BadRequestException('Only an open pull request can be merged.');
    const message = `Merge pull request #${issue.number} from ${issue.head}\n\n${issue.title}`;
    let sha: string;
    try {
      sha = await git.merge(ctx.dir, issue.base, issue.head, message, signature(user));
    } catch (e) {
      if (e instanceof git.GitError) throw new ConflictException(e.message);
      throw e;
    }
    this.db.setIssueState(issue.id, user.id, 'merged', sha);
    this.db.touchPushed(ctx.repo.id);
    return { merged_sha: sha };
  }
}
