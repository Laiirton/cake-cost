import {
  calculatePricing,
  type Ingredient,
  type PricingBreakdown,
  type RecipeItem,
} from '@/lib/utils'

export interface RecipeSummary {
  id: string
  name: string
  category: string
  size_label: string
  yield_label: string
  items: RecipeItem[]
}

export interface ExtraCostItem {
  uid?: string
  name: string
  cost: number
}

export type PresetAdjustmentKind = 'extra' | 'packaging' | 'delivery'

export interface PresetAdjustment {
  uid?: string
  kind: PresetAdjustmentKind
  name: string
  cost: number
}

export interface CalculatorPreset {
  id: string
  name: string
  recipe_id: string
  recipe_ids: string[]
  size_label: string
  servings: number
  markup_pct: number
  labor_hours: number
  labor_hour_rate: number
  fixed_cost: number
  packaging_cost: number
  delivery_cost: number
  extra_items: ExtraCostItem[]
  adjustments: PresetAdjustment[]
  target_sale_price: number | null
  notes: string
  display_order: number
}

export interface OrderLike {
  status: string
  payment_status: string
  sale_price: number
  deposit_amount: number
  event_date?: string
  delivery_date?: string
}

type ProductionTaskSeed = {
  title: string
  station: string
  dueDate: string
  dueHour: number
  dueMinute: number
}

const ORDER_ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'in_progress'])
const ORDER_CLOSED_STATUSES = new Set(['delivered', 'cancelled'])
const PAYMENT_PENDING_STATUSES = new Set(['pending', 'partial'])

function normalizeExtraItems(items: unknown): ExtraCostItem[] {
  if (!Array.isArray(items)) return []
  return items.reduce<ExtraCostItem[]>((accumulator, item) => {
    if (!item || typeof item !== 'object') return accumulator
    const parsed = item as { uid?: unknown; name?: unknown; cost?: unknown }
    accumulator.push({
      uid: typeof parsed.uid === 'string' ? parsed.uid : undefined,
      name: typeof parsed.name === 'string' ? parsed.name : '',
      cost: typeof parsed.cost === 'number' ? parsed.cost : Number(parsed.cost) || 0,
    })
    return accumulator
  }, [])
}

function normalizeMaybeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeRecipeIds(raw: Record<string, unknown>): string[] {
  if (Array.isArray(raw.recipe_ids)) {
    return raw.recipe_ids.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  }

  if (typeof raw.recipe_id === 'string' && raw.recipe_id.trim()) {
    return [raw.recipe_id]
  }

  return []
}

function normalizeAdjustmentKind(kind: unknown, name: string): PresetAdjustmentKind {
  if (kind === 'packaging' || kind === 'delivery' || kind === 'extra') {
    return kind
  }

  const normalizedName = name.trim().toLowerCase()
  if (normalizedName === 'embalagem') return 'packaging'
  if (normalizedName === 'entrega' || normalizedName === 'frete') return 'delivery'
  return 'extra'
}

function normalizePresetAdjustments(items: unknown): PresetAdjustment[] {
  if (!Array.isArray(items)) return []

  return items.reduce<PresetAdjustment[]>((accumulator, item) => {
    if (!item || typeof item !== 'object') return accumulator
    const parsed = item as { uid?: unknown; kind?: unknown; name?: unknown; cost?: unknown }
    const name = typeof parsed.name === 'string' ? parsed.name : ''
    accumulator.push({
      uid: typeof parsed.uid === 'string' ? parsed.uid : undefined,
      kind: normalizeAdjustmentKind(parsed.kind, name),
      name,
      cost: typeof parsed.cost === 'number' ? parsed.cost : Number(parsed.cost) || 0,
    })
    return accumulator
  }, [])
}

function getAdjustmentCost(adjustments: PresetAdjustment[], kind: PresetAdjustmentKind): number {
  return adjustments.find((adjustment) => adjustment.kind === kind)?.cost || 0
}

