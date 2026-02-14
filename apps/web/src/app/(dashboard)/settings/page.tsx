"use client"

import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, Save, Eye, EyeOff, CheckCircle, Key, Github } from "lucide-react"
import { api } from "@/lib/api"

interface SettingsResponse {
  settings: {
    githubToken: string | null
    anthropicApiKey: string | null
    hasGithubToken: boolean
    hasAnthropicApiKey: boolean
  }
}

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [githubToken, setGithubToken] = useState("")
  const [anthropicApiKey, setAnthropicApiKey] = useState("")
  const [showGithub, setShowGithub] = useState(false)
  const [showAnthropic, setShowAnthropic] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<SettingsResponse>("/api/settings"),
  })

  const mutation = useMutation({
    mutationFn: (body: { githubToken?: string; anthropicApiKey?: string }) =>
      api.put<SettingsResponse>("/api/settings", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] })
    },
  })

  function saveGithubToken() {
    if (!githubToken.trim()) return
    mutation.mutate({ githubToken: githubToken.trim() })
    setGithubToken("")
    setSaved("github")
    setTimeout(() => setSaved(null), 3000)
  }

  function saveAnthropicKey() {
    if (!anthropicApiKey.trim()) return
    mutation.mutate({ anthropicApiKey: anthropicApiKey.trim() })
    setAnthropicApiKey("")
    setSaved("anthropic")
    setTimeout(() => setSaved(null), 3000)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const settings = data?.settings

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure API keys and integrations for your organization.
        </p>
      </div>

      {/* GitHub Token */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Github className="size-5" />
            GitHub Access Token
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Required for the development agent to create branches, push code, and create Pull Requests.
            Generate a token at{" "}
            <a
              href="https://github.com/settings/tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              GitHub Settings &rarr; Tokens
            </a>{" "}
            with <code className="text-xs bg-muted px-1 py-0.5 rounded">repo</code> scope.
          </p>

          {settings?.hasGithubToken && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                <CheckCircle className="size-3 mr-1" />
                Configured
              </Badge>
              <span className="text-sm text-muted-foreground">{settings.githubToken}</span>
            </div>
          )}

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showGithub ? "text" : "password"}
                placeholder={settings?.hasGithubToken ? "Enter new token to replace..." : "ghp_xxxxxxxxxxxx"}
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowGithub(!showGithub)}
              >
                {showGithub ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <Button onClick={saveGithubToken} disabled={!githubToken.trim() || mutation.isPending}>
              {saved === "github" ? (
                <CheckCircle className="size-4" />
              ) : mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Anthropic API Key */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="size-5" />
            Anthropic API Key
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Required for AI agents (Discovery, Planning, Development, Testing) to analyze and generate code.
            Get your key at{" "}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Anthropic Console &rarr; API Keys
            </a>.
          </p>

          {settings?.hasAnthropicApiKey && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                <CheckCircle className="size-3 mr-1" />
                Configured
              </Badge>
              <span className="text-sm text-muted-foreground">{settings.anthropicApiKey}</span>
            </div>
          )}

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showAnthropic ? "text" : "password"}
                placeholder={settings?.hasAnthropicApiKey ? "Enter new key to replace..." : "sk-ant-xxxxxxxxxxxx"}
                value={anthropicApiKey}
                onChange={(e) => setAnthropicApiKey(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowAnthropic(!showAnthropic)}
              >
                {showAnthropic ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <Button onClick={saveAnthropicKey} disabled={!anthropicApiKey.trim() || mutation.isPending}>
              {saved === "anthropic" ? (
                <CheckCircle className="size-4" />
              ) : mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
