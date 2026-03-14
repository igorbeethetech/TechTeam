"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState, type ReactNode } from "react"
import { WebSocketProvider } from "@/hooks/use-websocket"
import { LanguageProvider } from "@/i18n"

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // 30 seconds
            retry: 1,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <WebSocketProvider>{children}</WebSocketProvider>
      </LanguageProvider>
    </QueryClientProvider>
  )
}
