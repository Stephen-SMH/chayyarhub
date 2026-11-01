import { Body, Controller, Get, HttpCode, HttpException, NotFoundException, Param, Post, Query, ServiceUnavailableException } from '@nestjs/common';
import { Config } from './config.js';
import { DbService, type User } from './db.service.js';
import { ExplainDto } from './dto.js';
import * as git from './git.js';
import { Access, requireUser, Viewer } from './http.js';
import { explain, KumalError } from './kumal.js';
import { render } from './markdown.js';
import { branchSha, cleanPath, pickRev } from './repos.controller.js';

/** Files bigger than this aren't played back line by line. */
const MAX_BLAME = 1_000_000;

/** Time travel through a file's history, and KuMal's plain-language explanations. */
@Controller('api/repos/:owner/:repo')
export class SnapshotsController {
  constructor(
    private readonly db: DbService,
    private readonly config: Config,
    private readonly access: Access,
  ) {}

  /** Every snapshot that changed a file, newest first. */
  @Get('file-history')
  async history(@Param('owner') owner: string, @Param('repo') name: string, @Query('ref') ref?: string, @Query('path') rawPath?: string, @Viewer() viewer?: User) {
    const ctx = this.access.repo(viewer, owner, name);
    const { rev, sha } = await pickRev(ctx, ref);
    const path = cleanPath(rawPath);
    if (!path) throw new NotFoundException('Choose a file.');
    const versions = await git.fileVersions(ctx.dir, sha, path);
    if (!versions.length) throw new NotFoundException(`'${path}' has no history at ${rev}.`);
    return { ref: rev, path, versions };
  }

  /** A file at one snapshot, each line marked with the snapshot that last changed it. */
  @Get('blame')
  async blame(@Param('owner') owner: string, @Param('repo') name: string, @Query('ref') ref?: string, @Query('path') rawPath?: string, @Viewer() viewer?: User) {
    const ctx = this.access.repo(viewer, owner, name);
    const { sha } = await pickRev(ctx, ref);
    const path = cleanPath(rawPath);
    if ((await git.objectKind(ctx.dir, sha, path)) !== 'blob') throw new NotFoundException(`'${path}' isn't a file at this snapshot.`);
    const size = await git.blobSize(ctx.dir, sha, path);
    if (size > MAX_BLAME) return { sha, path, too_large: true, binary: false, lines: [], commits: {} };
    if ((await git.blob(ctx.dir, sha, path)).subarray(0, 8000).includes(0)) return { sha, path, too_large: false, binary: true, lines: [], commits: {} };
    return { sha, path, too_large: false, binary: false, ...(await git.blame(ctx.dir, sha, path)) };
  }

  /** KuMal explains a snapshot (`sha`) or a pull request (`pull`). Signed-in people only, since each call costs money. */
  @Post('explain')
  @HttpCode(200)
  async explain(@Param('owner') owner: string, @Param('repo') name: string, @Body() b: ExplainDto, @Viewer() viewer?: User) {
    const ctx = this.access.repo(viewer, owner, name);
    requireUser(viewer);
    if (!this.config.kumal) throw new ServiceUnavailableException('KuMal is turned off on this server.');
    const lang = b.lang ?? 'en';

    let from: string;
    let to: string;
    let title: string;
    if (b.pull !== undefined) {
      const pull = this.db.getIssue(ctx.repo.id, b.pull);
      if (!pull?.is_pull || !pull.base || !pull.head) throw new NotFoundException(`There's no pull request #${b.pull}.`);
      if (pull.merged_sha) {
        const { parents } = await git.commit(ctx.dir, pull.merged_sha);
        [from, to] = [await git.mergeBase(ctx.dir, parents[0], parents[1]), parents[1]];
      } else {
        to = await branchSha(ctx, pull.head);
        from = await git.mergeBase(ctx.dir, await branchSha(ctx, pull.base), to);
      }
      title = `Pull request #${pull.number}: ${pull.title}\n\n${pull.body}`;
    } else {
      const sha = b.sha ? await git.resolve(ctx.dir, b.sha) : null;
      if (!sha) throw new NotFoundException('No such snapshot.');
      const commit = await git.commit(ctx.dir, sha);
      [from, to] = [commit.parents[0] ?? git.EMPTY_TREE, sha];
      title = `Snapshot (commit) ${commit.short} by ${commit.author}: ${commit.summary}\n\n${commit.body}`;
    }

    const key = `${ctx.repo.id}:${from}:${to}:${lang}`;
    let text = this.db.explanation(key);
    const cached = text !== undefined;
    if (!text) {
      try {
        text = await explain(this.config.kumalModel, title, await git.showPatch(ctx.dir, from, to), lang);
      } catch (e) {
        if (e instanceof KumalError) throw new HttpException({ statusCode: e.status, message: e.message }, e.status);
        throw e;
      }
      this.db.saveExplanation(key, ctx.repo.id, text);
    }
    return { html: render(text), cached };
  }
}
