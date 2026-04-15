'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Calculator,
  Clock,
  DollarSign,
  ListChecks,
  ShoppingBag,
  TrendingUp,
  Users,
  Wheat,
} from 'lucide-react'
import { getBrowserClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import {
  getOrderRemainingBalance,
  getOrderTimelineDate,
  isOrderActive,
  isPaymentOpen,
} from '@/lib/bakery'

interface OrderSummary {
  id: string
  title: string
  status: string
  payment_status: string
  sale_price: number
  deposit_amount: number
  event_date: string
  delivery_date: string
  customers?: { name: string }
}

interface TaskSummary {
  id: string
  title: string
  status: string
  due_at: string
  station: string
  orders?: { title: string }
}

interface IngredientAlert {
  id: string
  name: string
  updated_year: number
}

interface DashboardState {
  activeOrders: number
  totalCustomers: number
  totalRecipes: number
  totalPresets: number
  monthSales: number
  monthCashBalance: number
  pendingReceivables: number
  overdueOrders: OrderSummary[]
  upcomingOrders: OrderSummary[]
  pendingPayments: OrderSummary[]
  upcomingTasks: TaskSummary[]
  staleIngredients: IngredientAlert[]
  settings: {
    business_name: string
  } | null
}

const statusLabels: Record<string, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  in_progress: 'Em produção',
  completed: 'Concluído',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
  todo: 'A fazer',
  doing: 'Em andamento',
  done: 'Concluído',
  partial: 'Parcial',
  paid: 'Pago',
}

function getStatusBadge(status: string) {
  return (
    {
      pending: 'badge-warning',
      confirmed: 'badge-info',
      in_progress: 'badge-brand',
      completed: 'badge-success',
      delivered: 'badge-success',
      cancelled: 'badge-danger',
      todo: 'badge-neutral',
      doing: 'badge-warning',
      done: 'badge-success',
      partial: 'badge-warning',
      paid: 'badge-success',
    }[status] || 'badge-neutral'
  )
}

