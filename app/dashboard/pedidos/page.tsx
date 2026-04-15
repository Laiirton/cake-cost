'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  CheckCircle2,
  Pencil,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react'
import { useTransientToast } from '@/lib/hooks/useTransientToast'
import { getBrowserClient } from '@/lib/supabase/client'
import CurrencyInput from '@/app/dashboard/components/CurrencyInput'
import DateInput from '@/app/dashboard/components/DateInput'
import { formatCurrency, formatDate, getErrorMessage, type Ingredient } from '@/lib/utils'
import {
  buildOrderDraftFromPreset,
  buildProductionTasks,
  getOrderRemainingBalance,
  getOrderTimelineDate,
  isOrderActive,
  isPaymentOpen,
  normalizePreset,
  type CalculatorPreset,
  type RecipeSummary,
} from '@/lib/bakery'

interface Order {
  id: string
  customer_id: string
  preset_id: string
  title: string
  theme: string
  event_date: string
  delivery_date: string
  size_label: string
  servings: number
  sale_price: number
  deposit_amount: number
  status: string
  payment_status: string
  notes: string
  custom_adjustments: unknown[]
  display_order: number
  customers?: { name: string }
}

interface Customer {
  id: string
  name: string
}

interface OrderFormState {
  customer_id: string
  preset_id: string
  title: string
  theme: string
  event_date: string
  delivery_date: string
  size_label: string
  servings: number
  sale_price: number
  deposit_amount: number
  status: string
  payment_status: string
  notes: string
  custom_adjustments: unknown[]
  display_order: number
  auto_generate_tasks: boolean
}

const statusOptions = [
  { value: 'pending', label: 'Pendente' },
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'in_progress', label: 'Em produção' },
  { value: 'completed', label: 'Concluído' },
  { value: 'delivered', label: 'Entregue' },
  { value: 'cancelled', label: 'Cancelado' },
]

const paymentOptions = [
  { value: 'pending', label: 'Pendente' },
  { value: 'partial', label: 'Parcial' },
  { value: 'paid', label: 'Pago' },
]

function getStatusBadge(status: string) {
  return (
    {
      pending: 'badge-warning',
      confirmed: 'badge-info',
      in_progress: 'badge-brand',
      completed: 'badge-success',
      delivered: 'badge-success',
      cancelled: 'badge-danger',
      partial: 'badge-warning',
      paid: 'badge-success',
    }[status] || 'badge-neutral'
  )
}

function getStatusLabel(status: string) {
  return (
    statusOptions.find((option) => option.value === status)?.label ||
    paymentOptions.find((option) => option.value === status)?.label ||
    status
  )
}

function createEmptyForm(customers: Customer[], presets: CalculatorPreset[]): OrderFormState {
  return {
    customer_id: customers[0]?.id || '',
    preset_id: presets[0]?.id || '',
    title: '',
    theme: '',
    event_date: '',
    delivery_date: '',
    size_label: '',
    servings: 0,
    sale_price: 0,
    deposit_amount: 0,
    status: 'pending',
    payment_status: 'pending',
    notes: '',
    custom_adjustments: [],
    display_order: 0,
    auto_generate_tasks: true,
  }
}

