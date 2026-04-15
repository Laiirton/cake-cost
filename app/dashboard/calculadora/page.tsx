'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Plus,
  Save,
  Search,
  ShoppingBag,
  Printer,
  Trash2,
  X,
} from 'lucide-react'
import { useTransientToast } from '@/lib/hooks/useTransientToast'
import { getBrowserClient } from '@/lib/supabase/client'
import {
  calculateItemCost,
  calculatePricing,
  formatCurrency,
  formatCurrencyInputDraft,
  getErrorMessage,
  RECIPE_SECTIONS,
  type Ingredient,
  type PricingBreakdown,
  uid,
} from '@/lib/utils'
import CurrencyInput from '@/app/dashboard/components/CurrencyInput'
import {
  calculatePresetPricing,
  buildPresetAdjustments,
  normalizePreset,
  parseYieldToServings,
  type CalculatorPreset,
  type RecipeSummary,
} from '@/lib/bakery'

interface ExtraItem {
  uid: string
  name: string
  cost: number
}

interface SettingsDefaults {
  laborRate: number
  fixedCost: number
  orderGoal: number
  packagingCost: number
  deliveryCost: number
  markupPct: number
}

const emptyDefaults: SettingsDefaults = {
  laborRate: 0,
  fixedCost: 0,
  orderGoal: 1,
  packagingCost: 0,
  deliveryCost: 0,
  markupPct: 50,
}

interface SummaryRow {
  label: string
  value: string
  amount?: number
}

interface SummarySection {
  title: string
  rows: SummaryRow[]
}

interface SummaryIngredientRow {
  label: string
  quantity: string
  cost: string
  amount: number
}

interface SummaryIngredientSection {
  key: string
  title: string
  emoji: string
  totalCost: string
  totalAmount: number
  rows: SummaryIngredientRow[]
}

interface SummarySnapshot {
  title: string
  subtitle: string
  generatedAt: string
  sections: SummarySection[]
  ingredientSections: SummaryIngredientSection[]
  notes: string
  servingsValue: number
  pricing: PricingBreakdown
  raw: {
    recipe: {
      id: string
      name: string
      category: string
      sizeLabel: string
      yieldLabel: string
    }
    presetName: string | null
    selectedRecipeId: string
    selectedPresetId: string | null
    servingsTarget: number
    laborHours: number
    laborRate: number
    fixedCost: number
    orderGoal: number
    packagingCost: number
    deliveryCost: number
    markupPct: number
    manualPrice: number | null
    extraItems: ExtraItem[]
    recipeItems: Array<{
      section: string
      sectionLabel: string
      ingredientName: string
      quantity: number
      unit: string
      cost: number
    }>
  }
}

const quantityFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 3,
})

function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return '-'
  return quantityFormatter.format(value)
}

function sanitizeFileName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeCsvValue(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()

  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.readOnly = true
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()

  const copied = document.execCommand('copy')
  textarea.remove()

  if (!copied) {
    throw new Error('Não foi possível copiar o resumo.')
  }
}

function buildSummaryText(snapshot: SummarySnapshot): string {
  const lines: string[] = [
    snapshot.title,
    snapshot.subtitle,
    `Gerado em: ${snapshot.generatedAt}`,
    '',
  ]

  snapshot.sections.forEach((section) => {
    lines.push(section.title)
    section.rows.forEach((row) => {
      lines.push(`- ${row.label}: ${row.value}`)
    })
    lines.push('')
  })

  snapshot.ingredientSections.forEach((section) => {
    lines.push(`Ingredientes - ${section.title}`)
    section.rows.forEach((row) => {
      lines.push(`- ${row.label} | ${row.quantity} | ${row.cost}`)
    })
    lines.push(`Subtotal: ${section.totalCost}`)
    lines.push('')
  })

  if (snapshot.notes) {
    lines.push('Observações')
    lines.push(snapshot.notes)
  }

  return lines.join('\n').trim()
}

function buildSummaryCsv(snapshot: SummarySnapshot): string {
  const rows: string[] = ['Grupo;Seção;Campo;Quantidade;Valor']

  snapshot.sections.forEach((section) => {
    section.rows.forEach((row) => {
      rows.push(
        [
          escapeCsvValue('Resumo'),
          escapeCsvValue(section.title),
          escapeCsvValue(row.label),
          escapeCsvValue(''),
          escapeCsvValue(row.value),
        ].join(';')
      )
    })
  })

  snapshot.ingredientSections.forEach((section) => {
    section.rows.forEach((row) => {
      rows.push(
        [
          escapeCsvValue('Ingredientes'),
          escapeCsvValue(section.title),
          escapeCsvValue(row.label),
          escapeCsvValue(row.quantity),
          escapeCsvValue(row.cost),
        ].join(';')
      )
    })

    rows.push(
      [
        escapeCsvValue('Ingredientes'),
        escapeCsvValue(section.title),
        escapeCsvValue('Subtotal'),
        escapeCsvValue(''),
        escapeCsvValue(section.totalCost),
      ].join(';')
    )
  })

  if (snapshot.notes) {
    rows.push(
      [
        escapeCsvValue('Observações'),
        escapeCsvValue('Modelo'),
        escapeCsvValue('Notas'),
        escapeCsvValue(''),
        escapeCsvValue(snapshot.notes),
      ].join(';')
    )
  }

  return rows.join('\n')
}

