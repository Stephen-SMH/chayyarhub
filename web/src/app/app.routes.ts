import { Routes, UrlMatcher, UrlSegment } from '@angular/router';

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

// Each page is its own chunk: the first page loads only what it needs, and
// the router preloads the rest in the background (see app.config.ts).
const code = () => import('./repo/code').then((m) => m.CodePage);
const commits = () => import('./repo/commits').then((m) => m.CommitsPage);
const issues = () => import('./repo/issues').then((m) => m.IssuesPage);
const issue = () => import('./repo/issue').then((m) => m.IssuePage);
const notFound = () => import('./pages/not-found').then((m) => m.NotFoundPage);

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home').then((m) => m.HomePage), title: 'ChayYarHub' },
  { path: 'login', loadComponent: () => import('./pages/auth').then((m) => m.AuthPage), data: { mode: 'login' }, title: 'Sign in · ChayYarHub' },
  { path: 'signup', loadComponent: () => import('./pages/auth').then((m) => m.AuthPage), data: { mode: 'signup' }, title: 'Sign up · ChayYarHub' },
  { path: 'new', loadComponent: () => import('./pages/new-repo').then((m) => m.NewRepoPage), title: 'New repository · ChayYarHub' },
  { path: 'explore', loadComponent: () => import('./pages/explore').then((m) => m.ExplorePage), title: 'Explore · ChayYarHub' },
  { path: ':owner', loadComponent: () => import('./pages/profile').then((m) => m.ProfilePage) },
  {
    path: ':owner/:repo',
    loadComponent: () => import('./repo/shell').then((m) => m.RepoShell),
    children: [
      { path: '', loadComponent: code },
      { matcher: rest('tree'), loadComponent: code },
      { matcher: rest('blob'), loadComponent: code },
      { path: 'commits', loadComponent: commits },
      { matcher: rest('commits'), loadComponent: commits },
      { matcher: rest('travel'), loadComponent: () => import('./repo/travel').then((m) => m.TravelPage) },
      { path: 'commit/:sha', loadComponent: () => import('./repo/commits').then((m) => m.CommitPage) },
      { path: 'branches', loadComponent: () => import('./repo/branches').then((m) => m.BranchesPage) },
      { path: 'issues', loadComponent: issues, data: { pulls: false } },
      { path: 'issues/new', loadComponent: () => import('./repo/new-issue').then((m) => m.NewIssuePage) },
      { path: 'issues/:number', loadComponent: issue },
      { path: 'pulls', loadComponent: issues, data: { pulls: true } },
      { path: 'pull/:number', loadComponent: issue },
      { path: 'compare', loadComponent: () => import('./repo/compare').then((m) => m.ComparePage) },
      { path: 'settings', loadComponent: () => import('./repo/settings').then((m) => m.SettingsPage) },
      { path: '**', loadComponent: notFound },
    ],
  },
  { path: '**', loadComponent: notFound, title: 'Not found · ChayYarHub' },
];
