"use client"

import { useEffect, useRef } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { useSession, signOut, organization } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
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

  async function handleLogout() {
    await signOut()
    router.push("/login")
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="flex h-14 items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-lg font-semibold">
              TechTeam
            </Link>
            <nav className="flex items-center gap-4">
              <Link
                href="/projects"
                className={`text-sm transition-colors hover:text-foreground ${
                  pathname.startsWith("/projects")
                    ? "text-foreground font-medium"
                    : "text-muted-foreground"
                }`}
              >
                Projects
              </Link>
              <Link
                href="/metrics"
                className={`text-sm transition-colors hover:text-foreground ${
                  pathname.startsWith("/metrics")
                    ? "text-foreground font-medium"
                    : "text-muted-foreground"
                }`}
              >
                Metrics
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {session.user.email}
            </span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  )
}
