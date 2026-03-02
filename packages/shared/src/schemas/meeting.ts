import { z } from "zod"

export const meetingCreateSchema = z.object({
  reqsProjectId: z.string().min(1, "Project is required"),
  title: z.string().min(2, "Title must be at least 2 characters").max(200),
  scheduledAt: z.string().optional(),
  participants: z.array(z.string()).default([]),
  notes: z.string().max(5000).optional(),
})

export const meetingUpdateSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  status: z.enum(["scheduled", "recording", "processing", "completed"]).optional(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  durationSeconds: z.number().int().min(0).optional(),
  audioUrl: z.string().url().optional(),
  participants: z.array(z.string()).optional(),
  summary: z.string().optional(),
  notes: z.string().max(5000).optional(),
})

export type MeetingCreate = z.infer<typeof meetingCreateSchema>
export type MeetingUpdate = z.infer<typeof meetingUpdateSchema>
