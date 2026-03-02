"use client"

import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { AlertTriangle, GitMerge, CheckCircle2, ClipboardCheck, XCircle } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

interface Notification {
  id: string
  type: "agent_failed" | "merge_needs_human" | "demand_done" | "demand_ready_for_review" | "demand_rejected"
  title: string
  message: string
  read: boolean
  createdAt: string
  demandId: string | null
  projectId: string | null
  demand: { id: string; title: string } | null
  project: { id: string; name: string } | null
}

const typeIcons: Record<Notification["type"], { icon: typeof AlertTriangle; color: string }> = {
  agent_failed: { icon: AlertTriangle, color: "text-red-500" },
  merge_needs_human: { icon: GitMerge, color: "text-orange-500" },
  demand_done: { icon: CheckCircle2, color: "text-green-500" },
  demand_ready_for_review: { icon: ClipboardCheck, color: "text-blue-500" },
  demand_rejected: { icon: XCircle, color: "text-orange-500" },
}

export function NotificationPanel({ onClose }: { onClose?: () => void }) {
  const router = useRouter()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () =>
      api.get<{ notifications: Notification[] }>("/api/notifications"),
    staleTime: 0,
  })

  const markReadMutation = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/api/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", "list"] })
      queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] })
    },
  })

  const markAllReadMutation = useMutation({
    mutationFn: () =>
      api.post("/api/notifications/mark-all-read"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", "list"] })
      queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] })
    },
  })

  function handleNotificationClick(notification: Notification) {
    if (!notification.read) {
      markReadMutation.mutate(notification.id)
    }
    if (notification.demandId) {
      onClose?.()
      router.push(`/demands/${notification.demandId}`)
    }
  }

  const notifications = data?.notifications ?? []

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between pb-3">
        <h3 className="text-sm font-semibold">Notifications</h3>
        {notifications.some((n) => !n.read) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-auto px-2 py-1 text-xs"
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
          >
            Mark all read
          </Button>
        )}
      </div>

      <ScrollArea className="max-h-[400px]">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-sm text-muted-foreground">Loading...</span>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-sm text-muted-foreground">
              No notifications
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {notifications.map((notification) => {
              const { icon: Icon, color } = typeIcons[notification.type] ?? {
                icon: AlertTriangle,
                color: "text-muted-foreground",
              }

              return (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`flex items-start gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted/80 ${
                    !notification.read
                      ? "border-l-2 border-primary bg-muted/50"
                      : "border-l-2 border-transparent"
                  }`}
                >
                  <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} />
                  <div className="flex-1 overflow-hidden">
                    <p
                      className={`text-sm leading-tight ${
                        !notification.read ? "font-semibold" : "font-normal"
                      }`}
                    >
                      {notification.title}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {notification.message}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground/70">
                      {formatDistanceToNow(new Date(notification.createdAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
