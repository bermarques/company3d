# Company3D 🏢

A cartoon, first-person 3D office for your GitHub organization. Every repository is a floor, every current
team member sits at a desk, and their laptop shows what they're actually working on. Walk around, read
the team board, then ride the elevator down to the manager's office to create repos and hand out issues.

It runs in two ways:

- **Local mode**: just you, on your machine, through the GitHub CLI (`gh`). Zero setup beyond `gh auth login`.
- **Hosted mode**: your whole team. Everyone signs in with GitHub and sees the building through **their own**
  GitHub permissions: only repos they can access, and only actions they're allowed to take.

## Quick start (local mode)

```bash
npm install
npm start            # http://localhost:3000
```

Without the GitHub CLI you get a fictional **demo company** so you can explore right away
(`npm run demo` forces demo mode even when `gh` is set up).

To use your real organization:

1. Install the GitHub CLI: `winget install --id GitHub.cli` (or see https://cli.github.com)
2. Sign in: `gh auth login` (the default scopes `repo` and `read:org` are what Company3D needs)
3. On the title screen press **Check again**, then pick an organization (or your personal account).

## Hosted mode (your team signs in with GitHub)

### 1. Create a GitHub App

GitHub → Settings → Developer settings → **GitHub Apps** → New GitHub App (create it under your organization if
only your company will use it).

| Setting | Value |
| --- | --- |
| Homepage URL | your `PUBLIC_URL` |
| Callback URL | `PUBLIC_URL/auth/callback` (for example `https://company3d.example.com/auth/callback`) |
| Expire user authorization tokens | ✅ on |
| Webhook | off (not used yet) |
| Where can it be installed | "Only on this account" for one company, "Any account" for a public product |

**Repository permissions:** Metadata *read*, Issues *read & write*, Pull requests *read & write*,
Contents *read & write* (needed to merge PRs), Commit statuses *read*, Checks *read*, and Administration *read & write*
only if you want "New project" to create repositories. **Organization permissions:** Members *read*.

Then generate a **client secret** and **install the app** on your organization.

> A classic OAuth App also works (set the same callback URL). It's simpler but coarser: it asks for the `repo` scope,
> which covers all of a person's repositories.

### 2. Configure and run

Hosted mode needs `PUBLIC_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` and a random `SESSION_SECRET`
(see [.env.example](.env.example)). On a platform, set them as environment variables in its dashboard. A `.env` file is
only for running on your own machine and is never committed.

**Vercel**
1. Import the GitHub repo. Vercel detects `server.js`, runs `npm run build`, serves `public/` from its CDN and runs the
   server as a function.
2. Add the environment variables above, plus `TRUST_PROXY=1`. `PUBLIC_URL` must be the exact address people use (your
   production domain, or a branch address like `https://<project>-git-develop-<team>.vercel.app`).
3. Optional but recommended: add **Upstash for Redis** from Vercel's Marketplace (it has a free tier) so floor order and
   repo connections are kept. Without it they reset now and then.
4. Preview deployments are behind Vercel's login by default. Turn that off under *Settings → Deployment Protection*
   if teammates should reach a preview address.
5. Vercel's free Hobby plan is for non-commercial use. Use Pro (or another host) once you charge customers.

**Railway, Render, Fly.io or your own server**: `npm ci --omit=dev && npm run build && npm start` behind HTTPS, with
`TRUST_PROXY=1` when a proxy is in front. Mount a volume and point `DATA_DIR` at it (or use Redis) to keep settings.

Sign-ins live in encrypted cookies, so they survive restarts and deploys and work with any number of instances.

### 3. Share the building

Open your org's building and copy its link from the title screen or the Manager Console
(`https://your-host/o/your-org`). Teammates who open it sign in with GitHub; the app checks that they're members of
the organization and shows them exactly what their GitHub access allows:

| Who | Sees | Can do |
| --- | --- | --- |
| Org owner (admin) | everything they can access on GitHub | everything, including floor layout, repo connections and new projects |
| Member | repos they can read | open issues; assign/close with triage access; merge with write access |
| Not a member | nothing | they're told they're not part of the org |

People who leave the organization lose access within a few minutes, and they stop appearing as characters.

## Controls

| Key | Action |
| --- | --- |
| `W A S D` / arrows | walk (`Shift` to run) |
| Mouse | look around (click the scene to capture the mouse) |
| `E` or click | interact with whatever is under the crosshair |
| `P` | take out / put away your phone |
| `Esc` | pause / close a panel |

If the browser can't capture the mouse (some embedded browsers), it switches to **drag to look**.

## What's in the building

- **Elevator** (west wall on every floor): walk in, press `E` at the button panel, pick a floor.
- **Repo floors**: one per repository. Desks are arranged in pods; people who are busy sit closest to the board.
  - **Characters** are the repo's contributors who are **still members of the org**. People who left are not shown
    (the floor sign tells you how many). Members who are assigned issues or have open PRs show up even before their first commit.
  - **Laptop screens** show the person's current assigned issue, otherwise their open PR, otherwise the last PR they shipped.
  - People with nothing assigned wander off to the **coffee corner**. Hit `E` on anyone for details.
  - **Team board** (north wall): Backlog → In Progress → In Review → **Ready to Merge** → Shipped. Press `E` for the full
    interactive board where you can assign, unassign, close issues and merge ready PRs (as your permissions allow).
  - A PR is *ready to merge* when it isn't a draft, has no conflicts, checks aren't failing, and it's approved.
- **Lobby (G)**: building directory, team wall, a front-desk robot with tips, and the glass **Manager's Office**:
  - **Manager Console** (desk monitor): choose which repos get floors and their order, create blank repos
    (they get a floor immediately), write issues with assignees and labels, map repo **connections**
    (depends on / calls the API of / deploys …), share the building and switch organizations.
  - The **Repo Connections** wall map shows those links; each floor sign lists them too.

Data refreshes every 30 seconds while you're on a floor, and toasts announce new issues, new PRs,
PRs becoming ready and merges.

## Your phone (`P`)

A pocket shortcut to everything, from anywhere in the building:

- **📋 Board**: quick view of any floor's team board (not just the one you're on), plus "New issue".
- **🛗 Floors**: tap a floor to ride there.
- **👥 Team**: who's on this floor, or everyone in the org with the floors they work on and what they're doing.
  **Take me there** rides to their floor, puts you by their desk and drops a bouncing marker over their head.
