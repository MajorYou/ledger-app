import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { ClientTransactionsPage } from './client-page'

async function getData() {
  const user = await getSession()
  if (!user) return null

  const [transactions, categories, accounts, ledgers] = await Promise.all([
    prisma.transaction.findMany({
      orderBy: { transactionTime: 'desc' },
      take: 200,
      include: {
        category: { select: { id: true, name: true, icon: true, color: true } },
        account: { select: { id: true, name: true } },
        transactionLedgers: {
          include: { ledger: { select: { id: true, name: true, color: true } } },
        },
      },
    }),
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
    prisma.account.findMany({ where: { userId: user.id } }),
    prisma.ledger.findMany({ orderBy: { name: 'asc' } }),
  ])

  return {
    transactions: JSON.parse(JSON.stringify(transactions)),
    categories: JSON.parse(JSON.stringify(categories)),
    accounts: JSON.parse(JSON.stringify(accounts)),
    ledgers: JSON.parse(JSON.stringify(ledgers)),
  }
}

export type PageData = NonNullable<Awaited<ReturnType<typeof getData>>>

export default async function TransactionsPage() {
  const data = await getData()
  if (!data) return null
  return <ClientTransactionsPage data={data} />
}
