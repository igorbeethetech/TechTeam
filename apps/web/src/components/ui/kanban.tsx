"use client"

import * as React from "react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "@/lib/utils"
import { useDroppable } from "@dnd-kit/core"

// =========================================================
// Types
// =========================================================

type KanbanValue = Record<UniqueIdentifier, { id: UniqueIdentifier }[]>

interface KanbanContextValue<T extends { id: UniqueIdentifier }> {
  activeId: UniqueIdentifier | null
  activeItem: T | null
  activeColumn: UniqueIdentifier | null
}

const KanbanContext = React.createContext<KanbanContextValue<any>>({
  activeId: null,
  activeItem: null,
  activeColumn: null,
})

function useKanbanContext() {
  return React.useContext(KanbanContext)
}

// =========================================================
// Kanban (Root)
// =========================================================

interface KanbanProps<T extends { id: UniqueIdentifier }> {
  value: Record<UniqueIdentifier, T[]>
  onValueChange: (value: Record<UniqueIdentifier, T[]>) => void
  onMove?: (item: T, fromColumn: UniqueIdentifier, toColumn: UniqueIdentifier) => void
  getItemValue: (item: T) => UniqueIdentifier
  children: React.ReactNode
  className?: string
}

function Kanban<T extends { id: UniqueIdentifier }>({
  value,
  onValueChange,
  onMove,
  getItemValue,
  children,
  className,
}: KanbanProps<T>) {
  const [activeId, setActiveId] = React.useState<UniqueIdentifier | null>(null)
  const [activeColumn, setActiveColumn] = React.useState<UniqueIdentifier | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 300,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  )

  // Find which column contains an item
  function findColumn(itemId: UniqueIdentifier): UniqueIdentifier | undefined {
    // Check if itemId is a column
    if (itemId in value) return itemId
    for (const [col, items] of Object.entries(value)) {
      if (items.some((item) => getItemValue(item) === itemId)) {
        return col
      }
    }
    return undefined
  }

  function findItem(itemId: UniqueIdentifier): T | undefined {
    for (const items of Object.values(value)) {
      const found = items.find((item) => getItemValue(item) === itemId)
      if (found) return found
    }
    return undefined
  }

  const activeItem = activeId ? findItem(activeId) : null

  function handleDragStart(event: DragStartEvent) {
    const { active } = event
    setActiveId(active.id)
    const col = findColumn(active.id)
    setActiveColumn(col ?? null)
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return

    const activeCol = findColumn(active.id)
    const overCol = findColumn(over.id)

    if (!activeCol || !overCol || activeCol === overCol) return

    // Move item from one column to another
    const newValue = { ...value }
    const activeItems = [...(newValue[activeCol] ?? [])]
    const overItems = [...(newValue[overCol] ?? [])]

    const activeIndex = activeItems.findIndex(
      (item) => getItemValue(item) === active.id
    )
    if (activeIndex === -1) return

    const [movedItem] = activeItems.splice(activeIndex, 1)

    // Find insertion index
    const overIndex = overItems.findIndex(
      (item) => getItemValue(item) === over.id
    )
    if (overIndex >= 0) {
      overItems.splice(overIndex, 0, movedItem!)
    } else {
      overItems.push(movedItem!)
    }

    newValue[activeCol] = activeItems
    newValue[overCol] = overItems
    onValueChange(newValue)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event

    if (over) {
      const activeCol = findColumn(active.id)
      const overCol = findColumn(over.id)

      if (activeCol && overCol) {
        if (activeCol === overCol) {
          // Reorder within same column
          const items = [...(value[activeCol] ?? [])]
          const oldIndex = items.findIndex(
            (item) => getItemValue(item) === active.id
          )
          const newIndex = items.findIndex(
            (item) => getItemValue(item) === over.id
          )
          if (oldIndex !== newIndex && oldIndex >= 0 && newIndex >= 0) {
            const newValue = { ...value }
            newValue[activeCol] = arrayMove(items, oldIndex, newIndex)
            onValueChange(newValue)
          }
        }

        // Notify about cross-column moves
        if (activeColumn && activeCol !== activeColumn) {
          const item = findItem(active.id)
          if (item && onMove) {
            onMove(item, activeColumn, overCol)
          }
        }
      }
    }

    setActiveId(null)
    setActiveColumn(null)
  }

  return (
    <KanbanContext.Provider value={{ activeId, activeItem, activeColumn }}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className={className}>{children}</div>
      </DndContext>
    </KanbanContext.Provider>
  )
}

// =========================================================
// KanbanBoard
// =========================================================

interface KanbanBoardProps {
  children: React.ReactNode
  className?: string
}

function KanbanBoard({ children, className }: KanbanBoardProps) {
  return <div className={cn("flex gap-4", className)}>{children}</div>
}

// =========================================================
// KanbanColumn
// =========================================================

interface KanbanColumnProps {
  value: UniqueIdentifier
  children: React.ReactNode
  className?: string
  items?: UniqueIdentifier[]
}

function KanbanColumn({
  value,
  children,
  className,
  items = [],
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: value })

  return (
    <SortableContext
      id={String(value)}
      items={items}
      strategy={verticalListSortingStrategy}
    >
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-col rounded-lg border bg-muted/40 transition-colors",
          isOver && "bg-muted/80",
          className
        )}
      >
        {children}
      </div>
    </SortableContext>
  )
}

// =========================================================
// KanbanItem + drag handle context
// =========================================================

const KanbanItemContext = React.createContext<{
  listeners: ReturnType<typeof useSortable>["listeners"]
  attributes: ReturnType<typeof useSortable>["attributes"]
  setActivatorNodeRef: ReturnType<typeof useSortable>["setActivatorNodeRef"]
  isDragging: boolean
}>({
  listeners: undefined,
  attributes: {} as ReturnType<typeof useSortable>["attributes"],
  setActivatorNodeRef: () => {},
  isDragging: false,
})

function useKanbanItemHandle() {
  return React.useContext(KanbanItemContext)
}

interface KanbanItemProps {
  value: UniqueIdentifier
  children: React.ReactNode
  asHandle?: boolean
  className?: string
  asChild?: boolean
}

function KanbanItem({
  value,
  children,
  asHandle = false,
  className,
  asChild = false,
}: KanbanItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: value })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const dragProps = asHandle ? { ...attributes, ...listeners } : {}

  const Comp = asChild ? Slot : "div"

  return (
    <KanbanItemContext.Provider
      value={{ listeners, attributes, setActivatorNodeRef, isDragging }}
    >
      <Comp
        ref={setNodeRef}
        style={style}
        className={cn(className)}
        {...dragProps}
      >
        {children}
      </Comp>
    </KanbanItemContext.Provider>
  )
}

// =========================================================
// KanbanOverlay
// =========================================================

interface KanbanOverlayProps {
  children: (props: {
    value: UniqueIdentifier
    variant: "item" | "column"
  }) => React.ReactNode
}

function KanbanOverlay({ children }: KanbanOverlayProps) {
  const { activeId } = useKanbanContext()

  if (!activeId) return null

  return (
    <DragOverlay>
      {children({ value: activeId, variant: "item" })}
    </DragOverlay>
  )
}

export {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanItem,
  KanbanOverlay,
  useKanbanContext,
  useKanbanItemHandle,
}
