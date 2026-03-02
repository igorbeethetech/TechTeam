"use client"

import { useState, useEffect, useRef, useCallback } from "react"

interface UseSpeechRecognitionOptions {
  language?: string
  continuous?: boolean
  interimResults?: boolean
  onChunk?: (text: string, isFinal: boolean) => void
}

export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}) {
  const {
    language = "pt-BR",
    continuous = true,
    interimResults = true,
    onChunk,
  } = options

  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [interimTranscript, setInterimTranscript] = useState("")
  const [isSupported, setIsSupported] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const chunkBufferRef = useRef("")
  const isListeningRef = useRef(false)
  const onChunkRef = useRef(onChunk)

  useEffect(() => {
    onChunkRef.current = onChunk
  }, [onChunk])

  useEffect(() => {
    isListeningRef.current = isListening
  }, [isListening])

  useEffect(() => {
    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition

    setIsSupported(!!SpeechRecognitionAPI)

    if (SpeechRecognitionAPI) {
      const recognition = new SpeechRecognitionAPI()
      recognition.lang = language
      recognition.continuous = continuous
      recognition.interimResults = interimResults
      recognition.maxAlternatives = 1

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = ""
        let final = ""

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          if (result.isFinal) {
            final += result[0].transcript
          } else {
            interim += result[0].transcript
          }
        }

        if (final) {
          setTranscript((prev) => prev + " " + final)
          chunkBufferRef.current += " " + final

          if (chunkBufferRef.current.trim().length > 20) {
            onChunkRef.current?.(chunkBufferRef.current.trim(), true)
            chunkBufferRef.current = ""
          }
        }

        setInterimTranscript(interim)
        if (interim) {
          onChunkRef.current?.(interim, false)
        }
      }

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("Speech recognition error:", event.error)
        if (event.error === "no-speech" || event.error === "aborted") {
          if (isListeningRef.current) {
            try {
              recognition.start()
            } catch {
              // Ignore if already active
            }
          }
        }
      }

      recognition.onend = () => {
        if (isListeningRef.current) {
          try {
            recognition.start()
          } catch {
            // Ignore if already active
          }
        }
      }

      recognitionRef.current = recognition
    }

    return () => {
      recognitionRef.current?.stop()
    }
  }, [language, continuous, interimResults])

  const start = useCallback(() => {
    if (recognitionRef.current && !isListeningRef.current) {
      setIsListening(true)
      setTranscript("")
      setInterimTranscript("")
      chunkBufferRef.current = ""
      recognitionRef.current.start()
    }
  }, [])

  const stop = useCallback(() => {
    if (recognitionRef.current && isListeningRef.current) {
      setIsListening(false)
      recognitionRef.current.stop()

      if (chunkBufferRef.current.trim()) {
        onChunkRef.current?.(chunkBufferRef.current.trim(), true)
        chunkBufferRef.current = ""
      }
    }
  }, [])

  return {
    isListening,
    transcript,
    interimTranscript,
    isSupported,
    start,
    stop,
  }
}
