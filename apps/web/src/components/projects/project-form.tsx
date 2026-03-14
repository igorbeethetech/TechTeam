"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { z } from "zod"
import {
  projectCreateSchema,
  projectInitSchema,
  type Project,
} from "@techteam/shared"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { AlertCircle, Check, ChevronsUpDown, Loader2, Lock, Search } from "lucide-react"

type CreationMode = "existing" | "new"
type ExistingFormValues = z.input<typeof projectCreateSchema>
type InitFormValues = z.input<typeof projectInitSchema>

interface GithubOrgsResponse {
  user: { login: string; avatarUrl: string }
  orgs: { login: string; avatarUrl: string }[]
}

interface GithubReposResponse {
  repos: {
    name: string
    fullName: string
    url: string
    defaultBranch: string
    isPrivate: boolean
  }[]
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
}

interface ProjectFormProps {
  project?: Project
}

export function ProjectForm({ project }: ProjectFormProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const isEditing = !!project
  const [mode, setMode] = useState<CreationMode>("existing")
  const [autoSlug, setAutoSlug] = useState(true)
  const [selectedOrg, setSelectedOrg] = useState("")
  const [repoSearch, setRepoSearch] = useState("")
  const [repoPopoverOpen, setRepoPopoverOpen] = useState(false)

  // --- Existing mode form ---
  const existingForm = useForm<ExistingFormValues>({
    resolver: zodResolver(projectCreateSchema),
    defaultValues: project
      ? {
          name: project.name,
          description: project.description ?? undefined,
          repoUrl: project.repoUrl,
          techStack: project.techStack,
          maxConcurrentDev: project.maxConcurrentDev,
          mergeStrategy: project.mergeStrategy,
          testInstructions: project.testInstructions ?? undefined,
          previewUrlTemplate: project.previewUrlTemplate ?? undefined,
          databaseUrl: project.databaseUrl ?? undefined,
        }
      : {
          maxConcurrentDev: 1,
          mergeStrategy: "fifo",
        },
  })

  // --- New mode form ---
  const initForm = useForm<InitFormValues>({
    resolver: zodResolver(projectInitSchema),
    defaultValues: {
      maxConcurrentDev: 1,
      mergeStrategy: "fifo",
      visibility: "private",
      orgLogin: "",
      repoName: "",
    },
  })

  // Determine which form is active
  const isNewMode = !isEditing && mode === "new"
  const activeErrors = isNewMode
    ? initForm.formState.errors
    : existingForm.formState.errors
  const activeIsSubmitting = isNewMode
    ? initForm.formState.isSubmitting
    : existingForm.formState.isSubmitting

  // Fetch GitHub orgs (both create modes)
  const orgsQuery = useQuery<GithubOrgsResponse>({
    queryKey: ["github", "orgs"],
    queryFn: () => api.get<GithubOrgsResponse>("/api/github/orgs"),
    enabled: !isEditing,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  // Fetch repos for selected org (existing mode only)
  const reposQuery = useQuery<GithubReposResponse>({
    queryKey: ["github", "repos", selectedOrg],
    queryFn: () =>
      api.get<GithubReposResponse>(
        `/api/github/repos?org=${encodeURIComponent(selectedOrg)}`
      ),
    enabled: !isEditing && mode === "existing" && !!selectedOrg,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  // Auto-slug repoName from project name
  const watchedInitName = initForm.watch("name")
  useEffect(() => {
    if (isNewMode && autoSlug && watchedInitName) {
      initForm.setValue("repoName", slugify(watchedInitName))
    }
  }, [watchedInitName, isNewMode, autoSlug, initForm])

  // Submit handler
  async function onExistingSubmit(data: ExistingFormValues) {
    try {
      if (isEditing) {
        await api.put(`/api/projects/${project.id}`, data)
        toast.success("Projeto atualizado com sucesso")
      } else {
        await api.post("/api/projects", data)
        toast.success("Projeto criado com sucesso")
      }
      await queryClient.invalidateQueries({ queryKey: ["projects"] })
      router.push("/projects")
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Something went wrong"
      toast.error(message)
    }
  }

  async function onInitSubmit(data: InitFormValues) {
    try {
      await api.post("/api/projects/init", data)
      toast.success("Repositório criado e projeto configurado com sucesso")
      await queryClient.invalidateQueries({ queryKey: ["projects"] })
      router.push("/projects")
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Something went wrong"
      toast.error(message)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Mode toggle - only when creating */}
      {!isEditing && (
        <Tabs
          value={mode}
          onValueChange={(v) => setMode(v as CreationMode)}
        >
          <TabsList>
            <TabsTrigger value="existing">Repositório Existente</TabsTrigger>
            <TabsTrigger value="new">Criar do Zero</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {/* ===== EXISTING MODE FORM ===== */}
      {!isNewMode && (
        <form
          onSubmit={existingForm.handleSubmit(onExistingSubmit)}
          className="space-y-6"
        >
          <div className="space-y-2">
            <Label htmlFor="ex-name">Nome *</Label>
            <Input
              id="ex-name"
              placeholder="My Awesome Project"
              {...existingForm.register("name")}
              aria-invalid={!!existingForm.formState.errors.name}
            />
            {existingForm.formState.errors.name && (
              <p className="text-sm text-destructive">
                {existingForm.formState.errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ex-description">Descrição</Label>
            <Textarea
              id="ex-description"
              placeholder="Descrição breve do projeto..."
              rows={3}
              {...existingForm.register("description")}
            />
          </div>

          {/* Repo URL — read-only when editing, org+repo selectors when creating */}
          {isEditing ? (
            <div className="space-y-2">
              <Label>URL do Repositório</Label>
              <Input
                value={existingForm.watch("repoUrl") ?? ""}
                disabled
                className="bg-muted"
              />
            </div>
          ) : (
            <>
              {/* GitHub Organization */}
              <div className="space-y-2">
                <Label>Organização GitHub *</Label>
                {orgsQuery.isLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="size-4 animate-spin" />
                    Carregando organizações...
                  </div>
                )}
                {orgsQuery.isError && (
                  <div className="flex items-center gap-2 text-sm text-destructive py-2">
                    <AlertCircle className="size-4" />
                    Erro ao carregar organizações. Verifique o token GitHub nas
                    Configurações.
                  </div>
                )}
                {orgsQuery.data && (
                  <Select
                    value={selectedOrg}
                    onValueChange={(v) => {
                      setSelectedOrg(v)
                      setRepoSearch("")
                      existingForm.setValue("repoUrl", "", {
                        shouldValidate: false,
                      })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a organização..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__personal__">
                        {orgsQuery.data.user.login} (pessoal)
                      </SelectItem>
                      {orgsQuery.data.orgs.map((org) => (
                        <SelectItem key={org.login} value={org.login}>
                          {org.login}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Repository selector */}
              {selectedOrg && (
                <div className="space-y-2">
                  <Label>Repositório *</Label>
                  {reposQuery.isLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                      <Loader2 className="size-4 animate-spin" />
                      Carregando repositórios...
                    </div>
                  )}
                  {reposQuery.isError && (
                    <div className="flex items-center gap-2 text-sm text-destructive py-2">
                      <AlertCircle className="size-4" />
                      Erro ao carregar repositórios.
                    </div>
                  )}
                  {reposQuery.data && (
                    <>
                      <Popover
                        open={repoPopoverOpen}
                        onOpenChange={setRepoPopoverOpen}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            role="combobox"
                            aria-expanded={repoPopoverOpen}
                            className="w-full justify-between font-normal"
                          >
                            {existingForm.watch("repoUrl")
                              ? reposQuery.data.repos.find(
                                  (r) => r.url === existingForm.watch("repoUrl")
                                )?.name ?? "Selecione o repositório..."
                              : "Selecione o repositório..."}
                            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-[var(--radix-popover-trigger-width)] p-0"
                          align="start"
                        >
                          <div className="flex items-center gap-2 border-b px-3 py-2">
                            <Search className="size-4 shrink-0 text-muted-foreground" />
                            <input
                              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                              placeholder="Buscar repositório..."
                              value={repoSearch}
                              onChange={(e) => setRepoSearch(e.target.value)}
                            />
                          </div>
                          <div className="max-h-[252px] overflow-y-auto p-1">
                            {reposQuery.data.repos
                              .filter((repo) =>
                                repo.name
                                  .toLowerCase()
                                  .includes(repoSearch.toLowerCase())
                              )
                              .map((repo) => {
                                const isSelected =
                                  existingForm.watch("repoUrl") === repo.url
                                return (
                                  <button
                                    key={repo.fullName}
                                    type="button"
                                    className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                                    onClick={() => {
                                      existingForm.setValue(
                                        "repoUrl",
                                        repo.url,
                                        { shouldValidate: true }
                                      )
                                      setRepoPopoverOpen(false)
                                      setRepoSearch("")
                                    }}
                                  >
                                    <Check
                                      className={`size-4 shrink-0 ${isSelected ? "opacity-100" : "opacity-0"}`}
                                    />
                                    <span className="truncate">
                                      {repo.name}
                                    </span>
                                    {repo.isPrivate && (
                                      <Lock className="ml-auto size-3 shrink-0 text-muted-foreground" />
                                    )}
                                  </button>
                                )
                              })}
                            {reposQuery.data.repos.filter((repo) =>
                              repo.name
                                .toLowerCase()
                                .includes(repoSearch.toLowerCase())
                            ).length === 0 && (
                              <p className="py-4 text-center text-sm text-muted-foreground">
                                Nenhum repositório encontrado.
                              </p>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                      {existingForm.watch("repoUrl") && (
                        <p className="text-xs text-muted-foreground">
                          {existingForm.watch("repoUrl")}
                        </p>
                      )}
                    </>
                  )}
                  {existingForm.formState.errors.repoUrl && (
                    <p className="text-sm text-destructive">
                      {existingForm.formState.errors.repoUrl.message}
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="ex-techStack">Tech Stack *</Label>
            <Input
              id="ex-techStack"
              placeholder="Next.js, Fastify, PostgreSQL"
              {...existingForm.register("techStack")}
              aria-invalid={!!existingForm.formState.errors.techStack}
            />
            {existingForm.formState.errors.techStack && (
              <p className="text-sm text-destructive">
                {existingForm.formState.errors.techStack.message}
              </p>
            )}
          </div>

          <SharedFields
            form={existingForm}
            isEditing={isEditing}
          />

          <div className="flex items-center gap-3 pt-4">
            <Button
              type="submit"
              disabled={existingForm.formState.isSubmitting}
            >
              {existingForm.formState.isSubmitting
                ? "Salvando..."
                : isEditing
                  ? "Salvar Alterações"
                  : "Criar Projeto"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/projects")}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {/* ===== NEW MODE FORM ===== */}
      {isNewMode && (
        <form
          onSubmit={initForm.handleSubmit(onInitSubmit)}
          className="space-y-6"
        >
          <div className="space-y-2">
            <Label htmlFor="init-name">Nome do Projeto *</Label>
            <Input
              id="init-name"
              placeholder="Meu Novo Projeto"
              {...initForm.register("name")}
              aria-invalid={!!initForm.formState.errors.name}
            />
            {initForm.formState.errors.name && (
              <p className="text-sm text-destructive">
                {initForm.formState.errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="init-description">Descrição</Label>
            <Textarea
              id="init-description"
              placeholder="Descrição breve do projeto..."
              rows={3}
              {...initForm.register("description")}
            />
          </div>

          {/* GitHub Organization */}
          <div className="space-y-2">
            <Label>Organização GitHub *</Label>
            {orgsQuery.isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="size-4 animate-spin" />
                Carregando organizações...
              </div>
            )}
            {orgsQuery.isError && (
              <div className="flex items-center gap-2 text-sm text-destructive py-2">
                <AlertCircle className="size-4" />
                Erro ao carregar organizações. Verifique o token GitHub nas
                Configurações.
              </div>
            )}
            {orgsQuery.data && (
              <Select
                value={initForm.watch("orgLogin")}
                onValueChange={(v) =>
                  initForm.setValue("orgLogin", v, { shouldValidate: true })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__personal__">
                    {orgsQuery.data.user.login} (pessoal)
                  </SelectItem>
                  {orgsQuery.data.orgs.map((org) => (
                    <SelectItem key={org.login} value={org.login}>
                      {org.login}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {initForm.formState.errors.orgLogin && (
              <p className="text-sm text-destructive">
                {initForm.formState.errors.orgLogin.message}
              </p>
            )}
          </div>

          {/* Repository Name */}
          <div className="space-y-2">
            <Label htmlFor="init-repoName">Nome do Repositório *</Label>
            <Input
              id="init-repoName"
              placeholder="meu-novo-projeto"
              {...initForm.register("repoName", {
                onChange: () => setAutoSlug(false),
              })}
              aria-invalid={!!initForm.formState.errors.repoName}
            />
            <p className="text-xs text-muted-foreground">
              Gerado automaticamente a partir do nome do projeto. Pode ser
              editado.
            </p>
            {initForm.formState.errors.repoName && (
              <p className="text-sm text-destructive">
                {initForm.formState.errors.repoName.message}
              </p>
            )}
          </div>

          {/* Visibility */}
          <div className="space-y-2">
            <Label>Visibilidade</Label>
            <RadioGroup
              value={initForm.watch("visibility") ?? "private"}
              onValueChange={(v) =>
                initForm.setValue("visibility", v as "public" | "private")
              }
              className="flex gap-6"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="private" id="vis-private" />
                <Label htmlFor="vis-private" className="font-normal">
                  Privado
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="public" id="vis-public" />
                <Label htmlFor="vis-public" className="font-normal">
                  Público
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="init-techStack">Tech Stack *</Label>
            <Input
              id="init-techStack"
              placeholder="Next.js, Fastify, PostgreSQL"
              {...initForm.register("techStack")}
              aria-invalid={!!initForm.formState.errors.techStack}
            />
            {initForm.formState.errors.techStack && (
              <p className="text-sm text-destructive">
                {initForm.formState.errors.techStack.message}
              </p>
            )}
          </div>

          <SharedFields form={initForm} isEditing={false} />

          <div className="flex items-center gap-3 pt-4">
            <Button
              type="submit"
              disabled={initForm.formState.isSubmitting}
            >
              {initForm.formState.isSubmitting
                ? "Criando repositório..."
                : "Criar Repositório e Projeto"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/projects")}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

/**
 * Shared fields rendered identically in both modes:
 * maxConcurrentDev, mergeStrategy, previewUrlTemplate, testInstructions
 */
function SharedFields({
  form,
  isEditing,
}: {
  form: ReturnType<typeof useForm<any>>
  isEditing: boolean
}) {
  const maxConcurrentDev = form.watch("maxConcurrentDev")
  const mergeStrategy = form.watch("mergeStrategy")

  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Devs Simultâneos Máximo</Label>
          <Select
            value={String(maxConcurrentDev ?? 1)}
            onValueChange={(value) =>
              form.setValue("maxConcurrentDev", Number(value), {
                shouldValidate: true,
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1</SelectItem>
              <SelectItem value="2">2</SelectItem>
              <SelectItem value="3">3</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Estratégia de Merge</Label>
          <Select
            value={mergeStrategy ?? "fifo"}
            onValueChange={(value) =>
              form.setValue("mergeStrategy", value as "fifo" | "priority", {
                shouldValidate: true,
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fifo">FIFO (First In, First Out)</SelectItem>
              <SelectItem value="priority">Prioridade</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="previewUrlTemplate">Template de URL de Preview</Label>
        <Input
          id="previewUrlTemplate"
          placeholder="https://preview.vercel.app/git/{branch}"
          {...form.register("previewUrlTemplate")}
        />
        <p className="text-xs text-muted-foreground">
          Use{" "}
          <code className="rounded bg-muted px-1">{"{branch}"}</code>{" "}
          como placeholder para o nome da branch. Deixe vazio se não
          aplicável.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="testInstructions">Instruções de Teste</Label>
        <Textarea
          id="testInstructions"
          placeholder={
            "Passos para testar as mudanças localmente:\n1. git fetch origin && git checkout <branch>\n2. npm install\n3. npm run dev\n4. Abrir http://localhost:3000 e verificar..."
          }
          rows={4}
          {...form.register("testInstructions")}
        />
        <p className="text-xs text-muted-foreground">
          Instruções exibidas aos testadores durante a etapa de Review.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="databaseUrl">URL do Banco de Dados</Label>
        <Input
          id="databaseUrl"
          type="password"
          placeholder="postgresql://user:password@host:5432/database"
          {...form.register("databaseUrl")}
        />
        <p className="text-xs text-muted-foreground">
          String de conexão PostgreSQL do projeto (ex: Supabase). Usado pelo agente de Discovery
          para introspectar o schema e evitar perguntas sobre estrutura existente.
        </p>
      </div>
    </>
  )
}
