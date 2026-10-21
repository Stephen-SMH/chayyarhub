import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  SESSION_DAYS,
  clearCookie,
  hashPassword,
  newToken,
  passwordProblem,
  sessionCookie,
  sessionToken,
  tokenHash,
  usernameProblem,
  verifyPassword,
} from './auth.js';
import { Config } from './config.js';
import { DbService, isUniqueViolation, publicRepo, type User } from './db.service.js';
import { CredentialsDto, PreviewDto } from './dto.js';
import { Viewer } from './http.js';
import { render } from './markdown.js';

/** Accounts, profiles and site-wide pages. */
@Controller('api')
export class AccountsController {
  constructor(
    private readonly db: DbService,
    private readonly config: Config,
  ) {}

  private startSession(user: User, res: Response) {
    const token = newToken();
    this.db.createSession(tokenHash(token), user.id, SESSION_DAYS);
    res.setHeader('Set-Cookie', sessionCookie(token, this.config.secureCookies));
    return { user };
  }

  @Post('signup')
  async signup(@Body() b: CredentialsDto, @Res({ passthrough: true }) res: Response) {
    const username = b.username.trim();
    const problem = usernameProblem(username) ?? passwordProblem(b.password);
    if (problem) throw new BadRequestException(problem);
    const hash = await hashPassword(b.password);
    try {
      return this.startSession(this.db.createUser(username, hash), res);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`The username '${username}' is taken.`);
      throw e;
    }
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() b: CredentialsDto, @Res({ passthrough: true }) res: Response) {
    const found = this.db.loginLookup(b.username.trim());
    if (!found || !(await verifyPassword(b.password, found.hash))) {
      throw new UnauthorizedException('Incorrect username or password.');
    }
    return this.startSession(found.user, res);
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = sessionToken(req.headers.cookie);
    if (token) this.db.deleteSession(tokenHash(token));
    res.setHeader('Set-Cookie', clearCookie(this.config.secureCookies));
    return { ok: true };
  }

  @Get('me')
  me(@Viewer() viewer?: User) {
    return { user: viewer ?? null };
  }

  @Get('explore')
  explore() {
    return { repos: this.db.explore(50).map(publicRepo) };
  }

  @Get('users/:user')
  profile(@Param('user') name: string, @Viewer() viewer?: User) {
    const user = this.db.userByName(name);
    if (!user) throw new NotFoundException(`There's no user called '${name}'.`);
    const isMe = viewer?.id === user.id;
    return { user, repos: this.db.reposOf(user.id, isMe).map(publicRepo), is_me: isMe };
  }

  @Post('markdown')
  @HttpCode(200)
  preview(@Body() b: PreviewDto) {
    return { html: render(b.text) };
  }
}
