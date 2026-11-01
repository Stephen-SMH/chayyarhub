# ChayYarHub

**ChayYarHub** (ခြေရာ, *chay-yar*, "footprints") is a self-hosted git hub in the spirit of GitHub. Every commit leaves a footprint. Push your repositories to a server you run, then browse code and history, track issues, and review and merge pull requests in the browser.

It isn't a GitHub clone. ChayYarHub is built to make changes easy to read, especially for people new to a project: history is a timeline of **snapshots**, each change explains itself (what kind of files it touched, which functions, what only moved), and any file can be played back through time.

It is built with **Angular 22** and **NestJS 12**, and stores its data in SQLite and your system's `git`.

![A repository's code page in light mode](docs/repo.png)

## The ChayYar family

ChayYarHub is the centre of a family of tools, the way GitHub.com sits at the centre of GitHub Desktop, Actions, Pages and the rest.

| Product | Like | What it does | Status |
| --- | --- | --- | --- |
| **ChayYarHub** (this repository) | GitHub | Hosts repositories: code, history, issues, pull requests, accounts | v0.1, in progress |
| [**GitDesk**](https://github.com/Stephen-SMH/gitdesk) | GitHub Desktop | Desktop and browser client: changes, commits, history, branches, sync | v0.1, desktop and web |
| **SitMal** (စစ်မယ်, "will check") | GitHub Actions | Runs a repository's tests on every push and marks commits ✓ or ✗ | Planned |
| **PyaMal** (ပြမယ်, "will show") | GitHub Pages | Publishes a repository's website at its own address | Planned |
| **KuMal** (ကူမယ်, "will help") | Copilot | Explains snapshots and pull requests in plain English or Burmese, using Claude | Built in (explanations) |
| **`chayyar` CLI** | GitHub CLI | Pull requests and issues from the terminal | Planned |
| **ChayYarHub Mobile** | GitHub Mobile | Notifications and pull request review on your phone | Planned |

The names of planned products are working names.

## Made for reading changes

- **Snapshots, not commits.** History is a timeline of snapshots: saved moments of the whole project, like save points in a game. Each one shows at a glance what kind of change it was, as a coloured bar of code, tests, settings, docs, images and generated files. A short note explains the idea, and the word "commit", to newcomers.
- **What changed, at a glance.** Every snapshot, pull request and comparison opens with an overview: files sorted by what they are for, a **change map** (one box per file, grouped by folder, sized by how much changed), and the **functions and classes** that were added, changed, removed or moved to another file.
- **Noise out of the way.** Lockfiles and build output, files that were only renamed, and changes that only touched spacing are labelled and folded, under "You can probably skip". Real changes come first.
- **Before / After.** Changes show side by side, with the exact words that changed inside a line highlighted, code that only moved marked as moved (not deleted and re-added), and syntax colouring. One column is a click away, and is the default on phones. A file list on the left jumps to any file.
- **Time travel.** Slide or press play to step through every snapshot of a file, following it across renames. Lines are coloured by age, warm for recent and cool for old, and the lines each snapshot added are marked.
- **KuMal explains.** Ask KuMal to explain a snapshot or pull request in plain words, in English or Burmese. It runs on Claude and needs an API key (see Settings). Explanations are saved, so each change is explained once per language.
- **English and မြန်မာ.** Switch the interface language from the header. Snapshots are ခြေရာ, "footprints", in Burmese. The header, repository tabs, snapshots, changes and time travel are translated; other pages are English for now.

## What it does

- **Accounts.** Sign up and sign in. Your username is your address, for example `/soe`.
- **Repositories.** Create one, public or private, optionally starting with a README. You can also star repositories, change a repository's description or visibility, and delete it.
- **Git over HTTP.** `git clone`, `fetch` and `push` work with your username and password, including protocol v2 and pushes of any size. Anyone can clone a public repository; only its owner can push.
- **Code browser.** Folders and files with line numbers, rendered READMEs and Markdown, images and raw files. You can browse at any branch, tag or commit, including branch names with slashes (`feature/x`) and Burmese file names.
- **History.** The snapshot timeline grouped by day, a page per snapshot with its changes, time travel for any file, and a branch list showing how far each branch is ahead of or behind the default.
- **Issues.** Open issues and comment on them in Markdown, with a preview. Close and reopen them, with every step shown in a timeline.
- **Pull requests.** Compare two branches to see their commits and changed files, with conflict detection before you merge. Merging creates a merge commit, like GitHub's default.
- **Explore and profiles**, plus a light and a dark theme.

| Landing page | A pull request's changes |
| --- | --- |
| ![Landing page in dark mode](docs/landing.png) | ![Files changed in a pull request](docs/pull-request.png) |
| **An issue, with Burmese text** | **On a phone** |
| ![An issue's conversation](docs/issue.png) | ![The repository page at phone width](docs/phone.png) |

## Accessibility

- **Keyboard:** a "Skip to content" link, a visible focus ring, focus moved to the new page's content after each navigation, Escape to close menus, and arrow keys in a pull request's tabs.
- **Screen readers:** every control has a name, and states shown by icons (open, closed or merged; folder or file) are also written in text. Actions such as copying, starring, commenting and merging are announced. Form errors sit under their field and are linked to it.
- **Checked** with axe-core on every page in light and dark mode (no violations), at 375 px wide (no sideways scrolling), and with reduced motion turned on.

## Run it

You need Node 22.22.3 or newer and git 2.38 or newer.

```sh
npm run setup    # install the server's and the web app's dependencies
npm run build    # build the Angular app and the NestJS server
npm start        # http://127.0.0.1:4830
```

Open http://127.0.0.1:4830, sign up and create a repository. Then push to it:

```sh
git remote add origin http://127.0.0.1:4830/<you>/<repo>.git
git push -u origin main     # git asks for your ChayYarHub username and password
```

Your credential helper (Keychain, Git Credential Manager) remembers the password after the first push.

### Try it with sample data

With the server running, fill it with a small sample project: a Yangon weather app with ten snapshots (new code, moved code, a dependency update, a spacing-only change, a rename), an open pull request and an issue.

```sh
npm run demo     # then sign in as soe or ada, password "footprints"
```

### Settings

Set these as environment variables, for example `PORT=8080 npm start`.

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `4830` | Port to listen on |
| `HOST` | `127.0.0.1` | Address to listen on. Use `0.0.0.0` to let other machines on your network connect. |
| `CHAYYAR_DATA` | `chayyarhub-data/` in this folder | Where accounts (`chayyarhub.db`) and repositories (`repos/<id>.git`) are kept |
| `CHAYYAR_URL` | the address in the browser | The public address, used in clone URLs. An `https://` address also turns on secure cookies. |
| `CHAYYAR_WEB` | `web/dist` | The built web app |
| `ANTHROPIC_API_KEY` | (none) | Lets KuMal explain changes with Claude. Without credentials, KuMal says it needs a key. |
| `CHAYYAR_KUMAL` | on | `off` hides KuMal's answers on this server (the endpoint refuses) |
| `CHAYYAR_KUMAL_MODEL` | `claude-opus-5-5` | The Claude model KuMal uses |

To back up a hub, copy its data folder while the server is stopped.

## Security

- Passwords are hashed with scrypt. A session is a random 256-bit token, and only its SHA-256 hash is stored. Session cookies are `HttpOnly` and `SameSite=Lax`, and also `Secure` when `CHAYYAR_URL` is HTTPS.
- A change (a sign-in, a comment, a merge) must come from ChayYarHub's own pages: requests from other origins are refused.
- A private repository answers "not found" to everyone but its owner, on the web and over git.
- Markdown is sanitised on the server. Raw files are served with a sandbox Content Security Policy, so an HTML or SVG file in a repository can't run script as ChayYarHub.
- Anything taken from a URL (a branch name or a path) is checked, then resolved to a commit SHA before git sees it, so it can't be read as a git option.
- KuMal sends a change's diff and message to Claude (Anthropic's API) only when a signed-in person asks for an explanation. Turn it off with `CHAYYAR_KUMAL=off` for code that must not leave your network.
- The server itself speaks plain HTTP. To use it beyond your own machine or network, put it behind HTTPS (for example with Caddy) and set `CHAYYAR_URL`. Sign-in has no rate limiting yet.

## How it works

```
browser ── Angular app (web/) ── /api ──▶ NestJS (server/) ──▶ SQLite: users, sessions, stars, issues, pull requests
                                                │
                                                ├──▶ git: log, ls-tree, diff, blame, merge-tree, for browsing and merging
                                                └──▶ Claude (KuMal), only when someone asks for an explanation
git client ── clone / push over HTTP ─▶ NestJS ──▶ git http-backend ──▶ bare repositories (chayyarhub-data/repos/<id>.git)
```

The server checks who you are and what you may do, then hands clones and pushes to `git http-backend`, git's own HTTP server program. That way the protocol details (v2, gzip, chunked pushes) are git's, not ours. Pages are rendered by reading the bare repositories with ordinary git commands. Merges are done in memory with `git merge-tree --write-tree`, so no working copy is ever checked out on the server.

Change analysis (`server/src/changes.ts`) sorts files by their path, finds spacing-only changes with `git diff -w`, and finds functions and classes with per-language patterns, comparing the old and new versions of each file against the lines its patch touched. Word-level marks, moved-line detection and the before / after layout happen in the browser (`web/src/app/shared/diff-model.ts`).

## Develop

```sh
npm run dev:server   # NestJS on :4830, rebuilt on every change
npm run dev:web      # Angular on http://localhost:4200, passing /api to the server
npm test             # server unit tests, end-to-end tests, web unit tests
```

The end-to-end tests start a real server on a random port and drive it with the real `git` client. They cover accounts, pushing and cloning (with a Burmese file name and a 3 MB file), private repositories, the whole pull request flow, and merge conflicts.

```
server/   NestJS: controllers, SQLite (db.service.ts), git (git.ts, git-http.controller.ts)
web/      Angular: pages/ for site pages, repo/ for repository pages, shared/ for the changes view, change map, Markdown and avatars
scripts/  demo.mjs, the sample data
```

The look follows Soe's design system: Geist type, a rose-to-ember accent with blue for merged work, glass panels on dark, and a real light mode.

## Roadmap

- Burmese for the remaining pages (issues, pull requests, settings, sign-in)
- Compare any two snapshots, not just branches

- Collaborators and organisations, and forks with pull requests between them
- Access tokens and SSH keys for git
- Code search and syntax highlighting
- Line comments and reviews on pull requests
- Webhooks, which SitMal (CI) will use
- Signing in to ChayYarHub from GitDesk

## License

MIT © Soe Moe Htet (Stephen)