export function buildPresetAdjustments(params: {
  packagingCost: number
  deliveryCost: number
  extraItems: ExtraCostItem[]
}): PresetAdjustment[] {
  const adjustments: PresetAdjustment[] = []

  if (params.packagingCost > 0) {
    adjustments.push({
      kind: 'packaging',
      name: 'Embalagem',
      cost: params.packagingCost,
    })
  }

  if (params.deliveryCost > 0) {
    adjustments.push({
      kind: 'delivery',
      name: 'Entrega',
      cost: params.deliveryCost,
    })
  }

  params.extraItems
    .filter((item) => item.name.trim() || item.cost > 0)
    .forEach((item) => {
      adjustments.push({
        uid: item.uid,
        kind: 'extra',
        name: item.name,
        cost: item.cost,
      })
    })

  return adjustments
}

export function normalizePreset(raw: Record<string, unknown>): CalculatorPreset {
  const adjustmentsSource =
    Array.isArray(raw.adjustments) && raw.adjustments.length > 0 ? raw.adjustments : raw.extra_items
  const adjustments = normalizePresetAdjustments(adjustmentsSource)
  const recipeIds = normalizeRecipeIds(raw)
  const packagingCost = getAdjustmentCost(adjustments, 'packaging') || Number(raw.packaging_cost) || 0
  const deliveryCost = getAdjustmentCost(adjustments, 'delivery') || Number(raw.delivery_cost) || 0
  const extraItems = adjustments
    .filter((adjustment) => adjustment.kind === 'extra')
    .map(({ uid, name, cost }) => ({
      uid,
      name,
      cost,
    }))

  return {
    id: String(raw.id || ''),
    name: String(raw.name || ''),
    recipe_id: recipeIds[0] || '',
    recipe_ids: recipeIds,
    size_label: String(raw.size_label || ''),
    servings: Number(raw.servings) || 0,
    markup_pct: Number(raw.markup_pct) || 0,
    labor_hours: Number(raw.labor_hours) || 0,
    labor_hour_rate: Number(raw.labor_hour_rate) || 0,
    fixed_cost: Number(raw.fixed_cost) || 0,
    packaging_cost: packagingCost,
    delivery_cost: deliveryCost,
    extra_items: extraItems.length > 0 ? extraItems : normalizeExtraItems(raw.extra_items),
    adjustments,
    target_sale_price: normalizeMaybeNumber(raw.target_sale_price),
    notes: String(raw.notes || ''),
    display_order: Number(raw.display_order) || 0,
  }
}

export function parseYieldToServings(label: string): number {
  const match = label.match(/\d+/)
  return match ? Number(match[0]) : 0
}

export function isOrderActive(status: string): boolean {
  return ORDER_ACTIVE_STATUSES.has(status)
}

export function isOrderClosed(status: string): boolean {
  return ORDER_CLOSED_STATUSES.has(status)
}

export function isPaymentOpen(paymentStatus: string): boolean {
  return PAYMENT_PENDING_STATUSES.has(paymentStatus)
}

export function getOrderRemainingBalance(order: Pick<OrderLike, 'sale_price' | 'deposit_amount'>): number {
  return Math.max((order.sale_price || 0) - (order.deposit_amount || 0), 0)
}

export function getOrderTimelineDate(order: Pick<OrderLike, 'delivery_date' | 'event_date'>): string {
  return order.delivery_date || order.event_date || ''
}

export function calculatePresetPricing(
  preset: CalculatorPreset,
  recipe: RecipeSummary | undefined,
  ingredientsMap: Map<string, Ingredient>
): PricingBreakdown | null {
  if (!recipe) return null

  return calculatePricing({
    items: recipe.items,
    ingredientsMap,
    extraItems: preset.extra_items,
    laborHours: preset.labor_hours,
    laborHourRate: preset.labor_hour_rate,
    monthlyFixedCost: preset.fixed_cost,
    monthlyOrderGoal: 1,
    packagingCost: preset.packaging_cost,
    deliveryCost: preset.delivery_cost,
    markupPct: preset.markup_pct,
    salePrice: preset.target_sale_price && preset.target_sale_price > 0 ? preset.target_sale_price : undefined,
  })
}

