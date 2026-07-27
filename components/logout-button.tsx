'use client'

import { logout } from '@/lib/actions/auth'

export function LogoutButton() {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="text-sm text-zinc-400 hover:text-red-500 transition-colors"
      >
        退出
      </button>
    </form>
  )
}
