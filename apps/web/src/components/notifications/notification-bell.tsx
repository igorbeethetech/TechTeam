"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Bell } from "lucide-react"
import { api } from "@/lib/api"
import { useWsStatus } from "@/hooks/use-websocket"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { NotificationPanel } from "./notification-panel"

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const wsStatus = useWsStatus()

  const { data } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () =>
      api.get<{ count: number }>("/api/notifications/unread-count"),
    refetchInterval: wsStatus === "connected" ? false : 10_000,
  })

  const count = data?.count ?? 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-8"
          aria-label="Notifications"
        >
          <Bell className="size-4" />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-3">
        <NotificationPanel onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}
