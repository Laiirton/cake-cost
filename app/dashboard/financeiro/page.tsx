'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DollarSign, Pencil, Plus, Search, Trash2, TrendingDown, TrendingUp, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import CurrencyInput from '@/app/dashboard/components/CurrencyInput'
import { formatCurrency, formatDate, getErrorMessage } from '@/lib/utils'
import { getOrderRemainingBalance, getOrderTimelineDate, isPaymentOpen } from '@/lib/bakery'

interface CashEntry {
  id: string
  kind: string
  category: string
  description: string
  amount: number
  occurred_on: string
  order_id: string | null
  display_order: number
}

interface OrderSummary {
  id: string
  title: string
  sale_price: number
  deposit_amount: number
  payment_status: string
  status: string
  event_date: string
  delivery_date: string
  customers?: { name: string }
}

const kindOptions = [
  { value: 'income', label: 'Receita' },
  { value: 'expense', label: 'Despesa' },
]

export default function FinanceiroPage() {
  const [items, setItems] = useState<CashEntry[]>([])
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterKind, setFilterKind] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<CashEntry | null>(null)
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: string; message: string } | null>(null)
  const [period, setPeriod] = useState<'all' | 'month'>('all')
  const [formError, setFormError] = useState('')
  const supabase = useMemo(() => createClient(), [])

  const showToast = useCallback((type: string, message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const load = useCallback(async () => {
    try {
      const [cashRes, ordersRes] = await Promise.all([
        supabase.from('cash_entries').select('*').order('occurred_on', { ascending: false }),
        supabase
          .from('orders')
          .select('id, title, sale_price, deposit_amount, payment_status, status, event_date, delivery_date, customers(name)')
          .order('event_date', { ascending: false }),
      ])
      setItems((cashRes.data || []) as CashEntry[])
      setOrders(
        (ordersRes.data || []).map((order) => ({
          ...order,
          customers: Array.isArray(order.customers) ? order.customers[0] : order.customers,
        })) as OrderSummary[]
      )
    } catch (error) {
      console.error('Erro ao carregar financeiro:', error)
      showToast('error', 'Nao foi possivel carregar o financeiro.')
    } finally {
      setLoading(false)
    }
  }, [showToast, supabase])

  useEffect(() => {
    load()
  }, [load])

  const currentMonthLabel = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  const monthBounds = useMemo(() => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
    return { start, end }
  }, [])

  const scopedItems = useMemo(() => {
    if (period === 'all') return items
    return items.filter((item) => item.occurred_on >= monthBounds.start && item.occurred_on <= monthBounds.end)
  }, [items, monthBounds.end, monthBounds.start, period])

  const scopedOrders = useMemo(() => {
    if (period === 'all') return orders
    return orders.filter((order) => {
      const timeline = getOrderTimelineDate(order)
      return timeline >= monthBounds.start && timeline <= monthBounds.end
    })
  }, [orders, monthBounds.end, monthBounds.start, period])

  const openNew = () => {
    setEditing(null)
    setFormError('')
    setForm({
      kind: 'income',
      category: '',
      description: '',
      amount: 0,
      occurred_on: new Date().toISOString().split('T')[0],
      order_id: null,
      display_order: 0,
    })
    setShowModal(true)
  }

  const openEdit = (item: CashEntry) => {
    setEditing(item)
    setFormError('')
    setForm({
      kind: item.kind,
      category: item.category,
      description: item.description,
      amount: item.amount,
      occurred_on: item.occurred_on,
      order_id: item.order_id,
      display_order: item.display_order,
    })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setFormError('')
  }

  const handleSave = async () => {
    if (!(form.description as string)?.trim()) {
      setFormError('Informe a descricao do lancamento.')
      return
    }

    setSaving(true)
    setFormError('')

    try {
      if (editing) {
        const { error } = await supabase.from('cash_entries').update(form).eq('id', editing.id)
        if (error) throw error
        showToast('success', 'Lancamento atualizado!')
      } else {
        const { error } = await supabase.from('cash_entries').insert({ ...form, id: crypto.randomUUID() })
        if (error) throw error
        showToast('success', 'Lancamento criado!')
      }
      closeModal()
      load()
    } catch (error) {
      const message = getErrorMessage(error, 'Erro ao salvar lancamento')
      setFormError(message)
      showToast('error', message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir lancamento?')) return
    try {
      const { error } = await supabase.from('cash_entries').delete().eq('id', id)
      if (error) throw error
      showToast('success', 'Lancamento excluido!')
      load()
    } catch (error) {
      showToast('error', getErrorMessage(error, 'Erro ao excluir lancamento'))
    }
  }

  const filtered = scopedItems.filter((item) => {
    const matchSearch =
      item.description.toLowerCase().includes(search.toLowerCase()) ||
      item.category.toLowerCase().includes(search.toLowerCase())
    const matchKind = filterKind === 'all' || item.kind === filterKind
    return matchSearch && matchKind
  })

  const totalIncome = scopedItems.filter((item) => item.kind === 'income').reduce((sum, item) => sum + item.amount, 0)
  const totalExpense = scopedItems.filter((item) => item.kind === 'expense').reduce((sum, item) => sum + item.amount, 0)
  const balance = totalIncome - totalExpense
  const orderSales = scopedOrders.filter((order) => order.status !== 'cancelled').reduce((sum, order) => sum + order.sale_price, 0)
  const orderDeposits = scopedOrders.filter((order) => order.status !== 'cancelled').reduce((sum, order) => sum + order.deposit_amount, 0)
  const receivables = scopedOrders
    .filter((order) => order.status !== 'cancelled' && isPaymentOpen(order.payment_status))
    .reduce((sum, order) => sum + getOrderRemainingBalance(order), 0)
  const pendingOrders = scopedOrders.filter((order) => order.status !== 'cancelled' && isPaymentOpen(order.payment_status))

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
          <h1>Financeiro</h1>
          <p>Diferencie o que foi vendido nos pedidos do que entrou no caixa manual.</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={18} />
          Novo lancamento
        </button>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-icon"><TrendingUp size={24} /></div>
          <div className="stat-value">{formatCurrency(orderSales)}</div>
          <div className="stat-label">Vendido em pedidos</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><DollarSign size={24} /></div>
          <div className="stat-value">{formatCurrency(orderDeposits)}</div>
          <div className="stat-label">Entradas registradas nos pedidos</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><TrendingDown size={24} /></div>
          <div className="stat-value">{formatCurrency(receivables)}</div>
          <div className="stat-label">Ainda a receber</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><DollarSign size={24} /></div>
          <div className="stat-value" style={{ color: balance >= 0 ? 'var(--success-600)' : 'var(--danger-500)' }}>
            {formatCurrency(balance)}
          </div>
          <div className="stat-label">Saldo dos lancamentos</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24, background: 'linear-gradient(135deg, var(--gray-50), white)' }}>
        <div className="card-body" style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Periodo em foco: {period === 'all' ? 'Todos os registros' : currentMonthLabel}</div>
            <div className="text-sm text-muted">
              Pedidos mostram visao comercial. Lancamentos mostram caixa manual e despesas avulsas.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={`btn btn-sm ${period === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPeriod('all')}>
              Tudo
            </button>
            <button className={`btn btn-sm ${period === 'month' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPeriod('month')}>
              Este mes
            </button>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-header">
            <h3>Cobrancas em aberto</h3>
            <span className="badge badge-warning">{pendingOrders.length}</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {pendingOrders.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
                Nenhum pedido com saldo pendente.
              </div>
            ) : (
              <div style={{ padding: '6px 0' }}>
                {pendingOrders.slice(0, 8).map((order) => (
                  <Link
                    key={order.id}
                    href="/dashboard/pedidos"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      alignItems: 'center',
                      padding: '14px 24px',
                      borderBottom: '1px solid var(--border-light)',
                    }}
                  >
                    <div>
                      <div className="font-semibold">{order.title}</div>
                      <div className="text-xs text-muted">
                        {order.customers?.name || 'Sem cliente'} • {formatDate(getOrderTimelineDate(order))}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className={`badge ${getOrderRemainingBalance(order) > 0 ? 'badge-warning' : 'badge-success'}`}>
                        {order.payment_status === 'partial' ? 'Parcial' : 'Pendente'}
                      </div>
                      <div style={{ fontWeight: 800, marginTop: 6 }}>
                        {formatCurrency(getOrderRemainingBalance(order))}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Lancamentos manuais</h3>
            <span className="badge badge-neutral">{filtered.length}</span>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="search-bar">
                <Search size={18} />
                <input placeholder="Buscar..." value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {['all', 'income', 'expense'].map((kind) => (
                  <button key={kind} className={`btn btn-sm ${filterKind === kind ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilterKind(kind)}>
                    {kind === 'all' ? 'Todos' : kind === 'income' ? 'Receitas' : 'Despesas'}
                  </button>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
                Nenhum lancamento manual nessa visao.
              </div>
            ) : (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Categoria</th>
                      <th>Descricao</th>
                      <th>Data</th>
                      <th style={{ textAlign: 'right' }}>Valor</th>
                      <th style={{ textAlign: 'right' }}>Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => (
                      <tr key={item.id}>
                        <td><span className={`badge ${item.kind === 'income' ? 'badge-success' : 'badge-danger'}`}>{item.kind === 'income' ? 'Receita' : 'Despesa'}</span></td>
                        <td>{item.category}</td>
                        <td>
                          <div className="font-semibold">{item.description}</div>
                          {item.order_id && <div className="text-xs text-muted">Vinculado a pedido</div>}
                        </td>
                        <td className="text-sm">{formatDate(item.occurred_on)}</td>
                        <td className="text-right font-semibold" style={{ color: item.kind === 'income' ? 'var(--success-600)' : 'var(--danger-500)' }}>
                          {item.kind === 'income' ? '+' : '-'}{formatCurrency(item.amount)}
                        </td>
                        <td>
                          <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost btn-icon" onClick={() => openEdit(item)}>
                              <Pencil size={16} />
                            </button>
                            <button className="btn btn-ghost btn-icon" onClick={() => handleDelete(item.id)} style={{ color: 'var(--danger-500)' }}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing ? 'Editar lancamento' : 'Novo lancamento'}</h2>
              <button className="btn btn-ghost btn-icon" onClick={closeModal}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              {formError && <div className="form-error" style={{ marginBottom: 16 }}>{formError}</div>}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Tipo</label>
                  <select className="form-select" value={(form.kind as string) || 'income'} onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value }))}>
                    {kindOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Categoria</label>
                  <input className="form-input" value={(form.category as string) || ''} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} placeholder="Ex: Ingredientes, frete, embalagem..." />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Descricao</label>
                <input className="form-input" value={(form.description as string) || ''} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Valor</label>
                  <CurrencyInput value={(form.amount as number) || 0} onChange={(value) => setForm((current) => ({ ...current, amount: value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Data</label>
                  <input className="form-input" type="date" value={(form.occurred_on as string) || ''} onChange={(event) => setForm((current) => ({ ...current, occurred_on: event.target.value }))} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Vincular a pedido (opcional)</label>
                <select className="form-select" value={(form.order_id as string) || ''} onChange={(event) => setForm((current) => ({ ...current, order_id: event.target.value || null }))}>
                  <option value="">Nao vincular</option>
                  {orders.map((order) => (
                    <option key={order.id} value={order.id}>{order.title}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeModal}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Salvando...' : editing ? 'Atualizar lancamento' : 'Criar lancamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
