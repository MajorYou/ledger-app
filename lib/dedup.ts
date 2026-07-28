// 去重引擎：三维度匹配评分
import { getSetting, saveSetting } from '@/lib/actions/settings'

// ---- 归并建议相关类型 ----

export interface MergeTransaction {
  id: string
  merchant: string
  amount: number
  type: string
  description: string
  transactionTime: string
  categoryId: string | null
  categoryName: string | null
}

export interface MergeGroup {
  id: string
  merchant: string
  categoryId: string
  categoryName: string
  categoryIcon: string
  transactions: MergeTransaction[]
  stats: {
    count: number
    totalAmount: number
    avgAmount: number
    dateRange: { from: string; to: string }
    isPeriodic: boolean
  }
}

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

export interface ReasonDetail {
  dimension: 'merchant' | 'amount' | 'time'
  label: string
  description: string
}

export interface DedupPair {
  a: DedupCandidate
  b: DedupCandidate
  score: number
  reasons: string[]
  reasonDetails: ReasonDetail[]
  isRefund: boolean
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
): { score: number; reasons: string[]; reasonDetails: ReasonDetail[] } {
  const reasons: string[] = []
  const reasonDetails: ReasonDetail[] = []
  let score = 0

  // 时间差 ≤ 5min → +0.4, ≤ 30min → +0.2
  const timeDiff = Math.abs(
    new Date(a.transactionTime).getTime() - new Date(b.transactionTime).getTime()
  ) / 60000
  if (timeDiff <= 5) {
    score += 0.4
    reasons.push(`时间接近 (${Math.round(timeDiff)}分钟)`)
    reasonDetails.push({ dimension: 'time', label: '时间接近', description: `两笔交易时间仅相差 ${Math.round(timeDiff)} 分钟` })
  } else if (timeDiff <= 30) {
    score += 0.2
    reasons.push(`时间接近 (${Math.round(timeDiff)}分钟)`)
    reasonDetails.push({ dimension: 'time', label: '时间接近', description: `两笔交易时间相差 ${Math.round(timeDiff)} 分钟` })
  }

  // 金额差 ≤ 5% → +0.35, ≤ 10% → +0.15
  const maxAmount = Math.max(Math.abs(a.amount), Math.abs(b.amount))
  const amountDiff = maxAmount > 0 ? Math.abs(Math.abs(a.amount) - Math.abs(b.amount)) / maxAmount : 0
  if (amountDiff <= 0.05) {
    score += 0.35
    reasons.push(`金额接近 (¥${a.amount.toFixed(2)} vs ¥${b.amount.toFixed(2)})`)
    reasonDetails.push({ dimension: 'amount', label: '金额接近', description: `金额分别为 ¥${a.amount.toFixed(2)} 和 ¥${b.amount.toFixed(2)}，差异仅 ${(amountDiff * 100).toFixed(1)}%` })
  } else if (amountDiff <= 0.1) {
    score += 0.15
    reasons.push(`金额相近 (¥${a.amount.toFixed(2)} vs ¥${b.amount.toFixed(2)})`)
    reasonDetails.push({ dimension: 'amount', label: '金额相近', description: `金额分别为 ¥${a.amount.toFixed(2)} 和 ¥${b.amount.toFixed(2)}，差异 ${(amountDiff * 100).toFixed(1)}%` })
  }

  // 商户相似度 → +0.25
  const merchantSim = textSimilarity(a.merchant, b.merchant)
  if (merchantSim > 0.5) {
    score += merchantSim * 0.25
    if (merchantSim > 0.8) {
      reasons.push(`同一商户('${a.merchant}')`)
      reasonDetails.push({ dimension: 'merchant', label: '同一商户', description: `商户名均为 '${a.merchant}'，高度相似` })
    } else {
      reasons.push('商户名相似')
      reasonDetails.push({ dimension: 'merchant', label: '商户名相似', description: `商户名 '${a.merchant}' 与 '${b.merchant}' 相似度 ${(merchantSim * 100).toFixed(0)}%` })
    }
  }

  return { score: Math.min(score, 1), reasons, reasonDetails }
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
    const { score, reasons, reasonDetails } = dedupScore(input, {
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
        reasonDetails,
        isRefund: false,
      })
    }
  }

  return pairs.sort((a, b) => b.score - a.score)
}

/** 获取已忽略的交易对ID集合 */
export async function getIgnoredPairs(): Promise<Set<string>> {
  const raw = await getSetting('dedup_ignored')
  if (!raw) return new Set()
  try {
    const arr: string[] = JSON.parse(raw)
    return new Set(arr)
  } catch {
    return new Set()
  }
}

/** 标记一对交易为已忽略（不再出现在去重结果中） */
export async function skipDedupPair(idA: string, idB: string): Promise<void> {
  const ignored = await getIgnoredPairs()
  // 排序后存储，确保同一对只存一次
  const [first, second] = [idA, idB].sort()
  ignored.add(`${first}:${second}`)
  await saveSetting('dedup_ignored', JSON.stringify([...ignored]))
}

