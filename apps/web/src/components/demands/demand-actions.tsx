"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  StopCircle,
  RefreshCw,
  XCircle,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useTranslation } from "@/i18n/language-context"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

interface DemandActionsProps {
  demandId: string
  projectId: string
  stage: string
  agentStatus: string | null
  prUrl: string | null
}

export function DemandActions({
  demandId,
  projectId,
  stage,
  agentStatus,
  prUrl,
}: DemandActionsProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [isCancellingAgent, setIsCancellingAgent] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [isCancellingDemand, setIsCancellingDemand] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [closePr, setClosePr] = useState(true)
  const [deleteBranch, setDeleteBranch] = useState(false)

  const showCancelAgent = agentStatus === "running" || agentStatus === "queued"
  const showRetry = agentStatus === "failed" || agentStatus === "timeout" || agentStatus === "cancelled"
  const showCancelDemand = stage !== "inbox" && stage !== "done"

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["demand", demandId] })
    queryClient.invalidateQueries({ queryKey: ["demands", projectId] })
    queryClient.invalidateQueries({ queryKey: ["agent-runs", demandId] })
  }

  async function handleCancelAgent() {
    setIsCancellingAgent(true)
    try {
      await api.post(`/api/demands/${demandId}/cancel-agent`)
      toast.success(t("actions.agentCancelled"))
      invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao cancelar agente")
    } finally {
      setIsCancellingAgent(false)
    }
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

  async function handleCancelDemand() {
    setIsCancellingDemand(true)
    try {
      await api.post(`/api/demands/${demandId}/cancel`, { closePr, deleteBranch })
      toast.success(t("actions.demandCancelled"))
      setCancelDialogOpen(false)
      invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao cancelar demanda")
    } finally {
      setIsCancellingDemand(false)
    }
  }

  if (!showCancelAgent && !showRetry && !showCancelDemand) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showCancelAgent && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleCancelAgent}
          disabled={isCancellingAgent}
          className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
        >
          {isCancellingAgent ? (
            <Loader2 className="mr-1 size-3.5 animate-spin" />
          ) : (
            <StopCircle className="mr-1 size-3.5" />
          )}
          {isCancellingAgent ? t("actions.cancellingAgent") : t("actions.cancelAgent")}
        </Button>
      )}

      {showRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleRetry}
          disabled={isRetrying}
        >
          {isRetrying ? (
            <Loader2 className="mr-1 size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 size-3.5" />
          )}
          {isRetrying ? t("actions.retrying") : t("actions.retry")}
        </Button>
      )}

      {showCancelDemand && (
        <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
            >
              <XCircle className="mr-1 size-3.5" />
              {t("actions.cancelDemand")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("actions.cancelDemandTitle")}</DialogTitle>
              <DialogDescription>
                {t("actions.cancelDemandDescription")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              {prUrl && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={closePr}
                    onChange={(e) => setClosePr(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  {t("actions.closePrOnGithub")}
                </label>
              )}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteBranch}
                  onChange={(e) => setDeleteBranch(e.target.checked)}
                  className="rounded border-gray-300"
                />
                {t("actions.deleteRemoteBranch")}
              </label>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCancelDialogOpen(false)}
                disabled={isCancellingDemand}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={handleCancelDemand}
                disabled={isCancellingDemand}
              >
                {isCancellingDemand ? (
                  <Loader2 className="mr-1 size-4 animate-spin" />
                ) : (
                  <XCircle className="mr-1 size-4" />
                )}
                {isCancellingDemand ? t("actions.cancelling") : t("actions.confirmCancel")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
