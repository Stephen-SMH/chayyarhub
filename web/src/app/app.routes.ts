import { Routes, UrlMatcher, UrlSegment } from '@angular/router';
import { AuthPage } from './pages/auth';
import { ExplorePage } from './pages/explore';
import { HomePage } from './pages/home';
import { NewRepoPage } from './pages/new-repo';
import { NotFoundPage } from './pages/not-found';
import { ProfilePage } from './pages/profile';
import { BranchesPage } from './repo/branches';
import { CodePage } from './repo/code';
import { CommitPage, CommitsPage } from './repo/commits';
import { ComparePage } from './repo/compare';
import { IssuePage } from './repo/issue';
import { IssuesPage } from './repo/issues';
import { NewIssuePage } from './repo/new-issue';
import { SettingsPage } from './repo/settings';
import { RepoShell } from './repo/shell';

/**
 * `<prefix>/<ref>/<path…>`: a ref can contain slashes, so take every segment
 * after the prefix as one `rest` parameter and let the page split it.
 */
function rest(prefix: string): UrlMatcher {
  return (segments) =>
    segments.length > 1 && segments[0].path === prefix
      ? { consumed: segments, posParams: { rest: new UrlSegment(segments.slice(1).map((s) => s.path).join('/'), {}) } }
      : null;
}

export const routes: Routes = [
  { path: '', component: HomePage, title: 'ChayYarHub' },
  { path: 'login', component: AuthPage, data: { mode: 'login' }, title: 'Sign in · ChayYarHub' },
  { path: 'signup', component: AuthPage, data: { mode: 'signup' }, title: 'Sign up · ChayYarHub' },
  { path: 'new', component: NewRepoPage, title: 'New repository · ChayYarHub' },
  { path: 'explore', component: ExplorePage, title: 'Explore · ChayYarHub' },
  { path: ':owner', component: ProfilePage },
  {
    path: ':owner/:repo',
    component: RepoShell,
    children: [
      { path: '', component: CodePage },
      { matcher: rest('tree'), component: CodePage },
      { matcher: rest('blob'), component: CodePage },
      { path: 'commits', component: CommitsPage },
      { matcher: rest('commits'), component: CommitsPage },
      { path: 'commit/:sha', component: CommitPage },
      { path: 'branches', component: BranchesPage },
      { path: 'issues', component: IssuesPage, data: { pulls: false } },
      { path: 'issues/new', component: NewIssuePage },
      { path: 'issues/:number', component: IssuePage },
      { path: 'pulls', component: IssuesPage, data: { pulls: true } },
      { path: 'pull/:number', component: IssuePage },
      { path: 'compare', component: ComparePage },
      { path: 'settings', component: SettingsPage },
      { path: '**', component: NotFoundPage },
    ],
  },
  { path: '**', component: NotFoundPage, title: 'Not found · ChayYarHub' },
];
