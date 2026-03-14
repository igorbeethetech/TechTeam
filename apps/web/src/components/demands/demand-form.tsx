"use client"

import { useForm } from "react-hook-form"
import { useQueryClient, useQuery } from "@tanstack/react-query"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { z } from "zod"
import { GitBranch, Loader2 } from "lucide-react"
import {
  demandCreateSchema,
  PRIORITY_LEVELS,
  type Project,
} from "@techteam/shared"

// Use z.input for form state (fields with .default() are optional in input)
type DemandFormValues = z.input<typeof demandCreateSchema>

import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface ProjectsResponse {
  projects: Project[]
}

interface DemandFormProps {
  projectId?: string
  onSuccess?: () => void
}

export function DemandForm({ projectId, onSuccess }: DemandFormProps) {
  const queryClient = useQueryClient()

  // Fetch projects for selector (only when no projectId is provided)
  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.get<ProjectsResponse>("/api/projects"),
    enabled: !projectId,
  })

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DemandFormValues>({
    resolver: zodResolver(demandCreateSchema),
    defaultValues: {
      projectId: projectId ?? "",
      priority: "medium",
    },
  })

  const selectedPriority = watch("priority")
  const selectedProjectId = watch("projectId")
  const selectedBaseBranch = watch("baseBranch")

  // Fetch branches when a project is selected
  const effectiveProjectId = projectId ?? selectedProjectId
  const { data: branchesData, isLoading: isLoadingBranches } = useQuery({
    queryKey: ["branches", effectiveProjectId],
    queryFn: () =>
      api.get<{ branches: string[]; defaultBranch: string }>(
        `/api/projects/${effectiveProjectId}/branches`
      ),
    enabled: !!effectiveProjectId,
  })

  async function onSubmit(data: DemandFormValues) {
    try {
      await api.post("/api/demands", data)
      toast.success("Demand created successfully")
      // Invalidate demands for the project to refresh board
      await queryClient.invalidateQueries({
        queryKey: ["demands", data.projectId],
      })
      onSuccess?.()
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Something went wrong"
      toast.error(message)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="demand-title">Title *</Label>
        <Input
          id="demand-title"
          placeholder="What needs to be done?"
          {...register("title")}
          aria-invalid={!!errors.title}
        />
        {errors.title && (
          <p className="text-sm text-destructive">{errors.title.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="demand-description">Description</Label>
        <Textarea
          id="demand-description"
          placeholder="Describe the demand in detail..."
          rows={4}
          {...register("description")}
          aria-invalid={!!errors.description}
        />
        {errors.description && (
          <p className="text-sm text-destructive">
            {errors.description.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Priority</Label>
        <Select
          value={selectedPriority ?? "medium"}
          onValueChange={(value) =>
            setValue(
              "priority",
              value as (typeof PRIORITY_LEVELS)[number],
              { shouldValidate: true }
            )
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select priority..." />
          </SelectTrigger>
          <SelectContent>
            {PRIORITY_LEVELS.map((level) => (
              <SelectItem key={level} value={level}>
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.priority && (
          <p className="text-sm text-destructive">{errors.priority.message}</p>
        )}
      </div>

      {effectiveProjectId && (
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <GitBranch className="size-3.5" />
            Branch Base
            <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
          </Label>
          {isLoadingBranches ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="size-3.5 animate-spin" />
              Carregando branches...
            </div>
          ) : branchesData?.branches && branchesData.branches.length > 0 ? (
            <Select
              value={selectedBaseBranch ?? ""}
              onValueChange={(value) =>
                setValue("baseBranch", value === branchesData.defaultBranch ? undefined : value, {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={branchesData.defaultBranch} />
              </SelectTrigger>
              <SelectContent>
                {branchesData.branches.map((branch) => (
                  <SelectItem key={branch} value={branch}>
                    {branch}
                    {branch === branchesData.defaultBranch && (
                      <span className="ml-1 text-xs text-muted-foreground">(default)</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      )}

      {!projectId && (
        <div className="space-y-2">
          <Label>Project *</Label>
          <Select
            value={selectedProjectId ?? ""}
            onValueChange={(value) =>
              setValue("projectId", value, { shouldValidate: true })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a project..." />
            </SelectTrigger>
            <SelectContent>
              {(projectsData?.projects ?? [])
                .filter((p) => p.status === "active")
                .map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {errors.projectId && (
            <p className="text-sm text-destructive">
              {errors.projectId.message}
            </p>
          )}
        </div>
      )}

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Creating..." : "Create Demand"}
      </Button>
    </form>
  )
}
