'use client'

import React, { useEffect, useState } from 'react'
import { formatCurrencyInput } from '@/lib/utils'

interface CurrencyInputProps {
  value: number
  onChange: (value: number) => void
  placeholder?: string
  className?: string
}

export default function CurrencyInput({ value, onChange, placeholder = '0,00', className = '' }: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState('')

  useEffect(() => {
    const formatted = formatCurrencyInput(value)
    if (displayValue !== formatted && !document.activeElement?.classList.contains('form-input')) {
      setDisplayValue(formatted)
    }
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    const digits = val.replace(/\D/g, '')
    const amount = parseInt(digits) / 100 || 0
    const formatted = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(amount)
    
    setDisplayValue(formatted)
    onChange(amount)
  }

  return (
    <input
      className={`form-input ${className}`}
      type="text"
      value={displayValue || placeholder}
      onChange={handleChange}
      placeholder={placeholder}
    />
  )
}
