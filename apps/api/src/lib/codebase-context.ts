import { readdir, readFile, stat } from "fs/promises"
import { join, relative, basename } from "path"
import { execFile } from "child_process"
import { promisify } from "util"

const execFileAsync = promisify(execFile)

export interface CodebaseContextResult {
  success: boolean
  context: string
  error?: string
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "__pycache__",
  ".venv",
  "vendor",
  "coverage",
  ".turbo",
  ".claude",
])

const MAX_TREE_ENTRIES = 500

interface TreeEntry {
  path: string
  isDir: boolean
  depth: number
}

// ── Directory tree builder ───────────────────────────────────────────

async function buildTree(
  rootPath: string,
  maxDepth: number
): Promise<TreeEntry[]> {
  const entries: TreeEntry[] = []

  async function walk(dirPath: string, depth: number): Promise<void> {
    if (depth > maxDepth || entries.length >= MAX_TREE_ENTRIES) return

    let items: import("fs").Dirent[]
    try {
      items = await readdir(dirPath, { withFileTypes: true }) as import("fs").Dirent[]
    } catch {
      return
    }

    // Sort directories first, then alphabetically
    items.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1
      if (!a.isDirectory() && b.isDirectory()) return 1
      return a.name.localeCompare(b.name)
    })

    for (const item of items) {
      if (entries.length >= MAX_TREE_ENTRIES) break

      if (SKIP_DIRS.has(item.name)) continue

      const fullPath = join(dirPath, item.name)
      const relPath = relative(rootPath, fullPath)
      const isDir = item.isDirectory()

      entries.push({ path: relPath, isDir, depth })

      if (isDir) {
        await walk(fullPath, depth + 1)
      }
    }
  }

  await walk(rootPath, 0)
  return entries
}

function formatTree(entries: TreeEntry[]): string {
  const lines: string[] = []
  for (const entry of entries) {
    const indent = "  ".repeat(entry.depth)
    const suffix = entry.isDir ? "/" : ""
    lines.push(`${indent}${basename(entry.path)}${suffix}`)
  }
  return lines.join("\n")
}

// ── Config file readers ──────────────────────────────────────────────

async function readFileSafe(
  filePath: string,
  maxLines?: number
): Promise<string | null> {
  try {
    const content = await readFile(filePath, "utf-8")
    if (maxLines) {
      return content.split("\n").slice(0, maxLines).join("\n")
    }
    return content
  } catch {
    return null
  }
}

async function findPrismaSchema(repoPath: string): Promise<string | null> {
  // Try common locations
  const candidates = [
    join(repoPath, "prisma", "schema.prisma"),
    join(repoPath, "packages", "database", "prisma", "schema.prisma"),
    join(repoPath, "apps", "api", "prisma", "schema.prisma"),
  ]

  for (const candidate of candidates) {
    try {
      const fileStat = await stat(candidate)
      if (fileStat.isFile()) {
        // Prisma schema is highest priority, never truncate
        return await readFile(candidate, "utf-8")
      }
    } catch {
      continue
    }
  }

  // Fallback: search in tree (limited depth)
  try {
    const result = await searchForFile(repoPath, "schema.prisma", 4)
    if (result) {
      return await readFile(result, "utf-8")
    }
  } catch {
    // ignore
  }

  return null
}

async function searchForFile(
  dirPath: string,
  fileName: string,
  maxDepth: number,
  currentDepth = 0
): Promise<string | null> {
  if (currentDepth > maxDepth) return null

  try {
    const items = await readdir(dirPath, { withFileTypes: true })
    for (const item of items) {
      if (SKIP_DIRS.has(item.name)) continue
      const fullPath = join(dirPath, item.name)
      if (item.isFile() && item.name === fileName) {
        return fullPath
      }
      if (item.isDirectory()) {
        const found = await searchForFile(
          fullPath,
          fileName,
          maxDepth,
          currentDepth + 1
        )
        if (found) return found
      }
    }
  } catch {
    // ignore
  }
  return null
}

// ── Git log ──────────────────────────────────────────────────────────

