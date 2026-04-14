'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Search, Pencil, Trash2, X, Wheat, ArrowUpDown } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Ingredient {
  id: string
  name: string
  purchase_quantity: number
  purchase_unit: string
  purchase_price: number
  updated_year: number
  notes: string
  display_order: number
}

const emptyIngredient = {
  name: '',
  purchase_quantity: 0,
  purchase_unit: 'g',
  purchase_price: 0,
  updated_year: new Date().getFullYear(),
  notes: '',
  display_order: 0,
}

export default function IngredientesPage() {
  const [items, setItems] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Ingredient | null>(null)
  const [form, setForm] = useState(emptyIngredient)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: string; message: string } | null>(null)
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'year'>('name')
  const supabase = createClient()

  const load = useCallback(async () => {
    const { data } = await supabase.from('ingredients').select('*').order('display_order')
    setItems(data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const showToast = (type: string, message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }

  const openNew = () => {
    setEditing(null)
    setForm({ ...emptyIngredient, display_order: items.length })
    setShowModal(true)
  }

  const openEdit = (item: Ingredient) => {
    setEditing(item)
    setForm({
      name: item.name,
      purchase_quantity: item.purchase_quantity,
      purchase_unit: item.purchase_unit,
      purchase_price: item.purchase_price,
      updated_year: item.updated_year,
      notes: item.notes,
      display_order: item.display_order,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editing) {
        const { error } = await supabase.from('ingredients').update(form).eq('id', editing.id)
        if (error) throw error
        showToast('success', 'Ingrediente atualizado!')
      } else {
        const { error } = await supabase.from('ingredients').insert({ ...form, id: crypto.randomUUID() })
        if (error) throw error
        showToast('success', 'Ingrediente criado!')
      }
      setShowModal(false); load()
    } catch {
      showToast('error', 'Erro ao salvar ingrediente')
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir ingrediente? Receitas que usam este ingrediente podem ser afetadas.')) return
    try {
      await supabase.from('ingredients').delete().eq('id', id)
      showToast('success', 'Ingrediente excluído!')
      load()
    } catch { showToast('error', 'Erro ao excluir') }
  }

  const filtered = items
    .filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'price') return b.purchase_price - a.purchase_price
      if (sortBy === 'year') return b.updated_year - a.updated_year
      return a.name.localeCompare(b.name, 'pt-BR')
    })

  const totalValue = items.reduce((sum, i) => sum + i.purchase_price, 0)

  return (
    <div className="page-container">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

      <div className="page-header">
        <div>
          <h1>Ingredientes</h1>
          <p>{items.length} ingredientes cadastrados • Valor total em estoque: {formatCurrency(totalValue)}</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={18} /> Novo Ingrediente</button>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-bar" style={{ flex: 1, maxWidth: 360 }}>
          <Search size={18} />
          <input placeholder="Buscar ingrediente..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['name', 'price', 'year'] as const).map(s => (
            <button key={s} className={`btn btn-sm ${sortBy === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSortBy(s)}>
              <ArrowUpDown size={12} />
              {s === 'name' ? 'Nome' : s === 'price' ? 'Preço' : 'Ano'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="table-container">
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-light)' }}>
              <div className="skeleton" style={{ width: '60%', height: 16, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: '30%', height: 14 }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Wheat size={48} />
            <h3>Nenhum ingrediente encontrado</h3>
            <p>Cadastre os ingredientes que você usa nas suas receitas</p>
            <button className="btn btn-primary" onClick={openNew}><Plus size={18} /> Adicionar</button>
          </div>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ingrediente</th>
                <th style={{ textAlign: 'right' }}>Qtd Compra</th>
                <th>Unidade</th>
                <th style={{ textAlign: 'right' }}>Preço Pacote</th>
                <th style={{ textAlign: 'right' }}>Preço/Unidade</th>
                <th style={{ textAlign: 'center' }}>Ano</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const pricePerUnit = item.purchase_quantity > 0
                  ? item.purchase_price / item.purchase_quantity
                  : 0
                const isOld = item.updated_year < new Date().getFullYear()

                return (
                  <tr key={item.id}>
                    <td>
                      <div className="font-semibold">{item.name}</div>
                      {item.notes && <div className="text-xs text-muted truncate" style={{ maxWidth: 200 }}>{item.notes}</div>}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>{item.purchase_quantity}</td>
                    <td>{item.purchase_unit}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(item.purchase_price)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ fontWeight: 700, color: 'var(--brand-600)', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8125rem' }}>
                        {formatCurrency(pricePerUnit)}
                      </span>
                      <span className="text-xs text-muted">/{item.purchase_unit}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`badge ${isOld ? 'badge-warning' : 'badge-success'}`}>
                        {item.updated_year}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-icon" onClick={() => openEdit(item)} title="Editar"><Pencil size={16} /></button>
                        <button className="btn btn-ghost btn-icon" onClick={() => handleDelete(item.id)} title="Excluir" style={{ color: 'var(--danger-500)' }}><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing ? 'Editar Ingrediente' : 'Novo Ingrediente'}</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Nome *</label>
                <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Farinha de Trigo" autoFocus />
              </div>

              <div style={{ background: 'var(--gray-50)', borderRadius: 'var(--radius-lg)', padding: '16px', marginBottom: 20 }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 700, marginBottom: 12, color: 'var(--text-secondary)' }}>
                  📦 Dados de Compra
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Quantidade</label>
                    <input className="form-input" type="number" step="0.01" min="0" value={form.purchase_quantity || ''} onChange={e => setForm({ ...form, purchase_quantity: parseFloat(e.target.value) || 0 })} placeholder="Ex: 1000" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Unidade</label>
                    <select className="form-select" value={form.purchase_unit} onChange={e => setForm({ ...form, purchase_unit: e.target.value })}>
                      <option value="g">Gramas (g)</option>
                      <option value="kg">Quilos (kg)</option>
                      <option value="ml">Mililitros (ml)</option>
                      <option value="L">Litros (L)</option>
                      <option value="un">Unidade (un)</option>
                      <option value="dz">Dúzia (dz)</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Preço (R$)</label>
                    <input className="form-input" type="number" step="0.01" min="0" value={form.purchase_price || ''} onChange={e => setForm({ ...form, purchase_price: parseFloat(e.target.value) || 0 })} placeholder="0,00" />
                  </div>
                </div>

                {form.purchase_quantity > 0 && form.purchase_price > 0 && (
                  <div style={{ marginTop: 12, padding: '10px 14px', background: 'white', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="text-sm text-muted">Custo por {form.purchase_unit}:</span>
                    <span style={{ fontWeight: 800, color: 'var(--brand-600)', fontSize: '1rem' }}>
                      {formatCurrency(form.purchase_price / form.purchase_quantity)}/{form.purchase_unit}
                    </span>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Ano da Atualização do Preço</label>
                <input className="form-input" type="number" value={form.updated_year} onChange={e => setForm({ ...form, updated_year: parseInt(e.target.value) || new Date().getFullYear() })} />
                <div className="form-hint">Informe o ano em que este preço foi verificado</div>
              </div>

              <div className="form-group">
                <label className="form-label">Observações</label>
                <textarea className="form-textarea" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Ex: Marca preferida, onde comprar mais barato..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Salvando...' : editing ? 'Atualizar' : 'Criar Ingrediente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
