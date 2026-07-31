'use client'

import { register } from '@/lib/actions/auth'
import { useActionState } from 'react'
import Link from 'next/link'

export default function RegisterPage() {
  const [state, action, isPending] = useActionState(register, null)

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-8">
      <h1 className="text-2xl font-bold text-foreground mb-2">注册</h1>
      <p className="text-sm text-muted-foreground mb-6">创建你的家庭记账账号</p>

      <form action={action} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            姓名
          </label>
          <input
            name="name"
            type="text"
            required
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            placeholder="你的名字"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            邮箱
          </label>
          <input
            name="email"
            type="email"
            required
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            placeholder="your@email.com"
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
            placeholder="设置密码"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            家庭邀请码{' '}
            <span className="text-muted-foreground font-normal">（首个注册用户可不填）</span>
          </label>
          <input
            name="inviteCode"
            type="text"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            placeholder="输入邀请码"
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
          {isPending ? '注册中...' : '注册'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        已有账号？{' '}
        <Link href="/login" className="text-primary hover:underline">
          登录
        </Link>
      </p>
    </div>
  )
}
