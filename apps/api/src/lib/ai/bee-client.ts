import { prisma } from "@techteam/database"
import type { BeeLanguage } from "@techteam/shared"

interface BeeSettings {
  anthropicApiKey: string
  beeLanguage: BeeLanguage
}

/**
 * Fetches the Anthropic API key and Bee language from TenantSettings.
 * Throws if no API key is configured.
 */
export async function getBeeSettings(tenantId: string): Promise<BeeSettings> {
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: { anthropicApiKey: true, beeLanguage: true },
  })

  if (!settings?.anthropicApiKey) {
    throw new Error("Anthropic API key not configured. Please set it in Settings.")
  }

  return {
    anthropicApiKey: settings.anthropicApiKey,
    beeLanguage: (settings.beeLanguage as BeeLanguage) || "pt-BR",
  }
}
