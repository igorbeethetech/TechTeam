"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type { MeetingCreate, MeetingUpdate } from "@techteam/shared"

interface Meeting {
  id: string
  tenantId: string
  reqsProjectId: string
  title: string
  meetingNumber: number
  status: string
  scheduledAt: string | null
  startedAt: string | null
  endedAt: string | null
  durationSeconds: number | null
  audioUrl: string | null
  participants: string[]
  summary: string | null
  notes: string | null
  aiAnalysis: unknown
  metadata: unknown
  createdBy: string
  createdAt: string
  updatedAt: string
  reqsProject?: {
    id: string
    name: string
    clientId: string
    client: { id: string; name: string; sector: string }
  }
  _count?: { stickies: number; aiSuggestions: number; transcriptChunks: number }
}

interface TranscriptChunk {
  id: string
  meetingId: string
  chunkIndex: number
  text: string
  speaker: string | null
  timestampStart: number | null
  timestampEnd: number | null
  confidence: number | null
  isProcessed: boolean
  createdAt: string
}

export function useMeetings(reqsProjectId: string | undefined) {
  return useQuery({
    queryKey: ["meetings", reqsProjectId],
    queryFn: () =>
      api.get<{ meetings: Meeting[] }>(`/api/meetings?reqsProjectId=${reqsProjectId}`),
    enabled: !!reqsProjectId,
  })
}

export function useMeeting(id: string | undefined) {
  return useQuery({
    queryKey: ["meeting", id],
    queryFn: () => api.get<{ meeting: Meeting }>(`/api/meetings/${id}`),
    enabled: !!id,
  })
}

export function useCreateMeeting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: MeetingCreate) =>
      api.post<{ meeting: Meeting }>("/api/meetings", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["meetings", variables.reqsProjectId] })
    },
  })
}

export function useUpdateMeeting(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: MeetingUpdate) =>
      api.patch<{ meeting: Meeting }>(`/api/meetings/${id}`, data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["meeting", id] })
      queryClient.invalidateQueries({ queryKey: ["meetings", result.meeting.reqsProjectId] })
    },
  })
}

export function useTranscript(meetingId: string | undefined) {
  return useQuery({
    queryKey: ["transcript", meetingId],
    queryFn: () =>
      api.get<{ chunks: TranscriptChunk[] }>(`/api/meetings/${meetingId}/transcript`),
    enabled: !!meetingId,
  })
}