export function buildOrderDraftFromPreset(
  preset: CalculatorPreset,
  recipe: RecipeSummary | undefined,
  ingredientsMap: Map<string, Ingredient>
) {
  const pricing = calculatePresetPricing(preset, recipe, ingredientsMap)
  const servings = preset.servings || parseYieldToServings(recipe?.yield_label || '')
  const titleBase = recipe?.name || preset.name
  const sizeLabel = preset.size_label || recipe?.size_label || ''
  const title = sizeLabel ? `${titleBase} - ${sizeLabel}` : titleBase

  return {
    title,
    size_label: sizeLabel,
    servings,
    sale_price: pricing ? Number(pricing.salePrice.toFixed(2)) : 0,
    notes: preset.notes || '',
    pricing,
  }
}

function toDateOnly(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(dateString: string, amount: number): string {
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + amount)
  return toDateOnly(date)
}

function buildIsoAt(dateString: string, hour: number, minute: number): string {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString()
}

function uniqueSections(recipe: RecipeSummary | undefined) {
  const sections = new Set<string>()
  recipe?.items.forEach((item) => sections.add(item.section))
  return sections
}

export function buildProductionTasks(params: {
  orderId: string
  orderTitle: string
  recipe?: RecipeSummary
  deliveryDate?: string
  eventDate?: string
}) {
  const anchorDate =
    params.deliveryDate ||
    params.eventDate ||
    toDateOnly(new Date())

  const sections = uniqueSections(params.recipe)
  const seeds: ProductionTaskSeed[] = []

  if (sections.has('massa')) {
    seeds.push({
      title: `Preparar massa - ${params.orderTitle}`,
      station: 'Preparo',
      dueDate: addDays(anchorDate, -2),
      dueHour: 8,
      dueMinute: 0,
    })
  }

  if (sections.has('recheio')) {
    seeds.push({
      title: `Preparar recheio - ${params.orderTitle}`,
      station: 'Cozinha',
      dueDate: addDays(anchorDate, -2),
      dueHour: 11,
      dueMinute: 0,
    })
  }

  if (sections.has('cobertura')) {
    seeds.push({
      title: `Montar cobertura - ${params.orderTitle}`,
      station: 'Montagem',
      dueDate: addDays(anchorDate, -1),
      dueHour: 9,
      dueMinute: 0,
    })
  }

  if (sections.has('decoracao')) {
    seeds.push({
      title: `Finalizar decoracao - ${params.orderTitle}`,
      station: 'Decoracao',
      dueDate: addDays(anchorDate, -1),
      dueHour: 15,
      dueMinute: 0,
    })
  }

  if (sections.has('extras')) {
    seeds.push({
      title: `Separar extras - ${params.orderTitle}`,
      station: 'Acabamento',
      dueDate: addDays(anchorDate, -1),
      dueHour: 17,
      dueMinute: 0,
    })
  }

  if (seeds.length === 0) {
    seeds.push(
      {
        title: `Preparar produto - ${params.orderTitle}`,
        station: 'Preparo',
        dueDate: addDays(anchorDate, -2),
        dueHour: 9,
        dueMinute: 0,
      },
      {
        title: `Montar pedido - ${params.orderTitle}`,
        station: 'Montagem',
        dueDate: addDays(anchorDate, -1),
        dueHour: 14,
        dueMinute: 0,
      }
    )
  }

  seeds.push({
    title: `Embalar e conferir - ${params.orderTitle}`,
    station: 'Entrega',
    dueDate: anchorDate,
    dueHour: 8,
    dueMinute: 30,
  })

  return seeds.map((seed, index) => ({
    id: crypto.randomUUID(),
    order_id: params.orderId,
    title: seed.title,
    station: seed.station,
    due_at: buildIsoAt(seed.dueDate, seed.dueHour, seed.dueMinute),
    status: 'todo',
    notes: '',
    display_order: index,
  }))
}

export function formatLocalDateTimeInput(value: string | null | undefined): string {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function parseLocalDateTimeInput(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString()
}
