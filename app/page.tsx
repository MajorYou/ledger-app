import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import Link from 'next/link'
import { Package } from 'lucide-react'

export default async function DashboardPage() {
  const user = await getSession()
  if (!user) return null

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  // 本月支出
  const monthExpense = await prisma.transaction.aggregate({
    _sum: { amount: true },
    where: {
      type: 'expense',
      transactionTime: { gte: startOfMonth },
    },
  })

  // 本月收入
  const monthIncome = await prisma.transaction.aggregate({
    _sum: { amount: true },
    where: {
      type: 'income',
      transactionTime: { gte: startOfMonth },
    },
  })

  // 本月交易数
  const monthCount = await prisma.transaction.count({
    where: {
      transactionTime: { gte: startOfMonth },
    },
  })

  // 最近交易
  const recentTransactions = await prisma.transaction.findMany({
    take: 10,
    orderBy: { transactionTime: 'desc' },
    include: {
      category: { select: { id: true, name: true, icon: true, color: true } },
      sourceAccount: { select: { id: true, name: true, type: true } },
      toAccount: { select: { id: true, name: true, type: true } },
      transactionLedgers: {
        include: { ledger: { select: { id: true, name: true, color: true } } },
      },
    },
  })

  // 按分类汇总本月支出
  const categoryBreakdown = await prisma.transaction.groupBy({
    by: ['categoryId'],
    where: {
      type: 'expense',
      transactionTime: { gte: startOfMonth },
      categoryId: { not: null },
    },
    _sum: { amount: true },
    orderBy: { _sum: { amount: 'desc' } },
  })

  const categories = await prisma.category.findMany({
    where: { id: { in: categoryBreakdown.map((c) => c.categoryId!).filter(Boolean) } },
    select: { id: true, name: true, icon: true, color: true },
  })
  const categoryMap = new Map(categories.map((c) => [c.id, c]))

  return (
    <div className="w-full space-y-6">
      {/* 概览卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card rounded-md border border-border p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <p className="text-sm text-muted-foreground mb-1">本月支出</p>
          <p className="text-2xl font-bold font-mono text-destructive">
            ¥{monthExpense._sum.amount?.toFixed(2) || '0.00'}
          </p>
        </div>
        <div className="bg-card rounded-md border border-border p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <p className="text-sm text-muted-foreground mb-1">本月收入</p>
          <p className="text-2xl font-bold font-mono text-green-600 dark:text-green-400">
            ¥{monthIncome._sum.amount?.toFixed(2) || '0.00'}
          </p>
        </div>
        <div className="bg-card rounded-md border border-border p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <p className="text-sm text-muted-foreground mb-1">本月交易</p>
          <p className="text-2xl font-bold font-mono text-foreground">
            {monthCount} 笔
          </p>
        </div>
      </div>

      {/* 分类支出排名 */}
      {categoryBreakdown.length > 0 && (
        <div className="bg-card rounded-md border border-border p-5">
          <h2 className="font-semibold text-foreground mb-4">本月支出分类</h2>
          <div className="space-y-2">
            {categoryBreakdown.slice(0, 10).map((item) => {
              const cat = categoryMap.get(item.categoryId!)
              if (!cat) return null
              const total = monthExpense._sum.amount || 1
              const pct = ((item._sum.amount || 0) / total) * 100
              return (
                <div key={item.categoryId} className="flex items-center gap-3">
                  <span className="text-lg">{cat.icon}</span>
                  <span className="text-sm text-foreground flex-1">{cat.name}</span>
                  <span className="text-sm font-medium font-mono text-foreground">
                    ¥{item._sum.amount?.toFixed(2)}
                  </span>
                  <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(pct, 100)}%`,
                        backgroundColor: cat.color,
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 最近交易 */}
      <div className="bg-card rounded-md border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-foreground">最近交易</h2>
          <Link
            href="/transactions"
            className="text-sm text-primary hover:underline"
          >
            查看全部
          </Link>
        </div>
        {recentTransactions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            暂无交易记录，开始记账吧！
          </p>
        ) : (
          <div className="space-y-1">
            {recentTransactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center gap-3 py-2.5 border-b border-border last:border-0"
              >
                <span className="text-lg">{tx.category?.icon || <Package className="inline h-5 w-5" />}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {tx.merchant || tx.description || '未命名'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {tx.transactionTime.toLocaleDateString('zh-CN')}
                    {tx.type === 'transfer' && tx.sourceAccount && tx.toAccount
                      ? ` · ${tx.sourceAccount.name} → ${tx.toAccount.name}`
                      : tx.sourceAccount
                        ? ` · ${tx.sourceAccount.name}`
                        : ''}
                  </p>
                </div>
                <span
                  className={`text-sm font-semibold font-mono ${
                    tx.type === 'income' ? 'text-green-600 dark:text-green-400' : tx.type === 'transfer' ? 'text-primary' : 'text-destructive'
                  }`}
                >
                  {tx.type === 'income' ? '+' : tx.type === 'transfer' ? '' : '-'}¥{tx.amount.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
