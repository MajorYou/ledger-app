import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { ClientTransactionsPage } from './client-page'
import { getTransactionsPaginated, type TransactionFilters, type SortOption } from '@/lib/actions/transactions'
import { getCategoriesWithRecentFirst } from '@/lib/category-sort'

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const user = await getSession()
  if (!user) return null

  const sp = await searchParams

  const filters: TransactionFilters = {
    categoryId: typeof sp.category === 'string' ? sp.category : undefined,
    ledgerId: typeof sp.ledger === 'string' ? sp.ledger : undefined,
    accountId: typeof sp.sourceAccount === 'string'
      ? sp.sourceAccount
      : typeof sp.account === 'string'
        ? sp.account
        : undefined,
    dateFrom: typeof sp.dateFrom === 'string' ? sp.dateFrom : undefined,
    dateTo: typeof sp.dateTo === 'string' ? sp.dateTo : undefined,
    amountMin: typeof sp.amountMin === 'string' ? sp.amountMin : undefined,
    amountMax: typeof sp.amountMax === 'string' ? sp.amountMax : undefined,
    type: typeof sp.type === 'string' ? sp.type : undefined,
    keyword: typeof sp.keyword === 'string' ? sp.keyword : undefined,
  }

  const sort = (typeof sp.sort === 'string' ? sp.sort : 'time_desc') as SortOption

  const [initial, rawCategories, accounts, ledgers] = await Promise.all([
    getTransactionsPaginated(filters, sort),
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
    prisma.account.findMany({ where: { userId: user.id } }),
    prisma.ledger.findMany({ orderBy: { name: 'asc' } }),
  ])

  // 按常用分类排序（用于交易表单的分类下拉）
  const { sorted: categories } = await getCategoriesWithRecentFirst(rawCategories)

  return (
    <ClientTransactionsPage
      initialData={initial}
      categories={JSON.parse(JSON.stringify(categories))}
      accounts={JSON.parse(JSON.stringify(accounts))}
      ledgers={JSON.parse(JSON.stringify(ledgers))}
      initialFilters={filters}
      initialSort={sort}
    />
  )
}
