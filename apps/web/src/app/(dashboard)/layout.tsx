"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useSession, organization } from "@/lib/auth-client"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { AppSidebar } from "@/components/layout/app-sidebar"
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { data: session, isPending } = useSession()

  const orgFixAttempted = useRef(false)

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/login")
    }
  }, [isPending, session, router])

  // Auto-fix: if session exists but no active org, try to set one
  useEffect(() => {
    if (!session || orgFixAttempted.current) return
    if (session.session.activeOrganizationId) return

    orgFixAttempted.current = true
    organization.list().then((res) => {
      const orgs = res.data
      if (orgs && orgs.length > 0) {
        organization.setActive({ organizationId: orgs[0].id })
      }
    })
  }, [session])

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!session) {
    return null
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-6">
          <SidebarTrigger />
          <div className="flex-1" />
          <NotificationBell />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
