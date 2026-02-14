---
status: complete
phase: 02-kanban-and-demands
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md]
started: 2026-02-13T19:35:00Z
updated: 2026-02-13T19:35:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Kanban Board with 7 Columns
expected: Navigate to a project and click "View Board". You should see a Kanban board with 7 columns: Inbox, Discovery, Planning, Development, Testing, Merge, Done. Board header shows project name and demand count.
result: pass (fixed — Board button added to ProjectCard)

### 2. Create Demand via Sheet Panel
expected: On the board page, click "New Demand". A side panel (Sheet) should slide in from the right with a form: Title, Description, Priority. Project should be pre-selected. Submit and the sheet closes, demand appears in the Inbox column.
result: pass

### 3. Drag-and-Drop Between Columns
expected: Drag a demand card from the Inbox column to another column (e.g., Discovery). The card should move to the new column and stay there. The change should persist after refreshing the page.
result: pass

### 4. Demand Card Content
expected: Each demand card on the board shows: title, priority badge (color-coded by level: low=gray, medium=blue, high=orange, urgent=red).
result: pass

### 5. Board Auto-Refresh (Polling)
expected: Open the board in two browser tabs. Create a demand in one tab. Within ~5 seconds, the new demand should appear on the board in the other tab without manual refresh.
result: pass

### 6. Demand Detail Page
expected: On the board, click the external link icon on a demand card. You should navigate to /demands/:id showing: title, priority badge, creation date, description, and a pipeline progress bar highlighting the current stage.
result: pass

### 7. Pipeline Progress Bar
expected: On the demand detail page, the pipeline progress bar shows 7 stages. Stages up to the current one are highlighted (filled color). The current stage label is bold.
result: pass

### 8. Dashboard Board Links
expected: On the dashboard home (/), each project card should have a "View Board" link that navigates to that project's Kanban board.
result: pass

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0

## Gaps

- truth: "Navigate to a project and access board from project page"
  status: failed
  reason: "User reported: dentro da página de projeto não tem botão pro board, só na página inicial, tive que acessar por ela"
  severity: major
  test: 1
  root_cause: "ProjectCard component only has Edit/Archive buttons. The 'Board' link only exists on dashboard home page.tsx, not in the ProjectCard used on the projects list page."
  artifacts:
    - path: "apps/web/src/components/projects/project-card.tsx"
      issue: "Missing 'View Board' button — only has Edit and Archive/Unarchive actions"
  missing:
    - "Add Board button with Kanban icon linking to /projects/{id}/board in ProjectCard action buttons"

## User Observations (for future improvements)

- **Navigation/UX:** Pagina de Projects deveria ter botao para acessar o board de cada projeto. Ideal ter uma pagina dedicada "Boards" com selecao de projeto e navegacao lateral estilo Jira para trocar entre projetos.
- **Card clickability:** Textos dentro do demand card deveriam ser clicaveis para navegar ao detalhe (nao apenas o icone de link externo), mantendo o drag-and-drop funcionando normalmente.