- **🚀 Ready**: every PR that's ready to merge across all floors, with a merge button.
- **🔔 Activity**: new issues, PRs, merges and your own actions; the 📱 chip shows unread news.
- **📸 Camera**: snapshot the office (no HUD) and save it as a JPEG.
- **⚙️ Settings**: mouse sensitivity, field of view, name tags, shadows, outlines, sounds (remembered per browser).

## How it works

```
server.js                  HTTP server: static files, JSON API, mode selection (local vs hosted)
server/github-client.js    GitHub access: local `gh` CLI, or a signed-in user's token (hosted)
server/github-provider.js  org/repo/member queries, permissions and mutations
server/auth.js             "Sign in with GitHub" (OAuth web flow + PKCE, refresh, revoke)
server/sessions.js         sign-in sessions sealed in encrypted cookies
server/security.js         CSP and security headers, rate limits
server/demo-provider.js    fictional company with in-memory mutations
server/compose.js          turns issues/PRs/contributors/members into the floor model
server/config.js           per-org building settings (Upstash Redis or a JSON file)
scripts/build.mjs          copies three.js into public/ for CDNs; checks vercel.json CSP
vercel.json                Vercel routes and security headers
public/js/main.js          renderer, game loop, floors, elevator rides, polling, actions
public/js/permissions.js   which buttons the viewer gets, from their GitHub permissions
public/js/world/*          building, furniture, characters, repo floor, lobby, canvas screens
public/js/ui/*             HUD, panels, Kanban, phone, manager console, title screen
```

Rendering is Three.js with toon materials and an outline pass. Static furniture is merged into a handful of draw
calls; floors seat up to 48 people (the rest are listed as working remotely) to stay smooth.

Security details are in [SECURITY.md](SECURITY.md).

## Roadmap

- **Subscriptions.** An owner subscribes, installs the GitHub App on their organization and gets the building link to
  share. Plans limit how many organizations an owner can connect (Basic: one). Planned pieces: a workspace registry
  (org ↔ owner ↔ plan ↔ app installation) in a database instead of `data/config.json`, checkout and billing webhooks,
  and GitHub App webhooks so uninstalls and membership removals take effect instantly.
- **Character customization.** People who sign in with their own GitHub account can design the character that
  represents them (hair, colors, accessories). Profiles will be keyed by GitHub user id and editable only by that
  person, from a "Me" app on the phone.
