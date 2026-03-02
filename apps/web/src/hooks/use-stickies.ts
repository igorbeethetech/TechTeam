"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type { StickyCreate, StickyUpdate } from "@techteam/shared"

interface Sticky {
  id: string
  tenantId: string
  meetingId: string
  reqsProjectId: string
  category: string
  text: string
  details: string | null
  priority: string
  status: string
  source: string
  positionX: number
  positionY: number
  boardColumn: string | null
  transcriptChunkId: string | null
  timestampRef: string | null
  tags: string[]
  relatedStickyIds: string[]
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export function useStickies(params: { reqsProjectId?: string; meetingId?: string }) {
  const searchParams = new URLSearchParams()
  if (params.reqsProjectId) searchParams.set("reqsProjectId", params.reqsProjectId)
  if (params.meetingId) searchParams.set("meetingId", params.meetingId)
  const query = searchParams.toString()

  return useQuery({
    queryKey: ["stickies", params.reqsProjectId, params.meetingId],
    queryFn: () => api.get<{ stickies: Sticky[] }>(`/api/stickies?${query}`),
    enabled: !!(params.reqsProjectId || params.meetingId),
  })
}

export function useCreateSticky() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: StickyCreate) =>
      api.post<{ sticky: Sticky }>("/api/stickies", data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["stickies", result.sticky.reqsProjectId] })
    },
  })
}

export function useUpdateSticky() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: StickyUpdate }) =>
      api.patch<{ sticky: Sticky }>(`/api/stickies/${id}`, data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["stickies", result.sticky.reqsProjectId] })
    },
  })
}

export function useDeleteSticky() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reqsProjectId }: { id: string; reqsProjectId: string }) =>
      api.delete(`/api/stickies/${id}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["stickies", variables.reqsProjectId] })
    },
  })
}
