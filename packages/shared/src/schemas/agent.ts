import { z } from "zod"

// Discovery agent output schema
export const discoveryOutputSchema = z.object({
  functionalRequirements: z.array(
    z.object({
      id: z.string(),
      description: z.string(),
      acceptance: z.string(),
    })
  ),
  nonFunctionalRequirements: z.array(
    z.object({
      id: z.string(),
      category: z.enum([
        "performance",
        "security",
        "usability",
        "reliability",
        "maintainability",
      ]),
      description: z.string(),
    })
  ),
  complexity: z.enum(["S", "M", "L", "XL"]),
  ambiguities: z.array(
    z.object({
      question: z.string(),
      context: z.string(),
    })
  ),
  summary: z.string(),
})

// Planning agent output schema
export const planningOutputSchema = z.object({
  tasks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      type: z.enum(["create", "modify", "delete", "test", "config"]),
      files: z.array(
        z.object({
          path: z.string(),
          action: z.enum(["create", "modify", "delete"]),
        })
      ),
      dependencies: z.array(z.string()),
      estimatedComplexity: z.enum([
        "trivial",
        "simple",
        "moderate",
        "complex",
      ]),
    })
  ),
  executionOrder: z.array(z.string()),
  riskAreas: z.array(z.string()),
  summary: z.string(),
})

export type DiscoveryOutput = z.infer<typeof discoveryOutputSchema>
export type PlanningOutput = z.infer<typeof planningOutputSchema>

// Development agent output schema
export const developmentOutputSchema = z.object({
  commitMessage: z.string().describe("A concise commit message summarizing the changes made"),
  filesChanged: z.array(z.string()).describe("List of file paths that were created or modified"),
  approach: z.string().describe("Brief explanation of the implementation approach taken"),
  notes: z.string().optional().describe("Any caveats, known issues, or follow-up items"),
})

// Testing agent output schema
export const testingOutputSchema = z.object({
  verdict: z.enum(["approved", "rejected"]).describe("Whether the PR passes quality review"),
  summary: z.string().describe("Overall assessment of the changes"),
  testResults: z.object({
    testsRan: z.boolean().describe("Whether automated tests were executed"),
    testsPassed: z.boolean().optional().describe("Whether all tests passed (if tests ran)"),
    testOutput: z.string().optional().describe("Relevant test output or error messages"),
  }),
  codeQuality: z.object({
    adheresToPlan: z.boolean().describe("Whether the implementation follows the planning agent's task plan"),
    adheresToRequirements: z.boolean().describe("Whether the implementation satisfies the discovery agent's requirements"),
    issues: z.array(z.object({
      severity: z.enum(["critical", "major", "minor", "suggestion"]),
      file: z.string(),
      description: z.string(),
      suggestion: z.string().optional(),
    })).describe("List of code quality issues found"),
  }),
  rejectionReasons: z.array(z.string()).optional().describe("Specific reasons for rejection, if verdict is rejected"),
})

export type DevelopmentOutput = z.infer<typeof developmentOutputSchema>
export type TestingOutput = z.infer<typeof testingOutputSchema>

// Merge resolver agent output schema
export const mergeResolverOutputSchema = z.object({
  resolved: z.boolean().describe("Whether all merge conflicts were resolved"),
  resolvedFiles: z.array(z.string()).describe("Files where conflicts were resolved"),
  unresolvedFiles: z.array(z.string()).describe("Files where conflicts could not be resolved"),
  approach: z.string().describe("Description of the resolution approach taken"),
})

export type MergeResolverOutput = z.infer<typeof mergeResolverOutputSchema>
