// 去重引擎：三维度匹配评分

/** 格式化 Date 为本地时间字符串 YYYY-MM-DDTHH:mm */
function localTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export interface DedupCandidate {
  id: string
  merchant: string
  amount: number
  type: string
  transactionTime: string
  categoryName: string | null
}

export interface DedupPair {
  a: DedupCandidate
  b: DedupCandidate
  score: number
  reasons: string[]
}

/**
 * 两个字符串的相似度 (0~1)
 */
export function textSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase().trim()
  const bLower = b.toLowerCase().trim()
  if (!aLower || !bLower) return 0
  if (aLower === bLower) return 1
  if (aLower.includes(bLower) || bLower.includes(aLower)) return 0.8

  let common = 0
  const maxLen = Math.max(aLower.length, bLower.length)
  for (let i = 0; i < aLower.length - 1; i++) {
    if (bLower.includes(aLower.slice(i, i + 2))) common++
  }
  return common / (maxLen - 1)
}

/**
 * 计算两笔交易是否为重复的评分 (0~1)
 * ≥ 0.6 视为疑似重复
 */
export function dedupScore(
  a: { merchant: string; amount: number; transactionTime: string },
  b: { merchant: string; amount: number; transactionTime: string },
): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let score = 0

  // 时间差 ≤ 5min → +0.4, ≤ 30min → +0.2
  const timeDiff = Math.abs(
    new Date(a.transactionTime).getTime() - new Date(b.transactionTime).getTime()
  ) / 60000
  if (timeDiff <= 5) {
    score += 0.4
    reasons.push(`时间接近 (${Math.round(timeDiff)}分钟)`)
  } else if (timeDiff <= 30) {
    score += 0.2
    reasons.push(`时间接近 (${Math.round(timeDiff)}分钟)`)
  }

  // 金额差 ≤ 5% → +0.35, ≤ 10% → +0.15
  const maxAmount = Math.max(a.amount, b.amount)
  const amountDiff = maxAmount > 0 ? Math.abs(a.amount - b.amount) / maxAmount : 0
  if (amountDiff <= 0.05) {
    score += 0.35
    reasons.push(`金额接近 (±${(amountDiff * 100).toFixed(1)}%)`)
  } else if (amountDiff <= 0.1) {
    score += 0.15
    reasons.push(`金额相近 (±${(amountDiff * 100).toFixed(1)}%)`)
  }

  // 商户相似度 → +0.25
  const merchantSim = textSimilarity(a.merchant, b.merchant)
  if (merchantSim > 0.5) {
    score += merchantSim * 0.25
    if (merchantSim > 0.8) reasons.push('商户名高度相似')
    else if (merchantSim > 0.5) reasons.push('商户名相似')
  }

  return { score: Math.min(score, 1), reasons }
}

/**
 * 在已有交易中查找疑似重复
 */
export async function findDuplicates(
  merchant: string,
  amount: number,
  transactionTime: string,
): Promise<DedupPair[]> {
  const { prisma } = await import('@/lib/db')

  const time = new Date(transactionTime)
  const startTime = new Date(time.getTime() - 60 * 60000) // 前60分钟
  const endTime = new Date(time.getTime() + 60 * 60000)   // 后60分钟

  // 先按时间和金额缩小范围
  const candidates = await prisma.transaction.findMany({
    where: {
      transactionTime: { gte: startTime, lte: endTime },
      amount: {
        gte: amount * 0.85,
        lte: amount * 1.15,
      },
    },
    include: { category: { select: { name: true } } },
    orderBy: { transactionTime: 'desc' },
    take: 50,
  })

  const input = { merchant, amount, transactionTime }
  const pairs: DedupPair[] = []

  for (const c of candidates) {
    const { score, reasons } = dedupScore(input, {
      merchant: c.merchant,
      amount: c.amount,
      transactionTime: c.transactionTime.toISOString(),
    })
    if (score >= 0.6) {
      pairs.push({
        a: {
          id: c.id,
          merchant: c.merchant,
          amount: c.amount,
          type: c.type,
          transactionTime: localTime(c.transactionTime),
          categoryName: c.category?.name || null,
        },
        b: {
          id: '',
          merchant,
          amount,
          type: '',
          transactionTime,
          categoryName: null,
        },
        score,
        reasons,
      })
    }
  }

  return pairs.sort((a, b) => b.score - a.score)
}

/**
 * 全局扫描：找所有疑似重复对
 */
export async function scanAllDuplicates(): Promise<DedupPair[]> {
  const { prisma } = await import('@/lib/db')

  // 按 30 分钟窗口分组所有交易
  const transactions = await prisma.transaction.findMany({
    include: { category: { select: { name: true } } },
    orderBy: { transactionTime: 'asc' },
  })

  const pairs: DedupPair[] = []

  for (let i = 0; i < transactions.length; i++) {
    const a = transactions[i]
    for (let j = i + 1; j < transactions.length; j++) {
      const b = transactions[j]
      // 时间差 > 60 分钟，停止内循环
      const timeDiff = Math.abs(
        a.transactionTime.getTime() - b.transactionTime.getTime()
      ) / 60000
      if (timeDiff > 60) break

      const { score, reasons } = dedupScore(
        { merchant: a.merchant, amount: a.amount, transactionTime: a.transactionTime.toISOString() },
        { merchant: b.merchant, amount: b.amount, transactionTime: b.transactionTime.toISOString() },
      )
      if (score >= 0.6) {
        pairs.push({
          a: {
            id: a.id,
            merchant: a.merchant,
            amount: a.amount,
            type: a.type,
            transactionTime: localTime(a.transactionTime),
            categoryName: a.category?.name || null,
          },
          b: {
            id: b.id,
            merchant: b.merchant,
            amount: b.amount,
            type: b.type,
            transactionTime: localTime(b.transactionTime),
            categoryName: b.category?.name || null,
          },
          score,
          reasons,
        })
      }
    }
  }

  return pairs.sort((a, b) => b.score - a.score)
}

/**
 * 处理去重：保留 keepId，删除 deleteId
 */
export async function resolveDedup(keepId: string, deleteId: string): Promise<void> {
  const { prisma } = await import('@/lib/db')
  await prisma.transaction.delete({ where: { id: deleteId } })
}
