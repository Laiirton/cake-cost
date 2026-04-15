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
    setDraftValue(formatEditableValue(value))
    userOnFocus?.(event)
  }

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.target.value
    setDraftValue(rawValue)
    emitValue(rawValue)
  }

  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false)
    const rawValue = draftValue ?? event.target.value
    setDraftValue(null)
    emitValue(rawValue)
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
      {isFocused && draftValue !== null && draftValue !== '' && draftValue !== formatEditableValue(value) && (
        <div 
          className="currency-field-feedback"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 10,
            fontSize: '0.6875rem',
            color: 'var(--brand-600)',
            marginTop: 4,
            fontWeight: 600,
            pointerEvents: 'none'
          }}
        >
          Interpretação: {formatCommittedValue(parseCurrencyInput(draftValue))}
        </div>
      )}
    </div>
  )
}