function isOverdue(dateValue: string, today: string) {
  return Boolean(dateValue) && dateValue < today
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardState>({
    activeOrders: 0,
    totalCustomers: 0,
    totalRecipes: 0,
    totalPresets: 0,
    monthSales: 0,
    monthCashBalance: 0,
    pendingReceivables: 0,
    overdueOrders: [],
    upcomingOrders: [],
    pendingPayments: [],
    upcomingTasks: [],
    staleIngredients: [],
    settings: null,
  })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const supabase = await getBrowserClient()
      const now = new Date()
      const currentYear = now.getFullYear()
      const today = now.toISOString().split('T')[0]
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split('T')[0]
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        .toISOString()
        .split('T')[0]

      const [
        ordersRes,
        customersRes,
        recipesRes,
        presetsRes,
        tasksRes,
        ingredientsRes,
        monthIncomeRes,
        monthExpenseRes,
        settingsRes,
      ] = await Promise.all([
        supabase
          .from('orders')
          .select('id, title, status, payment_status, sale_price, deposit_amount, event_date, delivery_date, customers(name)')
          .order('event_date'),
        supabase.from('customers').select('id', { count: 'exact' }),
        supabase.from('recipes').select('id', { count: 'exact' }),
        supabase.from('calculator_presets').select('id', { count: 'exact' }),
        supabase
          .from('production_tasks')
          .select('id, title, status, due_at, station, orders(title)')
          .order('due_at'),
        supabase.from('ingredients').select('id, name, updated_year').order('updated_year'),
        supabase
          .from('cash_entries')
          .select('amount')
          .eq('kind', 'income')
          .gte('occurred_on', firstDayOfMonth)
          .lte('occurred_on', lastDayOfMonth),
        supabase
          .from('cash_entries')
          .select('amount')
          .eq('kind', 'expense')
          .gte('occurred_on', firstDayOfMonth)
          .lte('occurred_on', lastDayOfMonth),
        supabase.from('bakery_settings').select('business_name').limit(1).single(),
      ])

      const orders = (ordersRes.data || []).map((order: OrderSummary) => ({
        ...order,
        customers: Array.isArray(order.customers) ? order.customers[0] : order.customers,
      })) as OrderSummary[]
      const tasks = (tasksRes.data || []).map((task: TaskSummary) => ({
        ...task,
        orders: Array.isArray(task.orders) ? task.orders[0] : task.orders,
      })) as TaskSummary[]
      const activeOrders = orders.filter((order) => isOrderActive(order.status))
      const pendingReceivables = orders
        .filter((order) => order.status !== 'cancelled' && isPaymentOpen(order.payment_status))
        .reduce((sum: number, order) => sum + getOrderRemainingBalance(order), 0)
      const monthSales = orders
        .filter((order) => order.status !== 'cancelled')
        .filter((order) => {
          const timeline = getOrderTimelineDate(order)
          return timeline >= firstDayOfMonth && timeline <= lastDayOfMonth
        })
        .reduce((sum: number, order) => sum + (order.sale_price || 0), 0)
      const monthCashBalance =
        (monthIncomeRes.data || []).reduce((sum: number, entry: { amount: number }) => sum + (entry.amount || 0), 0) -
        (monthExpenseRes.data || []).reduce((sum: number, entry: { amount: number }) => sum + (entry.amount || 0), 0)

      setData({
        activeOrders: activeOrders.length,
        totalCustomers: customersRes.count || 0,
        totalRecipes: recipesRes.count || 0,
        totalPresets: presetsRes.count || 0,
        monthSales,
        monthCashBalance,
        pendingReceivables,
        overdueOrders: activeOrders
          .filter((order) => isOverdue(getOrderTimelineDate(order), today))
          .slice(0, 4),
        upcomingOrders: activeOrders
          .filter((order) => !isOverdue(getOrderTimelineDate(order), today))
          .slice(0, 5),
        pendingPayments: orders
          .filter((order) => order.status !== 'cancelled' && isPaymentOpen(order.payment_status))
          .sort((a, b) => getOrderTimelineDate(a).localeCompare(getOrderTimelineDate(b)))
          .slice(0, 5),
        upcomingTasks: tasks
          .filter((task) => task.status !== 'done')
          .slice(0, 6),
        staleIngredients: (ingredientsRes.data || [])
          .filter((ingredient: IngredientAlert) => ingredient.updated_year < currentYear)
          .slice(0, 5),
        settings: settingsRes.data ? { business_name: settingsRes.data.business_name } : null,
      })
    } catch (error) {
      console.error('Erro ao carregar painel:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const setupItems = [
    { label: 'Receitas', count: data.totalRecipes, href: '/dashboard/receitas', icon: BookOpen },
    { label: 'Modelos', count: data.totalPresets, href: '/dashboard/calculadora', icon: Calculator },
    { label: 'Clientes', count: data.totalCustomers, href: '/dashboard/clientes', icon: Users },
  ]

  const missingSetup = setupItems.filter((item) => item.count === 0)
  const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date())

  if (loading) {
    return (
      <div className="page-container">
        <div className="stats-grid">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="stat-card">
              <div className="skeleton" style={{ width: 48, height: 48, borderRadius: 12, marginBottom: 16 }} />
              <div className="skeleton" style={{ width: '60%', height: 28, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: '40%', height: 16 }} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>
            {data.settings?.business_name
              ? `Rotina de ${data.settings.business_name}`
              : 'Central da confeitaria'}
          </h1>
          <p>
            O que vender, produzir e cobrar em {monthName.charAt(0).toUpperCase() + monthName.slice(1)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/dashboard/calculadora" className="btn btn-secondary">
            <Calculator size={16} />
            Montar modelo
          </Link>
          <Link href="/dashboard/pedidos?new=1" className="btn btn-primary">
            <ShoppingBag size={16} />
            Novo pedido
          </Link>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon"><ShoppingBag size={24} /></div>
          <div className="stat-value">{data.activeOrders}</div>
          <div className="stat-label">Pedidos ativos</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><TrendingUp size={24} /></div>
          <div className="stat-value">{formatCurrency(data.monthSales)}</div>
          <div className="stat-label">Vendas do mês</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><DollarSign size={24} /></div>
          <div className="stat-value">{formatCurrency(data.pendingReceivables)}</div>
          <div className="stat-label">Valor a receber</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><ListChecks size={24} /></div>
          <div
            className="stat-value"
            style={{ color: data.monthCashBalance >= 0 ? 'var(--success-600)' : 'var(--danger-500)' }}
          >
            {formatCurrency(data.monthCashBalance)}
          </div>
          <div className="stat-label">Saldo manual do caixa</div>
        </div>
      </div>

      {missingSetup.length > 0 && (
        <div
          className="card"
          style={{
            marginBottom: 24,
            borderColor: 'var(--warning-500)',
            background: 'linear-gradient(135deg, var(--warning-50), white)',
          }}
        >
          <div className="card-body" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 240px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, marginBottom: 6 }}>
                <AlertCircle size={18} style={{ color: 'var(--warning-600)' }} />
                Base inicial incompleta
              </div>
              <p className="text-sm text-muted">
                Para o fluxo ficar leve, vale completar primeiro: {missingSetup.map((item) => item.label.toLowerCase()).join(', ')}.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {missingSetup.map((item) => {
                const Icon = item.icon
                return (
                  <Link key={item.label} href={item.href} className="btn btn-secondary">
                    <Icon size={16} />
                    Abrir {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <Link href="/dashboard/pedidos?new=1" className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <ShoppingBag size={20} />
            <ArrowRight size={16} />
          </div>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Criar novo pedido</div>
          <div className="text-sm text-muted">Comece por cliente e modelo para preencher o pedido com menos digitação.</div>
        </Link>
        <Link href="/dashboard/calculadora" className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Calculator size={20} />
            <ArrowRight size={16} />
          </div>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Criar ou revisar modelo</div>
          <div className="text-sm text-muted">Centralize precificação, embalagem, entrega e extras antes de vender.</div>
        </Link>
        <Link href="/dashboard/producao" className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Clock size={20} />
            <ArrowRight size={16} />
          </div>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Ver produção</div>
          <div className="text-sm text-muted">Acompanhe atrasos, itens de hoje e gargalos por estação.</div>
        </Link>
        <Link href="/dashboard/financeiro" className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <DollarSign size={20} />
            <ArrowRight size={16} />
          </div>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Cobrar e registrar</div>
          <div className="text-sm text-muted">Separe o que foi vendido do que entrou no caixa para não se perder.</div>
        </Link>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={18} style={{ color: 'var(--warning-500)' }} />
                Pedidos que pedem ação
              </h3>
              <Link href="/dashboard/pedidos" className="btn btn-ghost btn-sm">
                Ver pedidos
                <ArrowRight size={14} />
              </Link>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {data.overdueOrders.length === 0 && data.upcomingOrders.length === 0 ? (
                <div className="empty-state" style={{ padding: 32 }}>
                  <ShoppingBag size={40} />
                  <h3>Nenhum pedido em andamento</h3>
                  <p>Quando os pedidos entrarem, eles aparecem aqui por prioridade.</p>
                </div>
              ) : (
                <div style={{ padding: '6px 0' }}>
                  {[...data.overdueOrders, ...data.upcomingOrders].slice(0, 6).map((order) => {
                    const timeline = getOrderTimelineDate(order)
                    const remaining = getOrderRemainingBalance(order)
                    return (
                      <div
                        key={order.id}
                        style={{
                          padding: '14px 24px',
                          borderBottom: '1px solid var(--border-light)',
                          background: isOverdue(timeline, new Date().toISOString().split('T')[0])
                            ? 'var(--danger-50)'
                            : 'transparent',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ minWidth: 0 }}>
                            <div className="font-semibold">{order.title}</div>
                            <div className="text-xs text-muted">
                              {order.customers?.name || 'Sem cliente'} • {timeline ? formatDate(timeline) : 'Sem data'}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div className={`badge ${getStatusBadge(order.status)}`}>
                              {statusLabels[order.status] || order.status}
                            </div>
                            <div className="text-xs text-muted" style={{ marginTop: 6 }}>
                              Falta {formatCurrency(remaining)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <DollarSign size={18} />
                Cobranças pendentes
              </h3>
              <Link href="/dashboard/financeiro" className="btn btn-ghost btn-sm">
                Abrir financeiro
                <ArrowRight size={14} />
              </Link>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {data.pendingPayments.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
                  Sem cobranças pendentes por enquanto.
                </div>
              ) : (
                <div style={{ padding: '6px 0' }}>
                  {data.pendingPayments.map((order) => (
                    <div
                      key={order.id}
                      style={{
                        padding: '14px 24px',
                        borderBottom: '1px solid var(--border-light)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div className="font-semibold">{order.title}</div>
                        <div className="text-xs text-muted">
                          {order.customers?.name || 'Sem cliente'} • {formatDate(getOrderTimelineDate(order))}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className={`badge ${getStatusBadge(order.payment_status)}`}>
                          {statusLabels[order.payment_status] || order.payment_status}
                        </div>
                        <div style={{ fontWeight: 700, marginTop: 6 }}>
                          {formatCurrency(getOrderRemainingBalance(order))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={18} />
                Produção em fila
              </h3>
              <Link href="/dashboard/producao" className="btn btn-ghost btn-sm">
                Ver produção
                <ArrowRight size={14} />
              </Link>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {data.upcomingTasks.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
                  Nenhuma tarefa pendente no momento.
                </div>
              ) : (
                <div style={{ padding: '6px 0' }}>
                  {data.upcomingTasks.map((task) => (
                    <div
                      key={task.id}
                      style={{
                        padding: '14px 24px',
                        borderBottom: '1px solid var(--border-light)',
                        display: 'flex',
                        gap: 12,
                        alignItems: 'center',
                      }}
                    >
                      <span className={`badge ${getStatusBadge(task.status)}`}>
                        {statusLabels[task.status] || task.status}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="font-semibold text-sm">{task.title}</div>
                        <div className="text-xs text-muted">
                          {task.orders?.title || 'Sem pedido'} • {task.station || 'Sem estação'} • {formatDateTime(task.due_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Wheat size={18} />
                Base de cadastro
              </h3>
              <Link href="/dashboard/ingredientes" className="btn btn-ghost btn-sm">
                Revisar base
                <ArrowRight size={14} />
              </Link>
            </div>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
                {setupItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="card"
                      style={{ padding: 16, borderRadius: 'var(--radius-lg)', boxShadow: 'none' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <Icon size={18} />
                        <span className="badge badge-neutral">{item.count}</span>
                      </div>
                      <div style={{ fontWeight: 700 }}>{item.label}</div>
                    </Link>
                  )
                })}
              </div>

              <div
                style={{
                  padding: 16,
                  borderRadius: 'var(--radius-lg)',
                  background: data.staleIngredients.length > 0 ? 'var(--warning-50)' : 'var(--success-50)',
                  border: `1px solid ${data.staleIngredients.length > 0 ? 'var(--accent-200)' : 'var(--success-100)'}`,
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 6 }}>
                  {data.staleIngredients.length > 0
                    ? `${data.staleIngredients.length} ingrediente(s) com preço antigo`
                    : 'Custos base atualizados'}
                </div>
                <div className="text-sm text-muted">
                  {data.staleIngredients.length > 0
                    ? data.staleIngredients.map((ingredient) => ingredient.name).join(', ')
                    : 'A calculadora e os modelos vão refletir melhor o custo atual.'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
