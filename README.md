# Company3D 🏢

A cartoon, first-person 3D office for your GitHub organization. Every repository is a floor, every current
team member sits at a desk, and their laptop shows what they're actually working on. Walk around, read
the team board, then ride the elevator down to your manager's office to create repos and hand out issues.

Everything talks to GitHub through the **GitHub CLI** (`gh`), so it uses whatever account you signed in with.

## Quick start

```bash
npm install
npm start            # http://localhost:3000
```

Without the GitHub CLI you get a fictional **demo company** so you can explore right away
(`npm run demo` forces demo mode even when `gh` is set up).

### Connect your organization

1. Install the GitHub CLI: `winget install --id GitHub.cli` (or see https://cli.github.com)
2. Sign in: `gh auth login` (the default scopes `repo` and `read:org` are what Company3D needs)
3. On the title screen press **Check again**, then pick an organization (or your personal account).

No restart needed. The choice is saved in `data/config.json`.

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
    interactive board where you can assign, unassign, close issues and merge ready PRs.
  - A PR is *ready to merge* when it isn't a draft, has no conflicts, checks aren't failing, and it's approved.
- **Lobby (G)**: building directory, team wall, a front-desk robot with tips, and the glass **Manager's Office**:
  - **Manager Console** (desk monitor): choose which repos get floors and their order, create blank repos
    (they get a floor immediately), write issues with assignees and labels, map repo **connections**
    (depends on / calls the API of / deploys …), and switch organizations.
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
server.js                 local HTTP server (127.0.0.1 only) + JSON API
server/gh.js              runs `gh api` (REST + GraphQL), bodies via stdin, never a shell
server/github-provider.js org/repo/member queries and mutations
server/demo-provider.js   fictional company with in-memory mutations
server/compose.js         turns issues/PRs/contributors/members into the floor model
public/js/main.js         renderer, game loop, floors, elevator rides, polling, actions
public/js/world/*         building, furniture, characters, repo floor, lobby, canvas screens
public/js/ui/*            HUD, panels, Kanban, manager console, title screen
```

Rendering is Three.js with toon materials and an outline pass. Static furniture is merged into a handful of draw
calls; floors seat up to 48 people (the rest are listed as working remotely) to stay smooth.

**Security:** the server only listens on localhost, rejects requests with a foreign `Host`/`Origin`, and requires a
custom header on every write, because it acts with your `gh` credentials. Merging a PR and closing an issue both ask
for confirmation.
