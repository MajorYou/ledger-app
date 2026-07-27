'use server'

import { prisma } from '@/lib/db'
import { hashPassword, verifyPassword, createSession, clearSession } from '@/lib/auth'
import { redirect } from 'next/navigation'

export async function login(_prevState: unknown, formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: '请输入邮箱和密码' }
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    return { error: '用户不存在' }
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    return { error: '密码错误' }
  }

  await createSession(user.id)
  redirect('/')
}

export async function register(_prevState: unknown, formData: FormData) {
  const name = formData.get('name') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const inviteCode = formData.get('inviteCode') as string

  if (!name || !email || !password) {
    return { error: '请填写完整信息' }
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return { error: '该邮箱已注册' }
  }

  // 检查是否已有家庭主用户
  const hostExists = await prisma.user.findFirst({
    where: { isFamilyHost: true },
  })

  const passwordHash = await hashPassword(password)

  if (!hostExists) {
    // 第一个用户是家庭主用户
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        isFamilyHost: true,
      },
    })

    // 为主用户创建默认数据
    await createDefaultData(user.id)

    await createSession(user.id)
    redirect('/')
  }

  // 非首个用户需要邀请码
  if (!inviteCode) {
    return { error: '请输入家庭邀请码' }
  }

  const invite = await prisma.familyInvite.findUnique({
    where: { code: inviteCode },
  })

  if (!invite || !invite.isActive) {
    return { error: '邀请码无效' }
  }

  if (invite.usedById) {
    return { error: '邀请码已被使用' }
  }

  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return { error: '邀请码已过期' }
  }

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
    },
  })

  await prisma.familyInvite.update({
    where: { id: invite.id },
    data: { usedById: user.id, isActive: false },
  })

  // 为新成员创建默认账户
  await createDefaultData(user.id)

  await createSession(user.id)
  redirect('/')
}

export async function logout() {
  await clearSession()
  redirect('/login')
}

export async function generateInviteCode() {
  const code = Math.random().toString(36).substring(2, 10).toUpperCase()
  return code
}

async function createDefaultData(userId: string) {
  // 为新用户创建默认账户
  await prisma.account.createMany({
    data: [
      { userId, name: '现金', type: 'general', currency: 'CNY' },
      { userId, name: '支付宝', type: 'ewallet', currency: 'CNY' },
      { userId, name: '微信支付', type: 'ewallet', currency: 'CNY' },
    ],
  })
}
