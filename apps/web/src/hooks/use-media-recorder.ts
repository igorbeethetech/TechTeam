"use client"

import { useState, useRef, useCallback } from "react"

interface UseMediaRecorderOptions {
  mimeType?: string
  audioBitsPerSecond?: number
}

export function useMediaRecorder(options: UseMediaRecorderOptions = {}) {
  const {
    mimeType = "audio/webm;codecs=opus",
    audioBitsPerSecond = 128000,
  } = options

  const [isRecording, setIsRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [duration, setDuration] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 44100,
      },
    })

    const supportedMimeType = MediaRecorder.isTypeSupported(mimeType)
      ? mimeType
      : "audio/webm"

    const recorder = new MediaRecorder(stream, {
      mimeType: supportedMimeType,
      audioBitsPerSecond,
    })

    chunksRef.current = []

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data)
      }
    }

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: supportedMimeType })
      setAudioBlob(blob)
      stream.getTracks().forEach((track) => track.stop())
    }

    recorder.start(1000)
    mediaRecorderRef.current = recorder
    setIsRecording(true)
    setAudioBlob(null)
    startTimeRef.current = Date.now()

    timerRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
  }, [mimeType, audioBitsPerSecond])

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isRecording])

  return {
    isRecording,
    audioBlob,
    duration,
    start,
    stop,
  }
}
