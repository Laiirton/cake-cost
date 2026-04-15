'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Calculator, ChevronDown, ChevronRight, Plus, Trash2, Printer, Save, BookOpen, X } from 'lucide-react'
import {
  formatCurrency, calculateItemCost, calculateSectionCost, calculatePricing,
  RECIPE_SECTIONS, uid,
  type Ingredient, type RecipeItem, type PricingBreakdown,
} from '@/lib/utils'

interface Recipe {
  id: string; name: string; category: string; size_label: string; yield_label: string; items: RecipeItem[]
}

interface BakerySettings {
  default_markup_pct: number; labor_hour_rate: number; monthly_fixed_cost: number
  monthly_order_goal: number; packaging_cost_default: number; delivery_cost_default: number
}

interface ExtraItem { uid: string; name: string; cost: number }

const defaultSettings: BakerySettings = {
  default_markup_pct: 50,
  labor_hour_rate: 0,
  monthly_fixed_cost: 0,
  monthly_order_goal: 1,
  packaging_cost_default: 0,
  delivery_cost_default: 0,
}

export default function CalculadoraPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [settings, setSettings] = useState<BakerySettings>(defaultSettings)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ type: string; message: string } | null>(null)

  // Calculator state
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>('')
  const [laborHours, setLaborHours] = useState(0)
  const [laborRate, setLaborRate] = useState(0)
  const [fixedCost, setFixedCost] = useState(0)
  const [orderGoal, setOrderGoal] = useState(1)
  const [packagingCost, setPackagingCost] = useState(0)
  const [deliveryCost, setDeliveryCost] = useState(0)
  const [markupPct, setMarkupPct] = useState(50)
  const [manualPrice, setManualPrice] = useState<number | null>(null)
  const [extraItems, setExtraItems] = useState<ExtraItem[]>([])
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(RECIPE_SECTIONS.map(s => s.key)))

  // Saving preset state
  const [savingPreset, setSavingPreset] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [showSaveModal, setShowSaveModal] = useState(false)

  const supabase = useMemo(() => createClient(), [])

  const ingredientsMap = useMemo(() => {
    const m = new Map<string, Ingredient>()
    ingredients.forEach(i => m.set(i.id, i))
    return m
  }, [ingredients])

  const selectedRecipe = useMemo(
    () => recipes.find(r => r.id === selectedRecipeId),
    [recipes, selectedRecipeId]
  )

  const load = useCallback(async () => {
    const [recipesRes, ingredientsRes, settingsRes] = await Promise.all([
      supabase.from('recipes').select('id, name, category, size_label, yield_label, items').order('name'),
      supabase.from('ingredients').select('*').order('name'),
      supabase.from('bakery_settings').select('*').limit(1).single(),
    ])
    setRecipes((recipesRes.data || []).map(r => ({ ...r, items: Array.isArray(r.items) ? r.items : [] })))
    setIngredients(ingredientsRes.data || [])
    if (settingsRes.data) {
      const s = settingsRes.data
      setSettings(s)
      setLaborRate(s.labor_hour_rate)
      setFixedCost(s.monthly_fixed_cost)
      setOrderGoal(s.monthly_order_goal || 1)
      setPackagingCost(s.packaging_cost_default)
      setDeliveryCost(s.delivery_cost_default)
      setMarkupPct(s.default_markup_pct)
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const showToast = (type: string, message: string) => { setToast({ type, message }); setTimeout(() => setToast(null), 3000) }

  // Pricing calculation
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
  }, [selectedRecipe, ingredientsMap, extraItems, laborHours, laborRate, fixedCost, orderGoal, packagingCost, deliveryCost, markupPct, manualPrice])

  const handleSelectRecipe = (id: string) => {
    setSelectedRecipeId(id)
    setManualPrice(null)
    setExtraItems([])
    setLaborHours(0)
  }

  const addExtra = () => {
    setExtraItems(prev => [...prev, { uid: uid(), name: '', cost: 0 }])
  }

  const updateExtra = (extraUid: string, field: 'name' | 'cost', value: string | number) => {
    setExtraItems(prev => prev.map(e => e.uid === extraUid ? { ...e, [field]: value } : e))
  }

  const removeExtra = (extraUid: string) => {
    setExtraItems(prev => prev.filter(e => e.uid !== extraUid))
  }

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleSavePreset = async () => {
    if (!presetName.trim() || !selectedRecipe || !pricing) return
    setSavingPreset(true)
    try {
      await supabase.from('calculator_presets').insert({
        id: crypto.randomUUID(),
        name: presetName,
        recipe_id: selectedRecipe.id,
        size_label: selectedRecipe.size_label,
        servings: 0,
        markup_pct: markupPct,
        labor_hours: laborHours,
        labor_hour_rate: laborRate,
        fixed_cost: pricing.fixedCostPerOrder,
        packaging_cost: packagingCost,
        delivery_cost: deliveryCost,
        extra_items: extraItems,
        notes: `Preço sugerido: ${formatCurrency(pricing.suggestedPrice)} | Lucro: ${formatCurrency(pricing.profit)}`,
        display_order: 0,
      })
      showToast('success', 'Preset salvo!')
      setShowSaveModal(false)
      setPresetName('')
    } catch { showToast('error', 'Erro ao salvar') } finally { setSavingPreset(false) }
  }

  const handlePrint = () => {
    window.print()
  }

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-header"><div><h1>Calculadora de Preços</h1></div></div>
        <div className="card"><div className="card-body">{[1,2,3,4].map(i => <div key={i} style={{ marginBottom: 16 }}><div className="skeleton" style={{ width: '30%', height: 14, marginBottom: 8 }} /><div className="skeleton" style={{ width: '100%', height: 40 }} /></div>)}</div></div>
      </div>
    )
  }

  return (
    <div className="page-container">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

      <div className="page-header">
        <div>
          <h1>Calculadora de Preços</h1>
          <p>Calcule o custo, preço de venda e lucro dos seus produtos</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {pricing && (
            <>
              <button className="btn btn-secondary" onClick={handlePrint}><Printer size={16} /> Imprimir</button>
              <button className="btn btn-primary" onClick={() => { setPresetName(selectedRecipe?.name || ''); setShowSaveModal(true) }}><Save size={16} /> Salvar Preset</button>
            </>
          )}
        </div>
      </div>

      {/* Recipe Selector */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-body" style={{ padding: '20px 24px' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Selecione a Receita</label>
            <select
              className="form-select"
              value={selectedRecipeId}
              onChange={e => handleSelectRecipe(e.target.value)}
              style={{ fontSize: '1rem', padding: '12px 16px' }}
            >
              <option value="">Escolha uma receita...</option>
              {recipes.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name} {r.size_label ? `(${r.size_label})` : ''} {r.category ? `- ${r.category}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!selectedRecipe ? (
        <div className="card">
          <div className="empty-state">
            <BookOpen size={56} />
            <h3>Selecione uma receita para calcular</h3>
            <p>Escolha uma receita acima para ver a análise completa de custo e precificação</p>
          </div>
        </div>
      ) : (
        <div className="grid-2" style={{ gridTemplateColumns: '1fr 380px', alignItems: 'start' }}>
          {/* LEFT: Cost Breakdown */}
          <div>
            {/* Ingredient Cost Breakdown by Section */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9375rem' }}>
                  🧾 Custos dos Ingredientes
                </h3>
                <span style={{ fontWeight: 800, color: 'var(--brand-600)' }}>
                  {formatCurrency(pricing?.ingredientCost || 0)}
                </span>
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                {RECIPE_SECTIONS.map(section => {
                  const sectionItems = selectedRecipe.items.filter(i => i.section === section.key)
                  if (sectionItems.length === 0) return null
                  const sectionCost = pricing?.sectionCosts[section.key] || 0
                  const isExpanded = expandedSections.has(section.key)

                  return (
                    <div key={section.key} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <div
                        onClick={() => toggleSection(section.key)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '12px 24px', cursor: 'pointer', userSelect: 'none',
                          background: isExpanded ? 'var(--gray-50)' : 'transparent',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          <span>{section.emoji}</span>
                          <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>{section.label}</span>
                          <span className="badge badge-neutral" style={{ fontSize: '0.6875rem' }}>{sectionItems.length}</span>
                        </div>
                        <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--brand-600)' }}>
                          {formatCurrency(sectionCost)}
                        </span>
                      </div>

                      {isExpanded && (
                        <div style={{ padding: '0 24px 12px' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <tbody>
                              {sectionItems.map(item => {
                                const ing = ingredientsMap.get(item.ingredient_id)
                                const cost = calculateItemCost(item, ing)
                                return (
                                  <tr key={item.uid || item.ingredient_id} style={{ fontSize: '0.8125rem' }}>
                                    <td style={{ padding: '4px 0', color: 'var(--text-secondary)' }}>
                                      {ing?.name || 'Ingrediente removido'}
                                    </td>
                                    <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                                      {item.quantity} {item.unit}
                                    </td>
                                    <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
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

            {/* Extra Items */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <h3 style={{ fontSize: '0.9375rem' }}>📦 Itens Extras</h3>
                <button className="btn btn-secondary btn-sm" onClick={addExtra}>
                  <Plus size={14} /> Adicionar
                </button>
              </div>
              <div className="card-body" style={{ padding: extraItems.length > 0 ? '16px 24px' : '0 24px' }}>
                {extraItems.length === 0 ? (
                  <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>
                    Nenhum item extra (ex: topper, fita, caixa especial)
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {extraItems.map(extra => (
                      <div key={extra.uid} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input className="form-input" placeholder="Ex: Topper" value={extra.name} onChange={e => updateExtra(extra.uid, 'name', e.target.value)} style={{ flex: 1, padding: '8px 10px', fontSize: '0.8125rem' }} />
                        <input className="form-input" type="number" step="0.01" min="0" value={extra.cost || ''} onChange={e => updateExtra(extra.uid, 'cost', parseFloat(e.target.value) || 0)} style={{ width: 110, textAlign: 'right', padding: '8px 10px', fontSize: '0.8125rem' }} placeholder="R$ 0,00" />
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => removeExtra(extra.uid)} style={{ color: 'var(--danger-500)' }}><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Labor & Fixed Costs */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <h3 style={{ fontSize: '0.9375rem' }}>⚙️ Custos Operacionais</h3>
              </div>
              <div className="card-body">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Horas de Trabalho</label>
                    <input className="form-input" type="number" step="0.5" min="0" value={laborHours || ''} onChange={e => setLaborHours(parseFloat(e.target.value) || 0)} placeholder="0" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Valor/Hora (R$)</label>
                    <input className="form-input" type="number" step="0.01" min="0" value={laborRate || ''} onChange={e => setLaborRate(parseFloat(e.target.value) || 0)} />
                    <div className="form-hint">Mão de obra: {formatCurrency(laborHours * laborRate)}</div>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Custo Fixo Mensal (R$)</label>
                    <input className="form-input" type="number" step="0.01" min="0" value={fixedCost || ''} onChange={e => setFixedCost(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Meta Pedidos/Mês</label>
                    <input className="form-input" type="number" min="1" value={orderGoal || ''} onChange={e => setOrderGoal(parseInt(e.target.value) || 1)} />
                    <div className="form-hint">Custo fixo/pedido: {formatCurrency(orderGoal > 0 ? fixedCost / orderGoal : 0)}</div>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Embalagem (R$)</label>
                    <input className="form-input" type="number" step="0.01" min="0" value={packagingCost || ''} onChange={e => setPackagingCost(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Entrega (R$)</label>
                    <input className="form-input" type="number" step="0.01" min="0" value={deliveryCost || ''} onChange={e => setDeliveryCost(parseFloat(e.target.value) || 0)} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Pricing Summary */}
          <div style={{ position: 'sticky', top: 'calc(var(--header-height) + 24px)' }}>
            <div className="card" style={{ border: '2px solid var(--brand-200)' }}>
              <div className="card-header" style={{ background: 'linear-gradient(135deg, var(--brand-50), var(--accent-50))' }}>
                <h3 style={{ fontSize: '1rem' }}>💰 Resumo de Preço</h3>
              </div>
              <div className="card-body" style={{ padding: '20px' }}>
                {pricing && (
                  <>
                    {/* Cost breakdown lines */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.8125rem', marginBottom: 16 }}>
                      {RECIPE_SECTIONS.map(sec => {
                        const cost = pricing.sectionCosts[sec.key]
                        if (!cost || cost <= 0) return null
                        return (
                          <div key={sec.key} style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>{sec.emoji} {sec.label}</span>
                            <span style={{ fontWeight: 600 }}>{formatCurrency(cost)}</span>
                          </div>
                        )
                      })}
                      {pricing.extraItemsCost > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>📦 Extras</span>
                          <span style={{ fontWeight: 600 }}>{formatCurrency(pricing.extraItemsCost)}</span>
                        </div>
                      )}
                      {pricing.laborCost > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>👩‍🍳 Mão de obra</span>
                          <span style={{ fontWeight: 600 }}>{formatCurrency(pricing.laborCost)}</span>
                        </div>
                      )}
                      {pricing.fixedCostPerOrder > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>🏠 Custo fixo</span>
                          <span style={{ fontWeight: 600 }}>{formatCurrency(pricing.fixedCostPerOrder)}</span>
                        </div>
                      )}
                      {pricing.packagingCost > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>🎁 Embalagem</span>
                          <span style={{ fontWeight: 600 }}>{formatCurrency(pricing.packagingCost)}</span>
                        </div>
                      )}
                      {pricing.deliveryCost > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>🚗 Entrega</span>
                          <span style={{ fontWeight: 600 }}>{formatCurrency(pricing.deliveryCost)}</span>
                        </div>
                      )}
                    </div>

                    {/* Total Cost */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px solid var(--border-light)', borderBottom: '1px solid var(--border-light)', marginBottom: 16 }}>
                      <span style={{ fontWeight: 700 }}>Custo Total</span>
                      <span style={{ fontWeight: 800, fontSize: '1.125rem' }}>{formatCurrency(pricing.totalCost)}</span>
                    </div>

                    {/* Markup */}
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
                        onChange={e => { setMarkupPct(parseInt(e.target.value)); setManualPrice(null) }}
                        style={{ width: '100%', accentColor: 'var(--brand-500)' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
                        <span>0%</span>
                        <span>100%</span>
                        <span>200%</span>
                      </div>
                    </div>

                    {/* Suggested Price */}
                    <div style={{ background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', padding: '12px 14px', marginBottom: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: 4 }}>Preço Sugerido (custo + {markupPct}%)</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>{formatCurrency(pricing.suggestedPrice)}</div>
                    </div>

                    {/* Manual Sale Price */}
                    <div className="form-group" style={{ marginBottom: 16 }}>
                      <label className="form-label">Preço de Venda Final (R$)</label>
                      <input
                        className="form-input"
                        type="number"
                        step="0.01"
                        min="0"
                        value={manualPrice !== null ? manualPrice : ''}
                        onChange={e => {
                          const v = e.target.value
                          setManualPrice(v ? parseFloat(v) : null)
                        }}
                        placeholder={pricing.suggestedPrice.toFixed(2)}
                        style={{ fontSize: '1.125rem', textAlign: 'center', fontWeight: 700 }}
                      />
                      <div className="form-hint">Deixe vazio para usar o preço sugerido</div>
                    </div>

                    {/* Final Price & Profit */}
                    <div style={{
                      background: 'linear-gradient(135deg, var(--brand-600), var(--brand-700))',
                      borderRadius: 'var(--radius-lg)',
                      padding: '20px',
                      color: 'white',
                      textAlign: 'center',
                    }}>
                      <div style={{ fontSize: '0.75rem', opacity: 0.8, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Preço de Venda</div>
                      <div style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 12, letterSpacing: '-0.02em' }}>
                        {formatCurrency(pricing.salePrice)}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                        <div>
                          <div style={{ fontSize: '0.6875rem', opacity: 0.7, textTransform: 'uppercase' }}>Lucro</div>
                          <div style={{ fontSize: '1.125rem', fontWeight: 700, color: pricing.profit >= 0 ? '#86efac' : '#fca5a5' }}>
                            {formatCurrency(pricing.profit)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.6875rem', opacity: 0.7, textTransform: 'uppercase' }}>Margem</div>
                          <div style={{ fontSize: '1.125rem', fontWeight: 700, color: pricing.profitMargin >= 0 ? '#86efac' : '#fca5a5' }}>
                            {pricing.profitMargin.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save Preset Modal */}
      {showSaveModal && (
        <div className="modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Salvar Preset</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowSaveModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Nome do Preset</label>
                <input className="form-input" value={presetName} onChange={e => setPresetName(e.target.value)} placeholder="Ex: Bolo 20cm Chocolate" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowSaveModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSavePreset} disabled={savingPreset}>{savingPreset ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Print Styles */}
      <style>{`
        @media print {
          .sidebar, .header, .btn, .modal-overlay, .form-input, .form-select, .search-bar, input[type="range"] { display: none !important; }
          .main-content { margin-left: 0 !important; }
          .page-container { padding: 0 !important; }
          .grid-2 { grid-template-columns: 1fr 1fr !important; }
          .card { break-inside: avoid; box-shadow: none !important; border: 1px solid #ddd !important; }
        }
      `}</style>
    </div>
  )
}
