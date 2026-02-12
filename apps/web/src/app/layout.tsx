import type { Metadata } from "next"
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
      <body>{children}</body>
    </html>
  )
}
