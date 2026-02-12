"use client"

import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { z } from "zod"
import { projectCreateSchema, type Project } from "@techteam/shared"

// Use z.input for form state (fields with .default() are optional in input)
type ProjectFormValues = z.input<typeof projectCreateSchema>
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

interface ProjectFormProps {
  project?: Project
}

export function ProjectForm({ project }: ProjectFormProps) {
  const router = useRouter()
  const isEditing = !!project

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectCreateSchema),
    defaultValues: project
      ? {
          name: project.name,
          description: project.description ?? undefined,
          repoUrl: project.repoUrl,
          repoPath: project.repoPath,
          techStack: project.techStack,
          maxConcurrentDev: project.maxConcurrentDev,
          mergeStrategy: project.mergeStrategy,
        }
      : {
          maxConcurrentDev: 1,
          mergeStrategy: "fifo",
        },
  })

  const maxConcurrentDev = watch("maxConcurrentDev")
  const mergeStrategy = watch("mergeStrategy")

  async function onSubmit(data: ProjectFormValues) {
    try {
      if (isEditing) {
        await api.put(`/api/projects/${project.id}`, data)
        toast.success("Project updated successfully")
      } else {
        await api.post("/api/projects", data)
        toast.success("Project created successfully")
      }
      router.push("/projects")
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Something went wrong"
      toast.error(message)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Name *</Label>
        <Input
          id="name"
          placeholder="My Awesome Project"
          {...register("name")}
          aria-invalid={!!errors.name}
        />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Brief description of the project..."
          rows={3}
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
        <Label htmlFor="repoUrl">Repository URL *</Label>
        <Input
          id="repoUrl"
          placeholder="https://github.com/org/repo"
          {...register("repoUrl")}
          aria-invalid={!!errors.repoUrl}
        />
        {errors.repoUrl && (
          <p className="text-sm text-destructive">{errors.repoUrl.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="repoPath">Repository Path *</Label>
        <Input
          id="repoPath"
          placeholder="/home/dev/projects/repo"
          {...register("repoPath")}
          aria-invalid={!!errors.repoPath}
        />
        {errors.repoPath && (
          <p className="text-sm text-destructive">{errors.repoPath.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="techStack">Tech Stack *</Label>
        <Input
          id="techStack"
          placeholder="Next.js, Fastify, PostgreSQL"
          {...register("techStack")}
          aria-invalid={!!errors.techStack}
        />
        {errors.techStack && (
          <p className="text-sm text-destructive">
            {errors.techStack.message}
          </p>
        )}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Max Concurrent Devs</Label>
          <Select
            value={String(maxConcurrentDev ?? 1)}
            onValueChange={(value) =>
              setValue("maxConcurrentDev", Number(value), {
                shouldValidate: true,
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1</SelectItem>
              <SelectItem value="2">2</SelectItem>
              <SelectItem value="3">3</SelectItem>
            </SelectContent>
          </Select>
          {errors.maxConcurrentDev && (
            <p className="text-sm text-destructive">
              {errors.maxConcurrentDev.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Merge Strategy</Label>
          <Select
            value={mergeStrategy ?? "fifo"}
            onValueChange={(value) =>
              setValue("mergeStrategy", value as "fifo" | "priority", {
                shouldValidate: true,
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fifo">FIFO (First In, First Out)</SelectItem>
              <SelectItem value="priority">Priority</SelectItem>
            </SelectContent>
          </Select>
          {errors.mergeStrategy && (
            <p className="text-sm text-destructive">
              {errors.mergeStrategy.message}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 pt-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Saving..."
            : isEditing
            ? "Save Changes"
            : "Create Project"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/projects")}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
