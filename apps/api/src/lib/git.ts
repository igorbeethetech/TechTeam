import simpleGit, { type SimpleGit } from "simple-git"

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
