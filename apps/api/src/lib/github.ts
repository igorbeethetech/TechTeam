import { Octokit } from "@octokit/rest"
import { config } from "./config.js"

function getOctokit(): Octokit {
  if (!config.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is required for GitHub operations. Set it in .env")
  }
  return new Octokit({ auth: config.GITHUB_TOKEN })
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

export async function createPullRequest(params: CreatePrParams): Promise<string> {
  const octokit = getOctokit()
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
