// Shared utility functions for the bakery dashboard

/**
 * Format a number as Brazilian Real currency
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

/**
 * Format a string as phone mask (XX) XXXXX-XXXX
 */
export function formatPhone(value: string): string {
  const numbers = value.replace(/\D/g, '')
  if (numbers.length <= 10) {
    return numbers.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  }
  return numbers.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
}

/**
 * Clean currency string to number
 */
export function parseCurrency(value: string): number {
  return Number(value.replace(/\D/g, '')) / 100
}

/**
 * Format a date string to Brazilian format
 */
export function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  try {
    // Treat as UTC to avoid timezone shifts
    const [y, m, d] = dateStr.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('pt-BR')
  } catch {
    return dateStr
  }
}

/**
 * Format a datetime string to Brazilian format
 */
export function formatDateTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

/**
 * Ingredient from the database
 */
export interface Ingredient {
  id: string
  name: string
  purchase_quantity: number
  purchase_unit: string
  purchase_price: number
  updated_year: number
  notes: string
  display_order: number
}

/**
 * A single ingredient item within a recipe section
 */
export interface RecipeItem {
  uid: string // client‐side unique key
  section: 'massa' | 'recheio' | 'cobertura' | 'decoracao' | 'extras'
  ingredient_id: string
  quantity: number
  unit: string
}

/**
 * Sections available for a recipe
 */
export const RECIPE_SECTIONS = [
  { key: 'massa' as const, label: 'Massa', emoji: '🍞' },
  { key: 'recheio' as const, label: 'Recheio', emoji: '🍫' },
  { key: 'cobertura' as const, label: 'Cobertura', emoji: '🎂' },
  { key: 'decoracao' as const, label: 'Decoração', emoji: '✨' },
  { key: 'extras' as const, label: 'Extras', emoji: '📦' },
]

/**
 * Format a phone number with mask (XX) XXXXX-XXXX or (XX) XXXX-XXXX
 */
export function formatPhoneInput(value: string): string {
  const numbers = value.replace(/\D/g, '').slice(0, 11)
  if (numbers.length <= 10) {
    // (XX) XXXX-XXXX
    return numbers
      .replace(/(\d{0,2})(\d{0,4})(\d{0,4})/, (_, p1, p2, p3) => {
        if (!p2) return p1 ? `(${p1}` : ''
        if (!p3) return `(${p1}) ${p2}`
        return `(${p1}) ${p2}-${p3}`
      })
  }
  // (XX) XXXXX-XXXX
  return numbers
    .replace(/(\d{0,2})(\d{0,5})(\d{0,4})/, (_, p1, p2, p3) => {
      if (!p2) return p1 ? `(${p1}` : ''
      if (!p3) return `(${p1}) ${p2}`
      return `(${p1}) ${p2}-${p3}`
    })
}

/**
 * Clean phone string to only numbers
 */
export function cleanPhone(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * Format a number as currency input with R$ mask
 */
export function formatCurrencyInput(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) || 0 : value
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(num)
}

const currencyInputDisplayFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const currencyInputDraftFormatter = new Intl.NumberFormat('pt-BR', {
  useGrouping: false,
  maximumFractionDigits: 20,
})

/**
 * Format a number for a BRL input when it is not being edited.
 */
export function formatCurrencyInputDisplay(value: number): string {
  if (!Number.isFinite(value)) return ''
  return currencyInputDisplayFormatter.format(value)
}

/**
 * Format a number for editable BRL input text while the field is focused.
 */
export function formatCurrencyInputDraft(value: number): string {
  if (!Number.isFinite(value)) return ''
  return currencyInputDraftFormatter.format(value)
}

/**
 * Parse currency string to number (removes formatting)
 */
export function parseCurrencyInput(value: string): number {
  const cleaned = value.trim().replace(/[^\d,.-]/g, '')
  if (!cleaned) return 0

  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  const separatorIndex = Math.max(lastComma, lastDot)

  if (separatorIndex === -1) {
    return Number(cleaned.replace(/\D/g, '')) || 0
  }

  const integerPart = cleaned.slice(0, separatorIndex).replace(/[^\d-]/g, '')
  const decimalPart = cleaned.slice(separatorIndex + 1).replace(/\D/g, '')
  const normalized = `${integerPart || '0'}.${decimalPart}`

  return Number(normalized) || 0
}

/**
 * Extract a useful message from an unknown error value.
 */
export function getErrorMessage(error: unknown, fallback = 'Erro desconhecido'): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) {
      return message
    }
  }

  return fallback
}

/**
 * Calculate the cost of a recipe item based on ingredient purchase info.
 * cost = (quantity_used / purchase_quantity) × purchase_price
 */
