"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type { ReqsProjectCreate, ReqsProjectUpdate } from "@techteam/shared"

interface ReqsProject {
  id: string
  tenantId: string
  clientId: string
  name: string
  slug: string
  description: string | null
  status: string
  projectType: string | null
  estimatedHours: number | null
  estimatedValue: number | null
  startDate: string | null
  deadline: string | null
  metadata: unknown
  createdBy: string
  createdAt: string
  updatedAt: string
  client?: { id: string; name: string; sector: string; color: string }
  meetings?: unknown[]
  _count?: { meetings: number; stickies: number }
}

export function useReqsProjects(clientId?: string) {
  return useQuery({
    queryKey: ["reqs-projects", clientId],
    queryFn: () => {
      const params = clientId ? `?clientId=${clientId}` : ""
      return api.get<{ reqsProjects: ReqsProject[] }>(`/api/reqs-projects${params}`)
    },
  })
}

export function useReqsProject(id: string | undefined) {
  return useQuery({
    queryKey: ["reqs-project", id],
    queryFn: () => api.get<{ reqsProject: ReqsProject }>(`/api/reqs-projects/${id}`),
    enabled: !!id,
  })
}

export function useCreateReqsProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: ReqsProjectCreate) =>
      api.post<{ reqsProject: ReqsProject }>("/api/reqs-projects", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["reqs-projects"] })
      queryClient.invalidateQueries({ queryKey: ["client", variables.clientId] })
    },
  })
}

export function useUpdateReqsProject(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: ReqsProjectUpdate) =>
      api.put<{ reqsProject: ReqsProject }>(`/api/reqs-projects/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reqs-projects"] })
      queryClient.invalidateQueries({ queryKey: ["reqs-project", id] })
    },
  })
}
