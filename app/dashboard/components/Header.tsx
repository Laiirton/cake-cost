'use client'

import { Menu } from 'lucide-react'

interface HeaderProps {
  onMenuClick: () => void
  userEmail?: string
}

export default function Header({ onMenuClick, userEmail }: HeaderProps) {
  const initials = userEmail
    ? userEmail.substring(0, 1).toUpperCase()
    : 'U'

  return (
    <header className="header">
      <div className="header-left">
        <button className="mobile-menu-btn" onClick={onMenuClick} aria-label="Abrir menu">
          <Menu size={24} />
        </button>
      </div>
      <div className="header-right">
        <div className="header-user">
          <div className="header-avatar">{initials}</div>
          <div className="header-user-info">
            <span className="header-user-name">{userEmail || 'Usuário'}</span>
            <span className="header-user-role">Administrador</span>
          </div>
        </div>
      </div>
    </header>
  )
}
