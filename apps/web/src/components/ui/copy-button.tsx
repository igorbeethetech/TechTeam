"use client"

import { useState } from "react"
import { Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"

interface CopyButtonProps {
  text: string
  label?: string
  className?: string
}

export function CopyButton({ text, label, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className={`h-7 gap-1 px-2 text-xs ${className ?? ""}`}
      title={label ? `Copy ${label}` : "Copy"}
    >
      {copied ? (
        <Check className="size-3 text-green-600" />
      ) : (
        <Copy className="size-3" />
      )}
      {copied ? "Copied!" : "Copy"}
    </Button>
  )
}
