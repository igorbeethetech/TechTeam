import type { Metadata } from "next"
import { Toaster } from "sonner"
import { Providers } from "@/components/providers"
import "./globals.css"

export const metadata: Metadata = {
  title: "TechTeam Platform",
  description: "AI-powered development pipeline management",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
          <Toaster position="bottom-right" richColors />
        </Providers>
      </body>
    </html>
  )
}
