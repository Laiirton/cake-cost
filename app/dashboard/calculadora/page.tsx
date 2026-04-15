'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Plus,
  Save,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
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

export default function CalculadoraPage() {
  const searchParams = useSearchParams()
  const [recipes, setRecipes] = useState<RecipeSummary[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [presets, setPresets] = useState<CalculatorPreset[]>([])
  const [defaults, setDefaults] = useState<SettingsDefaults>(emptyDefaults)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ type: string; message: string } | null>(null)
  const [queryApplied, setQueryApplied] = useState(false)

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

  const supabase = useMemo(() => createClient(), [])

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

  const showToast = useCallback((type: string, message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }, [])

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
    showToast('success', 'Simulacao reiniciada.')
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

      const nextRecipes = (recipesRes.data || []).map((recipe) => ({
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
      const nextPresets = (presetsRes.data || []).map((preset) =>
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
      showToast('error', 'Nao foi possivel carregar os modelos e receitas.')
    } finally {
      setLoading(false)
    }
  }, [selectedRecipeId, showToast, supabase])

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
      showToast('success', 'Modelo excluido!')
    } catch (error) {
      showToast('error', getErrorMessage(error, 'Erro ao excluir modelo'))
    } finally {
      setDeletingPreset(false)
    }
  }

  const handlePrint = () => {
    window.print()
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
          <h1>Modelos e precos</h1>
          <p>Salve modelos prontos para vender sem recalcular tudo a cada pedido.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {selectedRecipe && (
            <button className="btn btn-secondary" onClick={handlePrint}>
              Imprimir resumo
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
                Nova simulacao
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
                        {recipe?.name || 'Receita removida'} {recipe?.category ? `• ${recipe.category}` : ''}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                        <span className="badge badge-neutral">{preset.servings || parseYieldToServings(recipe?.yield_label || '')} porcoes</span>
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
              <h3>Base da simulacao</h3>
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
              <h3>Escolha uma receita para comecar</h3>
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
                    {selectedPreset ? selectedPreset.name : `Simulacao de ${selectedRecipe.name}`}
                  </div>
                  <div className="text-sm text-muted">
                    {selectedPreset
                      ? 'Modelo carregado. Ajuste os custos e atualize se precisar.'
                      : 'Receita livre para testar preco, extras e margem.'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-secondary" onClick={startNewSimulation}>
                    Nova simulacao
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
                    <h3>Extras e personalizacao</h3>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addExtra}>
                      <Plus size={14} />
                      Adicionar extra
                    </button>
                  </div>
                  <div className="card-body" style={{ padding: extraItems.length > 0 ? '16px 24px' : '0 24px' }}>
                    {extraItems.length === 0 ? (
                      <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>
                        Nenhum extra adicionado. Use para topper, flores, caixas especiais ou itens cobrados a parte.
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
                        <label className="form-label">Porcoes planejadas</label>
                        <input
                          className="form-input"
                          type="number"
                          min="0"
                          value={servingsTarget || ''}
                          onChange={(event) => setServingsTarget(parseInt(event.target.value, 10) || 0)}
                        />
                        <div className="form-hint">Ajuda a enxergar custo e venda por porcao.</div>
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
                        <div className="form-hint">Mao de obra: {formatCurrency(laborHours * laborRate)}</div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Custo fixo considerado</label>
                        <CurrencyInput value={fixedCost} onChange={setFixedCost} />
                        <div className="form-hint">Se for custo mensal, ajuste a meta de pedidos abaixo.</div>
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Meta de pedidos/mes</label>
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
                    <h3>Observacoes do modelo</h3>
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
                    <h3>Resumo do preco</h3>
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
                              <span style={{ color: 'var(--text-secondary)' }}>Mao de obra</span>
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
                            Preco sugerido
                          </div>
                          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                            {formatCurrency(pricing.suggestedPrice)}
                          </div>
                        </div>

                        <div className="form-group" style={{ marginBottom: 16 }}>
                          <label className="form-label">Preco final</label>
                          <CurrencyInput
                            nullable
                            value={manualPrice}
                            onChange={setManualPrice}
                            placeholder={formatCurrencyInputDraft(pricing.suggestedPrice)}
                            style={{ fontSize: '1.125rem', fontWeight: 700, textAlign: 'center' }}
                          />
                          <div className="form-hint">Se ficar vazio, o sistema usa o preco sugerido.</div>
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
                              <div className="text-xs text-muted">Custo por porcao</div>
                              <div style={{ fontWeight: 800, marginTop: 4 }}>
                                {formatCurrency(pricing.totalCost / servingsTarget)}
                              </div>
                            </div>
                            <div className="card" style={{ padding: 14, boxShadow: 'none' }}>
                              <div className="text-xs text-muted">Venda por porcao</div>
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