function buildSummaryPrintDocument(snapshot: SummarySnapshot): string {
  const renderRows = (rows: SummaryRow[]) =>
    rows
      .map(
        (row) => `
          <tr>
            <td>${escapeHtml(row.label)}</td>
            <td>${escapeHtml(row.value)}</td>
          </tr>
        `
      )
      .join('')

  const renderIngredientRows = (rows: SummaryIngredientRow[]) =>
    rows
      .map(
        (row) => `
          <tr>
            <td>${escapeHtml(row.label)}</td>
            <td>${escapeHtml(row.quantity)}</td>
            <td>${escapeHtml(row.cost)}</td>
          </tr>
        `
      )
      .join('')

  const sectionCards = snapshot.sections
    .map(
      (section) => `
        <section class="sheet-card">
          <div class="sheet-card-header">
            <h2>${escapeHtml(section.title)}</h2>
            <span>${section.rows.length} itens</span>
          </div>
          <table class="sheet-table">
            <tbody>${renderRows(section.rows)}</tbody>
          </table>
        </section>
      `
    )
    .join('')

  const ingredientCards = snapshot.ingredientSections
    .map(
      (section) => `
        <section class="sheet-card sheet-card-ingredient">
          <div class="sheet-card-header">
            <h2>${escapeHtml(section.emoji)} ${escapeHtml(section.title)}</h2>
            <span>${escapeHtml(section.totalCost)}</span>
          </div>
          <table class="sheet-table sheet-table-ingredient">
            <thead>
              <tr>
                <th>Ingrediente</th>
                <th>Qtd.</th>
                <th>Custo</th>
              </tr>
            </thead>
            <tbody>${renderIngredientRows(section.rows)}</tbody>
          </table>
        </section>
      `
    )
    .join('')

  const notesCard = snapshot.notes
    ? `
        <section class="sheet-card sheet-card-notes">
          <div class="sheet-card-header">
            <h2>Observações</h2>
          </div>
          <p class="sheet-notes">${escapeHtml(snapshot.notes)}</p>
        </section>
      `
    : ''

  return `
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(snapshot.title)} - resumo</title>
    <style>
      @page {
        size: A4 landscape;
        margin: 10mm;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        color: #0f172a;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      body {
        padding: 0;
      }

      .sheet {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .sheet-header {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
        padding-bottom: 10px;
        border-bottom: 2px solid #e2e8f0;
      }

      .sheet-title {
        margin: 0;
        font-size: 22px;
        line-height: 1.1;
        font-weight: 800;
        letter-spacing: -0.03em;
      }

      .sheet-subtitle {
        margin-top: 4px;
        font-size: 11px;
        color: #475569;
      }

      .sheet-meta {
        text-align: right;
        font-size: 10px;
        color: #64748b;
      }

      .sheet-hero {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
      }

      .sheet-hero-item {
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 10px 12px;
        background: linear-gradient(135deg, #fdf2f8 0%, #fffbeb 100%);
        min-height: 64px;
      }

      .sheet-hero-label {
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #64748b;
      }

      .sheet-hero-value {
        margin-top: 4px;
        font-size: 18px;
        line-height: 1.05;
        font-weight: 800;
        color: #111827;
      }

      .sheet-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      .sheet-card {
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        padding: 10px 12px;
        background: #fff;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .sheet-card-notes {
        grid-column: 1 / -1;
      }

      .sheet-card-header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        margin-bottom: 8px;
      }

      .sheet-card-header h2 {
        margin: 0;
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #be185d;
      }

      .sheet-card-header span {
        font-size: 10px;
        font-weight: 700;
        color: #64748b;
      }

      .sheet-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 10px;
      }

      .sheet-table td,
      .sheet-table th {
        padding: 3px 0;
        border-bottom: 1px solid #f1f5f9;
        vertical-align: top;
      }

      .sheet-table th {
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #64748b;
        text-align: left;
      }

      .sheet-table td:nth-child(2),
      .sheet-table td:nth-child(3),
      .sheet-table th:nth-child(2),
      .sheet-table th:nth-child(3) {
        text-align: right;
      }

      .sheet-table tr:last-child td {
        border-bottom: 0;
      }

      .sheet-table td:first-child {
        color: #334155;
      }

      .sheet-table td:last-child {
        font-weight: 700;
      }

      .sheet-table-ingredient td:nth-child(2),
      .sheet-table-ingredient th:nth-child(2) {
        width: 74px;
      }

      .sheet-table-ingredient td:nth-child(3),
      .sheet-table-ingredient th:nth-child(3) {
        width: 88px;
      }

      .sheet-notes {
        margin: 0;
        font-size: 10px;
        line-height: 1.35;
        white-space: pre-wrap;
        color: #334155;
      }

      .sheet-footer {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        padding-top: 4px;
        font-size: 9px;
        color: #64748b;
      }

      .sheet-footer strong {
        color: #0f172a;
      }
    </style>
  </head>
  <body>
    <main class="sheet">
      <header class="sheet-header">
        <div>
          <h1 class="sheet-title">${escapeHtml(snapshot.title)}</h1>
          <div class="sheet-subtitle">${escapeHtml(snapshot.subtitle)}</div>
        </div>
        <div class="sheet-meta">
          <div><strong>Gerado em</strong></div>
          <div>${escapeHtml(snapshot.generatedAt)}</div>
        </div>
      </header>

      <section class="sheet-hero">
        <div class="sheet-hero-item">
          <div class="sheet-hero-label">Venda final</div>
          <div class="sheet-hero-value">${escapeHtml(formatCurrency(snapshot.pricing.salePrice))}</div>
        </div>
        <div class="sheet-hero-item">
          <div class="sheet-hero-label">Lucro</div>
          <div class="sheet-hero-value">${escapeHtml(formatCurrency(snapshot.pricing.profit))}</div>
        </div>
        <div class="sheet-hero-item">
          <div class="sheet-hero-label">Margem</div>
          <div class="sheet-hero-value">${escapeHtml(snapshot.pricing.profitMargin.toFixed(1))}%</div>
        </div>
        <div class="sheet-hero-item">
          <div class="sheet-hero-label">Custo total</div>
          <div class="sheet-hero-value">${escapeHtml(formatCurrency(snapshot.pricing.totalCost))}</div>
        </div>
      </section>

      <section class="sheet-grid">
        ${sectionCards}
        ${ingredientCards}
        ${notesCard}
      </section>

      <footer class="sheet-footer">
        <div><strong>${escapeHtml(snapshot.raw.recipe.name)}</strong></div>
        <div>${snapshot.servingsValue > 0 ? `${snapshot.servingsValue} porções planejadas` : 'Sem porções planejadas'}</div>
      </footer>
    </main>
  </body>
</html>
`
}

