'use client'

import { logout } from '@/lib/actions/auth'

export function LogoutButton() {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="text-sm text-muted-foreground hover:text-destructive transition-colors"
      >
        退出
      </button>
    </form>
  )
}
