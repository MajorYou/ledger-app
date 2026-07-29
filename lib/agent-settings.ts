import { getSetting } from '@/lib/actions/settings'
import { safeParseDate } from '@/lib/date-utils'

export interface AgentSettings {
  refundMode: 'add_income' | 'match_deduct' | 'always_ask'
  classifyMode: 'keyword' | 'llm' | 'hybrid'
  customRules: string
}

export async function loadAgentSettings(): Promise<AgentSettings> {
  const [refundMode, classifyMode, customRules] = await Promise.all([
    getSetting('AGENT_REFUND_MODE'),
    getSetting('AGENT_CLASSIFY_MODE'),
    getSetting('AGENT_CUSTOM_RULES'),
  ])

  return {
    refundMode: (refundMode as AgentSettings['refundMode']) || 'always_ask',
    classifyMode: (classifyMode as AgentSettings['classifyMode']) || 'keyword',
    customRules: customRules || '',
  }
}

/**
 * 退款匹配：在已有交易中查找可能对应的支出记录
 */
export interface MatchedExpense {
  id: string
  merchant: string
  amount: number
  transactionTime: string
  categoryName: string | null
}

export async function findMatchingExpenses(
  merchant: string,
  amount: number,
  date: string,
): Promise<MatchedExpense[]> {
  // 动态导入避免循环依赖
  const { prisma } = await import('@/lib/db')

  const parsedDate = safeParseDate(date)
  const startDate = new Date(parsedDate)
  startDate.setDate(startDate.getDate() - 30) // 往前30天

  // 构造当天结束时间（23:59:59）作为查询上界
  const endDate = new Date(parsedDate)
  endDate.setHours(23, 59, 59, 999)

  // 找同商户、金额相近(±30%)的支出记录
  const transactions = await prisma.transaction.findMany({
    where: {
      type: 'expense',
      transactionTime: { gte: startDate, lte: endDate },
      // 相同金额或金额相近
      amount: {
        gte: amount * 0.7,
        lte: amount * 1.3,
      },
    },
    include: { category: { select: { name: true } } },
    orderBy: { transactionTime: 'desc' },
    take: 20,
  })

  // 再过滤：商户名相似度匹配
  return transactions
    .filter((tx) => merchantSimilarity(tx.merchant, merchant) > 0.3)
    .map((tx) => ({
      id: tx.id,
      merchant: tx.merchant,
      amount: tx.amount,
      transactionTime: tx.transactionTime.toISOString().slice(0, 10),
      categoryName: tx.category?.name || null,
    }))
}

// 简单相似度：两个字符串共有的连续2字符片段数量
function merchantSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase()
  const bLower = b.toLowerCase()
  if (aLower === bLower) return 1
  if (aLower.includes(bLower) || bLower.includes(aLower)) return 0.8

  // 公共子串
  let common = 0
  const maxLen = Math.max(aLower.length, bLower.length)
  for (let i = 0; i < aLower.length - 1; i++) {
    const frag = aLower.slice(i, i + 2)
    if (bLower.includes(frag)) common++
  }
  return common / (maxLen - 1)
}
