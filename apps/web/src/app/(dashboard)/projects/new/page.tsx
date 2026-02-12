"use client"

import { ProjectForm } from "@/components/projects/project-form"

export default function NewProjectPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">New Project</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Set up a new project for your team.
        </p>
      </div>
      <ProjectForm />
    </div>
  )
}
