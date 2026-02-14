import { BoardsGrid } from "@/components/boards/boards-grid"

export default function BoardsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Boards</h1>
        <p className="text-muted-foreground">Select a project to view its Kanban board</p>
      </div>
      <BoardsGrid />
    </div>
  )
}
