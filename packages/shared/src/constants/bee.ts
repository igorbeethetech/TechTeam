export const STICKY_CATEGORIES = [
  "problem", "process", "requirement", "integration",
  "risk", "decision", "question", "scope", "persona",
  "constraint", "assumption",
] as const

export type BeeStickyCategory = (typeof STICKY_CATEGORIES)[number]

export const STICKY_CATEGORY_CONFIG: Record<BeeStickyCategory, { color: string; label: { "pt-BR": string; "en-US": string } }> = {
  problem:     { color: "#e74c3c", label: { "pt-BR": "Problema",    "en-US": "Problem" } },
  process:     { color: "#3498db", label: { "pt-BR": "Processo",    "en-US": "Process" } },
  requirement: { color: "#2ecc71", label: { "pt-BR": "Requisito",   "en-US": "Requirement" } },
  integration: { color: "#9b59b6", label: { "pt-BR": "Integração",  "en-US": "Integration" } },
  risk:        { color: "#e67e22", label: { "pt-BR": "Risco",       "en-US": "Risk" } },
  decision:    { color: "#1abc9c", label: { "pt-BR": "Decisão",     "en-US": "Decision" } },
  question:    { color: "#f39c12", label: { "pt-BR": "Pergunta",    "en-US": "Question" } },
  scope:       { color: "#34495e", label: { "pt-BR": "Escopo",      "en-US": "Scope" } },
  persona:     { color: "#e84393", label: { "pt-BR": "Persona",     "en-US": "Persona" } },
  constraint:  { color: "#636e72", label: { "pt-BR": "Restrição",   "en-US": "Constraint" } },
  assumption:  { color: "#fdcb6e", label: { "pt-BR": "Premissa",    "en-US": "Assumption" } },
}

export const CLIENT_SECTORS = [
  "education", "healthcare", "legal", "insurance",
  "finance", "retail", "technology", "other",
] as const

export type BeeClientSector = (typeof CLIENT_SECTORS)[number]

export const SECTOR_LABELS: Record<BeeClientSector, { "pt-BR": string; "en-US": string }> = {
  education:  { "pt-BR": "Educação",    "en-US": "Education" },
  healthcare: { "pt-BR": "Saúde",       "en-US": "Healthcare" },
  legal:      { "pt-BR": "Jurídico",    "en-US": "Legal" },
  insurance:  { "pt-BR": "Seguros",     "en-US": "Insurance" },
  finance:    { "pt-BR": "Financeiro",  "en-US": "Finance" },
  retail:     { "pt-BR": "Varejo",      "en-US": "Retail" },
  technology: { "pt-BR": "Tecnologia",  "en-US": "Technology" },
  other:      { "pt-BR": "Outro",       "en-US": "Other" },
}

export const SUGGESTION_DIMENSIONS = [
  "scope", "exceptions", "data", "permissions", "volume",
  "integrations", "business_rules", "sla", "migration",
  "compliance", "dependencies", "acceptance_criteria",
] as const

export type BeeSuggestionDimension = (typeof SUGGESTION_DIMENSIONS)[number]

export const DIMENSION_LABELS: Record<BeeSuggestionDimension, { "pt-BR": string; "en-US": string }> = {
  scope:               { "pt-BR": "Escopo",               "en-US": "Scope" },
  exceptions:          { "pt-BR": "Exceções",             "en-US": "Exceptions" },
  data:                { "pt-BR": "Dados",                "en-US": "Data" },
  permissions:         { "pt-BR": "Permissões",           "en-US": "Permissions" },
  volume:              { "pt-BR": "Volume",               "en-US": "Volume" },
  integrations:        { "pt-BR": "Integrações",          "en-US": "Integrations" },
  business_rules:      { "pt-BR": "Regras de Negócio",    "en-US": "Business Rules" },
  sla:                 { "pt-BR": "SLA",                  "en-US": "SLA" },
  migration:           { "pt-BR": "Migração",             "en-US": "Migration" },
  compliance:          { "pt-BR": "Compliance",           "en-US": "Compliance" },
  dependencies:        { "pt-BR": "Dependências",         "en-US": "Dependencies" },
  acceptance_criteria: { "pt-BR": "Critérios de Aceite",  "en-US": "Acceptance Criteria" },
}

export type BeeLanguage = "pt-BR" | "en-US"
