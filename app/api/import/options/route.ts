import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getCategoriesWithRecentFirst } from '@/lib/category-sort'

export async function GET(_request: NextRequest) {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [ledgers, rawCategories, accounts] = await Promise.all([
    prisma.ledger.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.category.findMany({
      select: { id: true, name: true, icon: true, type: true, parent: { select: { name: true } } },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    }),
    prisma.account.findMany({
      where: { userId: user.id, isActive: true },
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
    }),
  ])

  // 按常用分类排序
  const { sorted: sortedCategories, recentCount } = await getCategoriesWithRecentFirst(rawCategories)

  return NextResponse.json({
    ledgers,
    categories: sortedCategories.map(c => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      type: c.type,
      parentName: c.parent?.name || undefined,
    })),
    accounts,
    recentCount,
  })
}
