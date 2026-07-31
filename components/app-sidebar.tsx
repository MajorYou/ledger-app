import { getSession } from '@/lib/auth'
import { SidebarNav, SidebarFooter } from './app-sidebar-client'

export async function AppSidebar() {
  const user = await getSession()

  return (
    <aside className="w-56 shrink-0 sticky top-0 h-screen bg-card border-r border-border flex flex-col">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 gap-2.5 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#34dbcb] to-[#3445db] flex items-center justify-center">
          <svg className="w-4.5 h-4.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
            <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
            <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
          </svg>
        </div>
        <span className="font-bold text-base text-foreground">家庭记账</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        <SidebarNav />
      </nav>

      {/* Footer */}
      {user && <SidebarFooter user={user} />}
    </aside>
  )
}