function buildSummarySnapshot(params: {
  selectedRecipe: RecipeSummary
  selectedPreset: CalculatorPreset | null
  pricing: PricingBreakdown
  servingsTarget: number
  laborHours: number
  laborRate: number
  fixedCost: number
  orderGoal: number
  packagingCost: number
  deliveryCost: number
  markupPct: number
  manualPrice: number | null
  extraItems: ExtraItem[]
  modelNotes: string
  ingredientsMap: Map<string, Ingredient>
}): SummarySnapshot {
  const servingsValue =
    params.servingsTarget > 0
      ? params.servingsTarget
      : parseYieldToServings(params.selectedRecipe.yield_label || '')
  const modelName = params.selectedPreset?.name || `Simulação de ${params.selectedRecipe.name}`
  const subtitleParts = [params.selectedRecipe.name]
  if (params.selectedRecipe.category) subtitleParts.push(params.selectedRecipe.category)
  if (params.selectedRecipe.size_label) subtitleParts.push(params.selectedRecipe.size_label)

  const ingredientSections = RECIPE_SECTIONS.map((section) => {
    const rows = params.selectedRecipe.items
      .filter((item) => item.section === section.key)
      .map((item) => {
        const ingredient = params.ingredientsMap.get(item.ingredient_id)
        const cost = calculateItemCost(item, ingredient)
        return {
          label: ingredient?.name || 'Ingrediente removido',
          quantity: `${formatQuantity(item.quantity)} ${item.unit}`,
          cost: formatCurrency(cost),
          amount: cost,
        }
      })

    return {
      key: section.key,
      title: section.label,
      emoji: section.emoji,
      totalCost: formatCurrency(params.pricing.sectionCosts[section.key] || 0),
      totalAmount: params.pricing.sectionCosts[section.key] || 0,
      rows,
    }
  }).filter((section) => section.rows.length > 0 || section.totalAmount > 0)

  const extraRows = params.extraItems
    .filter((item) => item.name.trim() || item.cost > 0)
    .map((item) => ({
      label: item.name.trim() || 'Extra sem nome',
      value: formatCurrency(item.cost),
      amount: item.cost,
    }))

  const recipeInfoRows: SummaryRow[] = [
    { label: 'Modelo', value: modelName },
    { label: 'Receita', value: params.selectedRecipe.name },
    { label: 'Categoria', value: params.selectedRecipe.category || '-' },
    { label: 'Tamanho', value: params.selectedRecipe.size_label || '-' },
    { label: 'Rendimento', value: params.selectedRecipe.yield_label || '-' },
    {
      label: 'Porções planejadas',
      value: servingsValue > 0 ? `${servingsValue} porções` : '-',
      amount: servingsValue || undefined,
    },
  ]

  const operationalRows: SummaryRow[] = [
    { label: 'Horas de trabalho', value: `${params.laborHours.toFixed(1)} h`, amount: params.laborHours },
    { label: 'Valor/hora', value: formatCurrency(params.laborRate), amount: params.laborRate },
    { label: 'Mão de obra', value: formatCurrency(params.pricing.laborCost), amount: params.pricing.laborCost },
    { label: 'Custo fixo considerado', value: formatCurrency(params.fixedCost), amount: params.fixedCost },
    { label: 'Meta de pedidos/mês', value: `${params.orderGoal}`, amount: params.orderGoal },
    {
      label: 'Custo fixo/pedido',
      value: formatCurrency(params.pricing.fixedCostPerOrder),
      amount: params.pricing.fixedCostPerOrder,
    },
    { label: 'Embalagem', value: formatCurrency(params.pricing.packagingCost), amount: params.pricing.packagingCost },
    { label: 'Entrega', value: formatCurrency(params.pricing.deliveryCost), amount: params.pricing.deliveryCost },
  ]

  const financialRows: SummaryRow[] = [
    { label: 'Custo dos ingredientes', value: formatCurrency(params.pricing.ingredientCost), amount: params.pricing.ingredientCost },
    { label: 'Total extras', value: formatCurrency(params.pricing.extraItemsCost), amount: params.pricing.extraItemsCost },
    { label: 'Custo total', value: formatCurrency(params.pricing.totalCost), amount: params.pricing.totalCost },
    { label: 'Markup', value: `+${params.markupPct}%`, amount: params.markupPct },
    { label: 'Preço sugerido', value: formatCurrency(params.pricing.suggestedPrice), amount: params.pricing.suggestedPrice },
    { label: 'Preço final', value: formatCurrency(params.pricing.salePrice), amount: params.pricing.salePrice },
    { label: 'Lucro', value: formatCurrency(params.pricing.profit), amount: params.pricing.profit },
    { label: 'Margem', value: `${params.pricing.profitMargin.toFixed(1)}%`, amount: params.pricing.profitMargin },
  ]

  const servingRows: SummaryRow[] =
    servingsValue > 0
      ? [
          {
            label: 'Custo por porção',
            value: formatCurrency(params.pricing.totalCost / servingsValue),
            amount: params.pricing.totalCost / servingsValue,
          },
          {
            label: 'Venda por porção',
            value: formatCurrency(params.pricing.salePrice / servingsValue),
            amount: params.pricing.salePrice / servingsValue,
          },
        ]
      : []

  const summarySections: SummarySection[] = [
    { title: 'Dados do modelo', rows: recipeInfoRows },
    {
      title: 'Extras',
      rows:
        extraRows.length > 0
          ? [
              { label: 'Total de extras', value: formatCurrency(params.pricing.extraItemsCost), amount: params.pricing.extraItemsCost },
              ...extraRows,
            ]
          : [{ label: 'Extras', value: 'Nenhum extra adicionado' }],
    },
    { title: 'Custos operacionais', rows: operationalRows },
    { title: 'Resultado financeiro', rows: financialRows },
    ...(servingRows.length > 0 ? [{ title: 'Por porção', rows: servingRows }] : []),
  ]

  const recipeItems = params.selectedRecipe.items.map((item) => {
    const ingredient = params.ingredientsMap.get(item.ingredient_id)
    const section = RECIPE_SECTIONS.find((recipeSection) => recipeSection.key === item.section)
    const cost = calculateItemCost(item, ingredient)

    return {
      section: item.section,
      sectionLabel: section ? `${section.emoji} ${section.label}` : item.section,
      ingredientName: ingredient?.name || 'Ingrediente removido',
      quantity: item.quantity,
      unit: item.unit,
      cost,
    }
  })

  return {
    title: modelName,
    subtitle: subtitleParts.join(' • '),
    generatedAt: new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date()),
    sections: summarySections,
    ingredientSections,
    notes: params.modelNotes.trim(),
    servingsValue,
    pricing: params.pricing,
    raw: {
      recipe: {
        id: params.selectedRecipe.id,
        name: params.selectedRecipe.name,
        category: params.selectedRecipe.category,
        sizeLabel: params.selectedRecipe.size_label,
        yieldLabel: params.selectedRecipe.yield_label,
      },
      presetName: params.selectedPreset?.name || null,
      selectedRecipeId: params.selectedRecipe.id,
      selectedPresetId: params.selectedPreset?.id || null,
      servingsTarget: params.servingsTarget,
      laborHours: params.laborHours,
      laborRate: params.laborRate,
      fixedCost: params.fixedCost,
      orderGoal: params.orderGoal,
      packagingCost: params.packagingCost,
      deliveryCost: params.deliveryCost,
      markupPct: params.markupPct,
      manualPrice: params.manualPrice,
      extraItems: params.extraItems,
      recipeItems,
    },
  }
}

