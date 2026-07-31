import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { CategoryCRUD } from './crud'

export default async function CategoriesPage() {
  const user = await getSession()
  if (!user) return null

  const categories = await prisma.category.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      _count: { select: { transactions: true } },
    },
  })

  return (
    <div className="w-full">
      <h1 className="text-xl font-bold text-foreground mb-6">分类管理</h1>
      <CategoryCRUD
        categories={JSON.parse(JSON.stringify(categories))}
        parentOptions={JSON.parse(JSON.stringify(
          categories.filter((c) => !c.parentId)
        ))}
      />
    </div>
  )
}
