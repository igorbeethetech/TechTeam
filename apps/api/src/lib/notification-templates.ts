import type { SupportedLanguage } from "./i18n.js"

interface NotificationTemplate {
  title: string
  message: string
}

type TemplateParams = Record<string, string>

function interpolate(template: string, params: TemplateParams): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? `{${key}}`)
}

const TEMPLATES: Record<string, Record<SupportedLanguage, NotificationTemplate>> = {
  agent_failed: {
    "pt-BR": { title: "Agente falhou: {phase}", message: "Agente falhou para \"{title}\" durante a fase de {phase}. Erro: {error}" },
    "en-US": { title: "Agent failed: {phase}", message: "Agent failed for \"{title}\" during {phase} phase. Error: {error}" },
  },
  demand_ready_for_review: {
    "pt-BR": { title: "Pronta para revisão", message: "\"{title}\" passou nos testes automatizados e está pronta para revisão humana." },
    "en-US": { title: "Ready for review", message: "\"{title}\" passed automated testing and is ready for human review." },
  },
  demand_done: {
    "pt-BR": { title: "Demanda concluída", message: "\"{title}\" foi aprovada e marcada como concluída." },
    "en-US": { title: "Demand completed", message: "\"{title}\" has been approved and marked as done." },
  },
  demand_rejected: {
    "pt-BR": { title: "Demanda rejeitada", message: "\"{title}\" foi rejeitada durante a revisão: {feedback}" },
    "en-US": { title: "Demand rejected", message: "\"{title}\" was rejected during review: {feedback}" },
  },
  demand_cancelled: {
    "pt-BR": { title: "Demanda cancelada", message: "\"{title}\" foi cancelada." },
    "en-US": { title: "Demand cancelled", message: "\"{title}\" was cancelled." },
  },
}

export function getNotificationText(
  type: string,
  language: SupportedLanguage,
  params: TemplateParams
): NotificationTemplate {
  const template = TEMPLATES[type]?.[language] ?? TEMPLATES[type]?.["en-US"]
  if (!template) return { title: type, message: "" }
  return {
    title: interpolate(template.title, params),
    message: interpolate(template.message, params),
  }
}
