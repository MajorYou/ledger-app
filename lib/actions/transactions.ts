'use server'

import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

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
