'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Pencil, Trash2, X, ListChecks } from 'lucide-react'

interface Task {
  id: string; order_id: string; title: string; station: string; due_at: string; status: string; notes: string; display_order: number
  orders?: { title: string }
}

interface Order { id: string; title: string }

const statusOptions = [
  { value: 'todo', label: 'A Fazer' },
  { value: 'doing', label: 'Fazendo' },
  { value: 'done', label: 'Concluído' },
]

export default function ProducaoPage() {
  const [items, setItems] = useState<Task[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: string; message: string } | null>(null)
  const [filter, setFilter] = useState('all')
  const supabase = useMemo(() => createClient(), [])

  const load = useCallback(async () => {
    const [tasksRes, ordersRes] = await Promise.all([
      supabase.from('production_tasks').select('*, orders(title)').order('due_at'),
      supabase.from('orders').select('id, title').order('event_date', { ascending: false }),
    ])
    setItems(tasksRes.data || [])
    setOrders(ordersRes.data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const showToast = (type: string, message: string) => { setToast({ type, message }); setTimeout(() => setToast(null), 3000) }

  const openNew = () => { setEditing(null); setForm({ order_id: orders[0]?.id || '', title: '', station: '', due_at: '', status: 'todo', notes: '', display_order: 0 }); setShowModal(true) }
  const openEdit = (item: Task) => { setEditing(item); setForm({ order_id: item.order_id, title: item.title, station: item.station, due_at: item.due_at ? item.due_at.substring(0, 16) : '', status: item.status, notes: item.notes, display_order: item.display_order }); setShowModal(true) }

  const handleSave = async () => {
    if (!(form.title as string)?.trim()) return
    setSaving(true)
    try {
      const payload = { ...form, due_at: (form.due_at as string) ? new Date(form.due_at as string).toISOString() : new Date().toISOString() }
      if (editing) {
        const { error } = await supabase.from('production_tasks').update(payload).eq('id', editing.id)
        if (error) throw error
        showToast('success', 'Tarefa atualizada!')
      } else {
        const { error } = await supabase.from('production_tasks').insert({ ...payload, id: crypto.randomUUID() })
        if (error) throw error
        showToast('success', 'Tarefa criada!')
      }
      setShowModal(false); load()
    } catch { showToast('error', 'Erro ao salvar') } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir tarefa?')) return
    try {
      const { error } = await supabase.from('production_tasks').delete().eq('id', id)
      if (error) throw error
      showToast('success', 'Excluída!')
      load()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message || 'Erro desconhecido'
      showToast('error', `Erro ao excluir: ${msg}`)
    }
  }

  const toggleStatus = async (task: Task) => {
    const next = task.status === 'todo' ? 'doing' : task.status === 'doing' ? 'done' : 'todo'
    try {
      const { error } = await supabase.from('production_tasks').update({ status: next }).eq('id', task.id)
      if (error) throw error
      load()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message || 'Erro desconhecido'
      showToast('error', `Erro ao alterar status: ${msg}`)
    }
  }

  const filtered = filter === 'all' ? items : items.filter(i => i.status === filter)
  const formatDate = (d: string) => { try { return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) } catch { return d } }
  const getStatusBadge = (s: string) => ({ todo: 'badge-neutral', doing: 'badge-warning', done: 'badge-success' }[s] || 'badge-neutral')

  return (
    <div className="page-container">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
      <div className="page-header"><div><h1>Produção</h1><p>Acompanhe as tarefas de produção</p></div><button className="btn btn-primary" onClick={openNew}><Plus size={18} /> Nova Tarefa</button></div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {['all', 'todo', 'doing', 'done'].map(s => (
          <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter(s)}>
            {s === 'all' ? 'Todas' : statusOptions.find(o => o.value === s)?.label || s}
            {s !== 'all' && <span className="badge badge-neutral" style={{ marginLeft: 4 }}>{items.filter(i => i.status === s).length}</span>}
          </button>
        ))}
      </div>

      {loading ? <div className="table-container">{[1,2,3].map(i => <div key={i} style={{ padding: 14, borderBottom: '1px solid var(--border-light)' }}><div className="skeleton" style={{ width: '50%', height: 16 }} /></div>)}</div> : filtered.length === 0 ? (
        <div className="card"><div className="empty-state"><ListChecks size={48} /><h3>Nenhuma tarefa</h3><p>Crie tarefas de produção</p></div></div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead><tr><th>Tarefa</th><th>Pedido</th><th>Estação</th><th>Prazo</th><th>Status</th><th style={{ textAlign: 'right' }}>Ações</th></tr></thead>
            <tbody>{filtered.map(item => (
              <tr key={item.id}>
                <td className="font-semibold">{item.title}</td>
                <td className="text-sm">{item.orders?.title || '-'}</td>
                <td>{item.station || '-'}</td>
                <td className="text-sm">{formatDate(item.due_at)}</td>
                <td><button className={`badge ${getStatusBadge(item.status)}`} onClick={() => toggleStatus(item)} style={{ cursor: 'pointer', border: 'none' }}>{statusOptions.find(o => o.value === item.status)?.label || item.status}</button></td>
                <td><div className="table-actions" style={{ justifyContent: 'flex-end' }}><button className="btn btn-ghost btn-icon" onClick={() => openEdit(item)}><Pencil size={16} /></button><button className="btn btn-ghost btn-icon" onClick={() => handleDelete(item.id)} style={{ color: 'var(--danger-500)' }}><Trash2 size={16} /></button></div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h2>{editing ? 'Editar Tarefa' : 'Nova Tarefa'}</h2><button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={20} /></button></div>
            <div className="modal-body">
              <div className="form-group"><label className="form-label">Título *</label><input className="form-input" value={(form.title as string) || ''} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Pedido</label><select className="form-select" value={(form.order_id as string) || ''} onChange={e => setForm({ ...form, order_id: e.target.value })}><option value="">Selecione...</option>{orders.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}</select></div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Estação</label><input className="form-input" value={(form.station as string) || ''} onChange={e => setForm({ ...form, station: e.target.value })} placeholder="Ex: Forno, Decoração" /></div>
                <div className="form-group"><label className="form-label">Status</label><select className="form-select" value={(form.status as string) || 'todo'} onChange={e => setForm({ ...form, status: e.target.value })}>{statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
              </div>
              <div className="form-group"><label className="form-label">Prazo</label><input className="form-input" type="datetime-local" value={(form.due_at as string) || ''} onChange={e => setForm({ ...form, due_at: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Observações</label><textarea className="form-textarea" value={(form.notes as string) || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : editing ? 'Atualizar' : 'Criar'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