async function getGitLog(repoPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["log", "--oneline", "-20"],
      {
        cwd: repoPath,
        timeout: 5_000,
      }
    )
    return stdout.trim()
  } catch {
    return null
  }
}

// ── Docker compose ───────────────────────────────────────────────────

async function readDockerCompose(repoPath: string): Promise<string | null> {
  const candidates = [
    join(repoPath, "docker-compose.yml"),
    join(repoPath, "docker-compose.yaml"),
  ]
  for (const candidate of candidates) {
    const content = await readFileSafe(candidate)
    if (content) return content
  }
  return null
}

// ── Main function ────────────────────────────────────────────────────

export async function gatherCodebaseContext(
  repoPath: string,
  options?: { maxChars?: number; maxDepth?: number }
): Promise<CodebaseContextResult> {
  const maxChars = options?.maxChars ?? 40_000
  const maxDepth = options?.maxDepth ?? 4

  try {
    // Gather all sections in parallel where possible
    const [treeEntries, packageJson, prismaSchema, readme, envExample, dockerCompose, gitLog] =
      await Promise.all([
        buildTree(repoPath, maxDepth).catch(() => [] as TreeEntry[]),
        readFileSafe(join(repoPath, "package.json")),
        findPrismaSchema(repoPath),
        readFileSafe(join(repoPath, "README.md"), 200),
        readFileSafe(join(repoPath, ".env.example")),
        readDockerCompose(repoPath),
        getGitLog(repoPath),
      ])

    // Build sections with priority ordering for truncation
    // Priority (highest = last to truncate):
    //   1. prisma schema (never truncate)
    //   2. package.json
    //   3. .env.example
    //   4. directory tree
    //   5. docker-compose
    //   6. README
    //   7. git log (first to truncate)

    const sections: { name: string; content: string; priority: number }[] = []

    if (prismaSchema) {
      sections.push({
        name: "Prisma Schema",
        content: prismaSchema,
        priority: 1,
      })
    }

    if (packageJson) {
      sections.push({
        name: "package.json",
        content: packageJson,
        priority: 2,
      })
    }

    if (envExample) {
      sections.push({
        name: ".env.example",
        content: envExample,
        priority: 3,
      })
    }

    if (treeEntries.length > 0) {
      sections.push({
        name: "Directory Structure",
        content: formatTree(treeEntries),
        priority: 4,
      })
    }

    if (dockerCompose) {
      sections.push({
        name: "Docker Compose",
        content: dockerCompose,
        priority: 5,
      })
    }

    if (readme) {
      sections.push({
        name: "README.md (first 200 lines)",
        content: readme,
        priority: 6,
      })
    }

    if (gitLog) {
      sections.push({
        name: "Recent Git History",
        content: gitLog,
        priority: 7,
      })
    }

    // Assemble with headers
    let assembled = sections
      .map((s) => `## ${s.name}\n\n\`\`\`\n${s.content}\n\`\`\``)
      .join("\n\n")

    // If exceeding limit, truncate in reverse priority order (highest number first)
    if (assembled.length > maxChars) {
      // Sort by priority descending so we remove least important first
      const sortedByTruncationOrder = [...sections].sort(
        (a, b) => b.priority - a.priority
      )

      for (const section of sortedByTruncationOrder) {
        // Never truncate prisma schema
        if (section.priority === 1) continue

        // Remove this section and rebuild
        const remaining = sections.filter((s) => s !== section)
        sections.length = 0
        sections.push(...remaining)

        assembled = sections
          .map((s) => `## ${s.name}\n\n\`\`\`\n${s.content}\n\`\`\``)
          .join("\n\n")

        if (assembled.length <= maxChars) break
      }

      // Final hard truncation if still over limit
      if (assembled.length > maxChars) {
        assembled =
          assembled.slice(0, maxChars) +
          "\n\n... [Context truncated at character limit]"
      }
    }

    return {
      success: true,
      context: assembled,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      context: "",
      error: `Failed to gather codebase context: ${message}`,
    }
  }
}
