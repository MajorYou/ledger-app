'use client'

import { login } from '@/lib/actions/auth'
import { useActionState } from 'react'
import Link from 'next/link'

export default function LoginPage() {
  const [state, action, isPending] = useActionState(login, null)

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-8">
      <h1 className="text-2xl font-bold text-foreground mb-2">登录</h1>
      <p className="text-sm text-muted-foreground mb-6">欢迎回到家庭记账</p>

      <form action={action} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            邮箱
          </label>
          <input
            name="email"
            type="email"
            required
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            placeholder="admin@ledger.local"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            密码
          </label>
          <input
            name="password"
            type="password"
            required
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            placeholder="输入密码"
          />
        </div>

        {state?.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? '登录中...' : '登录'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        还没有账号？{' '}
        <Link href="/register" className="text-primary hover:underline">
          注册
        </Link>
      </p>
    </div>
  )
}
