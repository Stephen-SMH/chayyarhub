// Shapes of what the ChayYarHub server sends (server/src).

export interface User {
  id: number;
  username: string;
  created_at: number;
}

export interface Repo {
  id: number;
  owner: string;
  name: string;
  description: string;
  private: boolean;
  created_at: number;
  pushed_at: number | null;
  stars: number;
}

export interface RepoMeta {
  repo: Repo;
  clone_url: string;
  default_branch: string | null;
  branches: string[];
  starred: boolean;
  is_owner: boolean;
  signed_in: boolean;
  open_issues: number;
  open_pulls: number;
}

export interface Commit {
  sha: string;
  short: string;
  summary: string;
  body: string;
  author: string;
  email: string;
  date: number;
  parents: string[];
}

export interface Entry {
  name: string;
  path: string;
  kind: 'dir' | 'file' | 'symlink' | 'submodule';
  size: number | null;
}

export interface DirContents {
  type: 'dir';
  ref: string;
  sha: string;
  path: string;
  entries: Entry[];
  readme: { name: string; path: string; html: string } | null;
  last_commit: Commit | null;
}

export interface FileContents {
  type: 'file';
  ref: string;
  sha: string;
  path: string;
  size: number;
  binary: boolean;
  too_large: boolean;
  text: string | null;
  html: string | null;
  last_commit: Commit | null;
}

export type Contents = DirContents | FileContents;

export interface FileDiff {
  path: string;
  old_path: string | null;
  kind: 'new' | 'deleted' | 'renamed' | 'modified';
  additions: number;
  deletions: number;
  binary: boolean;
  patch: string | null;
}

export interface BranchRow {
  branch: { name: string; sha: string; summary: string; author: string; date: number };
  is_default: boolean;
  ahead: number;
  behind: number;
  pull: number | null;
}

export type IssueState = 'open' | 'closed' | 'merged';

export interface Issue {
  number: number;
  title: string;
  body: string;
  state: IssueState;
  is_pull: boolean;
  head: string | null;
  base: string | null;
  merged_sha: string | null;
  author: string;
  created_at: number;
  updated_at: number;
  comments: number;
}

export interface Comparison {
  commits: Commit[];
  files: FileDiff[];
  mergeable: boolean | null;
  conflicts: string[];
}

export interface IssueDetail {
  issue: Issue;
  body_html: string;
  comments: { id: number; author: string; kind: string; body: string; html: string; created_at: number }[];
  pull: (Comparison & { head_exists: boolean; base_exists: boolean }) | null;
  can_close: boolean;
  can_merge: boolean;
  signed_in: boolean;
}
