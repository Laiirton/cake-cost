'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTransientToast } from '@/lib/hooks/useTransientToast'
import { getBrowserClient } from '@/lib/supabase/client'
import { Settings, Save } from 'lucide-react'
import { formatPhoneInput } from '@/lib/utils'
import CurrencyInput from '@/app/dashboard/components/CurrencyInput'

interface BakerySettings {
  id: string
  business_name: string
  owner_name: string
  whatsapp: string
  default_markup_pct: number
  labor_hour_rate: number
  monthly_fixed_cost: number
  monthly_order_goal: number
  working_days_per_month: number
  packaging_cost_default: number
  delivery_cost_default: number
  notes: string
}

const defaultSettings: BakerySettings = {
  id: 'default',
  business_name: '',
  owner_name: '',
  whatsapp: '',
  default_markup_pct: 0,
  labor_hour_rate: 0,
  monthly_fixed_cost: 0,
  monthly_order_goal: 0,
  working_days_per_month: 22,
  packaging_cost_default: 0,
  delivery_cost_default: 0,
  notes: '',
}

export default function ConfiguracoesPage() {
  const [form, setForm] = useState<BakerySettings>(defaultSettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast, showToast } = useTransientToast()

  const load = useCallback(async () => {
    const supabase = await getBrowserClient()
    const { data } = await supabase.from('bakery_settings').select('*').limit(1).single()
    if (data) setForm(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    setSaving(true)
    try {
      const supabase = await getBrowserClient()
      const { error } = await supabase.from('bakery_settings').upsert(form)
      if (error) throw error
      showToast('success', 'Configurações salvas com sucesso!')
    } catch {
      showToast('error', 'Erro ao salvar configurações')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-header"><div><h1>Configurações</h1></div></div>
        <div className="card">
          <div className="card-body">
            {[1,2,3,4,5,6].map(i => <div key={i} style={{ marginBottom: 20 }}><div className="skeleton" style={{ width: '20%', height: 14, marginBottom: 8 }} /><div className="skeleton" style={{ width: '100%', height: 40 }} /></div>)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

      <div className="page-header">
        <div>
          <h1>Configurações</h1>
          <p>Configurações gerais da confeitaria</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          <Save size={18} /> {saving ? 'Salvando...' : 'Salvar Configurações'}
        </button>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Settings size={18} /> Dados da Confeitaria</h3>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Nome do Negócio</label>
              <input className="form-input" value={form.business_name} onChange={e => setForm({ ...form, business_name: e.target.value })} placeholder="Minha Confeitaria" />
            </div>
            <div className="form-group">
              <label className="form-label">Nome do Proprietário</label>
              <input className="form-input" value={form.owner_name} onChange={e => setForm({ ...form, owner_name: e.target.value })} />
            </div>
               <div className="form-group">
                 <label className="form-label">WhatsApp</label>
                 <input className="form-input" value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: formatPhoneInput(e.target.value) })} placeholder="(00) 00000-0000" />
               </div>
            <div className="form-group">
              <label className="form-label">Observações</label>
              <textarea className="form-textarea" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>💰 Valores Padrão</h3>
          </div>
          <div className="card-body">
               <div className="form-row">
                 <div className="form-group">
                   <label className="form-label">Markup Padrão (%)</label>
                   <input className="form-input" type="number" step="0.1" value={form.default_markup_pct} onChange={e => setForm({ ...form, default_markup_pct: parseFloat(e.target.value) || 0 })} />
                 </div>
                 <div className="form-group">
                   <label className="form-label">Valor/Hora (R$)</label>
                   <CurrencyInput 
                     value={form.labor_hour_rate} 
                     onChange={val => setForm({ ...form, labor_hour_rate: val })} 
                   />
                 </div>
               </div>
               <div className="form-row">
                 <div className="form-group">
                   <label className="form-label">Custo Fixo Mensal (R$)</label>
                   <CurrencyInput 
                     value={form.monthly_fixed_cost} 
                     onChange={val => setForm({ ...form, monthly_fixed_cost: val })} 
                   />
                 </div>
                 <div className="form-group">
                   <label className="form-label">Meta de Pedidos/Mês</label>
                   <input className="form-input" type="number" min="1" value={form.monthly_order_goal} onChange={e => setForm({ ...form, monthly_order_goal: parseInt(e.target.value) || 0 })} />
                 </div>
               </div>
               <div className="form-row">
                 <div className="form-group">
                   <label className="form-label">Dias Trabalhados/Mês</label>
                   <input className="form-input" type="number" value={form.working_days_per_month} onChange={e => setForm({ ...form, working_days_per_month: parseInt(e.target.value) || 0 })} />
                 </div>
                 <div className="form-group">
                   <label className="form-label">Embalagem Padrão (R$)</label>
                   <CurrencyInput 
                     value={form.packaging_cost_default} 
                     onChange={val => setForm({ ...form, packaging_cost_default: val })} 
                   />
                 </div>
               </div>
               <div className="form-group">
                 <label className="form-label">Entrega Padrão (R$)</label>
                 <CurrencyInput 
                   value={form.delivery_cost_default} 
                   onChange={val => setForm({ ...form, delivery_cost_default: val })} 
                 />
               </div>
          </div>
        </div>
      </div>
    </div>
  )
}
