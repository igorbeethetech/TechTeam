"use client"

import { Badge } from "@/components/ui/badge"
import type { DiscoveryOutput } from "@techteam/shared"
import { AlertTriangle } from "lucide-react"
import { ClarificationForm } from "./clarification-form"

const NFR_CATEGORY_COLORS: Record<string, string> = {
  performance: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  security: "bg-red-100 text-red-700 hover:bg-red-100",
  usability: "bg-green-100 text-green-700 hover:bg-green-100",
  reliability: "bg-orange-100 text-orange-700 hover:bg-orange-100",
  maintainability: "bg-purple-100 text-purple-700 hover:bg-purple-100",
}

const COMPLEXITY_LABELS: Record<string, string> = {
  S: "Small / trivial change",
  M: "Medium / few days of work",
  L: "Large / a week or more",
  XL: "Extra Large / major effort",
}

interface RequirementsViewProps {
  requirements: DiscoveryOutput
  demandId?: string
  isPaused?: boolean
}

export function RequirementsView({ requirements, demandId, isPaused }: RequirementsViewProps) {
  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">Summary</h3>
        <div className="rounded-lg border p-4">
          <p className="text-sm">{requirements.summary}</p>
        </div>
      </div>

      {/* Functional Requirements */}
      {requirements.functionalRequirements.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Functional Requirements
          </h3>
          <div className="space-y-3">
            {requirements.functionalRequirements.map((req, index) => (
              <div key={req.id} className="rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                    {index + 1}
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{req.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {req.acceptance}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Non-Functional Requirements */}
      {requirements.nonFunctionalRequirements.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Non-Functional Requirements
          </h3>
          <div className="space-y-3">
            {requirements.nonFunctionalRequirements.map((req) => (
              <div key={req.id} className="flex items-start gap-3 rounded-lg border p-4">
                <Badge
                  className={
                    NFR_CATEGORY_COLORS[req.category] ??
                    "bg-gray-100 text-gray-700 hover:bg-gray-100"
                  }
                >
                  {req.category}
                </Badge>
                <p className="text-sm">{req.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Complexity */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">
          Complexity
        </h3>
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-lg px-3 py-1">
              {requirements.complexity}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {COMPLEXITY_LABELS[requirements.complexity] ?? requirements.complexity}
            </span>
          </div>
        </div>
      </div>

      {/* Ambiguities */}
      {requirements.ambiguities.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Ambiguities
          </h3>
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30">
            <div className="mb-3 flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-4" />
              <span className="text-sm font-medium">
                {isPaused
                  ? "Please answer these questions to resume the agent pipeline."
                  : "These ambiguities were detected during discovery."}
              </span>
            </div>
            {isPaused && demandId ? (
              <ClarificationForm
                demandId={demandId}
                ambiguities={requirements.ambiguities}
              />
            ) : (
              <div className="space-y-3">
                {requirements.ambiguities.map((ambiguity, index) => (
                  <div key={index} className="space-y-1">
                    <p className="text-sm font-medium">{ambiguity.question}</p>
                    <p className="text-xs text-muted-foreground">
                      {ambiguity.context}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
