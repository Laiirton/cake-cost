'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Wheat,
  BookOpen,
  Calculator,
  Users,
  ShoppingBag,
  ListChecks,
  DollarSign,
  Settings,
  LogOut,
  X,
} from 'lucide-react'
import Image from 'next/image'

const navItems = [
  {
    section: 'Visão Geral',
    items: [
      { href: '/dashboard', label: 'Painel', icon: LayoutDashboard },
    ],
  },
  {
    section: 'Base',
    items: [
      { href: '/dashboard/ingredientes', label: 'Ingredientes', icon: Wheat },
      { href: '/dashboard/receitas', label: 'Receitas', icon: BookOpen },
      { href: '/dashboard/clientes', label: 'Clientes', icon: Users },
    ],
  },
  {
    section: 'Vendas',
    items: [
      { href: '/dashboard/calculadora', label: 'Modelos e Preços', icon: Calculator },
      { href: '/dashboard/pedidos', label: 'Pedidos', icon: ShoppingBag },
    ],
  },
  {
    section: 'Operação',
    items: [
      { href: '/dashboard/producao', label: 'Produção', icon: ListChecks },
      { href: '/dashboard/financeiro', label: 'Financeiro', icon: DollarSign },
    ],
  },
  {
    section: 'Sistema',
    items: [
      { href: '/dashboard/configuracoes', label: 'Configurações', icon: Settings },
    ],
  },
]

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  return (
    <>
      {isOpen && <div className="mobile-overlay" onClick={onClose} />}
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <Image 
              src="/logo.png" 
              alt="Logo" 
              width={42} 
              height={42} 
              style={{ borderRadius: '50%' }}
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent) parent.innerHTML = 'CC';
              }}
            />
          </div>
          <div className="sidebar-logo-text">
            <h2>Cake Cost</h2>
            <span>Gestão de Confeitaria</span>
          </div>
          <button
            className="btn-ghost btn-icon mobile-close-btn"
            onClick={onClose}
            style={{ marginLeft: 'auto', color: 'white' }}
            id="close-sidebar-btn"
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((section) => (
            <div key={section.section}>
              <div className="sidebar-section-title">{section.section}</div>
              {section.items.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`sidebar-link ${isActive(item.href) ? 'active' : ''}`}
                    onClick={onClose}
                  >
                    <Icon size={20} />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="sidebar-link"
              style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer' }}
            >
              <LogOut size={20} />
              Sair
            </button>
          </form>
        </div>
      </aside>
    </>
  )
}