/** 全局扫描：找所有疑似重复对 */
export async function scanAllDuplicates(): Promise<DedupPair[]> {
  const { prisma } = await import('@/lib/db')

  // 获取已忽略的交易对
  const ignored = await getIgnoredPairs()

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

      // 跳过已忽略的交易对
      const [first, second] = [a.id, b.id].sort()
      if (ignored.has(`${first}:${second}`)) continue

      const { score, reasons, reasonDetails } = dedupScore(
        { merchant: a.merchant, amount: a.amount, transactionTime: a.transactionTime.toISOString() },
        { merchant: b.merchant, amount: b.amount, transactionTime: b.transactionTime.toISOString() },
      )
      if (score >= 0.6) {
        // 检测退款场景：一正一负
        const isRefund = (a.type === 'income') !== (b.type === 'income')
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
          reasonDetails,
          isRefund,
        })
      }
    }
  }

  return pairs.sort((a, b) => b.score - a.score)
}

/**
 * 处理去重：保留 keepId，删除 deleteId
 */
/**
 * 扫描归并建议：识别周期性/相似的同类支出
 */
export async function scanMergeSuggestions(): Promise<MergeGroup[]> {
  const { prisma } = await import('@/lib/db')

  // 获取所有交易（含分类信息）
  const transactions = await prisma.transaction.findMany({
    include: { category: { select: { id: true, name: true, icon: true } } },
    orderBy: { transactionTime: 'asc' },
  })

  if (transactions.length === 0) return []

  // 按商户名相似度 + 同分类进行分组
  // 使用贪心聚类：遍历交易，尝试归入已有组，否则创建新组
  interface RawGroup {
    merchant: string
    categoryId: string
    categoryName: string
    categoryIcon: string
    transactions: typeof transactions
  }

  const groups: RawGroup[] = []

  for (const tx of transactions) {
    if (!tx.merchant || !tx.categoryId) continue

    let matched = false
    for (const g of groups) {
      if (g.categoryId !== tx.categoryId) continue
      const sim = textSimilarity(g.merchant, tx.merchant)
      if (sim > 0.7) {
        g.transactions.push(tx)
        matched = true
        break
      }
    }

    if (!matched) {
      groups.push({
        merchant: tx.merchant,
        categoryId: tx.categoryId,
        categoryName: tx.category?.name || '未分类',
        categoryIcon: tx.category?.icon || '📦',
        transactions: [tx],
      })
    }
  }

  // 筛选：每组至少 3 笔交易
  const qualified = groups.filter((g) => g.transactions.length >= 3)

  // 构建 MergeGroup
  const result: MergeGroup[] = qualified.map((g) => {
    const amounts = g.transactions.map((t) => t.amount)
    const totalAmount = amounts.reduce((s, a) => s + a, 0)
    const avgAmount = totalAmount / amounts.length

    // 标准差
    const variance = amounts.reduce((s, a) => s + (a - avgAmount) ** 2, 0) / amounts.length
    const stdDev = Math.sqrt(variance)

    // 时间跨度
    const times = g.transactions.map((t) => t.transactionTime.getTime())
    const fromTime = new Date(Math.min(...times))
    const toTime = new Date(Math.max(...times))

    // 周期性判断：检查交易间隔是否相对规律
    const isPeriodic = detectPeriodicity(g.transactions.map((t) => t.transactionTime))

    // 相似金额：标准差 < 均值的 20%
    const _similarAmount = avgAmount > 0 && stdDev < avgAmount * 0.2

    const groupId = `${g.merchant}__${g.categoryId}`

    return {
      id: groupId,
      merchant: g.merchant,
      categoryId: g.categoryId,
      categoryName: g.categoryName,
      categoryIcon: g.categoryIcon,
      transactions: g.transactions.map((t) => ({
        id: t.id,
        merchant: t.merchant,
        amount: t.amount,
        type: t.type,
        description: t.description,
        transactionTime: localTime(t.transactionTime),
        categoryId: t.categoryId,
        categoryName: t.category?.name || null,
      })),
      stats: {
        count: g.transactions.length,
        totalAmount,
        avgAmount,
        dateRange: {
          from: localTime(fromTime),
          to: localTime(toTime),
        },
        isPeriodic,
      },
    }
  })

  // 按交易笔数降序排列
  return result.sort((a, b) => b.stats.count - a.stats.count)
}

/**
 * 检测交易时间是否具有周期性
 * 简单策略：计算相邻交易间隔天数的标准差，如果 < 平均间隔的 30% 则认为具有周期性
 */
function detectPeriodicity(times: Date[]): boolean {
  if (times.length < 3) return false

  const sorted = [...times].sort((a, b) => a.getTime() - b.getTime())
  const intervals: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    intervals.push((sorted[i].getTime() - sorted[i - 1].getTime()) / 86400000) // 天数
  }

  if (intervals.length < 2) return false

  const avgInterval = intervals.reduce((s, n) => s + n, 0) / intervals.length
  if (avgInterval <= 0) return false

  const variance = intervals.reduce((s, n) => s + (n - avgInterval) ** 2, 0) / intervals.length
  const stdDev = Math.sqrt(variance)

  // 标准差 < 平均间隔的 30% → 周期性
  return stdDev < avgInterval * 0.3
}

