import { Octokit } from "@octokit/rest"
import { config } from "./config.js"
import { prisma } from "@techteam/database"

function getOctokit(token?: string): Octokit {
  const authToken = token || config.GITHUB_TOKEN
  if (!authToken) {
    throw new Error("GitHub token is required. Configure it in Settings or set GITHUB_TOKEN in .env")
  }
  return new Octokit({ auth: authToken })
}

/**
 * Fetch the GitHub token for a tenant from TenantSettings.
 * Falls back to .env GITHUB_TOKEN if not configured per-tenant.
 */
export async function getGithubTokenForTenant(tenantId: string): Promise<string> {
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
  })
  const token = settings?.githubToken || config.GITHUB_TOKEN
  if (!token) {
    throw new Error("GitHub token not configured. Go to Settings to add your GitHub Personal Access Token.")
  }
  return token
}

export function extractOwnerRepo(repoUrl: string): { owner: string; repo: string } {
  // Handle both HTTPS and SSH formats:
  // https://github.com/owner/repo.git
  // https://github.com/owner/repo
  // git@github.com:owner/repo.git
  const httpsMatch = repoUrl.match(/github\.com\/([^/]+)\/([^/.]+)/)
  const sshMatch = repoUrl.match(/github\.com:([^/]+)\/([^/.]+)/)
  const match = httpsMatch ?? sshMatch
  if (!match) {
    throw new Error(`Cannot extract owner/repo from URL: ${repoUrl}`)
  }
  return { owner: match[1]!, repo: match[2]! }
}

export interface CreatePrParams {
  repoUrl: string
  title: string
  body: string
  head: string // branch name
  base: string // default branch
}

export async function createPullRequest(params: CreatePrParams & { token?: string }): Promise<string> {
  const octokit = getOctokit(params.token)
  const { owner, repo } = extractOwnerRepo(params.repoUrl)

  const { data: pr } = await octokit.rest.pulls.create({
    owner,
    repo,
    title: params.title,
    body: params.body,
    head: params.head,
    base: params.base,
  })

  return pr.html_url
}

/**
 * Merge a pull request via GitHub API.
 */
export async function mergePullRequest(params: {
  repoUrl: string
  prNumber: number
  commitTitle: string
  mergeMethod?: "merge" | "squash" | "rebase"
  token?: string
}): Promise<{ sha: string }> {
  const octokit = getOctokit(params.token)
  const { owner, repo } = extractOwnerRepo(params.repoUrl)

  const { data } = await octokit.rest.pulls.merge({
    owner,
    repo,
    pull_number: params.prNumber,
    commit_title: params.commitTitle,
    merge_method: params.mergeMethod ?? "merge",
  })

  return { sha: data.sha }
}

/**
 * Close a pull request without merging.
 */
export async function closePullRequest(params: {
  repoUrl: string
  prNumber: number
  token?: string
}): Promise<void> {
  const octokit = getOctokit(params.token)
  const { owner, repo } = extractOwnerRepo(params.repoUrl)

  await octokit.rest.pulls.update({
    owner,
    repo,
    pull_number: params.prNumber,
    state: "closed",
  })
}

export interface GithubOrg {
  login: string
  avatarUrl: string
}

/**
 * Fetch the GitHub organizations the authenticated user belongs to,
 * plus the user's personal account info.
 */
export async function getGithubOrgs(token: string): Promise<{
  user: { login: string; avatarUrl: string }
  orgs: GithubOrg[]
}> {
  const octokit = getOctokit(token)

  const { data: user } = await octokit.rest.users.getAuthenticated()
  const { data: orgs } = await octokit.rest.orgs.listForAuthenticatedUser({
    per_page: 100,
  })

  return {
    user: { login: user.login, avatarUrl: user.avatar_url },
    orgs: orgs.map((o) => ({ login: o.login, avatarUrl: o.avatar_url })),
  }
}

export interface GithubRepo {
  name: string
  fullName: string
  url: string
  defaultBranch: string
  isPrivate: boolean
}

/**
 * List repositories for the authenticated user (personal) or for an organization.
 * When orgLogin is "__personal__", lists repos owned by the authenticated user.
 */
export async function listGithubRepos(
  token: string,
  orgLogin: string
): Promise<GithubRepo[]> {
  const octokit = getOctokit(token)

  let repos: Array<{
    name: string
    full_name: string
    html_url: string
    default_branch?: string | undefined
    private: boolean
  }>

  if (orgLogin === "__personal__") {
    const { data } = await octokit.rest.repos.listForAuthenticatedUser({
      type: "owner",
      sort: "updated",
      per_page: 100,
    })
    repos = data
  } else {
    const { data } = await octokit.rest.repos.listForOrg({
      org: orgLogin,
      type: "all",
      sort: "updated",
      per_page: 100,
    })
    repos = data
  }

  return repos.map((r) => ({
    name: r.name,
    fullName: r.full_name,
    url: r.html_url,
    defaultBranch: r.default_branch ?? "main",
    isPrivate: r.private,
  }))
}

export interface CreateRepoParams {
  token: string
  orgLogin: string
  repoName: string
  description?: string
  isPrivate: boolean
}

export interface CreateRepoResult {
  repoUrl: string
  cloneUrl: string
  defaultBranch: string
  fullName: string
}

/**
 * Create a new repository on GitHub.
 * Uses personal account when orgLogin is "__personal__", otherwise creates under the org.
 * auto_init creates an initial commit with a README.
 */
export async function createGithubRepo(
  params: CreateRepoParams
): Promise<CreateRepoResult> {
  const octokit = getOctokit(params.token)

  let data: {
    html_url: string
    clone_url: string
    default_branch: string
    full_name: string
  }

  if (params.orgLogin === "__personal__") {
    const res = await octokit.rest.repos.createForAuthenticatedUser({
      name: params.repoName,
      description: params.description ?? "",
      private: params.isPrivate,
      auto_init: true,
    })
    data = res.data
  } else {
    const res = await octokit.rest.repos.createInOrg({
      org: params.orgLogin,
      name: params.repoName,
      description: params.description ?? "",
      private: params.isPrivate,
      auto_init: true,
    })
    data = res.data
  }

  return {
    repoUrl: data.html_url,
    cloneUrl: data.clone_url,
    defaultBranch: data.default_branch ?? "main",
    fullName: data.full_name,
  }
}

/**
 * Extract the PR number from a GitHub PR URL.
 * e.g. "https://github.com/owner/repo/pull/42" -> 42
 */
export function extractPrNumber(prUrl: string): number {
  const num = parseInt(prUrl.split("/").pop()!)
  if (isNaN(num)) {
    throw new Error(`Cannot extract PR number from URL: ${prUrl}`)
  }
  return num
}
