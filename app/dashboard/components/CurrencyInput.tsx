'use client'

import React, { useState } from 'react'
import {
  formatCurrencyInputDisplay,
  formatCurrencyInputDraft,
  parseCurrencyInput,
} from '@/lib/utils'

type CurrencyInputBaseProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange' | 'type'
>

type CurrencyInputNonNullableProps = CurrencyInputBaseProps & {
  nullable?: false
  value: number
  onChange: (value: number) => void
  containerClassName?: string
  containerStyle?: React.CSSProperties
}

type CurrencyInputNullableProps = CurrencyInputBaseProps & {
  nullable: true
  value: number | null
  onChange: (value: number | null) => void
  containerClassName?: string
  containerStyle?: React.CSSProperties
}

type CurrencyInputProps = CurrencyInputNonNullableProps | CurrencyInputNullableProps

function formatEditableValue(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return ''
  }

  return formatCurrencyInputDraft(value)
}

function formatCommittedValue(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return ''
  }

  return formatCurrencyInputDisplay(value)
}

export default function CurrencyInput(props: CurrencyInputProps) {
  const {
    value,
    onChange,
    placeholder = '0,00',
    className = '',
    containerClassName = '',
    containerStyle,
    onFocus: userOnFocus,
    onBlur: userOnBlur,
    autoComplete = 'off',
    spellCheck = false,
    nullable,
    ...inputProps
  } = props

  const [isFocused, setIsFocused] = useState(false)
  const [draftValue, setDraftValue] = useState<string | null>(null)
  const isNullable = nullable === true

  const displayValue = isFocused
    ? draftValue ?? formatEditableValue(value)
    : formatCommittedValue(value)

  const emitValue = (rawValue: string) => {
    if (isNullable && rawValue.trim() === '') {
      (onChange as (nextValue: number | null) => void)(null)
      return
    }

    const nextValue = parseCurrencyInput(rawValue)

    if (isNullable) {
      (onChange as (nextValue: number | null) => void)(nextValue)
      return
    }

    (onChange as (nextValue: number) => void)(nextValue)
  }

  const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true)
    // When focusing, we show the current value already formatted
    setDraftValue(formatCommittedValue(value).replace('R$\u00a0', '').replace('R$', '').trim())
    userOnFocus?.(event)
  }

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.target.value
    
    // Currency mask logic: treat input as digits and divide by 100
    const digits = rawValue.replace(/\D/g, '')
    if (!digits) {
      setDraftValue('')
      if (isNullable) (onChange as (v: number | null) => void)(null)
      else (onChange as (v: number) => void)(0)
      return
    }

    const numericValue = parseInt(digits, 10) / 100
    const formatted = formatCommittedValue(numericValue).replace('R$\u00a0', '').replace('R$', '').trim()
    
    setDraftValue(formatted)
    
    if (isNullable) {
      (onChange as (nextValue: number | null) => void)(numericValue)
    } else {
      (onChange as (nextValue: number) => void)(numericValue)
    }
  }

  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false)
    setDraftValue(null)
    userOnBlur?.(event)
  }

  return (
    <div className={`currency-field ${containerClassName}`.trim()} style={{ ...containerStyle, position: 'relative' }}>
      <span className="currency-field-prefix">R$</span>
      <input
        {...inputProps}
        className={`form-input currency-field-input ${className}`.trim()}
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        autoComplete={autoComplete}
        spellCheck={spellCheck}
      />

    </div>
  )
}