/**
 * 批量修改交易分类
 */
export async function batchUpdateCategory(
  transactionIds: string[],
  categoryId: string
): Promise<{ success: boolean; count: number }> {
  const { prisma } = await import('@/lib/db')
  await prisma.transaction.updateMany({
    where: { id: { in: transactionIds } },
    data: { categoryId },
  })
  return { success: true, count: transactionIds.length }
}

/**
 * 批量标记为固定支出（在描述前加 [固定] 前缀）
 */
export async function batchMarkAsFixed(
  transactionIds: string[]
): Promise<{ success: boolean; count: number }> {
  const { prisma } = await import('@/lib/db')
  const txs = await prisma.transaction.findMany({
    where: { id: { in: transactionIds } },
    select: { id: true, description: true },
  })

  for (const tx of txs) {
    const desc = tx.description || ''
    const newDesc = desc.startsWith('[固定]')
      ? desc
      : `[固定]${desc}`
    await prisma.transaction.update({
      where: { id: tx.id },
      data: { description: newDesc },
    })
  }

  return { success: true, count: txs.length }
}

export interface ImportDuplicateCheck {
  isDuplicate: boolean
  duplicateScore: number
  duplicateReasons: string[]
}

/**
 * 批量检查导入交易是否与数据库已有交易重复
 * 返回每笔交易的重复标记信息
 */
export async function batchCheckDuplicates(
  items: Array<{ merchant: string; amount: number; transactionDate: string }>
): Promise<ImportDuplicateCheck[]> {
  const { prisma } = await import('@/lib/db')

  // 收集所有时间窗口，批量查询候选交易
  const allCandidates = new Map<string, { merchant: string; amount: number; transactionTime: Date }>()

  for (const item of items) {
    const time = new Date(item.transactionDate + 'T12:00:00')
    const startTime = new Date(time.getTime() - 1440 * 60000)  // 前24小时
    const endTime = new Date(time.getTime() + 1440 * 60000)    // 后24小时

    const candidates = await prisma.transaction.findMany({
      where: {
        transactionTime: { gte: startTime, lte: endTime },
        amount: {
          gte: item.amount * 0.85,
          lte: item.amount * 1.15,
        },
      },
      select: { id: true, merchant: true, amount: true, transactionTime: true },
      take: 20,
    })

    for (const c of candidates) {
      allCandidates.set(c.id, {
        merchant: c.merchant,
        amount: c.amount,
        transactionTime: c.transactionTime,
      })
    }
  }

  // 对每笔导入交易计算最高重复分数
  const results: ImportDuplicateCheck[] = []

  for (const item of items) {
    const time = new Date(item.transactionDate + 'T12:00:00')
    const input = { merchant: item.merchant, amount: item.amount, transactionTime: time.toISOString() }

    let bestScore = 0
    let bestReasons: string[] = []

    for (const [, c] of allCandidates) {
      const { score, reasons } = dedupScore(input, {
        merchant: c.merchant,
        amount: c.amount,
        transactionTime: c.transactionTime.toISOString(),
      })
      if (score > bestScore) {
        bestScore = score
        bestReasons = reasons
      }
    }

    results.push({
      isDuplicate: bestScore >= 0.6,
      duplicateScore: bestScore,
      duplicateReasons: bestReasons,
    })
  }

  return results
}

export async function resolveDedup(keepId: string, deleteId: string): Promise<void> {
  const { prisma } = await import('@/lib/db')
  await prisma.transaction.delete({ where: { id: deleteId } })
}

/**
 * 退款抵消：将两笔交易合并为一笔净额交易
 * 保留 keepId 的交易，金额修改为两者之和（正负抵消），删除 deleteId
 */
export async function mergeWithOffset(keepId: string, deleteId: string): Promise<{ newAmount: number }> {
  const { prisma } = await import('@/lib/db')
  const keepTx = await prisma.transaction.findUnique({ where: { id: keepId } })
  const deleteTx = await prisma.transaction.findUnique({ where: { id: deleteId } })
  if (!keepTx || !deleteTx) throw new Error('交易不存在')

  // 计算净额：支出为负，收入为正
  const keepSigned = keepTx.type === 'income' ? keepTx.amount : -keepTx.amount
  const deleteSigned = deleteTx.type === 'income' ? deleteTx.amount : -deleteTx.amount
  const netAmount = keepSigned + deleteSigned

  // 修改保留交易的金额和类型
  const newType = netAmount >= 0 ? 'income' : 'expense'
  await prisma.transaction.update({
    where: { id: keepId },
    data: { amount: Math.abs(netAmount), type: newType },
  })

  // 删除另一笔
  await prisma.transaction.delete({ where: { id: deleteId } })

  return { newAmount: Math.abs(netAmount) }
}
