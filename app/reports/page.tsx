import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { ReportsClient } from './client-page'

async function getReportData(period: string) {
  const user = await getSession()
  if (!user) return null

  const now = new Date()
  let startDate: Date

  switch (period) {
    case 'this-month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      break
    case 'last-month':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      break
    case 'this-year':
      startDate = new Date(now.getFullYear(), 0, 1)
      break
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
  }

  const endDate = period === 'last-month'
    ? new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
    : now

  // 按分类汇总
  const byCategory = await prisma.transaction.groupBy({
    by: ['categoryId', 'type'],
    where: {
      transactionTime: { gte: startDate, lte: endDate },
      categoryId: { not: null },
    },
    _sum: { amount: true },
    _count: true,
  })

  const categories = await prisma.category.findMany({
    where: { id: { in: byCategory.map((c) => c.categoryId!).filter(Boolean) } },
    select: { id: true, name: true, icon: true, color: true, type: true },
  })
  const catMap = new Map(categories.map((c) => [c.id, c]))

  const categoryBreakdown = byCategory.map((item) => {
    const cat = catMap.get(item.categoryId!)
    return {
      name: cat?.name || '未知',
      icon: cat?.icon || '📦',
      color: cat?.color || '#6b7280',
      type: item.type,
      amount: item._sum.amount || 0,
      count: item._count,
    }
  }).sort((a, b) => b.amount - a.amount)

  // 按账本汇总
  const byLedger = await prisma.transactionLedger.groupBy({
    by: ['ledgerId'],
    _count: true,
  })

  const ledgerIds = byLedger.map((l) => l.ledgerId)
  const ledgerAmounts = await Promise.all(
    ledgerIds.map(async (lid) => {
      const agg = await prisma.transaction.aggregate({
        _sum: { amount: true },
        where: {
          transactionLedgers: { some: { ledgerId: lid } },
          transactionTime: { gte: startDate, lte: endDate },
          type: 'expense',
        },
      })
      return { ledgerId: lid, amount: agg._sum.amount || 0 }
    })
  )

  const ledgers = await prisma.ledger.findMany({
    where: { id: { in: ledgerIds } },
    select: { id: true, name: true, color: true },
  })
  const ledgerMap = new Map(ledgers.map((l) => [l.id, l]))

  const ledgerBreakdown = ledgerAmounts
    .map((item) => {
      const ledger = ledgerMap.get(item.ledgerId)
      const count = byLedger.find((l) => l.ledgerId === item.ledgerId)?._count || 0
      return {
        name: ledger?.name || '未知',
        color: ledger?.color || '#6b7280',
        amount: item.amount,
        count,
      }
    })
    .sort((a, b) => b.amount - a.amount)

  // 按月趋势 (近6个月)
  const monthTrend: Array<{ month: string; expense: number; income: number }> = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const dEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59)
    const [exp, inc] = await Promise.all([
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { type: 'expense', transactionTime: { gte: d, lte: dEnd } },
      }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { type: 'income', transactionTime: { gte: d, lte: dEnd } },
      }),
    ])
    monthTrend.push({
      month: `${d.getFullYear()}/${d.getMonth() + 1}`,
      expense: exp._sum.amount || 0,
      income: inc._sum.amount || 0,
    })
  }

  // 按账户汇总
  const byAccount = await prisma.transaction.groupBy({
    by: ['accountId'],
    where: {
      accountId: { not: null },
      transactionTime: { gte: startDate, lte: endDate },
    },
    _sum: { amount: true },
    _count: true,
  })

  const accounts = await prisma.account.findMany({
    where: { id: { in: byAccount.map((a) => a.accountId!).filter(Boolean) } },
    select: { id: true, name: true },
  })
  const accMap = new Map(accounts.map((a) => [a.id, a]))

  const accountBreakdown = byAccount.map((item) => ({
    name: accMap.get(item.accountId!)?.name || '未知',
    amount: item._sum.amount || 0,
    count: item._count,
  })).sort((a, b) => b.amount - a.amount)

  return {
    categoryBreakdown: JSON.parse(JSON.stringify(categoryBreakdown)),
    ledgerBreakdown: JSON.parse(JSON.stringify(ledgerBreakdown)),
    monthTrend: JSON.parse(JSON.stringify(monthTrend)),
    accountBreakdown: JSON.parse(JSON.stringify(accountBreakdown)),
    totalExpense: categoryBreakdown
      .filter((c) => c.type === 'expense')
      .reduce((s, c) => s + c.amount, 0),
    totalIncome: categoryBreakdown
      .filter((c) => c.type === 'income')
      .reduce((s, c) => s + c.amount, 0),
  }
}

export type ReportData = NonNullable<Awaited<ReturnType<typeof getReportData>>>

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { period } = await searchParams
  const data = await getReportData(period || 'this-month')
  if (!data) return null
  return <ReportsClient data={data} currentPeriod={period || 'this-month'} />
}
