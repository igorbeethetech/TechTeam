"use client"

import { useSession } from "@/lib/auth-client"

export default function DashboardPage() {
  const { data: session } = useSession()

  return (
    <div>
      <h2 className="text-2xl font-bold">Welcome to TechTeam</h2>
      {session?.user && (
        <p className="mt-2 text-muted-foreground">
          Signed in as {session.user.name}
        </p>
      )}
      <p className="mt-4 text-muted-foreground">
        Projects will appear here.
      </p>
    </div>
  )
}
