// What the person looking may do. GitHub is the real gatekeeper (every action uses their own token); this only
// decides which buttons to show so people aren't offered things that would fail.
const RANK = { READ: 1, TRIAGE: 2, WRITE: 3, MAINTAIN: 4, ADMIN: 5 };

function repoInfo(app, repo) {
  if (app.floorData && app.floorData.repo.name === repo) return app.floorData.repo;
  const cached = app.floorCache && app.floorCache.get(repo);
  if (cached) return cached.repo;
  return (app.world && app.world.repos.find((r) => r.name === repo)) || null;
}

const rank = (app, repo) => RANK[(repoInfo(app, repo) || {}).permission] || 0;

export const can = {
  /** open issues (anyone who can read the repo, if issues are on) */
  createIssue: (app, repo) => {
    const r = repoInfo(app, repo);
    return !!r && r.hasIssues !== false && rank(app, repo) >= RANK.READ;
  },
  /** assign / unassign / close issues, set labels and assignees on new issues */
  triage: (app, repo) => rank(app, repo) >= RANK.TRIAGE,
  merge: (app, repo) => rank(app, repo) >= RANK.WRITE,
  /** floors, order and repo connections (Worktown3D's own settings) */
  manage: (app) => !!(app.world && app.world.access && app.world.access.canManage),
  createRepo: (app) => !!(app.world && app.world.access && app.world.access.canCreateRepo),
};

export function roleLabel(app) {
  const role = app.world && app.world.access ? app.world.access.role : null;
  return { owner: 'Owner', admin: 'Org admin', member: 'Member' }[role] || 'Visitor';
}
