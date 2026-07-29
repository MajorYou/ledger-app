import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { ReportsClient } from './client-page'

function resolveDateRange(period: string, startDateStr?: string, endDateStr?: string) {
  const now = new Date()
  let startDate: Date
  let endDate: Date

  if (period === 'custom' && startDateStr && endDateStr) {
    startDate = new Date(startDateStr + 'T00:00:00')
    endDate = new Date(endDateStr + 'T23:59:59')
  } else {
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
    endDate = period === 'last-month'
      ? new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
      : now
  }

  return { startDate, endDate }
}

async function getReportData(period: string, startDateStr?: string, endDateStr?: string) {
  const user = await getSession()
  if (!user) return null

  const { startDate, endDate } = resolveDateRange(period, startDateStr, endDateStr)
  const now = new Date()

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

  // 交叉维度：按 (ledgerId, categoryId) 二维分组
  const crossBreakdown = await getCrossBreakdown(startDate, endDate)

  return {
    categoryBreakdown: JSON.parse(JSON.stringify(categoryBreakdown)),
    ledgerBreakdown: JSON.parse(JSON.stringify(ledgerBreakdown)),
    monthTrend: JSON.parse(JSON.stringify(monthTrend)),
    accountBreakdown: JSON.parse(JSON.stringify(accountBreakdown)),
    crossBreakdown: JSON.parse(JSON.stringify(crossBreakdown)),
    totalExpense: categoryBreakdown
      .filter((c) => c.type === 'expense')
      .reduce((s, c) => s + c.amount, 0),
    totalIncome: categoryBreakdown
      .filter((c) => c.type === 'income')
      .reduce((s, c) => s + c.amount, 0),
  }
}

async function getCrossBreakdown(startDate: Date, endDate: Date) {
  // 获取时间范围内的所有 TransactionLedger 关联，带上交易的 categoryId、type、amount
  const txLedgers = await prisma.transactionLedger.findMany({
    where: {
      transaction: {
        transactionTime: { gte: startDate, lte: endDate },
        categoryId: { not: null },
      },
    },
    select: {
      ledgerId: true,
      transaction: {
        select: {
          categoryId: true,
          type: true,
          amount: true,
        },
      },
    },
  })

  // 收集涉及的 ledgerId 和 categoryId
  const ledgerIdSet = new Set<string>()
  const categoryIdSet = new Set<string>()
  // 按 (ledgerId, categoryId) 分组，分别累计 expense 和 income
  const crossMap = new Map<string, { expense: number; income: number }>()

  for (const tl of txLedgers) {
    const { ledgerId } = tl
    const { categoryId, type, amount } = tl.transaction
    if (!categoryId) continue
    ledgerIdSet.add(ledgerId)
    categoryIdSet.add(categoryId)
    const key = `${ledgerId}::${categoryId}`
    const entry = crossMap.get(key) || { expense: 0, income: 0 }
    if (type === 'expense') entry.expense += amount
    else if (type === 'income') entry.income += amount
    crossMap.set(key, entry)
  }

  // 批量查询账本和分类信息
  const [ledgers, categories] = await Promise.all([
    prisma.ledger.findMany({
      where: { id: { in: [...ledgerIdSet] } },
      select: { id: true, name: true, color: true },
    }),
    prisma.category.findMany({
      where: { id: { in: [...categoryIdSet] } },
      select: { id: true, name: true, icon: true, color: true },
    }),
  ])

  const ledgerInfoMap = new Map(ledgers.map((l) => [l.id, l]))
  const categoryInfoMap = new Map(categories.map((c) => [c.id, c]))

  // 构建矩阵数据
  const matrix: Array<{
    ledgerId: string
    ledgerName: string
    ledgerColor: string
    categoryId: string
    categoryName: string
    categoryIcon: string
    categoryColor: string
    expense: number
    income: number
  }> = []

  for (const [key, val] of crossMap.entries()) {
    const [ledgerId, categoryId] = key.split('::')
    const ledger = ledgerInfoMap.get(ledgerId)
    const category = categoryInfoMap.get(categoryId)
    matrix.push({
      ledgerId,
      ledgerName: ledger?.name || '未知',
      ledgerColor: ledger?.color || '#6b7280',
      categoryId,
      categoryName: category?.name || '未知',
      categoryIcon: category?.icon || '📦',
      categoryColor: category?.color || '#6b7280',
      expense: val.expense,
      income: val.income,
    })
  }

  return matrix
}

export type ReportData = NonNullable<Awaited<ReturnType<typeof getReportData>>>

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; startDate?: string; endDate?: string }>
}) {
  const { period, startDate, endDate } = await searchParams
  const currentPeriod = period || 'this-month'
  const data = await getReportData(currentPeriod, startDate, endDate)
  if (!data) return null
  return (
    <ReportsClient
      data={data}
      currentPeriod={currentPeriod}
      startDate={startDate}
      endDate={endDate}
    />
  )
}
