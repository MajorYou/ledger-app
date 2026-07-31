import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { AccountCRUD } from './crud'

export default async function AccountsPage() {
  const user = await getSession()
  if (!user) return null

  const accounts = await prisma.account.findMany({
    where: { userId: user.id, isActive: true },
    orderBy: { type: 'asc' },
  })

  return (
    <div className="w-full">
      <h1 className="text-xl font-bold text-foreground mb-6">账户管理</h1>
      <AccountCRUD
        accounts={JSON.parse(JSON.stringify(accounts))}
      />
    </div>
  )
}
