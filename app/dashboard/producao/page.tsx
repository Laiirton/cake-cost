'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Clock, ListChecks, Pencil, Plus, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime, getErrorMessage } from '@/lib/utils'
import { formatLocalDateTimeInput, parseLocalDateTimeInput } from '@/lib/bakery'

interface Task {
  id: string
  order_id: string
  title: string
  station: string
  due_at: string
  status: string
  notes: string
  display_order: number
  orders?: { title: string }
}

interface Order {
  id: string
  title: string
}

interface TaskFormState {
  order_id: string
  title: string
  station: string
  due_at: string
  status: string
  notes: string
  display_order: number
}

const statusOptions = [
  { value: 'todo', label: 'A fazer' },
  { value: 'doing', label: 'Em andamento' },
  { value: 'done', label: 'Concluido' },
]

function getStatusBadge(status: string) {
  return (
    {
      todo: 'badge-neutral',
      doing: 'badge-warning',
      done: 'badge-success',
    }[status] || 'badge-neutral'
  )
}

export default function ProducaoPage() {
  const [items, setItems] = useState<Task[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [form, setForm] = useState<TaskFormState>({
    order_id: '',
    title: '',
    station: '',
    due_at: '',
    status: 'todo',
    notes: '',
    display_order: 0,
  })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: string; message: string } | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'week' | 'overdue'>('all')
  const [formError, setFormError] = useState('')
  const supabase = useMemo(() => createClient(), [])

  const showToast = useCallback((type: string, message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const load = useCallback(async () => {
    try {
      const [tasksRes, ordersRes] = await Promise.all([
        supabase.from('production_tasks').select('*, orders(title)').order('due_at'),
        supabase.from('orders').select('id, title').order('event_date', { ascending: false }),
      ])
      setItems((tasksRes.data || []) as Task[])
      setOrders((ordersRes.data || []) as Order[])
    } catch (error) {
      console.error('Erro ao carregar producao:', error)
      showToast('error', 'Nao foi possivel carregar as tarefas.')
    } finally {
      setLoading(false)
    }
  }, [showToast, supabase])

  useEffect(() => {
    load()
  }, [load])

  const openNew = () => {
    setEditing(null)
    setFormError('')
    setForm({
      order_id: orders[0]?.id || '',
      title: '',
      station: '',
      due_at: '',
      status: 'todo',
      notes: '',
      display_order: items.length,
    })
    setShowModal(true)
  }

  const openEdit = (item: Task) => {
    setEditing(item)
    setFormError('')
    setForm({
      order_id: item.order_id,
      title: item.title,
      station: item.station,
      due_at: formatLocalDateTimeInput(item.due_at),
      status: item.status,
      notes: item.notes,
      display_order: item.display_order,
    })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setFormError('')
  }

  const handleSave = async () => {
    if (!form.title.trim()) {
      setFormError('Informe o titulo da tarefa.')
      return
    }

    setSaving(true)
    setFormError('')

    try {
      const payload = {
        order_id: form.order_id || null,
        title: form.title.trim(),
        station: form.station,
        due_at: form.due_at ? parseLocalDateTimeInput(form.due_at) : new Date().toISOString(),
        status: form.status,
        notes: form.notes,
        display_order: form.display_order,
      }

      if (editing) {
        const { error } = await supabase.from('production_tasks').update(payload).eq('id', editing.id)
        if (error) throw error
        showToast('success', 'Tarefa atualizada!')
      } else {
        const { error } = await supabase.from('production_tasks').insert({ ...payload, id: crypto.randomUUID() })
        if (error) throw error
        showToast('success', 'Tarefa criada!')
      }

      closeModal()
      load()
    } catch (error) {
      const message = getErrorMessage(error, 'Erro ao salvar tarefa')
      setFormError(message)
      showToast('error', message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir tarefa?')) return
    try {
      const { error } = await supabase.from('production_tasks').delete().eq('id', id)
      if (error) throw error
      showToast('success', 'Tarefa excluida!')
      load()
    } catch (error) {
      showToast('error', getErrorMessage(error, 'Erro ao excluir tarefa'))
    }
  }

  const moveTask = async (task: Task, nextStatus: string) => {
    try {
      const { error } = await supabase.from('production_tasks').update({ status: nextStatus }).eq('id', task.id)
      if (error) throw error
      setItems((previous) =>
        previous.map((item) => (item.id === task.id ? { ...item, status: nextStatus } : item))
      )
    } catch (error) {
      showToast('error', getErrorMessage(error, 'Erro ao atualizar status'))
    }
  }

  const today = new Date()
  const todayIso = today.toISOString().split('T')[0]
  const weekAhead = new Date()
  weekAhead.setDate(weekAhead.getDate() + 7)
  const weekAheadIso = weekAhead.toISOString()

  const filteredItems = items.filter((item) => {
    const dueDateOnly = item.due_at.split('T')[0]
    const matchStatus = statusFilter === 'all' || item.status === statusFilter
    const matchTime =
      timeFilter === 'all' ||
      (timeFilter === 'today' && dueDateOnly === todayIso) ||
      (timeFilter === 'week' && item.due_at <= weekAheadIso && item.due_at >= today.toISOString()) ||
      (timeFilter === 'overdue' && item.due_at < new Date().toISOString() && item.status !== 'done')
    return matchStatus && matchTime
  })

  const columns = statusOptions.map((status) => ({
    ...status,
    items: filteredItems.filter((item) => item.status === status.value),
  }))

  const overdueCount = items.filter((item) => item.due_at < new Date().toISOString() && item.status !== 'done').length
  const todayCount = items.filter((item) => item.due_at.split('T')[0] === todayIso && item.status !== 'done').length
  const doingCount = items.filter((item) => item.status === 'doing').length

  if (loading) {
    return (
      <div className="page-container">
        <div className="table-container">
          {[1, 2, 3].map((item) => (
            <div key={item} style={{ padding: 14, borderBottom: '1px solid var(--border-light)' }}>
              <div className="skeleton" style={{ width: '50%', height: 16 }} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

      <div className="page-header">
        <div>
          <h1>Producao</h1>
          <p>Visual para executar, nao so listar tarefa.</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={18} />
          Nova tarefa
        </button>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-icon"><AlertCircle size={24} /></div>
          <div className="stat-value">{overdueCount}</div>
          <div className="stat-label">Atrasadas</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Clock size={24} /></div>
          <div className="stat-value">{todayCount}</div>
          <div className="stat-label">Para hoje</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><ListChecks size={24} /></div>
          <div className="stat-value">{doingCount}</div>
          <div className="stat-label">Em andamento</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="form-select" style={{ width: 180 }} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">Todos os status</option>
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select className="form-select" style={{ width: 180 }} value={timeFilter} onChange={(event) => setTimeFilter(event.target.value as 'all' | 'today' | 'week' | 'overdue')}>
          <option value="all">Qualquer prazo</option>
          <option value="today">Hoje</option>
          <option value="week">Proximos 7 dias</option>
          <option value="overdue">Atrasadas</option>
        </select>
      </div>

      {filteredItems.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <ListChecks size={48} />
            <h3>Nenhuma tarefa nessa visao</h3>
            <p>Crie tarefas manuais ou gere automaticamente a partir dos pedidos.</p>
          </div>
        </div>
      ) : (
        <div className="grid-3" style={{ alignItems: 'start' }}>
          {columns.map((column) => (
            <div key={column.value} className="card" style={{ minHeight: 220 }}>
              <div className="card-header">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`badge ${getStatusBadge(column.value)}`}>{column.label}</span>
                </h3>
                <span className="badge badge-neutral">{column.items.length}</span>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {column.items.map((item) => {
                  const currentIndex = statusOptions.findIndex((status) => status.value === item.status)
                  const previousStatus = statusOptions[currentIndex - 1]?.value
                  const nextStatus = statusOptions[currentIndex + 1]?.value
                  return (
                    <div key={item.id} className="card" style={{ padding: 16, boxShadow: 'none', borderRadius: 'var(--radius-lg)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                        <div style={{ fontWeight: 800, fontSize: '0.9375rem' }}>{item.title}</div>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(item)}>
                          <Pencil size={14} />
                        </button>
                      </div>
                      <div className="text-xs text-muted" style={{ marginBottom: 10 }}>
                        {item.orders?.title || 'Sem pedido'} {item.station ? `• ${item.station}` : ''}
                      </div>
                      <div style={{ fontSize: '0.8125rem', marginBottom: 10 }}>{formatDateTime(item.due_at)}</div>
                      {item.notes && <div className="text-xs text-muted" style={{ marginBottom: 10 }}>{item.notes}</div>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {previousStatus && (
                            <button className="btn btn-secondary btn-sm" onClick={() => moveTask(item, previousStatus)}>
                              Voltar
                            </button>
                          )}
                          {nextStatus && (
                            <button className="btn btn-primary btn-sm" onClick={() => moveTask(item, nextStatus)}>
                              Avancar
                            </button>
                          )}
                        </div>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDelete(item.id)} style={{ color: 'var(--danger-500)' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing ? 'Editar tarefa' : 'Nova tarefa'}</h2>
              <button className="btn btn-ghost btn-icon" onClick={closeModal}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              {formError && <div className="form-error" style={{ marginBottom: 16 }}>{formError}</div>}
              <div className="form-group">
                <label className="form-label">Titulo</label>
                <input className="form-input" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Pedido</label>
                <select className="form-select" value={form.order_id} onChange={(event) => setForm((current) => ({ ...current, order_id: event.target.value }))}>
                  <option value="">Selecione...</option>
                  {orders.map((order) => (
                    <option key={order.id} value={order.id}>{order.title}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Estacao</label>
                  <input className="form-input" value={form.station} onChange={(event) => setForm((current) => ({ ...current, station: event.target.value }))} placeholder="Ex: Decoracao" />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Prazo</label>
                <input className="form-input" type="datetime-local" value={form.due_at} onChange={(event) => setForm((current) => ({ ...current, due_at: event.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Observacoes</label>
                <textarea className="form-textarea" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeModal}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Salvando...' : editing ? 'Atualizar tarefa' : 'Criar tarefa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
