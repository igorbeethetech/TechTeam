"use client"

import { useState } from "react"
import {
  CheckCircle2,
  XCircle,
  ExternalLink,
  GitBranch,
  Globe,
  FileText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CopyButton } from "@/components/ui/copy-button"
import { api } from "@/lib/api"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useTranslation } from "@/i18n/language-context"

interface ReviewSectionProps {
  demandId: string
  projectId: string
  branchName: string | null
  prUrl: string | null
  repoUrl?: string
  testInstructions?: string | null
  previewUrlTemplate?: string | null
}

export function ReviewSection({
  demandId,
  projectId,
  branchName,
  prUrl,
  repoUrl,
  testInstructions,
  previewUrlTemplate,
}: ReviewSectionProps) {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const [isApproving, setIsApproving] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [feedback, setFeedback] = useState("")

  const previewUrl = previewUrlTemplate && branchName
    ? previewUrlTemplate.replace("{branch}", encodeURIComponent(branchName))
    : null

  const handleApprove = async () => {
    setIsApproving(true)
    try {
      await api.post(`/api/demands/${demandId}/review`, { action: "approve" })
      toast.success(t("review.demandApproved"))
      queryClient.invalidateQueries({ queryKey: ["demand", demandId] })
      queryClient.invalidateQueries({ queryKey: ["demands", projectId] })
    } catch (err) {
      toast.error(t("review.failedToApprove"))
    } finally {
      setIsApproving(false)
    }
  }

  const handleReject = async () => {
    if (!feedback.trim()) {
      toast.error("Please provide feedback explaining the issue")
      return
    }
    setIsRejecting(true)
    try {
      await api.post(`/api/demands/${demandId}/review`, {
        action: "reject",
        feedback: feedback.trim(),
      })
      toast.success(t("review.demandRejected"))
      setShowRejectForm(false)
      setFeedback("")
      queryClient.invalidateQueries({ queryKey: ["demand", demandId] })
      queryClient.invalidateQueries({ queryKey: ["demands", projectId] })
    } catch (err) {
      toast.error(t("review.failedToReject"))
    } finally {
      setIsRejecting(false)
    }
  }

  return (
    <Card className="border-2 border-amber-200 bg-amber-50/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="size-5 text-amber-600" />
          {t("review.humanReviewRequired")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("review.automatedTestingPassed")}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Test Links */}
        <div className="space-y-3">
          {/* PR Link */}
          {prUrl && (
            <div className="flex items-center justify-between rounded-md border bg-white p-3">
              <div className="flex items-center gap-2">
                <ExternalLink className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">{t("review.pullRequest")}</span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 underline hover:text-blue-800"
                >
                  {prUrl.split("/").slice(-2).join("/")}
                </a>
                <CopyButton text={prUrl} label="PR URL" />
              </div>
            </div>
          )}

          {/* Branch Name */}
          {branchName && (
            <div className="flex items-center justify-between rounded-md border bg-white p-3">
              <div className="flex items-center gap-2">
                <GitBranch className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">{t("review.branch")}</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="rounded bg-muted px-2 py-0.5 text-sm font-mono">
                  {branchName}
                </code>
                <CopyButton text={branchName} label="branch name" />
              </div>
            </div>
          )}

          {/* Preview URL */}
          {previewUrl && (
            <div className="flex items-center justify-between rounded-md border bg-white p-3">
              <div className="flex items-center gap-2">
                <Globe className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">{t("review.preview")}</span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 underline hover:text-blue-800"
                >
                  {t("review.preview")}
                </a>
                <CopyButton text={previewUrl} label="preview URL" />
              </div>
            </div>
          )}

          {/* Git Checkout Command */}
          {branchName && (
            <div className="flex items-center justify-between rounded-md border bg-white p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{t("review.localTest")}</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="rounded bg-muted px-2 py-0.5 text-xs font-mono">
                  git checkout {branchName}
                </code>
                <CopyButton
                  text={`git fetch origin && git checkout ${branchName}`}
                  label="checkout command"
                />
              </div>
            </div>
          )}
        </div>

        {/* Test Instructions */}
        {testInstructions && (
          <div className="rounded-md border bg-white p-3">
            <p className="mb-2 text-sm font-medium">{t("review.testingInstructions")}</p>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {testInstructions}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            onClick={handleApprove}
            disabled={isApproving || isRejecting}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            {isApproving ? (
              t("review.approving")
            ) : (
              <>
                <CheckCircle2 className="mr-2 size-4" />
                {t("review.approveAndComplete")}
              </>
            )}
          </Button>
          <Button
            variant="destructive"
            onClick={() => setShowRejectForm(!showRejectForm)}
            disabled={isApproving || isRejecting}
            className="flex-1"
          >
            <XCircle className="mr-2 size-4" />
            {t("review.reject")}
          </Button>
        </div>

        {/* Reject Feedback Form */}
        {showRejectForm && (
          <div className="space-y-3 rounded-md border border-red-200 bg-red-50/50 p-3">
            <p className="text-sm font-medium text-red-800">
              {t("review.whatNeedsToBeFixed")}
            </p>
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder={t("review.describeFeedback")}
              rows={3}
              className="bg-white"
            />
            <Button
              onClick={handleReject}
              disabled={isRejecting || !feedback.trim()}
              variant="destructive"
              size="sm"
            >
              {isRejecting ? t("review.rejecting") : t("review.submitRejection")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
