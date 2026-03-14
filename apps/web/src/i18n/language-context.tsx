"use client"

import { createContext, useContext, useCallback, type ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import ptBR from "./locales/pt-BR"
import enUS from "./locales/en-US"

export type SupportedLanguage = "pt-BR" | "en-US"

type Dictionary = Record<string, Record<string, string>>

const dictionaries: Record<SupportedLanguage, Dictionary> = {
  "pt-BR": ptBR as unknown as Dictionary,
  "en-US": enUS as unknown as Dictionary,
}

interface LanguageContextValue {
  language: SupportedLanguage
  t: (key: string, params?: Record<string, string>) => string
  setLanguage: (lang: SupportedLanguage) => void
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

interface SettingsResponse {
  settings: {
    githubToken: string | null
    anthropicApiKey: string | null
    hasGithubToken: boolean
    hasAnthropicApiKey: boolean
    agentExecutionMode: "sdk" | "cli"
    beeLanguage?: string
  }
}

function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
  const keys = path.split(".")
  let current: unknown = obj
  for (const key of keys) {
    if (current == null || typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return typeof current === "string" ? current : undefined
}

function interpolate(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? `{${key}}`)
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<SettingsResponse>("/api/settings"),
  })

  const language: SupportedLanguage =
    (data?.settings?.beeLanguage as SupportedLanguage) ?? "pt-BR"

  const t = useCallback(
    (key: string, params?: Record<string, string>): string => {
      const dict = dictionaries[language] ?? dictionaries["pt-BR"]
      const value = getNestedValue(dict as unknown as Record<string, unknown>, key)
      if (value == null) return key
      return params ? interpolate(value, params) : value
    },
    [language]
  )

  const setLanguage = useCallback(
    (lang: SupportedLanguage) => {
      api
        .put<SettingsResponse>("/api/settings", { beeLanguage: lang })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["settings"] })
        })
    },
    [queryClient]
  )

  return (
    <LanguageContext.Provider value={{ language, t, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useTranslation() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error("useTranslation must be used within a LanguageProvider")
  return ctx
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider")
  return { language: ctx.language, setLanguage: ctx.setLanguage }
}
