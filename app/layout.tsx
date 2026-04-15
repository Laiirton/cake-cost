import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
})

export const metadata: Metadata = {
  title: 'Cake Cost - Gestão de Confeitaria',
  description: 'Dashboard profissional para gerenciamento de confeitaria. Controle receitas, pedidos, clientes, custos e muito mais.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR">
      <body className={inter.variable}>{children}</body>
    </html>
  )
}
