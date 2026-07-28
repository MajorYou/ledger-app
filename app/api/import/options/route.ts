import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(_request: NextRequest) {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [ledgers, categories] = await Promise.all([
    prisma.ledger.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.category.findMany({
      select: { id: true, name: true, type: true, parent: { select: { name: true } } },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    }),
  ])

  return NextResponse.json({
    ledgers,
    categories: categories.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      parentName: c.parent?.name || undefined,
    })),
  })
}
