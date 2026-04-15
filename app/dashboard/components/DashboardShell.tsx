'use client'

import { useState } from 'react'
import Header from './Header'
import Sidebar from './Sidebar'

interface DashboardShellProps {
  children: React.ReactNode
  userEmail?: string
}

export default function DashboardShell({ children, userEmail }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-content">
        <Header
          onMenuClick={() => setSidebarOpen(true)}
          userEmail={userEmail}
        />
        {children}
      </div>
    </>
  )
}
