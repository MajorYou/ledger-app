import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { BatchAdjustClient } from './client-page'

export default async function BatchAdjustPage() {
  const user = await getSession()
  if (!user) return null

  const categories = await prisma.category.findMany({
    select: { id: true, name: true, icon: true, type: true },
    orderBy: { name: 'asc' },
  })

  const ledgers = await prisma.ledger.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-foreground mb-2">批量调整</h1>
      <p className="text-sm text-muted-foreground mb-6">
        用自然语言描述批量操作或新增交易，AI 解析后预览确认再执行
      </p>
      <BatchAdjustClient
        categories={JSON.parse(JSON.stringify(categories))}
        ledgers={JSON.parse(JSON.stringify(ledgers))}
      />
    </div>
  )
}
