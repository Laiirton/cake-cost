'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Search, Pencil, Trash2, X, DollarSign, TrendingUp, TrendingDown } from 'lucide-react'
import { formatCurrency, formatDate, parseCurrencyInput, formatCurrencyInput } from '@/lib/utils'
import CurrencyInput from '@/app/dashboard/components/CurrencyInput'

interface CashEntry {
  id: string; kind: string; category: string; description: string; amount: number; occurred_on: string; order_id: string | null; display_order: number
}

const kindOptions = [
  { value: 'income', label: 'Receita' },
  { value: 'expense', label: 'Despesa' },
]

export default function FinanceiroPage() {
  const [items, setItems] = useState<CashEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterKind, setFilterKind] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<CashEntry | null>(null)
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: string; message: string } | null>(null)
  const supabase = useMemo(() => createClient(), [])

  const load = useCallback(async () => {
    const { data } = await supabase.from('cash_entries').select('*').order('occurred_on', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const showToast = (type: string, message: string) => { setToast({ type, message }); setTimeout(() => setToast(null), 3000) }

  const openNew = () => { setEditing(null); setForm({ kind: 'income', category: '', description: '', amount: 0, occurred_on: new Date().toISOString().split('T')[0], order_id: null, display_order: 0 }); setShowModal(true) }
  const openEdit = (item: CashEntry) => { setEditing(item); setForm({ kind: item.kind, category: item.category, description: item.description, amount: item.amount, occurred_on: item.occurred_on, order_id: item.order_id, display_order: item.display_order }); setShowModal(true) }

  const handleSave = async () => {
    if (!(form.description as string)?.trim()) return
    setSaving(true)
    try {
      if (editing) {
        const { error } = await supabase.from('cash_entries').update(form).eq('id', editing.id)
        if (error) throw error
        showToast('success', 'Lançamento atualizado!')
      } else {
        const { error } = await supabase.from('cash_entries').insert({ ...form, id: crypto.randomUUID() })
        if (error) throw error
        showToast('success', 'Lançamento criado!')
      }
      setShowModal(false); load()
    } catch { showToast('error', 'Erro ao salvar') } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir lançamento?')) return
    try {
      const { error } = await supabase.from('cash_entries').delete().eq('id', id)
      if (error) throw error
      showToast('success', 'Excluído!')
      load()
    } catch {
      showToast('error', 'Erro ao excluir')
    }
  }

  const filtered = items.filter(i => {
    const matchSearch = i.description.toLowerCase().includes(search.toLowerCase()) || i.category.toLowerCase().includes(search.toLowerCase())
    const matchKind = filterKind === 'all' || i.kind === filterKind
    return matchSearch && matchKind
  })

  const totalIncome = items.filter(i => i.kind === 'income').reduce((s, i) => s + i.amount, 0)
  const totalExpense = items.filter(i => i.kind === 'expense').reduce((s, i) => s + i.amount, 0)
  const balance = totalIncome - totalExpense

  return (
    <div className="page-container">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
      <div className="page-header"><div><h1>Financeiro</h1><p>Controle de receitas e despesas</p></div><button className="btn btn-primary" onClick={openNew}><Plus size={18} /> Novo Lançamento</button></div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="stat-card"><div className="stat-icon"><TrendingUp size={24} /></div><div className="stat-value" style={{ color: 'var(--success-600)' }}>{formatCurrency(totalIncome)}</div><div className="stat-label">Receitas</div></div>
        <div className="stat-card"><div className="stat-icon"><TrendingDown size={24} /></div><div className="stat-value" style={{ color: 'var(--danger-500)' }}>{formatCurrency(totalExpense)}</div><div className="stat-label">Despesas</div></div>
        <div className="stat-card"><div className="stat-icon"><DollarSign size={24} /></div><div className="stat-value" style={{ color: balance >= 0 ? 'var(--success-600)' : 'var(--danger-500)' }}>{formatCurrency(balance)}</div><div className="stat-label">Saldo</div></div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-bar"><Search size={18} /><input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['all', 'income', 'expense'].map(k => <button key={k} className={`btn btn-sm ${filterKind === k ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilterKind(k)}>{k === 'all' ? 'Todos' : k === 'income' ? 'Receitas' : 'Despesas'}</button>)}
        </div>
      </div>

      {loading ? <div className="table-container">{[1,2,3].map(i => <div key={i} style={{ padding: 14, borderBottom: '1px solid var(--border-light)' }}><div className="skeleton" style={{ width: '50%', height: 16 }} /></div>)}</div> : filtered.length === 0 ? (
        <div className="card"><div className="empty-state"><DollarSign size={48} /><h3>Nenhum lançamento</h3><p>Registre suas movimentações</p></div></div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead><tr><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Data</th><th style={{ textAlign: 'right' }}>Valor</th><th style={{ textAlign: 'right' }}>Ações</th></tr></thead>
            <tbody>{filtered.map(item => (
              <tr key={item.id}>
                <td><span className={`badge ${item.kind === 'income' ? 'badge-success' : 'badge-danger'}`}>{item.kind === 'income' ? 'Receita' : 'Despesa'}</span></td>
                <td>{item.category}</td>
                <td className="font-semibold">{item.description}</td>
                <td className="text-sm">{formatDate(item.occurred_on)}</td>
                <td className="text-right font-semibold" style={{ color: item.kind === 'income' ? 'var(--success-600)' : 'var(--danger-500)' }}>{item.kind === 'income' ? '+' : '-'}{formatCurrency(item.amount)}</td>
                <td><div className="table-actions" style={{ justifyContent: 'flex-end' }}><button className="btn btn-ghost btn-icon" onClick={() => openEdit(item)}><Pencil size={16} /></button><button className="btn btn-ghost btn-icon" onClick={() => handleDelete(item.id)} style={{ color: 'var(--danger-500)' }}><Trash2 size={16} /></button></div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h2>{editing ? 'Editar Lançamento' : 'Novo Lançamento'}</h2><button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={20} /></button></div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group"><label className="form-label">Tipo</label><select className="form-select" value={(form.kind as string) || 'income'} onChange={e => setForm({ ...form, kind: e.target.value })}>{kindOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Categoria</label><input className="form-input" value={(form.category as string) || ''} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Ex: Ingredientes, Vendas" /></div>
              </div>
              <div className="form-group"><label className="form-label">Descrição *</label><input className="form-input" value={(form.description as string) || ''} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
               <div className="form-row">
                 <div className="form-group">
                   <label className="form-label">Valor (R$)</label>
                   <CurrencyInput 
                     value={(form.amount as number) || 0} 
                     onChange={val => setForm({ ...form, amount: val })} 
                   />
                 </div>
                 <div className="form-group"><label className="form-label">Data</label><input className="form-input" type="date" value={(form.occurred_on as string) || ''} onChange={e => setForm({ ...form, occurred_on: e.target.value })} /></div>
               </div>
            </div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : editing ? 'Atualizar' : 'Criar'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
