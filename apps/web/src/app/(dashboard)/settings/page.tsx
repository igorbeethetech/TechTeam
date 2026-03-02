"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { toast } from "sonner"
import {
  Loader2, Save, Eye, EyeOff, CheckCircle, Key, Github, Terminal,
  AlertTriangle, ExternalLink, LogIn,
} from "lucide-react"
import { api } from "@/lib/api"

interface SettingsResponse {
  settings: {
    githubToken: string | null
    anthropicApiKey: string | null
    hasGithubToken: boolean
    hasAnthropicApiKey: boolean
    agentExecutionMode: "sdk" | "cli"
  }
}

interface ClaudeStatusResponse {
  loggedIn: boolean
  email?: string
  subscriptionType?: string
}

interface PreflightResponse {
  ok: boolean
  errors: { code: string; message: string }[]
}

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [githubToken, setGithubToken] = useState("")
  const [anthropicApiKey, setAnthropicApiKey] = useState("")
  const [showGithub, setShowGithub] = useState(false)
  const [showAnthropic, setShowAnthropic] = useState(false)
  const [executionMode, setExecutionMode] = useState<"sdk" | "cli">("sdk")
  const [saved, setSaved] = useState<string | null>(null)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<SettingsResponse>("/api/settings"),
  })

  const { data: claudeStatus, refetch: refetchClaudeStatus } = useQuery({
    queryKey: ["claude-status"],
    queryFn: () => api.get<ClaudeStatusResponse>("/api/settings/claude-status"),
    enabled: executionMode === "cli",
  })

  const { data: preflight, refetch: refetchPreflight } = useQuery({
    queryKey: ["preflight"],
    queryFn: () => api.get<PreflightResponse>("/api/settings/preflight"),
  })

  const mutation = useMutation({
    mutationFn: (body: { githubToken?: string; anthropicApiKey?: string; agentExecutionMode?: "sdk" | "cli" }) =>
      api.put<SettingsResponse>("/api/settings", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] })
      refetchPreflight()
    },
  })

  useEffect(() => {
    if (data?.settings?.agentExecutionMode) {
      setExecutionMode(data.settings.agentExecutionMode)
    }
  }, [data])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    setIsLoggingIn(false)
  }, [])

  function saveExecutionMode(mode: "sdk" | "cli") {
    setExecutionMode(mode)
    mutation.mutate({ agentExecutionMode: mode })
    setSaved("execution-mode")
    setTimeout(() => setSaved(null), 3000)
  }

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

  async function handleClaudeLogin() {
    setIsLoggingIn(true)
    try {
      await api.post("/api/settings/claude-login")
      toast.info("Processo de login iniciado. Verifique seu navegador.")

      // Poll claude-status every 3s until logged in (max 2 min)
      let attempts = 0
      pollRef.current = setInterval(async () => {
        attempts++
        if (attempts > 40) {
          stopPolling()
          toast.error("Timeout aguardando autenticação do Claude CLI")
          return
        }
        try {
          const status = await api.get<ClaudeStatusResponse>("/api/settings/claude-status")
          if (status.loggedIn) {
            stopPolling()
            refetchClaudeStatus()
            refetchPreflight()
            toast.success("Claude CLI autenticado com sucesso!")
          }
        } catch {
          // ignore polling errors
        }
      }, 3000)
    } catch {
      setIsLoggingIn(false)
      toast.error("Erro ao iniciar login do Claude CLI")
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const settings = data?.settings
  const preflightErrors = preflight?.errors ?? []

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure API keys and integrations for your organization.
        </p>
      </div>

      {/* Preflight Alerts Banner */}
      {preflightErrors.length > 0 && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 space-y-2">
          <div className="flex items-center gap-2 font-medium text-yellow-800">
            <AlertTriangle className="size-5" />
            Configuração incompleta
          </div>
          {preflightErrors.map((err) => (
            <div key={err.code} className="flex items-center gap-2 text-sm text-yellow-700">
              <span>&bull;</span>
              <span>{err.message}</span>
              {err.code === "missing_github_token" && (
                <a href="#github-token" className="underline hover:text-yellow-900 ml-1">
                  Configurar <ExternalLink className="size-3 inline" />
                </a>
              )}
              {err.code === "missing_anthropic_key" && (
                <a href="#anthropic-key" className="underline hover:text-yellow-900 ml-1">
                  Configurar <ExternalLink className="size-3 inline" />
                </a>
              )}
              {err.code === "cli_not_authenticated" && (
                <a href="#claude-cli" className="underline hover:text-yellow-900 ml-1">
                  Autenticar <ExternalLink className="size-3 inline" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* GitHub Token */}
      <Card id="github-token">
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
      <Card id="anthropic-key">
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

      {/* Agent Execution Mode */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="size-5" />
            Agent Execution Mode
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Choose how AI agents execute. <strong>API Key</strong> uses the Anthropic SDK (pay per use).{" "}
            <strong>Claude MAX</strong> uses the Claude CLI with your MAX subscription (unlimited).
          </p>
          <RadioGroup
            value={executionMode}
            onValueChange={(value: string) => saveExecutionMode(value as "sdk" | "cli")}
            className="space-y-3"
          >
            <div className="flex items-center space-x-3 rounded-md border p-3">
              <RadioGroupItem value="sdk" id="mode-sdk" />
              <Label htmlFor="mode-sdk" className="flex-1 cursor-pointer">
                <div className="font-medium">API Key (SDK)</div>
                <div className="text-sm text-muted-foreground">
                  Uses Anthropic API key configured above. Pay per token usage.
                </div>
              </Label>
            </div>
            <div className="flex items-center space-x-3 rounded-md border p-3">
              <RadioGroupItem value="cli" id="mode-cli" />
              <Label htmlFor="mode-cli" className="flex-1 cursor-pointer">
                <div className="font-medium">Claude MAX (CLI)</div>
                <div className="text-sm text-muted-foreground">
                  Uses Claude CLI subprocess. Requires Claude CLI installed and authenticated on the server.
                </div>
              </Label>
            </div>
          </RadioGroup>
          {saved === "execution-mode" && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="size-4" />
              Execution mode saved
            </div>
          )}
        </CardContent>
      </Card>

      {/* Claude CLI Authentication — only shown when CLI mode is selected */}
      {executionMode === "cli" && (
        <Card id="claude-cli">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="size-5" />
              Claude CLI Authentication
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              O Claude CLI precisa estar autenticado no servidor para usar a assinatura MAX.
              Clique no botão abaixo para iniciar a autenticação via navegador.
            </p>

            {claudeStatus?.loggedIn ? (
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  <CheckCircle className="size-3 mr-1" />
                  Autenticado
                </Badge>
                {claudeStatus.email && (
                  <span className="text-sm text-muted-foreground">{claudeStatus.email}</span>
                )}
                {claudeStatus.subscriptionType && (
                  <Badge variant="secondary">{claudeStatus.subscriptionType}</Badge>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
                  <AlertTriangle className="size-4 shrink-0" />
                  Claude CLI não autenticado. A pipeline de agentes não funcionará no modo MAX.
                </div>
                <Button
                  onClick={handleClaudeLogin}
                  disabled={isLoggingIn}
                  variant="default"
                >
                  {isLoggingIn ? (
                    <Loader2 className="size-4 animate-spin mr-2" />
                  ) : (
                    <LogIn className="size-4 mr-2" />
                  )}
                  {isLoggingIn ? "Aguardando autenticação..." : "Autenticar Claude MAX"}
                </Button>
                {isLoggingIn && (
                  <p className="text-xs text-muted-foreground">
                    Uma janela de autenticação foi aberta no navegador do servidor. Conclua o login para continuar.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
