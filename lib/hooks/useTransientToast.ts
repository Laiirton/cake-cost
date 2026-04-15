'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface ToastState {
  type: string
  message: string
}

export function useTransientToast(duration = 3000) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismissToast = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    setToast(null)
  }, [])

  const showToast = useCallback(
    (type: string, message: string) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      setToast({ type, message })
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null
        setToast(null)
      }, duration)
    },
    [duration]
  )

  useEffect(() => dismissToast, [dismissToast])

  return {
    toast,
    showToast,
    dismissToast,
  }
}
