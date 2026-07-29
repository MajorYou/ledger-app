import { prisma } from './db'

interface AccountInfo {
  last4?: string
  institution?: string
  accountType?: string  // savings / credit / prepaid / investment
  name: string          // 完整的显示名称
}

// 从支付方式字符串提取账户信息
export function extractAccountInfo(paymentMethod: string): AccountInfo | null {
  if (!paymentMethod || !paymentMethod.trim()) return null

  const pm = paymentMethod.trim()

  // 内置平台账户模式
  const platformMap: Record<string, AccountInfo> = {
    '余额宝': { institution: '支付宝', accountType: 'investment', name: '余额宝' },
    '零钱通': { institution: '微信', accountType: 'prepaid', name: '零钱通' },
    '零钱': { institution: '微信', accountType: 'prepaid', name: '微信零钱' },
  }

  if (platformMap[pm]) {
    return platformMap[pm]
  }

  // 银行卡模式：XX银行XX卡(XXXX)
  const bankCardRegex = /^(.+?)(储蓄卡|信用卡|借记卡|贷记卡)\((\d{4})\)$/
  const match = pm.match(bankCardRegex)
  if (match) {
    const institution = match[1].trim()
    const cardType = match[2]
    const last4 = match[3]
    let accountType: string
    if (cardType === '信用卡' || cardType === '贷记卡') {
      accountType = 'credit'
    } else {
      accountType = 'savings'
    }
    return { institution, accountType, last4, name: pm }
  }

  // 无法识别的模式，返回原始名称
  return { name: pm }
}

// 按 institution+last4 查找或提示创建账户
export async function findOrCreateAccount(userId: string, paymentMethod: string): Promise<string | null> {
  const info = extractAccountInfo(paymentMethod)
  if (!info) return null

  try {
    return await prisma.$transaction(async (tx) => {
      // 先按 institution + last4Digits 查找
      if (info.last4 && info.institution) {
        const existing = await tx.account.findFirst({
          where: { userId, institution: info.institution, last4Digits: info.last4 }
        })
        if (existing) return existing.id
      }

      // 再按 name 精确匹配
      const byName = await tx.account.findFirst({
        where: { userId, name: info.name }
      })
      if (byName) return byName.id

      // 未找到，在事务内创建
      const newAccount = await tx.account.create({
        data: {
          userId,
          name: info.name,
          type: info.accountType || 'savings',
          institution: info.institution || null,
          last4Digits: info.last4 || null,
        }
      })
      return newAccount.id
    })
  } catch (error) {
    // P2002: 唯一约束冲突（并发场景）
    if ((error as any)?.code === 'P2002') {
      const existing = await prisma.account.findFirst({
        where: { userId, name: info.name }
      })
      return existing?.id || null
    }
    throw error
  }
}