export function calculateItemCost(
  item: RecipeItem,
  ingredient: Ingredient | undefined
): number {
  if (!ingredient || ingredient.purchase_quantity <= 0) return 0

  let adjustedQty = item.quantity
  const iu = ingredient.purchase_unit.toLowerCase()
  const ru = item.unit.toLowerCase()

  // Convert recipe unit to ingredient unit if needed
  if (ru === 'g' && iu === 'kg') adjustedQty = item.quantity / 1000
  else if (ru === 'kg' && iu === 'g') adjustedQty = item.quantity * 1000
  else if (ru === 'ml' && iu === 'l') adjustedQty = item.quantity / 1000
  else if (ru === 'l' && iu === 'ml') adjustedQty = item.quantity * 1000
  else if (ru === 'un' && iu === 'dz') adjustedQty = item.quantity / 12
  else if (ru === 'dz' && iu === 'un') adjustedQty = item.quantity * 12

  return (adjustedQty / ingredient.purchase_quantity) * ingredient.purchase_price
}

/**
 * Calculate total cost of all recipe items
 */
export function calculateRecipeTotalCost(
  items: RecipeItem[],
  ingredientsMap: Map<string, Ingredient>
): number {
  return items.reduce((total, item) => {
    return total + calculateItemCost(item, ingredientsMap.get(item.ingredient_id))
  }, 0)
}

/**
 * Calculate section subtotal
 */
export function calculateSectionCost(
  items: RecipeItem[],
  section: string,
  ingredientsMap: Map<string, Ingredient>
): number {
  return items
    .filter(i => i.section === section)
    .reduce((total, item) => {
      return total + calculateItemCost(item, ingredientsMap.get(item.ingredient_id))
    }, 0)
}

/**
 * Full pricing breakdown for a cake/product
 */
export interface PricingBreakdown {
  ingredientCost: number        // total ingredient cost from recipe
  sectionCosts: Record<string, number>  // cost per section
  extraItemsCost: number        // topper, etc (manual)
  laborCost: number             // labor_hours × labor_hour_rate
  fixedCostPerOrder: number     // monthly_fixed_cost / monthly_order_goal
  packagingCost: number
  deliveryCost: number
  totalCost: number             // sum of all costs
  markupPct: number
  markupAmount: number          // totalCost × (markupPct / 100)
  suggestedPrice: number        // totalCost + markupAmount
  salePrice: number             // final price (may be rounded)
  profit: number                // salePrice - totalCost
  profitMargin: number          // (profit / salePrice) × 100
}

/**
 * Calculate the full pricing breakdown
 */
export function calculatePricing(params: {
  items: RecipeItem[]
  ingredientsMap: Map<string, Ingredient>
  extraItems: Array<{ name: string; cost: number }>
  laborHours: number
  laborHourRate: number
  monthlyFixedCost: number
  monthlyOrderGoal: number
  packagingCost: number
  deliveryCost: number
  markupPct: number
  salePrice?: number // if manually set
}): PricingBreakdown {
  const sectionCosts: Record<string, number> = {}
  for (const sec of RECIPE_SECTIONS) {
    sectionCosts[sec.key] = calculateSectionCost(
      params.items,
      sec.key,
      params.ingredientsMap
    )
  }

  const ingredientCost = Object.values(sectionCosts).reduce((a, b) => a + b, 0)
  const extraItemsCost = params.extraItems.reduce((sum, e) => sum + e.cost, 0)
  const laborCost = params.laborHours * params.laborHourRate
  const fixedCostPerOrder =
    params.monthlyOrderGoal > 0
      ? params.monthlyFixedCost / params.monthlyOrderGoal
      : 0

  const totalCost =
    ingredientCost +
    extraItemsCost +
    laborCost +
    fixedCostPerOrder +
    params.packagingCost +
    params.deliveryCost

  const markupAmount = totalCost * (params.markupPct / 100)
  const suggestedPrice = totalCost + markupAmount
  const salePrice = params.salePrice ?? suggestedPrice
  const profit = salePrice - totalCost
  const profitMargin = salePrice > 0 ? (profit / salePrice) * 100 : 0

  return {
    ingredientCost,
    sectionCosts,
    extraItemsCost,
    laborCost,
    fixedCostPerOrder,
    packagingCost: params.packagingCost,
    deliveryCost: params.deliveryCost,
    totalCost,
    markupPct: params.markupPct,
    markupAmount,
    suggestedPrice,
    salePrice,
    profit,
    profitMargin,
  }
}

/**
 * Generate a simple UID for client-side list keys
 */
export function uid(): string {
  return Math.random().toString(36).substring(2, 10)
}

/**
 * Format string as date mask dd/mm/aaaa
 */
export function formatDateMask(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  return digits
    .replace(/(\d{2})(\d)/, '$1/$2')
    .replace(/(\d{2})(\d{2})(\d)/, '$1/$2/$3')
}

/**
 * Normalizes a dd/mm/aaaa string to yyyy-mm-dd
 */
export function normalizeDate(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 8) return ''
  const d = digits.slice(0, 2)
  const m = digits.slice(2, 4)
  const y = digits.slice(4, 8)
  return `${y}-${m}-${d}`
}

/**
 * Converts yyyy-mm-dd to dd/mm/aaaa for input display
 */
export function toDateInputValue(value: string): string {
  if (!value) return ''
  const parts = value.split('-')
  if (parts.length !== 3) return value
  const [y, m, d] = parts
  return `${d}/${m}/${y}`
}
