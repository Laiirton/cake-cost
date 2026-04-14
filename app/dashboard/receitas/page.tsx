'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, Search, Pencil, Trash2, X, BookOpen, ChevronDown, ChevronRight, GripVertical,
} from 'lucide-react'
import {
  formatCurrency, calculateItemCost, calculateSectionCost, calculateRecipeTotalCost,
  RECIPE_SECTIONS, uid,
  type Ingredient, type RecipeItem,
} from '@/lib/utils'

interface Recipe {
  id: string
  name: string
  category: string
  size_label: string
  yield_label: string
  notes: string
  items: RecipeItem[]
  display_order: number
}

export default function ReceitasPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showEditor, setShowEditor] = useState(false)
  const [editing, setEditing] = useState<Recipe | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: string; message: string } | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formSize, setFormSize] = useState('')
  const [formYield, setFormYield] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formItems, setFormItems] = useState<RecipeItem[]>([])
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(RECIPE_SECTIONS.map(s => s.key))
  )

  const supabase = createClient()

  const ingredientsMap = useMemo(() => {
    const m = new Map<string, Ingredient>()
    ingredients.forEach(i => m.set(i.id, i))
    return m
  }, [ingredients])

  const load = useCallback(async () => {
    const [recipesRes, ingredientsRes] = await Promise.all([
      supabase.from('recipes').select('*').order('display_order'),
      supabase.from('ingredients').select('*').order('name'),
    ])
    if (recipesRes.error) {
      console.error('Erro ao carregar receitas:', recipesRes.error)
      showToast('error', `Erro receitas: ${recipesRes.error.message}`)
    }
    if (ingredientsRes.error) {
      console.error('Erro ao carregar ingredientes:', ingredientsRes.error)
      showToast('error', `Erro ingredientes: ${ingredientsRes.error.message}`)
    }
    setRecipes((recipesRes.data || []).map(r => ({
      ...r,
      items: Array.isArray(r.items) ? r.items : [],
    })))
    setIngredients(ingredientsRes.data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const showToast = (type: string, message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }

  const openNew = () => {
    setEditing(null)
    setFormName(''); setFormCategory(''); setFormSize(''); setFormYield(''); setFormNotes('')
    setFormItems([])
    setExpandedSections(new Set(RECIPE_SECTIONS.map(s => s.key)))
    setShowEditor(true)
  }

  const openEdit = (recipe: Recipe) => {
    setEditing(recipe)
    setFormName(recipe.name)
    setFormCategory(recipe.category)
    setFormSize(recipe.size_label)
    setFormYield(recipe.yield_label)
    setFormNotes(recipe.notes)
    setFormItems(recipe.items.map(i => ({ ...i, uid: i.uid || uid() })))
    setExpandedSections(new Set(RECIPE_SECTIONS.map(s => s.key)))
    setShowEditor(true)
  }

  const handleSave = async () => {
    if (!formName.trim()) return
    setSaving(true)
    try {
      const payload = {
        name: formName,
        category: formCategory,
        size_label: formSize,
        yield_label: formYield,
        notes: formNotes,
        items: formItems,
      }
      if (editing) {
        const { error } = await supabase.from('recipes').update(payload).eq('id', editing.id)
        if (error) throw error
        showToast('success', 'Receita atualizada!')
      } else {
        const { error } = await supabase.from('recipes').insert({ ...payload, id: crypto.randomUUID(), display_order: recipes.length })
        if (error) throw error
        showToast('success', 'Receita criada!')
      }
      setShowEditor(false)
      load()
    } catch (err) {
      console.error(err)
      showToast('error', 'Erro ao salvar receita')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta receita? Essa ação não pode ser desfeita.')) return
    try {
      const { error } = await supabase.from('recipes').delete().eq('id', id)
      if (error) throw error
      showToast('success', 'Receita excluída!')
      load()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message || 'Erro desconhecido'
      console.error('Erro ao excluir receita:', err)
      showToast('error', `Erro ao excluir: ${msg}`)
    }
  }

  // Item management
  const addItem = (section: RecipeItem['section']) => {
    const firstIngredient = ingredients[0]
    if (!firstIngredient) {
      showToast('error', 'Cadastre ingredientes primeiro!')
      return
    }
    setFormItems(prev => [...prev, {
      uid: uid(),
      section,
      ingredient_id: firstIngredient.id,
      quantity: 0,
      unit: firstIngredient.purchase_unit,
    }])
  }

  const updateItem = (itemUid: string, field: keyof RecipeItem, value: string | number) => {
    setFormItems(prev => prev.map(item => {
      if (item.uid !== itemUid) return item
      const updated = { ...item, [field]: value }
      // When ingredient changes, auto-set the unit
      if (field === 'ingredient_id') {
        const ing = ingredientsMap.get(value as string)
        if (ing) updated.unit = ing.purchase_unit
      }
      return updated
    }))
  }

  const removeItem = (itemUid: string) => {
    setFormItems(prev => prev.filter(i => i.uid !== itemUid))
  }

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const filtered = recipes.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.category.toLowerCase().includes(search.toLowerCase())
  )

  const categories = [...new Set(recipes.map(r => r.category).filter(Boolean))]

  return (
    <div className="page-container">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

      <div className="page-header">
        <div>
          <h1>Receitas</h1>
          <p>Gerencie receitas com cálculo automático de custos</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={18} /> Nova Receita
        </button>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 20 }}>
        <div className="search-bar">
          <Search size={18} />
          <input placeholder="Buscar receita..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Recipe List */}
      {loading ? (
        <div className="table-container">
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-light)' }}>
              <div className="skeleton" style={{ width: '50%', height: 16, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: '30%', height: 14 }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <BookOpen size={48} />
            <h3>Nenhuma receita encontrada</h3>
            <p>Crie suas receitas com ingredientes e custos automáticos</p>
            <button className="btn btn-primary" onClick={openNew}>
              <Plus size={18} /> Criar Receita
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {filtered.map(recipe => {
            const totalCost = calculateRecipeTotalCost(recipe.items, ingredientsMap)
            const sectionCounts: Record<string, number> = {}
            for (const sec of RECIPE_SECTIONS) {
              sectionCounts[sec.key] = recipe.items.filter(i => i.section === sec.key).length
            }
            return (
              <div key={recipe.id} className="card" style={{ cursor: 'pointer' }} onClick={() => openEdit(recipe)}>
                <div className="card-body" style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <h3 style={{ fontSize: '1.05rem', marginBottom: 4 }}>{recipe.name}</h3>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {recipe.category && <span className="badge badge-brand">{recipe.category}</span>}
                        {recipe.size_label && <span className="badge badge-neutral">{recipe.size_label}</span>}
                        {recipe.yield_label && <span className="badge badge-neutral">{recipe.yield_label}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-icon" onClick={(e) => { e.stopPropagation(); openEdit(recipe) }}><Pencil size={16} /></button>
                      <button className="btn btn-ghost btn-icon" onClick={(e) => { e.stopPropagation(); handleDelete(recipe.id) }} style={{ color: 'var(--danger-500)' }}><Trash2 size={16} /></button>
                    </div>
                  </div>

                  {/* Section breakdown */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
                    {RECIPE_SECTIONS.filter(s => sectionCounts[s.key] > 0).map(sec => (
                      <span key={sec.key}>{sec.emoji} {sec.label}: {sectionCounts[sec.key]} itens</span>
                    ))}
                  </div>

                  {/* Cost */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)' }}>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Custo Total dos Ingredientes</span>
                    <span style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--brand-600)' }}>
                      {formatCurrency(totalCost)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ============ RECIPE EDITOR MODAL ============ */}
      {showEditor && (
        <div className="modal-overlay" onClick={() => setShowEditor(false)}>
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 800, maxHeight: '95vh' }}
          >
            <div className="modal-header">
              <h2>{editing ? 'Editar Receita' : 'Nova Receita'}</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowEditor(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: 'calc(95vh - 140px)', overflowY: 'auto' }}>
              {/* Basic Info */}
              <div className="form-group">
                <label className="form-label">Nome da Receita *</label>
                <input className="form-input" value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: Bolo de Chocolate 20cm" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Categoria</label>
                  <input className="form-input" value={formCategory} onChange={e => setFormCategory(e.target.value)} placeholder="Ex: Bolos" list="recipe-categories" />
                  <datalist id="recipe-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
                </div>
                <div className="form-group">
                  <label className="form-label">Tamanho</label>
                  <input className="form-input" value={formSize} onChange={e => setFormSize(e.target.value)} placeholder="Ex: 20cm, 25x10" />
                </div>
                <div className="form-group">
                  <label className="form-label">Rendimento</label>
                  <input className="form-input" value={formYield} onChange={e => setFormYield(e.target.value)} placeholder="Ex: 20 fatias, 40 porções" />
                </div>
              </div>

              {/* ===== SECTIONS WITH INGREDIENTS ===== */}
              <div style={{ marginTop: 24, marginBottom: 8 }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 4 }}>
                  Ingredientes por Seção
                </h3>
                <p className="text-sm text-muted">
                  Adicione ingredientes em cada seção. O custo é calculado automaticamente.
                </p>
              </div>

              {RECIPE_SECTIONS.map(section => {
                const sectionItems = formItems.filter(i => i.section === section.key)
                const sectionCost = calculateSectionCost(formItems, section.key, ingredientsMap)
                const isExpanded = expandedSections.has(section.key)

                return (
                  <div
                    key={section.key}
                    style={{
                      border: '1px solid var(--border-light)',
                      borderRadius: 'var(--radius-lg)',
                      marginBottom: 12,
                      overflow: 'hidden',
                    }}
                  >
                    {/* Section Header */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        background: 'var(--gray-50)',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                      onClick={() => toggleSection(section.key)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        <span style={{ fontSize: '1.125rem' }}>{section.emoji}</span>
                        <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>{section.label}</span>
                        <span className="badge badge-neutral">{sectionItems.length} itens</span>
                      </div>
                      <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--brand-600)' }}>
                        {formatCurrency(sectionCost)}
                      </span>
                    </div>

                    {/* Section Body */}
                    {isExpanded && (
                      <div style={{ padding: '12px 16px' }}>
                        {sectionItems.length > 0 && (
                          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
                            <thead>
                              <tr style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <th style={{ textAlign: 'left', padding: '4px 8px 8px 0' }}>Ingrediente</th>
                                <th style={{ textAlign: 'right', padding: '4px 8px 8px', width: 90 }}>Qtd</th>
                                <th style={{ textAlign: 'center', padding: '4px 8px 8px', width: 60 }}>Und</th>
                                <th style={{ textAlign: 'right', padding: '4px 8px 8px', width: 100 }}>Custo</th>
                                <th style={{ width: 36, padding: '4px 0 8px' }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {sectionItems.map(item => {
                                const ingredient = ingredientsMap.get(item.ingredient_id)
                                const cost = calculateItemCost(item, ingredient)
                                return (
                                  <tr key={item.uid} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                    <td style={{ padding: '6px 8px 6px 0' }}>
                                      <select
                                        className="form-select"
                                        style={{ padding: '6px 8px', fontSize: '0.8125rem' }}
                                        value={item.ingredient_id}
                                        onChange={e => updateItem(item.uid, 'ingredient_id', e.target.value)}
                                      >
                                        {ingredients.map(ing => (
                                          <option key={ing.id} value={ing.id}>
                                            {ing.name} ({formatCurrency(ing.purchase_price)}/{ing.purchase_quantity}{ing.purchase_unit})
                                          </option>
                                        ))}
                                      </select>
                                    </td>
                                    <td style={{ padding: '6px 8px' }}>
                                      <input
                                        className="form-input"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        style={{ textAlign: 'right', padding: '6px 8px', fontSize: '0.8125rem' }}
                                        value={item.quantity || ''}
                                        onChange={e => updateItem(item.uid, 'quantity', parseFloat(e.target.value) || 0)}
                                      />
                                    </td>
                                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                      <select
                                        className="form-select"
                                        style={{ padding: '6px 4px', fontSize: '0.8125rem', textAlign: 'center' }}
                                        value={item.unit}
                                        onChange={e => updateItem(item.uid, 'unit', e.target.value)}
                                      >
                                        <option value="g">g</option>
                                        <option value="kg">kg</option>
                                        <option value="ml">ml</option>
                                        <option value="L">L</option>
                                        <option value="un">un</option>
                                        <option value="dz">dz</option>
                                        <option value="colher">colher</option>
                                        <option value="xic">xíc</option>
                                      </select>
                                    </td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontSize: '0.8125rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                      {formatCurrency(cost)}
                                    </td>
                                    <td style={{ padding: '6px 0' }}>
                                      <button
                                        className="btn btn-ghost btn-icon btn-sm"
                                        onClick={() => removeItem(item.uid)}
                                        style={{ color: 'var(--danger-500)' }}
                                      >
                                        <X size={14} />
                                      </button>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        )}

                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => addItem(section.key)}
                          style={{ width: '100%' }}
                        >
                          <Plus size={14} /> Adicionar {section.label}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Recipe Total */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 20px',
                background: 'linear-gradient(135deg, var(--brand-50), var(--accent-50))',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--brand-200)',
                marginTop: 8,
                marginBottom: 16,
              }}>
                <span style={{ fontSize: '0.9375rem', fontWeight: 700 }}>
                  💰 Custo Total da Receita
                </span>
                <span style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--brand-600)' }}>
                  {formatCurrency(calculateRecipeTotalCost(formItems, ingredientsMap))}
                </span>
              </div>

              {/* Notes */}
              <div className="form-group">
                <label className="form-label">Observações</label>
                <textarea className="form-textarea" value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Ex: Massa baunilha, 4 colher sopa de essência..." />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowEditor(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Salvando...' : editing ? 'Atualizar Receita' : 'Criar Receita'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
