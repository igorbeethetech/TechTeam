import path from "node:path"
import fs from "node:fs"
import simpleGit, { GitResponseError, type SimpleGit } from "simple-git"
import { config } from "./config.js"

export function createGitClient(repoPath: string): SimpleGit {
  return simpleGit(repoPath, {
    binary: "git",
    maxConcurrentProcesses: 1,
    trimmed: true,
  })
}

export async function createIsolatedBranch(
  repoPath: string,
  branchName: string,
  defaultBranch: string
): Promise<void> {
  const git = createGitClient(repoPath)
  await git.fetch("origin", defaultBranch)
  await git.checkout(`origin/${defaultBranch}`)
  await git.checkoutLocalBranch(branchName)
}

export async function commitAndPush(
  repoPath: string,
  branchName: string,
  commitMessage: string
): Promise<string> {
  const git = createGitClient(repoPath)
  const status = await git.status()
  if (status.files.length === 0) {
    throw new Error("No changes to commit -- development agent produced no code changes")
  }
  await git.add(".")
  const commitResult = await git.commit(commitMessage)
  await git.push("origin", branchName, ["--set-upstream"])
  return commitResult.commit // returns the commit hash
}

export async function resetWorkingDir(repoPath: string): Promise<void> {
  const git = createGitClient(repoPath)
  await git.checkout(".")
  await git.clean("f", ["-d"]) // remove untracked files and directories
}

export async function validateGitRepo(repoPath: string): Promise<boolean> {
  try {
    const git = createGitClient(repoPath)
    await git.status()
    return true
  } catch {
    return false
  }
}

/**
 * Attempt to merge a branch into the default branch.
 * Returns success status and list of conflict files if merge fails.
 */
export async function mergeFromBranch(
  repoPath: string,
  branchName: string,
  defaultBranch: string
): Promise<{ success: boolean; conflictFiles: string[] }> {
  const git = createGitClient(repoPath)
  await git.fetch("origin")
  await git.checkout(defaultBranch)
  await git.pull("origin", defaultBranch)

  try {
    await git.merge([branchName, "--no-ff"])
    return { success: true, conflictFiles: [] }
  } catch (err) {
    if (err instanceof GitResponseError) {
      // Merge conflict -- abort and return conflict files
      await git.merge(["--abort"])
      const conflictFiles = err.git.conflicts.map(
        (c: { file: string | null }) => c.file ?? "unknown"
      )
      return { success: false, conflictFiles }
    }
    // Non-merge error -- re-throw
    throw err
  }
}

/**
 * Check if the working directory has conflict markers.
 * Returns true if conflict markers are found.
 */
export async function checkConflictMarkers(
  repoPath: string
): Promise<boolean> {
  const git = createGitClient(repoPath)
  try {
    await git.diff(["--check"])
    return false
  } catch {
    // Exit code 2 = conflict markers found
    return true
  }
}

/**
 * Get the worktree path for a demand's isolated working directory.
 */
export function getWorktreePath(repoPath: string, demandId: string): string {
  return path.join(
    path.dirname(repoPath),
    ".worktrees",
    `${path.basename(repoPath)}-${demandId}`
  )
}

/**
 * Create a new git worktree for isolated branch work.
 */
export async function createWorktree(
  repoPath: string,
  worktreePath: string,
  branchName: string,
  defaultBranch: string
): Promise<void> {
  const git = createGitClient(repoPath)
  await git.raw([
    "worktree",
    "add",
    worktreePath,
    "-b",
    branchName,
    `origin/${defaultBranch}`,
  ])
}

/**
 * Remove a git worktree and prune stale entries.
 */
export async function removeWorktree(
  repoPath: string,
  worktreePath: string
): Promise<void> {
  try {
    const git = createGitClient(repoPath)
    await git.raw(["worktree", "remove", worktreePath, "--force"])
    await git.raw(["worktree", "prune"])
  } catch (err) {
    console.warn(
      `[git] Warning: failed to remove worktree ${worktreePath}:`,
      err instanceof Error ? err.message : err
    )
  }
}

/**
 * Inject a GitHub token into the git remote URL for authenticated push operations.
 * Returns the original remote URL so it can be restored after the push.
 *
 * Format: https://x-access-token:{token}@github.com/{owner}/{repo}.git
 *
 * IMPORTANT: Always call restoreGitRemote in a finally block after push
 * to prevent the token from leaking in git logs or config.
 */
export async function injectGitToken(
  repoPath: string,
  token: string
): Promise<string> {
  const git = createGitClient(repoPath)
  const rawUrl = await git.remote(["get-url", "origin"]) ?? ""
  // Sanitize: trim whitespace, strip literal \n escape sequences, remove control chars
  const originalUrl = rawUrl.replace(/\\n/g, "").replace(/[\r\n]+/g, "").trim()
  if (!originalUrl) {
    throw new Error("No remote 'origin' found in git repository")
  }

  // Parse owner/repo from HTTPS or SSH URL
  const match = originalUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/)
  if (!match) {
    throw new Error(`Cannot parse GitHub owner/repo from remote URL: ${originalUrl}`)
  }
  const [, owner, repo] = match

  const sanitizedToken = token.replace(/[\r\n\s]+/g, "")
  const tokenUrl = `https://x-access-token:${sanitizedToken}@github.com/${owner}/${repo}.git`
  await git.remote(["set-url", "origin", tokenUrl])

  return originalUrl
}