export default function PedidosPage() {
  const searchParams = useSearchParams()
  const [items, setItems] = useState<Order[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [presets, setPresets] = useState<CalculatorPreset[]>([])
  const [recipes, setRecipes] = useState<RecipeSummary[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'upcoming' | 'overdue'>('all')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Order | null>(null)
  const [form, setForm] = useState<OrderFormState>(createEmptyForm([], []))
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set())
  const [queryApplied, setQueryApplied] = useState(false)
  const { toast, showToast } = useTransientToast()

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

  const presetsMap = useMemo(() => {
    const map = new Map<string, CalculatorPreset>()
    presets.forEach((preset) => map.set(preset.id, preset))
    return map
  }, [presets])

  const selectedPreset = form.preset_id ? presetsMap.get(form.preset_id) : undefined
  const selectedRecipe = selectedPreset ? recipesMap.get(selectedPreset.recipe_id) : undefined
  const presetDraft = selectedPreset
    ? buildOrderDraftFromPreset(selectedPreset, selectedRecipe, ingredientsMap)
    : null

  const load = useCallback(async () => {
    try {
      const supabase = await getBrowserClient()
      const [ordersRes, customersRes, presetsRes, recipesRes, ingredientsRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id, customer_id, preset_id, title, theme, event_date, delivery_date, size_label, servings, sale_price, deposit_amount, status, payment_status, notes, custom_adjustments, display_order, customers(name)')
          .order('event_date', { ascending: false }),
        supabase.from('customers').select('id, name').order('name'),
        supabase.from('calculator_presets').select('*').order('display_order'),
        supabase
          .from('recipes')
          .select('id, name, category, size_label, yield_label, items')
          .order('name'),
        supabase.from('ingredients').select('*').order('name'),
      ])

      setItems(
        (ordersRes.data || []).map((order: Order) => ({
          ...order,
          customers: Array.isArray(order.customers) ? order.customers[0] : order.customers,
        })) as Order[]
      )
      setCustomers((customersRes.data || []) as Customer[])
      setPresets(
        (presetsRes.data || []).map((preset: Record<string, unknown>) =>
          normalizePreset(preset as unknown as Record<string, unknown>)
        )
      )
      setRecipes(
        (recipesRes.data || []).map((recipe: RecipeSummary) => ({
          ...recipe,
          items: Array.isArray(recipe.items) ? recipe.items : [],
        })) as RecipeSummary[]
      )
      setIngredients((ingredientsRes.data || []) as Ingredient[])
    } catch (error) {
      console.error('Erro ao carregar pedidos:', error)
      showToast('error', 'Não foi possível carregar os pedidos.')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    load()
  }, [load])

  const applyPresetToForm = useCallback(
    (presetId: string) => {
      const preset = presetsMap.get(presetId)
      if (!preset) {
        setForm((current) => ({ ...current, preset_id: presetId }))
        return
      }

      const recipe = recipesMap.get(preset.recipe_id)
      const draft = buildOrderDraftFromPreset(preset, recipe, ingredientsMap)

      setForm((current) => ({
        ...current,
        preset_id: presetId,
        title: draft.title,
        size_label: draft.size_label,
        servings: draft.servings,
        sale_price: draft.sale_price,
        notes: draft.notes,
      }))
    },
    [ingredientsMap, presetsMap, recipesMap]
  )

  const openNew = useCallback(
    (presetId?: string, customerId?: string) => {
      if (customers.length === 0 || presets.length === 0) {
        showToast('error', 'Cadastre pelo menos um cliente e um modelo antes de criar pedidos.')
        return
      }

      const nextForm = createEmptyForm(customers, presets)
      nextForm.customer_id = customerId || nextForm.customer_id
      nextForm.preset_id = presetId || nextForm.preset_id
      if (nextForm.preset_id) {
        const preset = presetsMap.get(nextForm.preset_id)
        const recipe = preset ? recipesMap.get(preset.recipe_id) : undefined
        const draft = preset ? buildOrderDraftFromPreset(preset, recipe, ingredientsMap) : null
        if (draft) {
          nextForm.title = draft.title
          nextForm.size_label = draft.size_label
          nextForm.servings = draft.servings
          nextForm.sale_price = draft.sale_price
          nextForm.notes = draft.notes
        }
      }
      setEditing(null)
      setFormError('')
      setFieldErrors(new Set())
      setShowModal(true)
      setForm(nextForm)
    },
    [customers, ingredientsMap, presets, presetsMap, recipesMap, showToast]
  )

  useEffect(() => {
    if (loading || queryApplied) return

    if (searchParams.get('new') === '1') {
      openNew(searchParams.get('preset') || undefined, searchParams.get('customer') || undefined)
    }

    setQueryApplied(true)
  }, [loading, openNew, queryApplied, searchParams])

  const openEdit = (item: Order) => {
    setEditing(item)
    setFormError('')
    setFieldErrors(new Set())
    setForm({
      customer_id: item.customer_id,
      preset_id: item.preset_id,
      title: item.title,
      theme: item.theme,
      event_date: item.event_date,
      delivery_date: item.delivery_date,
      size_label: item.size_label,
      servings: item.servings,
      sale_price: item.sale_price,
      deposit_amount: item.deposit_amount,
      status: item.status,
      payment_status: item.payment_status,
      notes: item.notes,
      custom_adjustments: item.custom_adjustments,
      display_order: item.display_order,
      auto_generate_tasks: false,
    })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setFormError('')
    setFieldErrors(new Set())
  }

  const handleAdvanceStatus = async (order: Order) => {
    const statusIndex = statusOptions.findIndex((option) => option.value === order.status)
    if (statusIndex === -1 || statusIndex === statusOptions.length - 1) return

    const nextStatus = statusOptions[statusIndex + 1].value

    try {
      const supabase = await getBrowserClient()
      const { error } = await supabase.from('orders').update({ status: nextStatus }).eq('id', order.id)
      if (error) throw error
      setItems((previous) =>
        previous.map((item) => (item.id === order.id ? { ...item, status: nextStatus } : item))
      )
      showToast('success', `Pedido movido para ${getStatusLabel(nextStatus).toLowerCase()}.`)
    } catch (error) {
      showToast('error', getErrorMessage(error, 'Erro ao atualizar status'))
    }
  }

  const handleSave = async () => {
    const title = form.title.trim()
    const errors = new Set<string>()

    if (!title) {
      errors.add('title')
      setFormError('Informe o título do pedido.')
    } else if (!form.customer_id) {
      errors.add('customer_id')
      setFormError('Selecione um cliente.')
    } else if (!form.preset_id) {
      errors.add('preset_id')
      setFormError('Selecione um modelo.')
    } else if (!form.event_date) {
      errors.add('event_date')
      setFormError('Informe a data do evento.')
    } else if (!form.delivery_date) {
      errors.add('delivery_date')
      setFormError('Informe a data de entrega.')
    } else if (form.delivery_date && form.event_date && form.delivery_date > form.event_date) {
      errors.add('delivery_date')
      errors.add('event_date')
      setFormError('A data de entrega não pode ser posterior à data do evento.')
    } else if (form.deposit_amount > form.sale_price) {
      errors.add('deposit_amount')
      setFormError('O valor de entrada não pode ser maior que o valor total.')
    }

    if (errors.size > 0) {
      setFieldErrors(errors)
      return
    }

    setSaving(true)
    setFormError('')
    setFieldErrors(new Set())

    try {
      const supabase = await getBrowserClient()
      const payload = {
        customer_id: form.customer_id,
        preset_id: form.preset_id,
        title,
        theme: form.theme,
        event_date: form.event_date,
        delivery_date: form.delivery_date,
        size_label: form.size_label,
        servings: form.servings,
        sale_price: form.sale_price,
        deposit_amount: form.deposit_amount,
        status: form.status,
        payment_status: form.payment_status,
        notes: form.notes,
        custom_adjustments: form.custom_adjustments,
        display_order: form.display_order,
      }

      if (editing) {
        const { error } = await supabase.from('orders').update(payload).eq('id', editing.id)
        if (error) throw error
        showToast('success', 'Pedido atualizado!')
      } else {
        const orderId = crypto.randomUUID()
        const { error } = await supabase.from('orders').insert({ ...payload, id: orderId })
        if (error) throw error

        if (form.auto_generate_tasks) {
          const generatedTasks = buildProductionTasks({
            orderId,
            orderTitle: title,
            recipe: selectedRecipe,
            deliveryDate: form.delivery_date,
            eventDate: form.event_date,
          })
          const { error: taskError } = await supabase.from('production_tasks').insert(generatedTasks)
          if (taskError) {
            console.error('Erro ao criar tarefas automáticas:', taskError)
            showToast('error', 'Pedido salvo, mas não foi possível gerar as tarefas automaticamente.')
          }
        }

        showToast('success', 'Pedido criado!')
      }

      closeModal()
      load()
    } catch (error) {
      const message = getErrorMessage(error, 'Erro ao salvar pedido')
      setFormError(message)
      setFieldErrors(new Set(['submit']))
      showToast('error', message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este pedido?')) return
    try {
      const supabase = await getBrowserClient()
      const { error } = await supabase.from('orders').delete().eq('id', id)
      if (error) throw error
      showToast('success', 'Pedido excluído!')
      load()
    } catch (error) {
      showToast('error', getErrorMessage(error, 'Erro ao excluir pedido'))
    }
  }

  const today = new Date().toISOString().split('T')[0]
  const filtered = items.filter((item) => {
    const timeline = getOrderTimelineDate(item)
    const matchSearch =
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.customers?.name?.toLowerCase().includes(search.toLowerCase()) ||
      item.theme.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || item.status === statusFilter
    const matchPayment = paymentFilter === 'all' || item.payment_status === paymentFilter
    const matchTimeline =
      timelineFilter === 'all' ||
      (timelineFilter === 'upcoming' && timeline >= today) ||
      (timelineFilter === 'overdue' && timeline < today && isOrderActive(item.status))
    return matchSearch && matchStatus && matchPayment && matchTimeline
  })

  const activeOrders = items.filter((item) => isOrderActive(item.status))
  const weekAhead = new Date()
  weekAhead.setDate(weekAhead.getDate() + 7)
  const weekAheadIso = weekAhead.toISOString().split('T')[0]
  const pendingReceivables = items
    .filter((item) => item.status !== 'cancelled' && isPaymentOpen(item.payment_status))
    .reduce((sum: number, item) => sum + getOrderRemainingBalance(item), 0)
  const averageTicket =
    items.filter((item) => item.status !== 'cancelled').reduce((sum: number, item) => sum + item.sale_price, 0) /
    Math.max(items.filter((item) => item.status !== 'cancelled').length, 1)

  if (loading) {
    return (
      <div className="page-container">
        <div className="table-container">
          {[1, 2, 3].map((item) => (
            <div key={item} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-light)' }}>
              <div className="skeleton" style={{ width: '50%', height: 16, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: '30%', height: 14 }} />
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
          <h1>Pedidos</h1>
          <p>Cliente + modelo + datas. O resto precisa ser rápido.</p>
        </div>
        <button className="btn btn-primary" onClick={() => openNew()}>
          <Plus size={18} />
          Novo pedido
        </button>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-icon"><ShoppingBag size={24} /></div>
          <div className="stat-value">{activeOrders.length}</div>
          <div className="stat-label">Pedidos ativos</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><CheckCircle2 size={24} /></div>
          <div className="stat-value">
            {activeOrders.filter((item) => {
              const timeline = getOrderTimelineDate(item)
              return timeline >= today && timeline <= weekAheadIso
            }).length}
          </div>
          <div className="stat-label">Entrega nesta semana</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><AlertCircle size={24} /></div>
          <div className="stat-value">{formatCurrency(pendingReceivables)}</div>
          <div className="stat-label">A receber</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><ShoppingBag size={24} /></div>
          <div className="stat-value">{formatCurrency(Number.isFinite(averageTicket) ? averageTicket : 0)}</div>
          <div className="stat-label">Ticket médio</div>
        </div>
      </div>

      {(customers.length === 0 || presets.length === 0) && (
        <div className="card" style={{ marginBottom: 20, borderColor: 'var(--warning-500)', background: 'var(--warning-50)' }}>
          <div className="card-body" style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>Pré-requisitos para vender rápido</div>
              <div className="text-sm text-muted">
                Cadastre pelo menos um cliente e um modelo antes de criar pedidos.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {customers.length === 0 && (
                <Link href="/dashboard/clientes" className="btn btn-secondary">
                  Abrir clientes
                </Link>
              )}
              {presets.length === 0 && (
                <Link href="/dashboard/calculadora" className="btn btn-secondary">
                  Criar modelo
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-bar" style={{ flex: 1, maxWidth: 360 }}>
          <Search size={18} />
          <input
            placeholder="Buscar pedido, cliente ou tema..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select className="form-select" style={{ width: 180 }} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">Todos os status</option>
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select className="form-select" style={{ width: 180 }} value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}>
          <option value="all">Todos os pagamentos</option>
          {paymentOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select className="form-select" style={{ width: 180 }} value={timelineFilter} onChange={(event) => setTimelineFilter(event.target.value as 'all' | 'upcoming' | 'overdue')}>
          <option value="all">Qualquer prazo</option>
          <option value="upcoming">Próximos</option>
          <option value="overdue">Atrasados</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <ShoppingBag size={48} />
            <h3>Nenhum pedido encontrado</h3>
            <p>Comece pelos modelos e depois transforme em pedidos com poucos cliques.</p>
            <button className="btn btn-primary" onClick={() => openNew()}>
              <Plus size={18} />
              Criar pedido
            </button>
          </div>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Prazo</th>
                <th>Status</th>
                <th>Pagamento</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="font-semibold">{item.title}</div>
                    <div className="text-xs text-muted">
                      {presetsMap.get(item.preset_id)?.name || 'Sem modelo'} {item.theme ? `• ${item.theme}` : ''}
                    </div>
                  </td>
                  <td>{item.customers?.name || '-'}</td>
                  <td>
                    <div className="text-sm">{formatDate(getOrderTimelineDate(item))}</div>
                    <div className="text-xs text-muted">
                      Falta {formatCurrency(getOrderRemainingBalance(item))}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${getStatusBadge(item.status)}`}>
                      {getStatusLabel(item.status)}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${getStatusBadge(item.payment_status)}`}>
                      {getStatusLabel(item.payment_status)}
                    </span>
                  </td>
                  <td className="text-right font-semibold">{formatCurrency(item.sale_price)}</td>
                  <td>
                    <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                      {item.status !== 'delivered' && item.status !== 'cancelled' && (
                        <button className="btn btn-ghost btn-sm" onClick={() => handleAdvanceStatus(item)}>
                          Avançar
                        </button>
                      )}
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

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" style={{ maxWidth: 760 }} onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing ? 'Editar pedido' : 'Novo pedido'}</h2>
              <button className="btn btn-ghost btn-icon" onClick={closeModal}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              {formError && <div className="form-error" style={{ marginBottom: 16 }}>{formError}</div>}

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Cliente</label>
                  <select
                    className="form-select"
                    value={form.customer_id}
                    onChange={(event) => setForm((current) => ({ ...current, customer_id: event.target.value }))}
                  >
                    <option value="">Selecione...</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>{customer.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Modelo</label>
                  <select
                    className="form-select"
                    value={form.preset_id}
                    onChange={(event) => applyPresetToForm(event.target.value)}
                  >
                    <option value="">Selecione...</option>
                    {presets.map((preset) => (
                      <option key={preset.id} value={preset.id}>{preset.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {presetDraft && (
                <div 
                  className="card" 
                  style={{ 
                    marginBottom: 16, 
                    boxShadow: 'none', 
                    borderColor: !selectedRecipe ? 'var(--danger-500)' : 'var(--brand-200)', 
                    background: !selectedRecipe ? 'var(--danger-50)' : 'linear-gradient(135deg, var(--brand-50), white)' 
                  }}
                >
                  <div className="card-body" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: 800, marginBottom: 4 }}>
                          {selectedPreset?.name}
                          {!selectedRecipe && <span className="badge badge-danger" style={{ marginLeft: 8 }}>RECEITA REMOVIDA</span>}
                        </div>
                        <div className="text-sm text-muted">
                          {selectedRecipe?.name || 'O vínculo com a receita original foi quebrado.'} {selectedRecipe?.size_label ? `• ${selectedRecipe.size_label}` : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="text-xs text-muted">Preço sugerido</div>
                        <div style={{ fontWeight: 800, color: !selectedRecipe ? 'var(--danger-600)' : 'var(--brand-600)' }}>
                          {formatCurrency(presetDraft.sale_price)}
                        </div>
                      </div>
                    </div>
                    {!selectedRecipe && (
                      <div 
                        style={{ 
                          marginTop: 12, 
                          paddingTop: 12, 
                          borderTop: '1px solid var(--danger-200)', 
                          fontSize: '0.75rem', 
                          color: 'var(--danger-700)',
                          fontWeight: 600
                        }}
                      >
                        ⚠️ ATENÇÃO: A receita deste modelo não existe mais. O valor sugerido pode estar defasado ou zerado (R$ 0,00). 
                        Revise o valor total do pedido manualmente.
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className={`form-group ${fieldErrors.has('title') ? 'has-error' : ''}`}>
                <label className="form-label">Título do pedido</label>
                <input
                  className="form-input"
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Ex: Bolo de aniversário da Ana"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Tema</label>
                <input
                  className="form-input"
                  value={form.theme}
                  onChange={(event) => setForm((current) => ({ ...current, theme: event.target.value }))}
                  placeholder="Ex: Flores secas, safari, elegante..."
                />
              </div>

              <div className="form-row">
                <DateInput
                  label="Data do evento"
                  value={form.event_date}
                  onChange={(val) => setForm((current) => ({ ...current, event_date: val }))}
                  hasError={fieldErrors.has('event_date')}
                />
                <DateInput
                  label="Data de entrega"
                  value={form.delivery_date}
                  onChange={(val) => setForm((current) => ({ ...current, delivery_date: val }))}
                  hasError={fieldErrors.has('delivery_date')}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Tamanho</label>
                  <input
                    className="form-input"
                    value={form.size_label}
                    onChange={(event) => setForm((current) => ({ ...current, size_label: event.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Porções</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    value={form.servings || ''}
                    onChange={(event) => setForm((current) => ({ ...current, servings: parseInt(event.target.value, 10) || 0 }))}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className={`form-group ${fieldErrors.has('sale_price') ? 'has-error' : ''}`}>
                  <label className="form-label">Valor total</label>
                  <CurrencyInput value={form.sale_price} onChange={(value) => setForm((current) => ({ ...current, sale_price: value || 0 }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Entrada recebida</label>
                  <CurrencyInput
                    value={form.deposit_amount}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        deposit_amount: value,
                        payment_status:
                          value <= 0
                            ? 'pending'
                            : value >= current.sale_price
                              ? 'paid'
                              : 'partial',
                      }))
                    }
                  />
                  <div className="form-hint">
                    Restante: {formatCurrency(Math.max(form.sale_price - form.deposit_amount, 0))}
                  </div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select
                    className="form-select"
                    value={form.status}
                    onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Pagamento</label>
                  <select
                    className="form-select"
                    value={form.payment_status}
                    onChange={(event) => setForm((current) => ({ ...current, payment_status: event.target.value }))}
                  >
                    {paymentOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {!editing && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                  <input
                    type="checkbox"
                    checked={form.auto_generate_tasks}
                    onChange={(event) => setForm((current) => ({ ...current, auto_generate_tasks: event.target.checked }))}
                  />
                  <span className="text-sm">
                    Gerar tarefas de produção automaticamente a partir do modelo
                  </span>
                </label>
              )}

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Observações</label>
                <textarea
                  className="form-textarea"
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeModal}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Salvando...' : editing ? 'Atualizar pedido' : 'Criar pedido'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
