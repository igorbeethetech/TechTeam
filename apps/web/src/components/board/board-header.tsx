"use client"

import { useState } from "react"
import { Plus, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { api } from "@/lib/api"
import { useTranslation } from "@/i18n/language-context"

interface BoardHeaderProps {
  projectName: string
  projectId: string
  demandCount: number
  onNewDemand?: () => void
}

export function BoardHeader({
  projectName,
  projectId,
  demandCount,
  onNewDemand,
}: BoardHeaderProps) {
  const { t } = useTranslation()
  const [syncing, setSyncing] = useState(false)

  async function handleSync() {
    setSyncing(true)
    try {
      await api.post(`/api/projects/${projectId}/sync`)
      toast.success(t("project.syncSuccess"))
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t("project.syncError")
      toast.error(message)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">{projectName}</h1>
        <Badge variant="secondary">{demandCount} demands</Badge>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={handleSync} disabled={syncing}>
          <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? t("project.syncing") : t("project.sync")}
        </Button>
        <Button onClick={onNewDemand}>
          <Plus className="size-4" />
          New Demand
        </Button>
      </div>
    </div>
  )
}
