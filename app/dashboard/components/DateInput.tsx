'use client'

import React, { useState, useEffect } from 'react'
import { formatDateMask, normalizeDate, toDateInputValue } from '@/lib/utils'

interface DateInputProps {
  value: string // yyyy-mm-dd
  onChange: (value: string) => void
  label: string
  className?: string
  hasError?: boolean
}

export default function DateInput({ value, onChange, label, className = '', hasError }: DateInputProps) {
  const [displayValue, setDisplayValue] = useState('')

  // Sync internal display value when prop changes (e.g. on load or reset)
  useEffect(() => {
    setDisplayValue(toDateInputValue(value))
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const masked = formatDateMask(raw)
    setDisplayValue(masked)

    // Only emit when complete (8 digits)
    const normalized = normalizeDate(masked)
    if (normalized) {
      onChange(normalized)
    } else if (masked === '') {
      onChange('')
    }
  }

  return (
    <div className={`form-group ${hasError ? 'has-error' : ''} ${className}`}>
      <label className="form-label">{label}</label>
      <input
        type="text"
        className="form-input"
        placeholder="dd/mm/aaaa"
        value={displayValue}
        onChange={handleChange}
        maxLength={10}
      />
    </div>
  )
}
