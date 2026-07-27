import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { LedgerCRUD } from './crud'

export default async function LedgersPage() {
  const user = await getSession()
  if (!user) return null

  const ledgers = await prisma.ledger.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      _count: { select: { transactionLedgers: true } },
    },
  })

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-zinc-900 mb-6">账本管理</h1>
      <LedgerCRUD
        ledgers={JSON.parse(JSON.stringify(ledgers))}
        parentOptions={JSON.parse(JSON.stringify(
          ledgers.filter((l) => !l.parentId)
        ))}
      />
    </div>
  )
}
