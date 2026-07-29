import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { LogoutButton } from './logout-button'
import { RefreshButton } from './refresh-button'

export async function NavBar() {
  const user = await getSession()

  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-zinc-200">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-bold text-lg text-zinc-900">
            💰 家庭记账
          </Link>
          {user && (
            <div className="hidden sm:flex items-center gap-4 text-sm">
              <Link
                href="/"
                className="text-zinc-600 hover:text-zinc-900 transition-colors"
              >
                仪表盘
              </Link>
              <Link
                href="/transactions"
                className="text-zinc-600 hover:text-zinc-900 transition-colors"
              >
                交易记录
              </Link>
              <Link
                href="/import"
                className="text-zinc-600 hover:text-zinc-900 transition-colors"
              >
                导入
              </Link>
              <Link
                href="/ledgers"
                className="text-zinc-600 hover:text-zinc-900 transition-colors"
              >
                账本
              </Link>
              <Link
                href="/accounts"
                className="text-zinc-600 hover:text-zinc-900 transition-colors"
              >
                账户
              </Link>
              <Link
                href="/categories"
                className="text-zinc-600 hover:text-zinc-900 transition-colors"
              >
                分类
              </Link>
              <Link
                href="/reports"
                className="text-zinc-600 hover:text-zinc-900 transition-colors"
              >
                报表
              </Link>
              <Link
                href="/dedup"
                className="text-zinc-600 hover:text-zinc-900 transition-colors"
              >
                去重
              </Link>
              <Link
                href="/settings"
                className="text-zinc-400 hover:text-zinc-900 transition-colors"
              >
                设置
              </Link>
            </div>
          )}
        </div>
        {user && (
          <div className="flex items-center gap-3">
            <RefreshButton />
            <span className="text-sm text-zinc-500">{user.name}</span>
            <LogoutButton />
          </div>
        )}
      </div>
    </nav>
  )
}