export default function CalculadoraPage() {
  const searchParams = useSearchParams()
  const [recipes, setRecipes] = useState<RecipeSummary[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [presets, setPresets] = useState<CalculatorPreset[]>([])
  const [defaults, setDefaults] = useState<SettingsDefaults>(emptyDefaults)
  const [loading, setLoading] = useState(true)
  const [queryApplied, setQueryApplied] = useState(false)
  const { toast, showToast } = useTransientToast()

  const [selectedRecipeId, setSelectedRecipeId] = useState('')
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [presetSearch, setPresetSearch] = useState('')
  const [servingsTarget, setServingsTarget] = useState(0)
  const [laborHours, setLaborHours] = useState(0)
  const [laborRate, setLaborRate] = useState(0)
  const [fixedCost, setFixedCost] = useState(0)
  const [orderGoal, setOrderGoal] = useState(1)
  const [packagingCost, setPackagingCost] = useState(0)
  const [deliveryCost, setDeliveryCost] = useState(0)
  const [markupPct, setMarkupPct] = useState(50)
  const [manualPrice, setManualPrice] = useState<number | null>(null)
  const [extraItems, setExtraItems] = useState<ExtraItem[]>([])
  const [modelNotes, setModelNotes] = useState('')
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(RECIPE_SECTIONS.map((section) => section.key))
  )

  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveIntent, setSaveIntent] = useState<'create' | 'duplicate'>('create')
  const [presetNameDraft, setPresetNameDraft] = useState('')
  const [presetError, setPresetError] = useState('')
  const [savingPreset, setSavingPreset] = useState(false)
  const [deletingPreset, setDeletingPreset] = useState(false)

  const recipesMap = useMemo(() => {
    const map = new Map<string, RecipeSummary>()
    recipes.forEach((recipe) => map.set(recipe.id, recipe))
    return map
  }, [recipes])

  const ingredientsMap = useMemo(() => {
    const map = new Map<string, Ingredient>()
    ingredients.forEach((ingredient) => map.set(ingredient.id, ingredient))
    return map
  }, [ingredients])

  const selectedRecipe = useMemo(
    () => recipes.find((recipe) => recipe.id === selectedRecipeId),
    [recipes, selectedRecipeId]
  )
  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.id === selectedPresetId) || null,
    [presets, selectedPresetId]
  )

  const pricing: PricingBreakdown | null = useMemo(() => {
    if (!selectedRecipe) return null

    return calculatePricing({
      items: selectedRecipe.items,
      ingredientsMap,
      extraItems,
      laborHours,
      laborHourRate: laborRate,
      monthlyFixedCost: fixedCost,
      monthlyOrderGoal: orderGoal,
      packagingCost,
      deliveryCost,
      markupPct,
      salePrice: manualPrice ?? undefined,
    })
  }, [
    selectedRecipe,
    ingredientsMap,
    extraItems,
    laborHours,
    laborRate,
    fixedCost,
    orderGoal,
    packagingCost,
    deliveryCost,
    markupPct,
    manualPrice,
  ])

  const summarySnapshot = useMemo(() => {
    if (!selectedRecipe || !pricing) return null

    return buildSummarySnapshot({
      selectedRecipe,
      selectedPreset,
      pricing,
      servingsTarget,
      laborHours,
      laborRate,
      fixedCost,
      orderGoal,
      packagingCost,
      deliveryCost,
      markupPct,
      manualPrice,
      extraItems,
      modelNotes,
      ingredientsMap,
    })
  }, [
    selectedRecipe,
    selectedPreset,
    pricing,
    servingsTarget,
    laborHours,
    laborRate,
    fixedCost,
    orderGoal,
    packagingCost,
    deliveryCost,
    markupPct,
    manualPrice,
    extraItems,
    modelNotes,
    ingredientsMap,
  ])

  const presetSummaries = useMemo(() => {
    return presets
      .map((preset) => {
        const recipe = recipesMap.get(preset.recipe_id)
        const presetPricing = calculatePresetPricing(preset, recipe, ingredientsMap)
        return { preset, recipe, pricing: presetPricing }
      })
      .filter(({ preset, recipe }) => {
        const haystack = `${preset.name} ${recipe?.name || ''} ${recipe?.category || ''}`.toLowerCase()
        return haystack.includes(presetSearch.toLowerCase())
      })
  }, [presets, recipesMap, ingredientsMap, presetSearch])

  const getDefaultExpandedSections = () => new Set(RECIPE_SECTIONS.map((section) => section.key))

  const resetSimulation = useCallback(
    (recipeId = '') => {
      const recipe = recipeId ? recipesMap.get(recipeId) : undefined
      setSelectedPresetId('')
      setSelectedRecipeId(recipeId)
      setServingsTarget(parseYieldToServings(recipe?.yield_label || ''))
      setLaborHours(0)
      setLaborRate(defaults.laborRate)
      setFixedCost(defaults.fixedCost)
      setOrderGoal(defaults.orderGoal)
      setPackagingCost(defaults.packagingCost)
      setDeliveryCost(defaults.deliveryCost)
      setMarkupPct(defaults.markupPct)
      setManualPrice(null)
      setExtraItems([])
      setModelNotes('')
    },
    [defaults, recipesMap]
  )

  const startNewSimulation = useCallback(() => {
    resetSimulation(selectedRecipeId)
    setPresetSearch('')
    setExpandedSections(getDefaultExpandedSections())
    showToast('success', 'Simulação reiniciada.')
  }, [resetSimulation, selectedRecipeId, showToast])

  const applyPreset = useCallback(
    (preset: CalculatorPreset) => {
      const recipe = recipesMap.get(preset.recipe_id)
      setSelectedPresetId(preset.id)
      setSelectedRecipeId(preset.recipe_id)
      setServingsTarget(preset.servings || parseYieldToServings(recipe?.yield_label || ''))
      setLaborHours(preset.labor_hours)
      setLaborRate(preset.labor_hour_rate)
      setFixedCost(preset.fixed_cost)
      setOrderGoal(1)
      setPackagingCost(preset.packaging_cost)
      setDeliveryCost(preset.delivery_cost)
      setMarkupPct(preset.markup_pct)
      setManualPrice(preset.target_sale_price && preset.target_sale_price > 0 ? preset.target_sale_price : null)
      setExtraItems(
        preset.extra_items.map((item) => ({
          uid: item.uid || uid(),
          name: item.name,
          cost: item.cost,
        }))
      )
      setModelNotes(preset.notes || '')
    },
    [recipesMap]
  )

  const load = useCallback(async () => {
    try {
      const supabase = await getBrowserClient()
      const [recipesRes, ingredientsRes, settingsRes, presetsRes] = await Promise.all([
        supabase
          .from('recipes')
          .select('id, name, category, size_label, yield_label, items')
          .order('name'),
        supabase.from('ingredients').select('*').order('name'),
        supabase.from('bakery_settings').select('*').limit(1).single(),
        supabase
          .from('calculator_presets')
          .select('id, name, size_label, servings, recipe_ids, adjustments, labor_hours, labor_hour_rate, fixed_cost, markup_pct, target_sale_price, notes, display_order')
          .order('display_order'),
      ])

      const nextRecipes = (recipesRes.data || []).map((recipe: RecipeSummary) => ({
        ...recipe,
        items: Array.isArray(recipe.items) ? recipe.items : [],
      })) as RecipeSummary[]
      const nextIngredients = (ingredientsRes.data || []) as Ingredient[]
      const nextDefaults = settingsRes.data
        ? {
            laborRate: settingsRes.data.labor_hour_rate,
            fixedCost: settingsRes.data.monthly_fixed_cost,
            orderGoal: settingsRes.data.monthly_order_goal || 1,
            packagingCost: settingsRes.data.packaging_cost_default,
            deliveryCost: settingsRes.data.delivery_cost_default,
            markupPct: settingsRes.data.default_markup_pct,
          }
        : emptyDefaults
      const nextPresets = (presetsRes.data || []).map((preset: Record<string, unknown>) =>
        normalizePreset(preset as unknown as Record<string, unknown>)
      )

      setRecipes(nextRecipes)
      setIngredients(nextIngredients)
      setDefaults(nextDefaults)
      setPresets(nextPresets)
      setLaborRate(nextDefaults.laborRate)
      setFixedCost(nextDefaults.fixedCost)
      setOrderGoal(nextDefaults.orderGoal)
      setPackagingCost(nextDefaults.packagingCost)
      setDeliveryCost(nextDefaults.deliveryCost)
      setMarkupPct(nextDefaults.markupPct)

      if (!selectedRecipeId && nextRecipes[0]) {
        setSelectedRecipeId(nextRecipes[0].id)
        setServingsTarget(parseYieldToServings(nextRecipes[0].yield_label || ''))
      }
    } catch (error) {
      console.error('Erro ao carregar calculadora:', error)
      showToast('error', 'Não foi possível carregar os modelos e receitas.')
    } finally {
      setLoading(false)
    }
  }, [selectedRecipeId, showToast])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (loading || queryApplied) return

    const presetParam = searchParams.get('preset')
    const recipeParam = searchParams.get('recipe')

    if (presetParam) {
      const preset = presets.find((item) => item.id === presetParam)
      if (preset) {
        applyPreset(preset)
      }
      setQueryApplied(true)
      return
    }

    if (recipeParam) {
      resetSimulation(recipeParam)
      setQueryApplied(true)
      return
    }

    setQueryApplied(true)
  }, [applyPreset, loading, presets, queryApplied, resetSimulation, searchParams])

  const toggleSection = (key: string) => {
    setExpandedSections((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const addExtra = () => {
    setExtraItems((previous) => [...previous, { uid: uid(), name: '', cost: 0 }])
  }

  const updateExtra = (extraUid: string, field: 'name' | 'cost', value: string | number) => {
    setExtraItems((previous) =>
      previous.map((item) => (item.uid === extraUid ? { ...item, [field]: value } : item))
    )
  }

  const removeExtra = (extraUid: string) => {
    setExtraItems((previous) => previous.filter((item) => item.uid !== extraUid))
  }

  const openCreatePreset = () => {
    setSaveIntent('create')
    setPresetNameDraft(selectedRecipe ? `${selectedRecipe.name} ${selectedRecipe.size_label || ''}`.trim() : '')
    setPresetError('')
    setShowSaveModal(true)
  }

  const openDuplicatePreset = () => {
    if (!selectedPreset) return
    setSaveIntent('duplicate')
    setPresetNameDraft(`${selectedPreset.name} copia`)
    setPresetError('')
    setShowSaveModal(true)
  }

  const handlePersistNewPreset = async () => {
    if (!presetNameDraft.trim()) {
      setPresetError('Informe um nome para o modelo.')
      return
    }

    if (!selectedRecipe || !pricing) {
      setPresetError('Escolha uma receita antes de salvar.')
      return
    }

    setSavingPreset(true)
    setPresetError('')

    try {
      const supabase = await getBrowserClient()
      const payload = {
        id: crypto.randomUUID(),
        name: presetNameDraft.trim(),
        recipe_ids: [selectedRecipe.id],
        size_label: selectedRecipe.size_label,
        servings: servingsTarget,
        markup_pct: markupPct,
        labor_hours: laborHours,
        labor_hour_rate: laborRate,
        fixed_cost: Number(pricing.fixedCostPerOrder.toFixed(2)),
        adjustments: buildPresetAdjustments({
          packagingCost,
          deliveryCost,
          extraItems,
        }),
        target_sale_price: Number(pricing.salePrice.toFixed(2)),
        notes: modelNotes,
        display_order: presets.length,
      }

      const { data: savedPreset, error } = await supabase
        .from('calculator_presets')
        .insert(payload)
        .select('*')
        .single()

      if (error) throw error

      const normalized = normalizePreset(savedPreset as unknown as Record<string, unknown>)
      setPresets((previous) => [...previous, normalized])
      applyPreset(normalized)
      setShowSaveModal(false)
      showToast('success', saveIntent === 'create' ? 'Modelo salvo!' : 'Modelo duplicado!')
    } catch (error) {
      const message = getErrorMessage(error, 'Erro ao salvar modelo')
      setPresetError(message)
      showToast('error', message)
    } finally {
      setSavingPreset(false)
    }
  }

  const handleUpdatePreset = async () => {
    if (!selectedPreset || !selectedRecipe || !pricing) return

    setSavingPreset(true)
    try {
      const payload = {
        name: selectedPreset.name,
        recipe_ids: [selectedRecipe.id],
        size_label: selectedRecipe.size_label,
        servings: servingsTarget,
        markup_pct: markupPct,
        labor_hours: laborHours,
        labor_hour_rate: laborRate,
        fixed_cost: Number(pricing.fixedCostPerOrder.toFixed(2)),
        adjustments: buildPresetAdjustments({
          packagingCost,
          deliveryCost,
          extraItems,
        }),
        target_sale_price: Number(pricing.salePrice.toFixed(2)),
        notes: modelNotes,
      }

      const supabase = await getBrowserClient()
      const { data: updatedPreset, error } = await supabase
        .from('calculator_presets')
        .update(payload)
        .eq('id', selectedPreset.id)
        .select('*')
        .single()

      if (error) throw error

      const normalized = normalizePreset(updatedPreset as unknown as Record<string, unknown>)
      setPresets((previous) =>
        previous.map((preset) => (preset.id === normalized.id ? normalized : preset))
      )
      applyPreset(normalized)
      showToast('success', 'Modelo atualizado!')
    } catch (error) {
      showToast('error', getErrorMessage(error, 'Erro ao atualizar modelo'))
    } finally {
      setSavingPreset(false)
    }
  }

  const handleDeletePreset = async () => {
    if (!selectedPreset) return
    if (!confirm(`Excluir o modelo "${selectedPreset.name}"?`)) return

    setDeletingPreset(true)
    try {
      const supabase = await getBrowserClient()
      const { count, error: countError } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('preset_id', selectedPreset.id)

      if (countError) throw countError

      if ((count || 0) > 0) {
        showToast(
          'error',
          `Este modelo ainda esta vinculado a ${count} pedido${count === 1 ? '' : 's'}. Troque o modelo dos pedidos antes de excluir.`
        )
        return
      }

      const { error } = await supabase.from('calculator_presets').delete().eq('id', selectedPreset.id)
      if (error) throw error

      setPresets((previous) => previous.filter((preset) => preset.id !== selectedPreset.id))
      resetSimulation(selectedRecipeId)
      showToast('success', 'Modelo excluído!')
    } catch (error) {
      showToast('error', getErrorMessage(error, 'Erro ao excluir modelo'))
    } finally {
      setDeletingPreset(false)
    }
  }

  const handlePrint = () => {
    if (!summarySnapshot) return

    const printWindow = window.open('', '_blank', 'width=1200,height=900')
    if (!printWindow) {
      showToast('error', 'Permita a abertura da janela de impressão.')
      return
    }

    printWindow.document.open()
    printWindow.document.write(buildSummaryPrintDocument(summarySnapshot))
    printWindow.document.close()
    printWindow.focus()

    printWindow.onafterprint = () => {
      printWindow.close()
    }

    setTimeout(() => {
      printWindow.print()
    }, 200)
  }

  const handleCopySummary = async () => {
    if (!summarySnapshot) return

    try {
      await copyTextToClipboard(buildSummaryText(summarySnapshot))
      showToast('success', 'Resumo copiado!')
    } catch (error) {
      showToast('error', getErrorMessage(error, 'Erro ao copiar o resumo'))
    }
  }

  const handleDownloadCsv = () => {
    if (!summarySnapshot) return

    const baseName = sanitizeFileName(summarySnapshot.title) || 'resumo-modelo'
    downloadTextFile(`${baseName}.csv`, buildSummaryCsv(summarySnapshot), 'text/csv')
    showToast('success', 'CSV gerado!')
  }

  const handleDownloadJson = () => {
    if (!summarySnapshot) return

    const baseName = sanitizeFileName(summarySnapshot.title) || 'resumo-modelo'
    downloadTextFile(`${baseName}.json`, `${JSON.stringify(summarySnapshot, null, 2)}\n`, 'application/json')
    showToast('success', 'JSON gerado!')
  }

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1>Modelos e precos</h1>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} style={{ marginBottom: 16 }}>
                <div className="skeleton" style={{ width: '30%', height: 14, marginBottom: 8 }} />
                <div className="skeleton" style={{ width: '100%', height: 40 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

      <div className="page-header">
        <div>
          <h1>Modelos e preços</h1>
          <p>Salve modelos prontos para vender sem recalcular tudo a cada pedido.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {summarySnapshot && (
            <button className="btn btn-secondary" onClick={handlePrint}>
              <Printer size={16} />
              Imprimir resumo
            </button>
          )}
          {summarySnapshot && (
            <button className="btn btn-secondary" onClick={handleCopySummary}>
              <Copy size={16} />
              Copiar resumo
            </button>
          )}
          {summarySnapshot && (
            <button className="btn btn-secondary" onClick={handleDownloadCsv}>
              <Download size={16} />
              Baixar CSV
            </button>
          )}
          {summarySnapshot && (
            <button className="btn btn-secondary" onClick={handleDownloadJson}>
              <Download size={16} />
              Baixar JSON
            </button>
          )}
          <button className="btn btn-primary" onClick={openCreatePreset} disabled={!selectedRecipe}>
            <Save size={16} />
            Salvar novo modelo
          </button>
        </div>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: '320px 1fr', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-header">
              <h3>Modelos salvos</h3>
              <span className="badge badge-neutral">{presets.length}</span>
            </div>
            <div className="card-body" style={{ paddingBottom: 16 }}>
              <div className="search-bar" style={{ maxWidth: 'none', marginBottom: 16 }}>
                <Search size={18} />
                <input
                  placeholder="Buscar modelo..."
                  value={presetSearch}
                  onChange={(event) => setPresetSearch(event.target.value)}
                />
              </div>

              <button type="button" className="btn btn-secondary btn-sm" onClick={startNewSimulation} style={{ width: '100%', marginBottom: 12 }}>
                <Plus size={14} />
                Nova simulação
              </button>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {presetSummaries.length === 0 ? (
                  <div className="text-sm text-muted">Nenhum modelo salvo ainda.</div>
                ) : (
                  presetSummaries.map(({ preset, recipe, pricing: presetPricing }) => (
                    <button
                      key={preset.id}
                      className="card"
                      onClick={() => applyPreset(preset)}
                      style={{
                        textAlign: 'left',
                        padding: 16,
                        borderColor:
                          selectedPresetId === preset.id ? 'var(--brand-400)' : 'var(--border-light)',
                        boxShadow: selectedPresetId === preset.id ? 'var(--shadow-md)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                        <div style={{ fontWeight: 800 }}>{preset.name}</div>
                        {selectedPresetId === preset.id && <span className="badge badge-brand">Ativo</span>}
                      </div>
                      <div className="text-xs text-muted" style={{ marginBottom: 8 }}>
                        {recipe?.name || 'Vínculo quebrado'} {recipe?.category ? `• ${recipe.category}` : ''}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                        <span className="badge badge-neutral">{preset.servings || parseYieldToServings(recipe?.yield_label || '')} porções</span>
                        <span style={{ fontWeight: 700, color: 'var(--brand-600)' }}>
                          {formatCurrency(presetPricing?.salePrice || 0)}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3>Base da simulação</h3>
            </div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Receita</label>
                <select
                  className="form-select"
                  value={selectedRecipeId}
                  onChange={(event) => resetSimulation(event.target.value)}
                >
                  <option value="">Escolha uma receita...</option>
                  {recipes.map((recipe) => (
                    <option key={recipe.id} value={recipe.id}>
                      {recipe.name} {recipe.size_label ? `(${recipe.size_label})` : ''} {recipe.category ? `- ${recipe.category}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {selectedRecipe ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {selectedRecipe.category && <span className="badge badge-brand">{selectedRecipe.category}</span>}
                  {selectedRecipe.size_label && <span className="badge badge-neutral">{selectedRecipe.size_label}</span>}
                  {selectedRecipe.yield_label && <span className="badge badge-neutral">{selectedRecipe.yield_label}</span>}
                </div>
              ) : (
                <div className="text-sm text-muted">Escolha uma receita para montar o modelo.</div>
              )}
            </div>
          </div>
        </div>

        {!selectedRecipe ? (
          <div className="card">
            <div className="empty-state">
              <Save size={56} />
              <h3>Escolha uma receita para começar</h3>
              <p>Depois ajuste custos, markup e salve um modelo pronto para usar nos pedidos.</p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="card">
              <div className="card-body" style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', marginBottom: 4 }}>
                    Contexto atual
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '1.125rem' }}>
                    {selectedPreset ? selectedPreset.name : `Simulação de ${selectedRecipe.name}`}
                  </div>
                  <div className="text-sm text-muted">
                    {selectedPreset
                      ? 'Modelo carregado. Ajuste os custos e atualize se precisar.'
                      : 'Receita livre para testar preco, extras e margem.'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-secondary" onClick={startNewSimulation}>
                    Nova simulação
                  </button>
                  {selectedPreset && (
                    <button type="button" className="btn btn-secondary" onClick={openDuplicatePreset}>
                      <Copy size={16} />
                      Duplicar
                    </button>
                  )}
                  {selectedPreset && (
                    <button type="button" className="btn btn-secondary" onClick={handleUpdatePreset} disabled={savingPreset}>
                      <Save size={16} />
                      Atualizar modelo
                    </button>
                  )}
                  {selectedPreset && (
                    <Link href={`/dashboard/pedidos?new=1&preset=${selectedPreset.id}`} className="btn btn-primary">
                      <ShoppingBag size={16} />
                      Criar pedido
                    </Link>
                  )}
                  {selectedPreset && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleDeletePreset}
                      disabled={deletingPreset}
                      style={{ color: 'var(--danger-500)' }}
                    >
                      <Trash2 size={16} />
                      Excluir
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid-2" style={{ gridTemplateColumns: '1fr 360px', alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div className="card">
                  <div className="card-header">
                    <h3>Custos dos ingredientes</h3>
                    <span style={{ fontWeight: 800, color: 'var(--brand-600)' }}>
                      {formatCurrency(pricing?.ingredientCost || 0)}
                    </span>
                  </div>
                  <div className="card-body" style={{ padding: 0 }}>
                    {RECIPE_SECTIONS.map((section) => {
                      const sectionItems = selectedRecipe.items.filter((item) => item.section === section.key)
                      if (sectionItems.length === 0) return null
                      const isExpanded = expandedSections.has(section.key)
                      const sectionCost = pricing?.sectionCosts[section.key] || 0

                      return (
                        <div key={section.key} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <div
                            onClick={() => toggleSection(section.key)}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: 12,
                              alignItems: 'center',
                              padding: '12px 24px',
                              cursor: 'pointer',
                              background: isExpanded ? 'var(--gray-50)' : 'transparent',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              <span>{section.emoji}</span>
                              <span style={{ fontWeight: 700 }}>{section.label}</span>
                              <span className="badge badge-neutral">{sectionItems.length}</span>
                            </div>
                            <span style={{ fontWeight: 700, color: 'var(--brand-600)' }}>
                              {formatCurrency(sectionCost)}
                            </span>
                          </div>

                          {isExpanded && (
                            <div style={{ padding: '0 24px 12px' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <tbody>
                                  {sectionItems.map((item) => {
                                    const ingredient = ingredientsMap.get(item.ingredient_id)
                                    const cost = calculateItemCost(item, ingredient)
                                    return (
                                      <tr key={item.uid || item.ingredient_id} style={{ fontSize: '0.8125rem' }}>
                                        <td style={{ padding: '4px 0', color: 'var(--text-secondary)' }}>
                                          {ingredient?.name || 'Ingrediente removido'}
                                        </td>
                                        <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-tertiary)' }}>
                                          {item.quantity} {item.unit}
                                        </td>
                                        <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 700 }}>
                                          {formatCurrency(cost)}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <h3>Extras e personalização</h3>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addExtra}>
                      <Plus size={14} />
                      Adicionar extra
                    </button>
                  </div>
                  <div className="card-body" style={{ padding: extraItems.length > 0 ? '16px 24px' : '0 24px' }}>
                    {extraItems.length === 0 ? (
                      <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>
                        Nenhum extra adicionado. Use para topper, flores, caixas especiais ou itens cobrados à parte.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {extraItems.map((extra) => (
                          <div key={extra.uid} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input
                              className="form-input"
                              placeholder="Ex: Topper"
                              value={extra.name}
                              onChange={(event) => updateExtra(extra.uid, 'name', event.target.value)}
                              style={{ flex: 1, padding: '8px 10px', fontSize: '0.8125rem' }}
                            />
                            <CurrencyInput
                              value={extra.cost}
                              onChange={(value) => updateExtra(extra.uid, 'cost', value)}
                              placeholder="0,00"
                              containerStyle={{ width: 160, flex: '0 0 160px' }}
                              style={{ padding: '8px 10px', fontSize: '0.8125rem' }}
                            />
                            <button
                              type="button"
                              className="btn btn-ghost btn-icon btn-sm"
                              onClick={() => removeExtra(extra.uid)}
                              style={{ color: 'var(--danger-500)' }}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <h3>Custos operacionais</h3>
                  </div>
                  <div className="card-body">
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Porções planejadas</label>
                        <input
                          className="form-input"
                          type="number"
                          min="0"
                          value={servingsTarget || ''}
                          onChange={(event) => setServingsTarget(parseInt(event.target.value, 10) || 0)}
                        />
                        <div className="form-hint">Ajuda a enxergar custo e venda por porção.</div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Horas de trabalho</label>
                        <input
                          className="form-input"
                          type="number"
                          step="0.5"
                          min="0"
                          value={laborHours || ''}
                          onChange={(event) => setLaborHours(parseFloat(event.target.value) || 0)}
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Valor/hora</label>
                        <CurrencyInput value={laborRate} onChange={setLaborRate} />
                        <div className="form-hint">Mão de obra: {formatCurrency(laborHours * laborRate)}</div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Custo fixo considerado</label>
                        <CurrencyInput value={fixedCost} onChange={setFixedCost} />
                        <div className="form-hint">Se for custo mensal, ajuste a meta de pedidos abaixo.</div>
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Meta de pedidos/mês</label>
                        <input
                          className="form-input"
                          type="number"
                          min="1"
                          value={orderGoal || ''}
                          onChange={(event) => setOrderGoal(parseInt(event.target.value, 10) || 1)}
                        />
                        <div className="form-hint">
                          Custo fixo por pedido: {formatCurrency(orderGoal > 0 ? fixedCost / orderGoal : 0)}
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Embalagem</label>
                        <CurrencyInput value={packagingCost} onChange={setPackagingCost} />
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Entrega</label>
                      <CurrencyInput value={deliveryCost} onChange={setDeliveryCost} />
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <h3>Observações do modelo</h3>
                  </div>
                  <div className="card-body">
                    <textarea
                      className="form-textarea"
                      value={modelNotes}
                      onChange={(event) => setModelNotes(event.target.value)}
                      placeholder="Ex: inclui topper simples, usa caixa branca, entrega local."
                    />
                  </div>
                </div>
              </div>

              <div style={{ position: 'sticky', top: 'calc(var(--header-height) + 24px)' }}>
                <div className="card" style={{ border: '2px solid var(--brand-200)' }}>
                  <div className="card-header" style={{ background: 'linear-gradient(135deg, var(--brand-50), var(--accent-50))' }}>
                    <h3>Resumo do preço</h3>
                  </div>
                  <div className="card-body" style={{ padding: 20 }}>
                    {pricing && (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.8125rem', marginBottom: 16 }}>
                          {RECIPE_SECTIONS.map((section) => {
                            const sectionCost = pricing.sectionCosts[section.key]
                            if (!sectionCost || sectionCost <= 0) return null
                            return (
                              <div key={section.key} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>
                                  {section.emoji} {section.label}
                                </span>
                                <span style={{ fontWeight: 600 }}>{formatCurrency(sectionCost)}</span>
                              </div>
                            )
                          })}
                          {pricing.extraItemsCost > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>Extras</span>
                              <span style={{ fontWeight: 600 }}>{formatCurrency(pricing.extraItemsCost)}</span>
                            </div>
                          )}
                          {pricing.laborCost > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>Mão de obra</span>
                              <span style={{ fontWeight: 600 }}>{formatCurrency(pricing.laborCost)}</span>
                            </div>
                          )}
                          {pricing.fixedCostPerOrder > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>Custo fixo/pedido</span>
                              <span style={{ fontWeight: 600 }}>{formatCurrency(pricing.fixedCostPerOrder)}</span>
                            </div>
                          )}
                          {pricing.packagingCost > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>Embalagem</span>
                              <span style={{ fontWeight: 600 }}>{formatCurrency(pricing.packagingCost)}</span>
                            </div>
                          )}
                          {pricing.deliveryCost > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>Entrega</span>
                              <span style={{ fontWeight: 600 }}>{formatCurrency(pricing.deliveryCost)}</span>
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px solid var(--border-light)', borderBottom: '1px solid var(--border-light)', marginBottom: 16 }}>
                          <span style={{ fontWeight: 700 }}>Custo total</span>
                          <span style={{ fontWeight: 800, fontSize: '1.125rem' }}>{formatCurrency(pricing.totalCost)}</span>
                        </div>

                        <div className="form-group" style={{ marginBottom: 12 }}>
                          <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Markup</span>
                            <span style={{ color: 'var(--brand-600)' }}>+{markupPct}%</span>
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="200"
                            step="5"
                            value={markupPct}
                            onChange={(event) => {
                              setMarkupPct(parseInt(event.target.value, 10))
                              setManualPrice(null)
                            }}
                            style={{ width: '100%', accentColor: 'var(--brand-500)' }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
                            <span>0%</span>
                            <span>100%</span>
                            <span>200%</span>
                          </div>
                        </div>

                        <div style={{ background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', padding: '12px 14px', marginBottom: 12, textAlign: 'center' }}>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: 4 }}>
                            Preço sugerido
                          </div>
                          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                            {formatCurrency(pricing.suggestedPrice)}
                          </div>
                        </div>
<div className="form-group" style={{ marginBottom: 16 }}>
  <label className="form-label">Preço final</label>
  <CurrencyInput
    nullable
    value={manualPrice}
                            onChange={setManualPrice}
                            placeholder={formatCurrencyInputDraft(pricing.suggestedPrice)}
                            style={{ fontSize: '1.125rem', fontWeight: 700, textAlign: 'center' }}
                          />
                          <div className="form-hint">Se ficar vazio, o sistema usa o preço sugerido.</div>
                        </div>

                        <div
                          style={{
                            background: 'linear-gradient(135deg, var(--brand-600), var(--brand-700))',
                            borderRadius: 'var(--radius-lg)',
                            padding: 20,
                            color: 'white',
                            textAlign: 'center',
                            marginBottom: 16,
                          }}
                        >
                          <div style={{ fontSize: '0.75rem', opacity: 0.8, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Venda final
                          </div>
                          <div style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 12 }}>
                            {formatCurrency(pricing.salePrice)}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-around', gap: 12 }}>
                            <div>
                              <div style={{ fontSize: '0.6875rem', opacity: 0.7, textTransform: 'uppercase' }}>Lucro</div>
                              <div style={{ fontSize: '1.125rem', fontWeight: 700 }}>
                                {formatCurrency(pricing.profit)}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.6875rem', opacity: 0.7, textTransform: 'uppercase' }}>Margem</div>
                              <div style={{ fontSize: '1.125rem', fontWeight: 700 }}>
                                {pricing.profitMargin.toFixed(1)}%
                              </div>
                            </div>
                          </div>
                        </div>

                        {servingsTarget > 0 && (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                            <div className="card" style={{ padding: 14, boxShadow: 'none' }}>
                              <div className="text-xs text-muted">Custo por porção</div>
                              <div style={{ fontWeight: 800, marginTop: 4 }}>
                                {formatCurrency(pricing.totalCost / servingsTarget)}
                              </div>
                            </div>
                            <div className="card" style={{ padding: 14, boxShadow: 'none' }}>
                              <div className="text-xs text-muted">Venda por porção</div>
                              <div style={{ fontWeight: 800, marginTop: 4 }}>
                                {formatCurrency(pricing.salePrice / servingsTarget)}
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showSaveModal && (
        <div className="modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>{saveIntent === 'create' ? 'Salvar novo modelo' : 'Duplicar modelo'}</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowSaveModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Nome do modelo</label>
                <input
                  className="form-input"
                  value={presetNameDraft}
                  onChange={(event) => setPresetNameDraft(event.target.value)}
                  placeholder="Ex: Bolo 20cm premium"
                />
              </div>
              {presetError && <div className="form-error" style={{ marginTop: 0 }}>{presetError}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowSaveModal(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={handlePersistNewPreset} disabled={savingPreset}>
                {savingPreset ? 'Salvando...' : 'Salvar modelo'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          .sidebar, .header, .btn, .modal-overlay, .form-input, .form-select, .search-bar, input[type="range"] { display: none !important; }
          .main-content { margin-left: 0 !important; }
          .page-container { padding: 0 !important; }
          .grid-2 { grid-template-columns: 1fr !important; }
          .card { break-inside: avoid; box-shadow: none !important; border: 1px solid #ddd !important; }
        }
      `}</style>
    </div>
  )
}
