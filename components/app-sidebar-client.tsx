'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Upload,
  Receipt,
  BarChart3,
  BookOpen,
  Wallet,
  FolderTree,
  Copy,
  Settings,
} from 'lucide-react'
import { ThemeToggle } from './theme-toggle'
import { LogoutButton } from './logout-button'
import type { SessionUser } from '@/lib/auth'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  highlight?: boolean
}

const coreWorkflow: NavItem[] = [
  { href: '/', label: '仪表盘', icon: LayoutDashboard },
  { href: '/import', label: '导入对账', icon: Upload, highlight: true },
  { href: '/transactions', label: '交易记录', icon: Receipt },
  { href: '/reports', label: '报表', icon: BarChart3 },
]

const dataManagement: NavItem[] = [
  { href: '/ledgers', label: '账本', icon: BookOpen },
  { href: '/accounts', label: '账户', icon: Wallet },
  { href: '/categories', label: '分类', icon: FolderTree },
  { href: '/dedup', label: '去重', icon: Copy },
]

function NavItemLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon

  const baseClasses = 'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors'

  let classes: string
  if (item.highlight) {
    classes = isActive
      ? `${baseClasses} bg-gradient-to-r from-[#34dbcb]/15 to-[#3445db]/15 text-primary font-medium`
      : `${baseClasses} bg-gradient-to-r from-[#34dbcb]/8 to-[#3445db]/8 text-primary hover:from-[#34dbcb]/15 hover:to-[#3445db]/15`
  } else if (isActive) {
    classes = `${baseClasses} bg-muted text-foreground font-medium`
  } else {
    classes = `${baseClasses} text-muted-foreground hover:text-foreground hover:bg-muted/50`
  }

  return (
    <Link href={item.href} className={classes}>
      <Icon className="w-4 h-4 shrink-0" />
      <span>{item.label}</span>
    </Link>
  )
}

function NavGroup({ title, items, pathname }: {
  title?: string
  items: NavItem[]
  pathname: string
}) {
  return (
    <div className="mb-3">
      {title && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground uppercase tracking-wider font-medium">
          {title}
        </div>
      )}
      <div className="space-y-0.5">
        {items.map((item) => (
          <NavItemLink key={item.href} item={item} isActive={pathname === item.href} />
        ))}
      </div>
    </div>
  )
}

export function SidebarNav() {
  const pathname = usePathname()

  return (
    <>
      <NavGroup items={coreWorkflow} pathname={pathname} />
      <NavGroup title="数据管理" items={dataManagement} pathname={pathname} />
      <NavGroup
        items={[{ href: '/settings', label: '设置', icon: Settings }]}
        pathname={pathname}
      />
    </>
  )
}

export function SidebarFooter({ user }: { user: SessionUser }) {
  return (
    <div className="border-t border-border px-3 py-3 flex items-center gap-2">
      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary shrink-0">
        {user.name.charAt(0).toUpperCase()}
      </div>
      <span className="text-sm text-foreground truncate flex-1 min-w-0">{user.name}</span>
      <ThemeToggle />
      <LogoutButton />
    </div>
  )
}
