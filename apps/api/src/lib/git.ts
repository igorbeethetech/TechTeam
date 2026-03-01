import path from "node:path"
import simpleGit, { GitResponseError, type SimpleGit } from "simple-git"

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
  const originalUrl = await git.remote(["get-url", "origin"])
  if (!originalUrl) {
    throw new Error("No remote 'origin' found in git repository")
  }

  // Parse owner/repo from HTTPS or SSH URL
  const match = originalUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/)
  if (!match) {
    throw new Error(`Cannot parse GitHub owner/repo from remote URL: ${originalUrl}`)
  }
  const [, owner, repo] = match

  const tokenUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`
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
  await git.remote(["set-url", "origin", originalUrl])
}
