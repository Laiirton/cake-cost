'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Search, Pencil, Trash2, X, ShoppingBag } from 'lucide-react'
import { formatCurrency, formatDate, parseCurrencyInput, formatCurrencyInput } from '@/lib/utils'
import CurrencyInput from '@/app/dashboard/components/CurrencyInput'

interface Order {
  id: string; customer_id: string; preset_id: string; title: string; theme: string; event_date: string; delivery_date: string; size_label: string; servings: number; sale_price: number; deposit_amount: number; status: string; payment_status: string; labor_hours: number | null; labor_hour_rate: number | null; fixed_cost: number | null; markup_pct: number | null; custom_adjustments: unknown[]; notes: string; display_order: number
  customers?: { name: string }
}

interface Customer { id: string; name: string }
interface Preset { id: string; name: string }

const statusOptions = [
  { value: 'pending', label: 'Pendente' },
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'in_progress', label: 'Em Produção' },
  { value: 'completed', label: 'Concluído' },
  { value: 'delivered', label: 'Entregue' },
  { value: 'cancelled', label: 'Cancelado' },
]

const paymentOptions = [
  { value: 'pending', label: 'Pendente' },
  { value: 'partial', label: 'Parcial' },
  { value: 'paid', label: 'Pago' },
]

export default function PedidosPage() {
  const [items, setItems] = useState<Order[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [presets, setPresets] = useState<Preset[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Order | null>(null)
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: string; message: string } | null>(null)
  const supabase = useMemo(() => createClient(), [])

  const load = useCallback(async () => {
    const [ordersRes, customersRes, presetsRes] = await Promise.all([
      supabase.from('orders').select('*, customers(name)').order('event_date', { ascending: false }),
      supabase.from('customers').select('id, name').order('name'),
      supabase.from('calculator_presets').select('id, name').order('name'),
    ])
    setItems(ordersRes.data || [])
    setCustomers(customersRes.data || [])
    setPresets(presetsRes.data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const showToast = (type: string, message: string) => { setToast({ type, message }); setTimeout(() => setToast(null), 3000) }

  const emptyForm = () => ({
    customer_id: customers[0]?.id || '', preset_id: presets[0]?.id || '', title: '', theme: '', event_date: '', delivery_date: '', size_label: '', servings: 0, sale_price: 0, deposit_amount: 0, status: 'pending', payment_status: 'pending', notes: '', custom_adjustments: [], display_order: 0
  })

  const openNew = () => { setEditing(null); setForm(emptyForm()); setShowModal(true) }
  const openEdit = (item: Order) => {
    setEditing(item)
    setForm({ customer_id: item.customer_id, preset_id: item.preset_id, title: item.title, theme: item.theme, event_date: item.event_date, delivery_date: item.delivery_date, size_label: item.size_label, servings: item.servings, sale_price: item.sale_price, deposit_amount: item.deposit_amount, status: item.status, payment_status: item.payment_status, notes: item.notes, custom_adjustments: item.custom_adjustments, display_order: item.display_order })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!(form.title as string)?.trim()) return
    
    // Validação: data de entrega deve ser antes ou igual à data do evento
    const eventDate = form.event_date as string
    const deliveryDate = form.delivery_date as string
    if (eventDate && deliveryDate) {
      const event = new Date(eventDate)
      const delivery = new Date(deliveryDate)
      if (delivery > event) {
        showToast('error', 'A data de entrega não pode ser posterior à data do evento')
        return
      }
    }
    
    setSaving(true)
    try {
      if (editing) {
        const { error } = await supabase.from('orders').update(form).eq('id', editing.id)
        if (error) throw error
        showToast('success', 'Pedido atualizado!')
      } else {
        const { error } = await supabase.from('orders').insert({ ...form, id: crypto.randomUUID() })
        if (error) throw error
        showToast('success', 'Pedido criado!')
      }
      setShowModal(false); load()
    } catch { showToast('error', 'Erro ao salvar') } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este pedido?')) return
    try {
      const { error } = await supabase.from('orders').delete().eq('id', id)
      if (error) throw error
      showToast('success', 'Excluído!')
      load()
    } catch {
      showToast('error', 'Erro ao excluir')
    }
  }

  const filtered = items.filter(i => i.title.toLowerCase().includes(search.toLowerCase()))
  const getStatusBadge = (s: string) => ({ pending: 'badge-warning', confirmed: 'badge-info', in_progress: 'badge-brand', completed: 'badge-success', delivered: 'badge-success', cancelled: 'badge-danger', partial: 'badge-warning', paid: 'badge-success' }[s] || 'badge-neutral')
  const getStatusLabel = (s: string) => statusOptions.find(o => o.value === s)?.label || paymentOptions.find(o => o.value === s)?.label || s

  return (
    <div className="page-container">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
      <div className="page-header"><div><h1>Pedidos</h1><p>Gerencie os pedidos da confeitaria</p></div><button className="btn btn-primary" onClick={openNew}><Plus size={18} /> Novo Pedido</button></div>
      <div style={{ marginBottom: 20 }}><div className="search-bar"><Search size={18} /><input placeholder="Buscar pedido..." value={search} onChange={e => setSearch(e.target.value)} /></div></div>

      {loading ? <div className="table-container">{[1,2,3].map(i => <div key={i} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-light)' }}><div className="skeleton" style={{ width: '50%', height: 16, marginBottom: 8 }} /></div>)}</div> : filtered.length === 0 ? (
        <div className="card"><div className="empty-state"><ShoppingBag size={48} /><h3>Nenhum pedido</h3><p>Crie seu primeiro pedido</p><button className="btn btn-primary" onClick={openNew}><Plus size={18} /> Criar</button></div></div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead><tr><th>Pedido</th><th>Cliente</th><th>Data Evento</th><th>Status</th><th>Pagamento</th><th style={{ textAlign: 'right' }}>Valor</th><th style={{ textAlign: 'right' }}>Ações</th></tr></thead>
            <tbody>{filtered.map(item => (
              <tr key={item.id}>
                <td><div className="font-semibold">{item.title}</div>{item.theme && <div className="text-xs text-muted">{item.theme}</div>}</td>
                <td>{item.customers?.name || '-'}</td>
                <td className="text-sm">{formatDate(item.event_date)}</td>
                <td><span className={`badge ${getStatusBadge(item.status)}`}>{getStatusLabel(item.status)}</span></td>
                <td><span className={`badge ${getStatusBadge(item.payment_status)}`}>{getStatusLabel(item.payment_status)}</span></td>
                <td className="text-right font-semibold">{formatCurrency(item.sale_price)}</td>
                <td><div className="table-actions" style={{ justifyContent: 'flex-end' }}><button className="btn btn-ghost btn-icon" onClick={() => openEdit(item)}><Pencil size={16} /></button><button className="btn btn-ghost btn-icon" onClick={() => handleDelete(item.id)} style={{ color: 'var(--danger-500)' }}><Trash2 size={16} /></button></div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h2>{editing ? 'Editar Pedido' : 'Novo Pedido'}</h2><button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={20} /></button></div>
            <div className="modal-body">
              <div className="form-group"><label className="form-label">Título *</label><input className="form-input" value={(form.title as string) || ''} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ex: Bolo de Casamento" /></div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Cliente</label><select className="form-select" value={(form.customer_id as string) || ''} onChange={e => setForm({ ...form, customer_id: e.target.value })}><option value="">Selecione...</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Preset</label><select className="form-select" value={(form.preset_id as string) || ''} onChange={e => setForm({ ...form, preset_id: e.target.value })}><option value="">Selecione...</option>{presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              </div>
              <div className="form-group"><label className="form-label">Tema</label><input className="form-input" value={(form.theme as string) || ''} onChange={e => setForm({ ...form, theme: e.target.value })} /></div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Data do Evento</label><input className="form-input" type="date" value={(form.event_date as string) || ''} onChange={e => setForm({ ...form, event_date: e.target.value })} /></div>
                <div className="form-group"><label className="form-label">Data de Entrega</label><input className="form-input" type="date" value={(form.delivery_date as string) || ''} onChange={e => setForm({ ...form, delivery_date: e.target.value })} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Tamanho</label><input className="form-input" value={(form.size_label as string) || ''} onChange={e => setForm({ ...form, size_label: e.target.value })} /></div>
                <div className="form-group"><label className="form-label">Porções</label><input className="form-input" type="number" value={(form.servings as number) || 0} onChange={e => setForm({ ...form, servings: parseInt(e.target.value) || 0 })} /></div>
              </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Preço de Venda (R$)</label>
                    <CurrencyInput 
                      value={(form.sale_price as number) || 0} 
                      onChange={val => setForm({ ...form, sale_price: val })} 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Sinal (R$)</label>
                    <CurrencyInput 
                      value={(form.deposit_amount as number) || 0} 
                      onChange={val => setForm({ ...form, deposit_amount: val })} 
                    />
                  </div>
                </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Status</label><select className="form-select" value={(form.status as string) || 'pending'} onChange={e => setForm({ ...form, status: e.target.value })}>{statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Pagamento</label><select className="form-select" value={(form.payment_status as string) || 'pending'} onChange={e => setForm({ ...form, payment_status: e.target.value })}>{paymentOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
              </div>
              <div className="form-group"><label className="form-label">Observações</label><textarea className="form-textarea" value={(form.notes as string) || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : editing ? 'Atualizar' : 'Criar'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
