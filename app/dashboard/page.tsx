'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ShoppingBag, Users, DollarSign, TrendingUp, Calendar, Clock,
  BookOpen, Wheat, ArrowRight, AlertCircle,
} from 'lucide-react'
import Link from 'next/link'
import { formatCurrency, calculateRecipeTotalCost, formatDate, formatDateTime, type Ingredient, type RecipeItem } from '@/lib/utils'

interface DashboardData {
  totalOrders: number
  totalCustomers: number
  totalRevenue: number
  totalRecipes: number
  pendingOrders: Array<{
    id: string; title: string; status: string; sale_price: number; event_date: string
    customers?: { name: string }
  }>
  upcomingTasks: Array<{
    id: string; title: string; status: string; due_at: string
    orders?: { title: string }
  }>
  recentRecipes: Array<{
    id: string; name: string; category: string; items: RecipeItem[]
  }>
  monthlyIncome: number
  monthlyExpense: number
  settings: {
    business_name: string; monthly_order_goal: number
  } | null
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>({
    totalOrders: 0, totalCustomers: 0, totalRevenue: 0, totalRecipes: 0,
    pendingOrders: [], upcomingTasks: [], recentRecipes: [],
    monthlyIncome: 0, monthlyExpense: 0, settings: null,
  })
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  const ingredientsMap = useMemo(() => {
    const m = new Map<string, Ingredient>()
    ingredients.forEach(i => m.set(i.id, i))
    return m
  }, [ingredients])

