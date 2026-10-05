// Real data source: every read and write goes through the GitHub CLI (`gh api`).
import { ghApi, graphql, GhError } from './gh.js';
import { composeFloor } from './compose.js';

const OWNER_QUERY = `
query($owner: String!, $cursor: String) {
  repositoryOwner(login: $owner) {
    __typename
    login
    avatarUrl
    ... on Organization { name description }
    ... on User { name }
    repositories(first: 100, after: $cursor, ownerAffiliations: [OWNER], orderBy: { field: PUSHED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        name description url isPrivate isArchived isFork pushedAt
        primaryLanguage { name color }
        issues(states: OPEN) { totalCount }
        pullRequests(states: OPEN) { totalCount }
      }
    }
  }
}`;

const MEMBERS_QUERY = `
query($owner: String!, $cursor: String) {
  organization(login: $owner) {
    membersWithRole(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { login name avatarUrl }
    }
  }
}`;

const REPO_QUERY = `
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    name description url isPrivate isArchived pushedAt
    primaryLanguage { name color }
    issues(states: OPEN, first: 100, orderBy: { field: UPDATED_AT, direction: DESC }) {
      totalCount
      nodes {
        number title url body createdAt updatedAt
        author { login }
        assignees(first: 6) { nodes { login } }
        labels(first: 6) { nodes { name color } }
        comments { totalCount }
      }
    }
    openPRs: pullRequests(states: OPEN, first: 50, orderBy: { field: UPDATED_AT, direction: DESC }) {
      totalCount
      nodes {
        number title url body createdAt updatedAt isDraft reviewDecision mergeable
        headRefName baseRefName additions deletions changedFiles
        author { login }
        assignees(first: 6) { nodes { login } }
        labels(first: 6) { nodes { name color } }
        approvals: reviews(states: APPROVED) { totalCount }
        latestReviews(first: 6) { nodes { state author { login } } }
        closingIssuesReferences(first: 5) { nodes { number } }
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
      }
    }
    mergedPRs: pullRequests(states: MERGED, first: 40, orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes { number title url mergedAt additions deletions author { login } }
    }
    defaultBranchRef {
      target {
        ... on Commit {
          history(first: 100) { nodes { author { user { login } } } }
        }
      }
    }
  }
}`;

const nodes = (conn) => (conn && conn.nodes ? conn.nodes.filter(Boolean) : []);
const login = (actor) => (actor ? actor.login : null);
const trimBody = (b) => (b ? (b.length > 4000 ? b.slice(0, 4000) + '\n…' : b) : '');

function mapRepoSummary(r) {
  return {
    name: r.name,
    description: r.description || '',
    url: r.url,
    isPrivate: r.isPrivate,
    isArchived: r.isArchived,
    isFork: !!r.isFork,
    pushedAt: r.pushedAt,
    language: r.primaryLanguage ? r.primaryLanguage.name : null,
    languageColor: r.primaryLanguage ? r.primaryLanguage.color : null,
    openIssues: r.issues ? r.issues.totalCount : 0,
    openPRs: r.pullRequests ? r.pullRequests.totalCount : r.openPRs ? r.openPRs.totalCount : 0,
  };
}

