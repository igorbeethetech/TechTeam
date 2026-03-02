"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type { ClientCreate, ClientUpdate } from "@techteam/shared"

interface Client {
  id: string
  tenantId: string
  name: string
  slug: string
  sector: string
  description: string | null
  color: string
  logoUrl: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  status: string
  metadata: unknown
  createdBy: string
  createdAt: string
  updatedAt: string
  _count?: { reqsProjects: number }
  reqsProjects?: unknown[]
}

export function useClients(status?: string) {
  return useQuery({
    queryKey: ["clients", status],
    queryFn: () => {
      const params = status ? `?status=${status}` : ""
      return api.get<{ clients: Client[] }>(`/api/clients${params}`)
    },
  })
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: ["client", id],
    queryFn: () => api.get<{ client: Client }>(`/api/clients/${id}`),
    enabled: !!id,
  })
}

export function useCreateClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: ClientCreate) => api.post<{ client: Client }>("/api/clients", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] })
    },
  })
}

export function useUpdateClient(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: ClientUpdate) => api.put<{ client: Client }>(`/api/clients/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] })
      queryClient.invalidateQueries({ queryKey: ["client", id] })
    },
  })
}