/**
 * Restore the git remote URL to its original value after a token-authenticated push.
 * Must be called in a finally block after injectGitToken to prevent token leakage.
 */
export async function restoreGitRemote(
  repoPath: string,
  originalUrl: string
): Promise<void> {
  const git = createGitClient(repoPath)
  const sanitizedUrl = originalUrl.replace(/\\n/g, "").replace(/[\r\n]+/g, "").trim()
  await git.remote(["set-url", "origin", sanitizedUrl])
}

/**
 * Clone a GitHub repository to a local path.
 * Injects the token into the HTTPS URL for authentication (private repos).
 * The target directory must NOT already exist.
 */
export async function cloneRepo(params: {
  cloneUrl: string
  localPath: string
  token: string
}): Promise<void> {
  const { cloneUrl, localPath, token } = params

  if (fs.existsSync(localPath)) {
    throw new Error(`Target path already exists: ${localPath}`)
  }

  // Inject token into URL for authentication
  const match = cloneUrl.match(/github\.com\/([^/]+)\/([^/.]+)/)
  if (!match) {
    throw new Error(`Cannot parse GitHub owner/repo from clone URL: ${cloneUrl}`)
  }
  const [, owner, repo] = match
  const sanitizedToken = token.replace(/[\r\n\s]+/g, "")
  const authenticatedUrl = `https://x-access-token:${sanitizedToken}@github.com/${owner}/${repo}.git`

  // Clone into new directory (no baseDir needed)
  const git = simpleGit()
  await git.clone(authenticatedUrl, localPath)
}

/**
 * Compute a deterministic local path for a repo: REPOS_BASE_PATH / tenantId / owner--repo
 */
export function getRepoLocalPath(tenantId: string, repoUrl: string): string {
  const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/)
  if (!match) {
    throw new Error(`Cannot parse GitHub owner/repo from URL: ${repoUrl}`)
  }
  const [, owner, repo] = match
  return path.join(config.REPOS_BASE_PATH, tenantId, `${owner}--${repo}`)
}

/**
 * Ensure a repo is cloned and up-to-date at the given path.
 * - If dir doesn't exist → clone + strip token from remote
 * - If dir exists + is git → fetch + pull on defaultBranch
 * - If dir exists + not git → throw
 */
export async function ensureRepoReady(params: {
  repoPath: string
  repoUrl: string
  defaultBranch: string
  token: string
}): Promise<void> {
  const { repoPath, repoUrl, defaultBranch, token } = params

  if (!fs.existsSync(repoPath)) {
    // Clone fresh
    fs.mkdirSync(repoPath, { recursive: true })
    // Remove newly created empty dir so cloneRepo can create it
    fs.rmSync(repoPath, { recursive: true })
    await cloneRepo({ cloneUrl: repoUrl, localPath: repoPath, token })
    // Strip token from remote config
    const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/)
    if (match) {
      const [, owner, repo] = match
      const git = createGitClient(repoPath)
      await git.remote(["set-url", "origin", `https://github.com/${owner}/${repo}.git`])
    }
    return
  }

  // Dir exists — check if it's a valid git repo
  const isValid = await validateGitRepo(repoPath)
  if (!isValid) {
    // Only auto-remove directories inside REPOS_BASE_PATH (auto-managed).
    // Legacy manual paths (e.g. user project folders) must NOT be deleted.
    const normalizedRepo = path.resolve(repoPath)
    const normalizedBase = path.resolve(config.REPOS_BASE_PATH)
    if (normalizedRepo.startsWith(normalizedBase)) {
      console.log(`[git] Auto-managed path is not a valid git repo, re-cloning: ${repoPath}`)
      fs.rmSync(repoPath, { recursive: true, force: true })
      await cloneRepo({ cloneUrl: repoUrl, localPath: repoPath, token })
      const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/)
      if (match) {
        const [, owner, repo] = match
        const git = createGitClient(repoPath)
        await git.remote(["set-url", "origin", `https://github.com/${owner}/${repo}.git`])
      }
      return
    }
    // Legacy manual path — cannot safely modify it
    throw new Error(
      `Path exists but is not a valid git repository: ${repoPath}. ` +
      `This is a legacy project path. Use the Sync button to migrate it to auto-managed storage.`
    )
  }

  // Fetch and pull on default branch
  const originalUrl = await injectGitToken(repoPath, token)
  try {
    const git = createGitClient(repoPath)
    await git.fetch("origin")
    // Only pull if we're on the default branch
    const currentBranch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim()
    if (currentBranch === defaultBranch) {
      await git.pull("origin", defaultBranch)
    }
  } finally {
    await restoreGitRemote(repoPath, originalUrl)
  }
}