async function paginate(query, variables, pick, maxPages = 10) {
  const all = [];
  let cursor = null;
  let first = null;
  for (let page = 0; page < maxPages; page++) {
    const data = await graphql(query, { ...variables, cursor });
    if (!first) first = data;
    const conn = pick(data);
    if (!conn) break;
    all.push(...nodes(conn));
    if (!conn.pageInfo || !conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return { first, all };
}

async function restPages(endpoint, maxPages = 5) {
  const all = [];
  for (let page = 1; page <= maxPages; page++) {
    const sep = endpoint.includes('?') ? '&' : '?';
    const res = await ghApi(`${endpoint}${sep}per_page=100&page=${page}`);
    if (!Array.isArray(res) || res.length === 0) break; // 204 No Content (empty repo) yields null
    all.push(...res);
    if (res.length < 100) break;
  }
  return all;
}

export function createGithubProvider(gh) {
  const me = gh.user;

  return {
    mode: 'github',
    viewer: me,

    async listOwners() {
      const orgs = await ghApi('user/orgs?per_page=100');
      return [
        ...(Array.isArray(orgs) ? orgs : []).map((o) => ({
          login: o.login,
          type: 'Organization',
          description: o.description || '',
          avatarUrl: o.avatar_url,
        })),
        { login: me.login, type: 'User', description: 'Your personal account', avatarUrl: me.avatarUrl },
      ];
    },

    async getWorld(ownerLogin) {
      const { first, all } = await paginate(OWNER_QUERY, { owner: ownerLogin }, (d) => d && d.repositoryOwner && d.repositoryOwner.repositories);
      const ownerNode = first && first.repositoryOwner;
      if (!ownerNode) throw new GhError(`Could not find a GitHub organization or user named "${ownerLogin}"`, { status: 404 });
      const owner = {
        login: ownerNode.login,
        type: ownerNode.__typename,
        name: ownerNode.name || ownerNode.login,
        description: ownerNode.description || '',
        avatarUrl: ownerNode.avatarUrl,
      };
      let members = null;
      if (owner.type === 'Organization') {
        const res = await paginate(MEMBERS_QUERY, { owner: owner.login }, (d) => d && d.organization && d.organization.membersWithRole);
        members = res.all.map((m) => ({ login: m.login, name: m.name, avatarUrl: m.avatarUrl }));
      }
      return { owner, repos: all.map(mapRepoSummary), members };
    },

    async getFloor(world, repoName) {
      const owner = world.owner;
      const [data, contributors] = await Promise.all([
        graphql(REPO_QUERY, { owner: owner.login, name: repoName }),
        restPages(`repos/${owner.login}/${repoName}/contributors`, 2).catch((e) => {
          console.warn(`[gh] contributors for ${repoName}:`, e.message);
          return [];
        }),
      ]);
      const r = data && data.repository;
      if (!r) throw new GhError(`Repository ${owner.login}/${repoName} not found`, { status: 404 });

      const issues = nodes(r.issues).map((i) => ({
        number: i.number,
        title: i.title,
        url: i.url,
        body: trimBody(i.body),
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
        author: login(i.author),
        assignees: nodes(i.assignees).map((a) => a.login),
        labels: nodes(i.labels).map((l) => ({ name: l.name, color: l.color })),
        comments: i.comments ? i.comments.totalCount : 0,
      }));
      const prs = nodes(r.openPRs).map((p) => {
        const lastCommit = nodes(p.commits)[0];
        const rollup = lastCommit && lastCommit.commit && lastCommit.commit.statusCheckRollup;
        return {
          number: p.number,
          title: p.title,
          url: p.url,
          body: trimBody(p.body),
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          author: login(p.author),
          assignees: nodes(p.assignees).map((a) => a.login),
          labels: nodes(p.labels).map((l) => ({ name: l.name, color: l.color })),
          isDraft: p.isDraft,
          reviewDecision: p.reviewDecision,
          mergeable: p.mergeable,
          checks: rollup ? rollup.state : null,
          approvals: p.approvals ? p.approvals.totalCount : 0,
          reviewers: nodes(p.latestReviews).map((rv) => ({ login: login(rv.author), state: rv.state })),
          closingIssues: nodes(p.closingIssuesReferences).map((n) => n.number),
          headRefName: p.headRefName,
          baseRefName: p.baseRefName,
          additions: p.additions,
          deletions: p.deletions,
          changedFiles: p.changedFiles,
        };
      });
      const merged = nodes(r.mergedPRs).map((m) => ({
        number: m.number,
        title: m.title,
        url: m.url,
        mergedAt: m.mergedAt,
        author: login(m.author),
        additions: m.additions,
        deletions: m.deletions,
      }));

      // GitHub's contributors list is computed in the background and can lag behind new commits by hours,
      // so also count authors from the latest default-branch history, which is always current.
      const team = new Map(contributors.map((c) => [c.login.toLowerCase(), { login: c.login, type: c.type, contributions: c.contributions }]));
      const history = r.defaultBranchRef && r.defaultBranchRef.target && r.defaultBranchRef.target.history;
      const recent = new Map();
      for (const commit of nodes(history)) {
        const user = commit.author && commit.author.user;
        if (user) recent.set(user.login, (recent.get(user.login) || 0) + 1);
      }
      for (const [authorLogin, count] of recent) {
        if (!team.has(authorLogin.toLowerCase())) team.set(authorLogin.toLowerCase(), { login: authorLogin, type: 'User', contributions: count });
      }

      return composeFloor({
        owner,
        repo: mapRepoSummary({ ...r, issues: r.issues, pullRequests: r.openPRs }),
        members: world.members,
        contributors: [...team.values()],
        issues,
        prs,
        merged,
      });
    },

    async listLabels(ownerLogin, repoName) {
      const labels = await restPages(`repos/${ownerLogin}/${repoName}/labels`, 2);
      return labels.map((l) => ({ name: l.name, color: l.color, description: l.description || '' }));
    },

    async createRepo(world, { name, description, isPrivate, autoInit }) {
      const body = { name, description: description || '', private: !!isPrivate, auto_init: !!autoInit };
      const endpoint = world.owner.type === 'Organization' ? `orgs/${world.owner.login}/repos` : 'user/repos';
      const r = await ghApi(endpoint, { method: 'POST', body });
      return { name: r.name, url: r.html_url };
    },

    async createIssue(ownerLogin, repoName, { title, body, assignees, labels }) {
      const payload = { title, body: body || '' };
      if (assignees && assignees.length) payload.assignees = assignees;
      if (labels && labels.length) payload.labels = labels;
      const r = await ghApi(`repos/${ownerLogin}/${repoName}/issues`, { method: 'POST', body: payload });
      return { number: r.number, url: r.html_url, title: r.title };
    },

    async updateIssue(ownerLogin, repoName, number, { assignees, state }) {
      const payload = {};
      if (assignees) payload.assignees = assignees;
      if (state) payload.state = state;
      const r = await ghApi(`repos/${ownerLogin}/${repoName}/issues/${number}`, { method: 'PATCH', body: payload });
      return { number: r.number, url: r.html_url, state: r.state };
    },

    async mergePR(ownerLogin, repoName, number, method = 'squash') {
      const r = await ghApi(`repos/${ownerLogin}/${repoName}/pulls/${number}/merge`, {
        method: 'PUT',
        body: { merge_method: method },
      });
      return { merged: !!r.merged, message: r.message, sha: r.sha };
    },

    async avatar(userLogin) {
      const res = await fetch(`https://github.com/${encodeURIComponent(userLogin)}.png?size=128`, { redirect: 'follow' });
      if (!res.ok) return null;
      return { buffer: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') || 'image/png' };
    },
  };
}
