'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Plus, Search, Pencil, Trash2, X, Users } from 'lucide-react'
import { formatPhoneInput } from '@/lib/utils'

interface Customer {
  id: string
  name: string
  phone: string
  instagram: string | null
  neighborhood: string
  notes: string
  display_order: number
}

const emptyCustomer = { name: '', phone: '', instagram: '', neighborhood: '', notes: '', display_order: 0 }

export default function ClientesPage() {
  const [items, setItems] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState(emptyCustomer)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: string; message: string } | null>(null)
  const [formError, setFormError] = useState('')
  const supabase = useMemo(() => createClient(), [])

  const load = useCallback(async () => {
    const { data } = await supabase.from('customers').select('*').order('name')
    setItems(data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const showToast = (type: string, message: string) => { setToast({ type, message }); setTimeout(() => setToast(null), 3000) }

  const openNew = () => { setEditing(null); setFormError(''); setForm(emptyCustomer); setShowModal(true) }
  const openEdit = (item: Customer) => {
    setEditing(item)
    setFormError('')
    setForm({ name: item.name, phone: item.phone, instagram: item.instagram || '', neighborhood: item.neighborhood, notes: item.notes, display_order: item.display_order })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError('Informe o nome do cliente.')
      return
    }
    setSaving(true)
    try {
      const payload = { ...form, instagram: form.instagram || null }
      if (editing) {
        const { error } = await supabase.from('customers').update(payload).eq('id', editing.id)
        if (error) throw error
        showToast('success', 'Cliente atualizado!')
      } else {
        const { error } = await supabase.from('customers').insert({ ...payload, id: crypto.randomUUID() })
        if (error) throw error
        showToast('success', 'Cliente criado!')
      }
      setShowModal(false); load()
    } catch { showToast('error', 'Erro ao salvar') } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este cliente?')) return
    try {
      await supabase.from('customers').delete().eq('id', id)
      showToast('success', 'Excluído!'); load()
    } catch { showToast('error', 'Erro ao excluir') }
  }

  const filtered = items.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.phone.includes(search) ||
    i.neighborhood.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="page-container">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

      <div className="page-header">
        <div><h1>Clientes</h1><p>{items.length} clientes cadastrados e prontos para novos pedidos</p></div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={18} /> Novo Cliente</button>
      </div>

      <div style={{ marginBottom: 20 }}><div className="search-bar"><Search size={18} /><input placeholder="Buscar por nome, telefone ou bairro..." value={search} onChange={e => setSearch(e.target.value)} /></div></div>

      {loading ? (
        <div className="table-container">{[1,2,3,4].map(i => <div key={i} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-light)' }}><div className="skeleton" style={{ width: '50%', height: 16, marginBottom: 8 }} /><div className="skeleton" style={{ width: '30%', height: 14 }} /></div>)}</div>
      ) : filtered.length === 0 ? (
        <div className="card"><div className="empty-state"><Users size={48} /><h3>Nenhum cliente encontrado</h3><p>Adicione seus primeiros clientes</p><button className="btn btn-primary" onClick={openNew}><Plus size={18} /> Adicionar</button></div></div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead><tr><th>Nome</th><th>Telefone</th><th>Instagram</th><th>Bairro</th><th style={{ textAlign: 'right' }}>Ações</th></tr></thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.id}>
                  <td className="font-semibold">{item.name}</td>
                  <td>{item.phone || '-'}</td>
                  <td>{item.instagram ? `@${item.instagram.replace('@', '')}` : '-'}</td>
                  <td>{item.neighborhood || '-'}</td>
                  <td>
                    <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                      <Link href={`/dashboard/pedidos?new=1&customer=${item.id}`} className="btn btn-ghost btn-sm">Pedido</Link>
                      <button className="btn btn-ghost btn-icon" onClick={() => openEdit(item)}><Pencil size={16} /></button>
                      <button className="btn btn-ghost btn-icon" onClick={() => handleDelete(item.id)} style={{ color: 'var(--danger-500)' }}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h2>{editing ? 'Editar Cliente' : 'Novo Cliente'}</h2><button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={20} /></button></div>
            <div className="modal-body">
              {formError && <div className="form-error" style={{ marginBottom: 16 }}>{formError}</div>}
              <div className="form-group"><label className="form-label">Nome *</label><input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Telefone</label><input className="form-input" value={form.phone} onChange={e => setForm({ ...form, phone: formatPhoneInput(e.target.value) })} placeholder="(00) 00000-0000" /></div>
                <div className="form-group"><label className="form-label">Instagram</label><input className="form-input" value={form.instagram} onChange={e => setForm({ ...form, instagram: e.target.value })} placeholder="@usuario" /></div>
              </div>
              <div className="form-group"><label className="form-label">Bairro</label><input className="form-input" value={form.neighborhood} onChange={e => setForm({ ...form, neighborhood: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Observações</label><textarea className="form-textarea" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : editing ? 'Atualizar' : 'Criar'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