  const load = useCallback(async () => {
    try {
      const now = new Date()
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

      const [
        ordersRes, customersRes, recipesRes, ingredientsRes,
        pendingOrdersRes, tasksRes, recentRecipesRes,
        monthIncomeRes, monthExpenseRes, settingsRes,
      ] = await Promise.all([
        supabase.from('orders').select('id, sale_price', { count: 'exact' }),
        supabase.from('customers').select('id', { count: 'exact' }),
        supabase.from('recipes').select('id', { count: 'exact' }),
        supabase.from('ingredients').select('*'),
        supabase.from('orders').select('id, title, status, sale_price, event_date, customers(name)')
          .in('status', ['pending', 'confirmed', 'in_progress'])
          .order('event_date').limit(6),
        supabase.from('production_tasks').select('id, title, status, due_at, orders(title)')
          .in('status', ['todo', 'doing']).order('due_at').limit(5),
        supabase.from('recipes').select('id, name, category, items').order('display_order').limit(4),
        supabase.from('cash_entries').select('amount').eq('kind', 'income')
          .gte('occurred_on', firstDayOfMonth).lte('occurred_on', lastDayOfMonth),
        supabase.from('cash_entries').select('amount').eq('kind', 'expense')
          .gte('occurred_on', firstDayOfMonth).lte('occurred_on', lastDayOfMonth),
        supabase.from('bakery_settings').select('business_name, monthly_order_goal').limit(1).single(),
      ])

      const totalRevenue = ordersRes.data?.reduce((sum, o) => sum + (o.sale_price || 0), 0) || 0
      const monthlyIncome = monthIncomeRes.data?.reduce((s, e) => s + (e.amount || 0), 0) || 0
      const monthlyExpense = monthExpenseRes.data?.reduce((s, e) => s + (e.amount || 0), 0) || 0

      setIngredients(ingredientsRes.data || [])
      setData({
        totalOrders: ordersRes.count || 0,
        totalCustomers: customersRes.count || 0,
        totalRevenue,
        totalRecipes: recipesRes.count || 0,
        pendingOrders: (pendingOrdersRes.data || []) as unknown as DashboardData['pendingOrders'],
        upcomingTasks: (tasksRes.data || []) as unknown as DashboardData['upcomingTasks'],
        recentRecipes: (recentRecipesRes.data || []).map(r => ({ ...r, items: Array.isArray(r.items) ? r.items : [] })),
        monthlyIncome,
        monthlyExpense,
        settings: settingsRes.data as DashboardData['settings'],
      })
    } catch (err) {
      console.error('Error loading dashboard:', err)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => { load() }, [load])



  const statusLabels: Record<string, string> = {
    pending: 'Pendente', confirmed: 'Confirmado', in_progress: 'Em Produção',
    completed: 'Concluído', cancelled: 'Cancelado', delivered: 'Entregue',
    todo: 'A fazer', doing: 'Fazendo', done: 'Feito',
  }

  const getStatusBadge = (s: string) => ({
    pending: 'badge-warning', confirmed: 'badge-info', in_progress: 'badge-brand',
    completed: 'badge-success', delivered: 'badge-success', cancelled: 'badge-danger',
    todo: 'badge-neutral', doing: 'badge-warning', done: 'badge-success',
  }[s] || 'badge-neutral')

  const currentMonth = new Date().toLocaleDateString('pt-BR', { month: 'long' })

  if (loading) {
    return (
      <div className="page-container">
        <div className="stats-grid">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="stat-card">
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
              ? `Olá, ${data.settings.business_name}! 👋`
              : 'Painel de Controle'}
          </h1>
          <p>Visão geral da sua confeitaria • {currentMonth.charAt(0).toUpperCase() + currentMonth.slice(1)}</p>
        </div>
        <Link href="/dashboard/calculadora" className="btn btn-primary">
          <DollarSign size={18} /> Calcular Preço
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon"><ShoppingBag size={24} /></div>
          <div className="stat-value">{data.totalOrders}</div>
          <div className="stat-label">Pedidos Totais</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Users size={24} /></div>
          <div className="stat-value">{data.totalCustomers}</div>
          <div className="stat-label">Clientes</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><DollarSign size={24} /></div>
          <div className="stat-value" style={{ fontSize: data.totalRevenue > 99999 ? '1.25rem' : undefined }}>{formatCurrency(data.totalRevenue)}</div>
          <div className="stat-label">Receita Total</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><TrendingUp size={24} /></div>
          <div className="stat-value" style={{ fontSize: '1.25rem', color: (data.monthlyIncome - data.monthlyExpense) >= 0 ? 'var(--success-600)' : 'var(--danger-500)' }}>
            {formatCurrency(data.monthlyIncome - data.monthlyExpense)}
          </div>
          <div className="stat-label">Saldo do Mês</div>
        </div>
      </div>

      <div className="grid-2">
        {/* Pending Orders */}
        <div className="card">
          <div className="card-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={18} style={{ color: 'var(--warning-500)' }} />
              Pedidos Ativos
            </h3>
            <Link href="/dashboard/pedidos" className="btn btn-ghost btn-sm">Ver todos <ArrowRight size={14} /></Link>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {data.pendingOrders.length === 0 ? (
              <div className="empty-state" style={{ padding: 40 }}>
                <ShoppingBag size={40} style={{ color: 'var(--gray-300)', margin: '0 auto 12px' }} />
                <p>Nenhum pedido ativo</p>
              </div>
            ) : (
              <table className="data-table">
                <thead><tr><th>Pedido</th><th>Data</th><th>Status</th><th style={{ textAlign: 'right' }}>Valor</th></tr></thead>
                <tbody>
                  {data.pendingOrders.map(order => (
                    <tr key={order.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{order.title}</div>
                        <div className="text-xs text-muted">{order.customers?.name}</div>
                      </td>
                   <td className="text-sm">{formatDate(order.event_date)}</td>
                       <td><span className={`badge ${getStatusBadge(order.status)}`}>{statusLabels[order.status] || order.status}</span></td>
                       <td className="text-right font-semibold">{formatCurrency(order.sale_price)}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             )}
           </div>
         </div>
 
         {/* Tasks + Quick Recipes */}
         <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
           {/* Upcoming Tasks */}
           <div className="card">
             <div className="card-header">
               <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Clock size={18} /> Produção Pendente</h3>
               <Link href="/dashboard/producao" className="btn btn-ghost btn-sm">Ver <ArrowRight size={14} /></Link>
             </div>
             <div className="card-body" style={{ padding: 0 }}>
               {data.upcomingTasks.length === 0 ? (
                 <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>Nenhuma tarefa pendente ✅</div>
               ) : (
                 <div style={{ padding: '4px 0' }}>
                   {data.upcomingTasks.map(task => (
                     <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px', borderBottom: '1px solid var(--border-light)' }}>
                       <span className={`badge ${getStatusBadge(task.status)}`} style={{ minWidth: 60, textAlign: 'center' }}>{statusLabels[task.status]}</span>
                       <div style={{ flex: 1, minWidth: 0 }}>
                         <div className="font-semibold text-sm truncate">{task.title}</div>
                         <div className="text-xs text-muted">{task.orders?.title} • {formatDateTime(task.due_at)}</div>
                       </div>
                     </div>
                   ))}
                 </div>
               )}
             </div>
           </div>

          {/* Recent Recipes with Cost */}
          <div className="card">
            <div className="card-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><BookOpen size={18} /> Receitas</h3>
              <Link href="/dashboard/receitas" className="btn btn-ghost btn-sm">Ver <ArrowRight size={14} /></Link>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {data.recentRecipes.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>Nenhuma receita cadastrada</div>
              ) : (
                <div style={{ padding: '4px 0' }}>
                  {data.recentRecipes.map(recipe => {
                    const cost = calculateRecipeTotalCost(recipe.items, ingredientsMap)
                    return (
                      <div key={recipe.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 24px', borderBottom: '1px solid var(--border-light)' }}>
                        <div>
                          <div className="font-semibold text-sm">{recipe.name}</div>
                          <div className="text-xs text-muted">{recipe.category} • {recipe.items.length} ingredientes</div>
                        </div>
                        <span style={{ fontWeight: 700, color: 'var(--brand-600)', fontSize: '0.8125rem' }}>{formatCurrency(cost)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
