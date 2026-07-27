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
) {
  const user = await getSession()
  if (!user) throw new Error('Unauthorized')

  await prisma.transaction.update({
    where: { id: transactionId },
    data: { categoryId, isConfirmed: true },
  })

  revalidatePath('/')
  revalidatePath('/transactions')
  return { success: true }
}
