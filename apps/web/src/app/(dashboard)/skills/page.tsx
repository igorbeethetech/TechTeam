"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Sparkles,
  Plus,
  Pencil,
  Trash2,
  Power,
  PowerOff,
  Tag,
} from "lucide-react"
import { SKILL_CATEGORIES, AGENT_PHASES } from "@techteam/shared"
import type { Skill, SkillCategory, AgentPhase } from "@techteam/shared"

interface SkillsResponse {
  skills: Skill[]
}

const CATEGORY_LABELS: Record<string, string> = {
  frontend: "Frontend",
  backend: "Backend",
  devops: "DevOps",
  quality: "Quality",
  design: "Design",
  integrations: "Integrations",
  general: "General",
}

const CATEGORY_COLORS: Record<string, string> = {
  frontend: "bg-cyan-100 text-cyan-700",
  backend: "bg-indigo-100 text-indigo-700",
  devops: "bg-orange-100 text-orange-700",
  quality: "bg-teal-100 text-teal-700",
  design: "bg-violet-100 text-violet-700",
  integrations: "bg-amber-100 text-amber-700",
  general: "bg-gray-100 text-gray-700",
}

const PHASE_LABELS: Record<string, string> = {
  discovery: "Discovery",
  planning: "Planning",
  development: "Development",
  testing: "Testing",
}

interface SkillFormData {
  name: string
  description: string
  instructions: string
  tags: string
  applicablePhases: string[]
  category: string
}

const EMPTY_FORM: SkillFormData = {
  name: "",
  description: "",
  instructions: "",
  tags: "",
  applicablePhases: ["discovery", "planning", "development", "testing"],
  category: "general",
}

export default function SkillsPage() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null)
  const [form, setForm] = useState<SkillFormData>(EMPTY_FORM)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<SkillsResponse>("/api/skills"),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) =>
      api.patch<{ skill: Skill }>(`/api/skills/${id}/toggle`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["skills"] }),
  })

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post<{ skill: Skill }>("/api/skills", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] })
      setDialogOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: Record<string, unknown>
    }) => api.put<{ skill: Skill }>(`/api/skills/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] })
      setDialogOpen(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/skills/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] })
      setDeleteConfirm(null)
    },
  })

  const skills = data?.skills ?? []

  // Group skills by category
  const grouped = skills.reduce<Record<string, Skill[]>>((acc, skill) => {
    const cat = skill.category || "general"
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(skill)
    return acc
  }, {})

  function openCreate() {
    setEditingSkill(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEdit(skill: Skill) {
    setEditingSkill(skill)
    setForm({
      name: skill.name,
      description: skill.description,
      instructions: skill.instructions,
      tags: skill.tags.join(", "),
      applicablePhases: skill.applicablePhases,
      category: skill.category,
    })
    setDialogOpen(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload = {
      name: form.name,
      description: form.description,
      instructions: form.instructions,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      applicablePhases: form.applicablePhases,
      category: form.category,
    }

    if (editingSkill) {
      updateMutation.mutate({ id: editingSkill.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  function togglePhase(phase: string) {
    setForm((prev) => ({
      ...prev,
      applicablePhases: prev.applicablePhases.includes(phase)
        ? prev.applicablePhases.filter((p) => p !== phase)
        : [...prev.applicablePhases, phase],
    }))
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="size-6 text-amber-500" />
            Agent Skills
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Skills are automatically matched to agent runs based on tags.
            Enable, disable, or create custom skills.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          New Skill
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <div className="h-5 w-32 bg-muted animate-pulse rounded" />
                <div className="h-4 w-full bg-muted animate-pulse rounded" />
                <div className="flex gap-1">
                  <div className="h-5 w-14 bg-muted animate-pulse rounded" />
                  <div className="h-5 w-14 bg-muted animate-pulse rounded" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : skills.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10 gap-3">
            <Sparkles className="size-10 text-muted-foreground" />
            <p className="text-muted-foreground">No skills configured</p>
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              Create your first skill
            </Button>
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([category, categorySkills]) => (
          <div key={category} className="space-y-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Badge
                className={
                  CATEGORY_COLORS[category] ?? "bg-gray-100 text-gray-700"
                }
              >
                {CATEGORY_LABELS[category] ?? category}
              </Badge>
              <span className="text-sm font-normal text-muted-foreground">
                {categorySkills.length}{" "}
                {categorySkills.length === 1 ? "skill" : "skills"}
              </span>
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categorySkills.map((skill) => (
                <Card
                  key={skill.id}
                  className={`transition-opacity ${!skill.enabled ? "opacity-50" : ""}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm font-medium">
                        {skill.name}
                        {skill.isDefault && (
                          <Badge
                            variant="outline"
                            className="ml-2 text-[10px]"
                          >
                            Default
                          </Badge>
                        )}
                      </CardTitle>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => toggleMutation.mutate(skill.id)}
                          title={
                            skill.enabled ? "Disable skill" : "Enable skill"
                          }
                        >
                          {skill.enabled ? (
                            <Power className="size-3.5 text-green-600" />
                          ) : (
                            <PowerOff className="size-3.5 text-muted-foreground" />
                          )}
                        </Button>
                        {!skill.isDefault && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => openEdit(skill)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => setDeleteConfirm(skill.id)}
                            >
                              <Trash2 className="size-3.5 text-red-500" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {skill.description}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {skill.tags.slice(0, 5).map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="text-[10px] px-1.5 py-0"
                        >
                          <Tag className="size-2.5 mr-0.5" />
                          {tag}
                        </Badge>
                      ))}
                      {skill.tags.length > 5 && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0"
                        >
                          +{skill.tags.length - 5}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {skill.applicablePhases.map((phase) => (
                        <Badge
                          key={phase}
                          className="text-[10px] bg-slate-100 text-slate-600"
                        >
                          {PHASE_LABELS[phase] ?? phase}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingSkill ? "Edit Skill" : "New Skill"}
            </DialogTitle>
            <DialogDescription>
              {editingSkill
                ? "Update this skill's configuration."
                : "Create a custom skill for your agents."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g., Stripe Integration"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Brief description of what this skill covers"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instructions">Instructions</Label>
              <Textarea
                id="instructions"
                value={form.instructions}
                onChange={(e) =>
                  setForm((f) => ({ ...f, instructions: e.target.value }))
                }
                placeholder="Detailed guidelines the agent should follow..."
                rows={5}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                value={form.tags}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tags: e.target.value }))
                }
                placeholder="stripe, payment, checkout, billing"
                required
              />
              <p className="text-xs text-muted-foreground">
                Skills are matched when any tag appears in the demand
                title, description, or project tech stack.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <div className="flex flex-wrap gap-2">
                {SKILL_CATEGORIES.map((cat) => (
                  <Button
                    key={cat}
                    type="button"
                    variant={form.category === cat ? "default" : "outline"}
                    size="sm"
                    onClick={() => setForm((f) => ({ ...f, category: cat }))}
                  >
                    {CATEGORY_LABELS[cat] ?? cat}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Applicable Phases</Label>
              <div className="flex flex-wrap gap-2">
                {AGENT_PHASES.map((phase) => (
                  <Button
                    key={phase}
                    type="button"
                    variant={
                      form.applicablePhases.includes(phase)
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    onClick={() => togglePhase(phase)}
                  >
                    {PHASE_LABELS[phase] ?? phase}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving
                  ? "Saving..."
                  : editingSkill
                    ? "Update"
                    : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirm !== null}
        onOpenChange={() => setDeleteConfirm(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Skill</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this skill? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
