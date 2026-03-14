"use client"

import { useState } from "react"
import { useQueryClient, useQuery } from "@tanstack/react-query"
import { AlertTriangle, RefreshCw, XCircle, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useTranslation } from "@/i18n/language-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { AgentRun } from "@techteam/shared"

interface ErrorRecoverySectionProps {
  demandId: string
  projectId: string
  agentStatus: string
  stage: string
}

interface AgentRunsResponse {
  agentRuns: AgentRun[]
}

export function ErrorRecoverySection({
  demandId,
  projectId,
  agentStatus,
  stage,
}: ErrorRecoverySectionProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [isRetrying, setIsRetrying] = useState(false)

  const { data } = useQuery({
    queryKey: ["agent-runs", demandId],
    queryFn: () =>
      api.get<AgentRunsResponse>(`/api/agent-runs?demandId=${demandId}`),
  })

  // Find the last failed/timeout/cancelled run
  const lastFailedRun = data?.agentRuns?.find(
    (r) => r.status === "failed" || r.status === "timeout" || r.status === "cancelled"
  )

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["demand", demandId] })
    queryClient.invalidateQueries({ queryKey: ["demands", projectId] })
    queryClient.invalidateQueries({ queryKey: ["agent-runs", demandId] })
  }

  async function handleRetry() {
    setIsRetrying(true)
    try {
      await api.post(`/api/demands/${demandId}/retry`)
      toast.success(t("actions.retryStarted"))
      invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao tentar novamente")
    } finally {
      setIsRetrying(false)
    }
  }

  const statusLabels: Record<string, string> = {
    failed: t("errorRecovery.agentFailed"),
    timeout: t("errorRecovery.agentTimeout"),
    cancelled: t("errorRecovery.agentCancelled"),
  }

  const statusColors: Record<string, string> = {
    failed: "border-red-300 text-red-700",
    timeout: "border-orange-300 text-orange-700",
    cancelled: "border-gray-300 text-gray-600",
  }

  return (
    <Card className="border-2 border-red-200 bg-red-50/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="size-5 text-red-600" />
          {statusLabels[agentStatus] ?? agentStatus}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("errorRecovery.problemDuringPhase")} <strong>{t(`stages.${stage}` as any) ?? stage}</strong>.{" "}
          {t("errorRecovery.canRetryOrCancel")}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Error details from last failed run */}
        {lastFailedRun && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="outline" className={statusColors[lastFailedRun.status] ?? ""}>
                {lastFailedRun.phase} - {statusLabels[lastFailedRun.status] ?? lastFailedRun.status}
              </Badge>
              {lastFailedRun.attempt > 1 && (
                <Badge variant="outline" className="text-xs">
                  {t("errorRecovery.attempt")} {lastFailedRun.attempt}
                </Badge>
              )}
            </div>
            {lastFailedRun.error && (
              <div className="rounded-md border border-red-200 bg-white p-3">
                <pre className="overflow-auto text-xs text-red-700 whitespace-pre-wrap">
                  {lastFailedRun.error}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 pt-1">
          <Button
            onClick={handleRetry}
            disabled={isRetrying}
            className="flex-1"
          >
            {isRetrying ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-4" />
            )}
            {isRetrying ? t("actions.retrying") : t("actions.retry")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
