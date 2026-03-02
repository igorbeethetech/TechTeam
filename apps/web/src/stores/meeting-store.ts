import { create } from "zustand"

interface MeetingState {
  activeMeetingId: string | null
  isRecording: boolean
  recordingSeconds: number
  transcript: string
  interimTranscript: string
  chunkIndex: number
  aiPanelOpen: boolean
  activeTab: "board" | "docs" | "charts"
  selectedCategories: string[]

  setActiveMeeting: (id: string | null) => void
  setIsRecording: (recording: boolean) => void
  incrementSeconds: () => void
  resetTimer: () => void
  appendTranscript: (text: string) => void
  setInterimTranscript: (text: string) => void
  incrementChunkIndex: () => number
  toggleAiPanel: () => void
  setActiveTab: (tab: "board" | "docs" | "charts") => void
  toggleCategory: (category: string) => void
  clearCategories: () => void
  reset: () => void
}

const initialState = {
  activeMeetingId: null,
  isRecording: false,
  recordingSeconds: 0,
  transcript: "",
  interimTranscript: "",
  chunkIndex: 0,
  aiPanelOpen: true,
  activeTab: "board" as const,
  selectedCategories: [] as string[],
}

export const useMeetingStore = create<MeetingState>((set, get) => ({
  ...initialState,

  setActiveMeeting: (id) => set({ activeMeetingId: id }),
  setIsRecording: (recording) => set({ isRecording: recording }),
  incrementSeconds: () => set((s) => ({ recordingSeconds: s.recordingSeconds + 1 })),
  resetTimer: () => set({ recordingSeconds: 0 }),
  appendTranscript: (text) => set((s) => ({ transcript: s.transcript + " " + text })),
  setInterimTranscript: (text) => set({ interimTranscript: text }),
  incrementChunkIndex: () => {
    const current = get().chunkIndex
    set({ chunkIndex: current + 1 })
    return current
  },
  toggleAiPanel: () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),
  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleCategory: (category) =>
    set((s) => ({
      selectedCategories: s.selectedCategories.includes(category)
        ? s.selectedCategories.filter((c) => c !== category)
        : [...s.selectedCategories, category],
    })),
  clearCategories: () => set({ selectedCategories: [] }),
  reset: () => set(initialState),
}))
