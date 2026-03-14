export type SupportedLanguage = "pt-BR" | "en-US"

export function getLanguageInstruction(language: SupportedLanguage): string {
  if (language === "en-US") return ""

  return `
IMPORTANT LANGUAGE REQUIREMENT: All human-readable text in your response MUST be written in Brazilian Portuguese (pt-BR).
This includes: summaries, descriptions, requirement text, ambiguity questions, task titles, risk descriptions,
code review comments, rejection reasons, approach descriptions, notes, and any other text meant for humans to read.
Technical terms (e.g., API, SDK, REST), code, identifiers, file paths, and JSON keys MUST remain in English.
Do NOT translate code, variable names, or file paths.
`.trim()
}

export async function getTenantLanguage(tenantId: string): Promise<SupportedLanguage> {
  // Import prisma inline to avoid circular deps
  const { prisma } = await import("@techteam/database")
  const settings = await prisma.tenantSettings.findUnique({ where: { tenantId } })
  return (settings?.beeLanguage as SupportedLanguage) ?? "pt-BR"
}
