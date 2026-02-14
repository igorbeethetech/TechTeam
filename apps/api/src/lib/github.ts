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
