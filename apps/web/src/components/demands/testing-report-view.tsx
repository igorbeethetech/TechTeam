"use client"

import { Badge } from "@/components/ui/badge"
import type { TestingOutput } from "@techteam/shared"
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react"

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700 hover:bg-red-100",
  major: "bg-orange-100 text-orange-700 hover:bg-orange-100",
  minor: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100",
  suggestion: "bg-blue-100 text-blue-700 hover:bg-blue-100",
}

interface TestingReportViewProps {
  testingOutput: TestingOutput
  isLatestReport: boolean
}

export function TestingReportView({
  testingOutput,
  isLatestReport,
}: TestingReportViewProps) {
  const isApproved = testingOutput.verdict === "approved"

  return (
    <div className="space-y-6">
      {/* Verdict */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">Verdict</h3>
        <div className="flex items-center gap-3 rounded-lg border p-4">
          <Badge
            variant={isApproved ? "default" : "destructive"}
            className="text-sm"
          >
            {testingOutput.verdict.charAt(0).toUpperCase() +
              testingOutput.verdict.slice(1)}
          </Badge>
          {!isLatestReport && (
            <span className="text-xs text-muted-foreground">
              (superseded by newer report)
            </span>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">Summary</h3>
        <div className="rounded-lg border p-4">
          <p className="text-sm">{testingOutput.summary}</p>
        </div>
      </div>

      {/* Test Results */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">
          Test Results
        </h3>
        <div className="rounded-lg border p-4 space-y-3">
          {testingOutput.testResults.testsRan ? (
            <>
              <div className="flex items-center gap-2">
                {testingOutput.testResults.testsPassed ? (
                  <CheckCircle2 className="size-4 text-green-600" />
                ) : (
                  <XCircle className="size-4 text-red-600" />
                )}
                <Badge
                  className={
                    testingOutput.testResults.testsPassed
                      ? "bg-green-100 text-green-700 hover:bg-green-100"
                      : "bg-red-100 text-red-700 hover:bg-red-100"
                  }
                >
                  Tests {testingOutput.testResults.testsPassed ? "Passed" : "Failed"}
                </Badge>
              </div>
              {testingOutput.testResults.testOutput && (
                <pre className="max-h-60 overflow-auto rounded bg-muted p-3 text-xs">
                  <code>{testingOutput.testResults.testOutput}</code>
                </pre>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No automated tests were executed
            </p>
          )}
        </div>
      </div>

      {/* Code Quality */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">
          Code Quality
        </h3>
        <div className="rounded-lg border p-4 space-y-4">
          {/* Adherence badges */}
          <div className="flex flex-wrap gap-2">
            <Badge
              className={
                testingOutput.codeQuality.adheresToPlan
                  ? "bg-green-100 text-green-700 hover:bg-green-100"
                  : "bg-red-100 text-red-700 hover:bg-red-100"
              }
            >
              Plan adherence: {testingOutput.codeQuality.adheresToPlan ? "Yes" : "No"}
            </Badge>
            <Badge
              className={
                testingOutput.codeQuality.adheresToRequirements
                  ? "bg-green-100 text-green-700 hover:bg-green-100"
                  : "bg-red-100 text-red-700 hover:bg-red-100"
              }
            >
              Requirements adherence:{" "}
              {testingOutput.codeQuality.adheresToRequirements ? "Yes" : "No"}
            </Badge>
          </div>

          {/* Issues */}
          {testingOutput.codeQuality.issues.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground">
                Issues ({testingOutput.codeQuality.issues.length})
              </p>
              {testingOutput.codeQuality.issues.map((issue, index) => (
                <div
                  key={index}
                  className="space-y-1 rounded border p-3"
                >
                  <div className="flex items-start gap-2">
                    <Badge
                      className={
                        SEVERITY_COLORS[issue.severity] ??
                        "bg-gray-100 text-gray-700 hover:bg-gray-100"
                      }
                    >
                      {issue.severity}
                    </Badge>
                    <code className="text-xs text-muted-foreground">
                      {issue.file}
                    </code>
                  </div>
                  <p className="text-sm">{issue.description}</p>
                  {issue.suggestion && (
                    <p className="text-xs italic text-muted-foreground">
                      {issue.suggestion}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No code quality issues found
            </p>
          )}
        </div>
      </div>

      {/* Rejection Reasons */}
      {!isApproved &&
        testingOutput.rejectionReasons &&
        testingOutput.rejectionReasons.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Rejection Reasons
            </h3>
            <div className="rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-700 dark:bg-red-950/30">
              <div className="mb-2 flex items-center gap-2 text-red-700 dark:text-red-400">
                <AlertTriangle className="size-4" />
                <span className="text-sm font-medium">
                  Changes were rejected for the following reasons:
                </span>
              </div>
              <ul className="space-y-1 pl-6 list-disc">
                {testingOutput.rejectionReasons.map((reason, index) => (
                  <li key={index} className="text-sm">
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
    </div>
  )
}
