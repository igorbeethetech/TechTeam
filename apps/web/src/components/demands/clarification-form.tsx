"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Loader2, Send } from "lucide-react"
import { api } from "@/lib/api"

interface Ambiguity {
  question: string
  context: string
}

interface ClarificationFormProps {
  demandId: string
  ambiguities: Ambiguity[]
}

export function ClarificationForm({ demandId, ambiguities }: ClarificationFormProps) {
  const queryClient = useQueryClient()
  const [answers, setAnswers] = useState<Record<number, string>>(
    () => Object.fromEntries(ambiguities.map((_, i) => [i, ""]))
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allAnswered = ambiguities.every((_, i) => answers[i]?.trim())

  async function handleSubmit() {
    if (!allAnswered) return

    setIsSubmitting(true)
    setError(null)

    try {
      const payload = ambiguities.map((amb, i) => ({
        question: amb.question,
        answer: answers[i]!.trim(),
      }))

      await api.post(`/api/demands/${demandId}/clarify`, { answers: payload })
      queryClient.invalidateQueries({ queryKey: ["demand", demandId] })
      queryClient.invalidateQueries({ queryKey: ["agent-runs", demandId] })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit clarifications")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {ambiguities.map((ambiguity, index) => (
        <div key={index} className="space-y-2 rounded-lg border p-4">
          <p className="text-sm font-medium">{ambiguity.question}</p>
          <p className="text-xs text-muted-foreground">{ambiguity.context}</p>
          <textarea
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            rows={3}
            placeholder="Your answer..."
            value={answers[index] ?? ""}
            onChange={(e) =>
              setAnswers((prev) => ({ ...prev, [index]: e.target.value }))
            }
            disabled={isSubmitting}
          />
        </div>
      ))}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <Button
        onClick={handleSubmit}
        disabled={!allAnswered || isSubmitting}
      >
        {isSubmitting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Send className="size-4" />
        )}
        Submit Answers & Resume Agent
      </Button>
    </div>
  )
}
