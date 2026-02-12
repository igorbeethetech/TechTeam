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
