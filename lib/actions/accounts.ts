'use server'

import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function createAccount(_prevState: unknown, formData: FormData): Promise<{ success: boolean; error?: string }> {
  const user = await getSession()
  if (!user) return { success: false, error: '未登录' }

  const name = formData.get('name') as string
  const type = (formData.get('type') as string) || 'savings'
  const institution = (formData.get('institution') as string) || null
  const last4Digits = (formData.get('last4Digits') as string) || null
  const balance = parseFloat((formData.get('balance') as string) || '0')

  if (!name) return { success: false, error: '账户名称不能为空' }

  try {
    await prisma.account.create({
      data: {
        userId: user.id,
        name,
        type,
        institution: institution || null,
        last4Digits: last4Digits || null,
        balance: isNaN(balance) ? 0 : balance,
      },
    })

    revalidatePath('/accounts')
    return { success: true }
  } catch (error: any) {
    // 唯一约束冲突
    if (error?.code === 'P2002') {
      return { success: false, error: '该机构+卡号的账户已存在' }
    }
    return { success: false, error: '创建账户失败' }
  }
}

export async function updateAccount(id: string, _prevState: unknown, formData: FormData): Promise<{ success: boolean; error?: string }> {
  const user = await getSession()
  if (!user) return { success: false, error: '未登录' }

  const name = formData.get('name') as string
  const type = (formData.get('type') as string) || 'savings'
  const institution = (formData.get('institution') as string) || null
  const last4Digits = (formData.get('last4Digits') as string) || null
  const balance = parseFloat((formData.get('balance') as string) || '0')

  if (!name) return { success: false, error: '账户名称不能为空' }

  try {
    await prisma.account.update({
      where: { id, userId: user.id },
      data: {
        name,
        type,
        institution: institution || null,
        last4Digits: last4Digits || null,
        balance: isNaN(balance) ? 0 : balance,
      },
    })

    revalidatePath('/accounts')
    return { success: true }
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return { success: false, error: '该机构+卡号的账户已存在' }
    }
    return { success: false, error: '更新账户失败' }
  }
}

export async function deleteAccount(id: string): Promise<{ success: boolean }> {
  const user = await getSession()
  if (!user) return { success: false }

  await prisma.account.update({
    where: { id, userId: user.id },
    data: { isActive: false },
  })

  revalidatePath('/accounts')
  return { success: true }
}

export async function getAccounts(userId: string) {
  return prisma.account.findMany({
    where: { userId, isActive: true },
    orderBy: { type: 'asc' },
  })
}
