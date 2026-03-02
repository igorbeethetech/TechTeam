"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"

interface AISuggestion {
  id: string
  tenantId: string
  meetingId: string
  suggestionType: string
  text: string
  reason: string | null
  urgency: string
  dimension: string | null
  status: string
  triggerChunkId: string | null
  triggerStickyId: string | null
  createdAt: string
  resolvedAt: string | null
}

export function useAISuggestions(meetingId: string | undefined) {
  return useQuery({
    queryKey: ["ai-suggestions", meetingId],
    queryFn: () =>
      api.get<{ suggestions: AISuggestion[] }>(`/api/ai-suggestions?meetingId=${meetingId}`),
    enabled: !!meetingId,
  })
}

export function useUpdateSuggestion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string; meetingId: string }) =>
      api.patch<{ suggestion: AISuggestion }>(`/api/ai-suggestions/${id}`, { status }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ai-suggestions", variables.meetingId] })
    },
  })
}
