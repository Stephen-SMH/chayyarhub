import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AccountsController } from './accounts.controller.js';
import { Config } from './config.js';
import { DbService } from './db.service.js';
import { GitHttpController } from './git-http.controller.js';
import { Access, SameOriginMiddleware, ViewerMiddleware } from './http.js';
import { IssuesController } from './issues.controller.js';
import { ReposController } from './repos.controller.js';
import { SnapshotsController } from './snapshots.controller.js';

@Module({
  controllers: [AccountsController, ReposController, IssuesController, SnapshotsController, GitHttpController],
  providers: [Config, DbService, Access],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SameOriginMiddleware).forRoutes('api/{*path}');
    consumer.apply(ViewerMiddleware).forRoutes('{*path}');
  }
}
