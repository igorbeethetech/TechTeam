"use client"

import { Badge } from "@/components/ui/badge"
import type { PlanningOutput } from "@techteam/shared"
import { AlertTriangle } from "lucide-react"

const TASK_TYPE_COLORS: Record<string, string> = {
  create: "bg-green-100 text-green-700 hover:bg-green-100",
  modify: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  delete: "bg-red-100 text-red-700 hover:bg-red-100",
  test: "bg-purple-100 text-purple-700 hover:bg-purple-100",
  config: "bg-gray-100 text-gray-700 hover:bg-gray-100",
}

const FILE_ACTION_COLORS: Record<string, string> = {
  create: "bg-green-100 text-green-700 hover:bg-green-100",
  modify: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  delete: "bg-red-100 text-red-700 hover:bg-red-100",
}

const COMPLEXITY_COLORS: Record<string, string> = {
  trivial: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  simple: "bg-green-100 text-green-700 hover:bg-green-100",
  moderate: "bg-orange-100 text-orange-700 hover:bg-orange-100",
  complex: "bg-red-100 text-red-700 hover:bg-red-100",
}

interface PlanViewProps {
  plan: PlanningOutput
}

export function PlanView({ plan }: PlanViewProps) {
  // Build a map of tasks by ID for easy lookup
  const taskMap = new Map(plan.tasks.map((t) => [t.id, t]))

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">Summary</h3>
        <div className="rounded-lg border p-4">
          <p className="text-sm">{plan.summary}</p>
        </div>
      </div>

      {/* Tasks in execution order */}
      {plan.tasks.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Tasks ({plan.tasks.length})
          </h3>
          <div className="space-y-3">
            {plan.executionOrder.map((taskId, index) => {
              const task = taskMap.get(taskId)
              if (!task) return null

              return (
                <div key={task.id} className="rounded-lg border p-4 space-y-3">
                  {/* Task header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium">{task.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {task.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge className={TASK_TYPE_COLORS[task.type] ?? "bg-gray-100 text-gray-700"}>
                        {task.type}
                      </Badge>
                      <Badge className={COMPLEXITY_COLORS[task.estimatedComplexity] ?? "bg-gray-100 text-gray-700"}>
                        {task.estimatedComplexity}
                      </Badge>
                    </div>
                  </div>

                  {/* Files */}
                  {task.files.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        Files
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {task.files.map((file) => (
                          <div
                            key={file.path}
                            className="flex items-center gap-1 rounded bg-muted px-2 py-0.5"
                          >
                            <Badge
                              className={`text-[10px] px-1 py-0 ${FILE_ACTION_COLORS[file.action] ?? ""}`}
                            >
                              {file.action}
                            </Badge>
                            <code className="text-xs">{file.path}</code>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Dependencies */}
                  {task.dependencies.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        Depends on
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {task.dependencies.map((depId) => (
                          <Badge
                            key={depId}
                            variant="outline"
                            className="text-xs"
                          >
                            {depId}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Execution Order */}
      {plan.executionOrder.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Execution Order
          </h3>
          <div className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-1.5">
              {plan.executionOrder.map((taskId, index) => (
                <div key={taskId} className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-xs">
                    {taskId}
                  </Badge>
                  {index < plan.executionOrder.length - 1 && (
                    <span className="text-muted-foreground text-xs">
                      &rarr;
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Risk Areas */}
      {plan.riskAreas.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Risk Areas
          </h3>
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30">
            <div className="mb-2 flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-4" />
              <span className="text-sm font-medium">Identified Risks</span>
            </div>
            <ul className="space-y-1 pl-6 list-disc">
              {plan.riskAreas.map((risk, index) => (
                <li key={index} className="text-sm">
                  {risk}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
