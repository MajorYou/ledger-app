'use server'

import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import type { Prisma } from '@prisma/client'

export interface TransactionFilters {
  categoryId?: string
  ledgerId?: string
  accountId?: string
  dateFrom?: string // YYYY-MM-DD
  dateTo?: string   // YYYY-MM-DD
  amountMin?: string
  amountMax?: string
  type?: string     // expense | income | ''
  keyword?: string
}

export type SortOption = 'time_desc' | 'time_asc' | 'amount_desc' | 'amount_asc'

const PAGE_SIZE = 20

export async function getTransactionsPaginated(
  filters: TransactionFilters,
  sort: SortOption = 'time_desc',
  cursorId?: string
): Promise<{ transactions: any[]; hasMore: boolean }> {
  const user = await getSession()
  if (!user) throw new Error('Unauthorized')

  const where = buildWhere(filters)
  const orderBy = buildOrderBy(sort)

  const take = PAGE_SIZE + 1 // fetch one extra to detect hasMore

  const args: Prisma.TransactionFindManyArgs = {
    where,
    orderBy,
    take,
    include: {
      category: { select: { id: true, name: true, icon: true, color: true } },
      account: { select: { id: true, name: true } },
      transactionLedgers: {
        include: { ledger: { select: { id: true, name: true, color: true } } },
      },
    },
  }

  if (cursorId) {
    args.cursor = { id: cursorId }
    args.skip = 1 // skip the cursor item itself
  }

  const transactions = await prisma.transaction.findMany(args)
  const hasMore = transactions.length > PAGE_SIZE
  if (hasMore) transactions.pop()

  return {
    transactions: JSON.parse(JSON.stringify(transactions)),
    hasMore,
  }
}

function buildWhere(filters: TransactionFilters): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = {}

  if (filters.categoryId) {
    where.categoryId = filters.categoryId
  }
  if (filters.ledgerId) {
    where.transactionLedgers = { some: { ledgerId: filters.ledgerId } }
  }
  if (filters.accountId) {
    where.accountId = filters.accountId
  }
  if (filters.dateFrom || filters.dateTo) {
    const time: Prisma.DateTimeFilter = {}
    if (filters.dateFrom) time.gte = new Date(filters.dateFrom + 'T00:00:00')
    if (filters.dateTo) time.lte = new Date(filters.dateTo + 'T23:59:59')
    where.transactionTime = time
  }
  if (filters.amountMin || filters.amountMax) {
    const amount: Prisma.FloatFilter = {}
    if (filters.amountMin) amount.gte = parseFloat(filters.amountMin)
    if (filters.amountMax) amount.lte = parseFloat(filters.amountMax)
    where.amount = amount
  }
  if (filters.type && filters.type !== 'all') {
    where.type = filters.type
  }
  if (filters.keyword) {
    const kw = filters.keyword
    where.OR = [
      { merchant: { contains: kw } },
      { description: { contains: kw } },
    ]
  }

  return where
}

function buildOrderBy(sort: SortOption): Prisma.TransactionOrderByWithRelationInput {
  switch (sort) {
    case 'time_asc':
      return { transactionTime: 'asc' }
    case 'amount_desc':
      return { amount: 'desc' }
    case 'amount_asc':
      return { amount: 'asc' }
    case 'time_desc':
    default:
      return { transactionTime: 'desc' }
  }
}

export async function createTransaction(_prevState: unknown, formData: FormData) {
  const user = await getSession()
  if (!user) throw new Error('Unauthorized')

  const type = formData.get('type') as string
  const amount = parseFloat(formData.get('amount') as string)
  const merchant = (formData.get('merchant') as string) || ''
  const description = (formData.get('description') as string) || ''
  const transactionTime = formData.get('transactionTime')
    ? new Date(formData.get('transactionTime') as string)
    : new Date()
  const categoryId = (formData.get('categoryId') as string) || null
  const accountId = (formData.get('accountId') as string) || null
  const ledgerIds = formData.getAll('ledgerIds') as string[]

  if (!amount || amount <= 0) {
    return { error: '请输入有效金额' }
  }

  const transaction = await prisma.transaction.create({
    data: {
      type,
      amount,
      merchant,
      description,
      transactionTime,
      categoryId,
      accountId,
      createdById: user.id,
      transactionLedgers: {
        create: ledgerIds.map((ledgerId) => ({ ledgerId })),
      },
    },
  })

  // 创建时已选分类 → 触发自动学习
  if (merchant && categoryId) {
    await autoLearnCategory(merchant, categoryId)
  }

  revalidatePath('/')
  revalidatePath('/transactions')
  return { success: true, id: transaction.id }
}

export async function updateTransaction(id: string, _prevState: unknown, formData: FormData) {
  const user = await getSession()
  if (!user) throw new Error('Unauthorized')

  const type = formData.get('type') as string
  const amount = parseFloat(formData.get('amount') as string)
  const merchant = (formData.get('merchant') as string) || ''
  const description = (formData.get('description') as string) || ''
  const transactionTime = formData.get('transactionTime')
    ? new Date(formData.get('transactionTime') as string)
    : undefined
  const categoryId = (formData.get('categoryId') as string) || null
  const accountId = (formData.get('accountId') as string) || null
  const ledgerIds = formData.getAll('ledgerIds') as string[]

  if (!amount || amount <= 0) {
    return { error: '请输入有效金额' }
  }

  // 删除旧的账本关联，创建新的
  await prisma.transactionLedger.deleteMany({ where: { transactionId: id } })

  await prisma.transaction.update({
    where: { id },
    data: {
      type,
      amount,
      merchant,
      description,
      ...(transactionTime && { transactionTime }),
      categoryId,
      accountId,
      transactionLedgers: {
        create: ledgerIds.map((ledgerId) => ({ ledgerId })),
      },
    },
  })

  revalidatePath('/')
  revalidatePath('/transactions')
  return { success: true }
}

export async function deleteTransaction(id: string) {
  const user = await getSession()
  if (!user) throw new Error('Unauthorized')

  await prisma.transaction.delete({ where: { id } })

  revalidatePath('/')
  revalidatePath('/transactions')
  return { success: true }
}

export async function confirmCategory(
  transactionId: string,
  categoryId: string
): Promise<{ success: boolean; learned?: boolean }> {
  const user = await getSession()
  if (!user) throw new Error('Unauthorized')

  const tx = await prisma.transaction.update({
    where: { id: transactionId },
    data: { categoryId, isConfirmed: true },
  })

  // 自动学习
  let learned = false
  if (tx.merchant) {
    learned = await autoLearnCategory(tx.merchant, categoryId)
  }

  revalidatePath('/')
  revalidatePath('/transactions')
  return { success: true, learned }
}

// 自动学习：统计商户被确认到同一分类的次数，≥3 写入缓存。返回是否触发了学习
async function autoLearnCategory(merchant: string, categoryId: string): Promise<boolean> {
  const count = await prisma.transaction.count({
    where: {
      merchant,
      categoryId,
      isConfirmed: true,
    },
  })

  if (count >= 3) {
    await prisma.classificationCache.upsert({
      where: { merchantPattern: merchant },
      update: {
        suggestedCategoryId: categoryId,
        confidence: Math.min(count / 5, 1),
        hitCount: count,
      },
      create: {
        merchantPattern: merchant,
        suggestedCategoryId: categoryId,
        confidence: 0.8,
        hitCount: count,
      },
    })
    return true
  }
  return false
}
