import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { detectCategoryName } from '@/lib/category-detector'
import { loadAgentSettings, findMatchingExpenses } from '@/lib/agent-settings'
import { findDuplicates, DedupPair } from '@/lib/dedup'
import { batchClassifyTransactions } from '@/lib/ai/classifier'
import { logger } from '@/lib/logger'

async function autoLearnCategory(merchant: string, categoryId: string): Promise<boolean> {
  const count = await prisma.transaction.count({
    where: { merchant, categoryId, isConfirmed: true },
  })
  if (count >= 3) {
    await prisma.classificationCache.upsert({
      where: { merchantPattern: merchant },
      update: { suggestedCategoryId: categoryId, confidence: Math.min(count / 5, 1), hitCount: count },
      create: { merchantPattern: merchant, suggestedCategoryId: categoryId, confidence: 0.8, hitCount: count },
    })
    return true
  }
  return false
}

interface ImportItem {
  merchant: string
  amount: number
  type: string
  transactionDate?: string
  description?: string
  categoryId?: string
  ledgerId?: string
  refundAction?: string
  deleteExpenseId?: string
}

export async function POST(request: NextRequest) {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const items: ImportItem[] = body.items || []
    const globalLedgerId: string | undefined = body.ledgerId
    const quickImport: boolean = body.quickImport === true
    const categoryCorrections: Array<{ merchant: string; originalCategoryId: string; correctedCategoryId: string }> = body.categoryCorrections || []

    if (items.length === 0) {
      return NextResponse.json({ success: true, results: [], dedupWarnings: [] })
    }

    // Phase -1: 应用用户分类修正到 ClassificationCache
    let correctionsApplied = 0
    for (const correction of categoryCorrections) {
      if (!correction.merchant || !correction.correctedCategoryId) continue
      try {
        await prisma.classificationCache.upsert({
          where: { merchantPattern: correction.merchant },
          update: { suggestedCategoryId: correction.correctedCategoryId, confidence: 0.9 },
          create: { merchantPattern: correction.merchant, suggestedCategoryId: correction.correctedCategoryId, confidence: 0.9, hitCount: 1 },
        })
        correctionsApplied++
        logger.info('batch-confirm:category-correction', {
          merchant: correction.merchant,
          from: correction.originalCategoryId,
          to: correction.correctedCategoryId,
        })
      } catch (cacheErr) {
        logger.error('batch-confirm:correction-cache-failed', {
          merchant: correction.merchant,
          error: cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
        })
      }
    }

    const agentSettings = await loadAgentSettings()
    const useLlm = agentSettings.classifyMode === 'llm' || agentSettings.classifyMode === 'hybrid'

    // Phase 0: 处理退款匹配（income 类型交易）
    const refundResults: Array<{ success: boolean; category: null; learned: false; refundMatched?: boolean }> = []
    const nonRefundItems: Array<{ item: ImportItem; idx: number }> = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type === 'income' && item.refundAction === undefined) {
        if (agentSettings.refundMode === 'match_deduct' || agentSettings.refundMode === 'always_ask') {
          const matches = await findMatchingExpenses(item.merchant || '', item.amount, item.transactionDate || '')
          if (matches.length > 0) {
            if (agentSettings.refundMode === 'match_deduct') {
              // 自动匹配：删除最匹配的支出
              const best = matches[0]
              await prisma.transaction.delete({ where: { id: best.id } })
              refundResults.push({ success: true, category: null, learned: false, refundMatched: true })
              continue
            }
            // always_ask: 批量导入中无法交互选择，跳过退款匹配，作为普通收入导入
            // 记录日志提示
            logger.info('batch-confirm:refund-skip-ask', {
              merchant: item.merchant,
              amount: item.amount,
              matchCount: matches.length,
            })
          }
        }
      }
      // 退款模式：delete_expense
      if (item.type === 'income' && item.refundAction === 'delete_expense') {
        const expenseId = item.deleteExpenseId
        if (expenseId) {
          await prisma.transaction.delete({ where: { id: expenseId } })
          refundResults.push({ success: true, category: null, learned: false, refundMatched: true })
          continue
        }
      }
      nonRefundItems.push({ item, idx: i })
    }

    // Phase 1: 缓存优先 → 规则匹配 → 收集需要 LLM 的项
    const ruleResults: Array<{
      item: ImportItem
      idx: number
      categoryId: string | null
      categoryName: string | null
      needLlm: boolean
    }> = []

    for (const { item, idx } of nonRefundItems) {
      let categoryId: string | null = item.categoryId || null
      let categoryName: string | null = null

      // 优先级 1: ClassificationCache（最高优先级 — 用户学习到的正确分类）
      if (!categoryId && item.type === 'expense' && item.merchant) {
        // 先精确匹配
        let cache = await prisma.classificationCache.findFirst({
          where: { merchantPattern: item.merchant },
        })
        // 精确未命中时，用商户名前6个字符做模糊匹配
        if (!cache && item.merchant && item.merchant.length >= 4) {
          const prefix = item.merchant.substring(0, Math.min(6, item.merchant.length))
          cache = await prisma.classificationCache.findFirst({
            where: {
              merchantPattern: { contains: prefix },
              confidence: { gte: 0.8 },
            },
            orderBy: { confidence: 'desc' },
          })
        }
        if (cache && cache.confidence >= 0.8) {
          const cat = await prisma.category.findUnique({ where: { id: cache.suggestedCategoryId } })
          if (cat) {
            categoryId = cat.id
            categoryName = cat.name
          }
        }
      }

      // 优先级 2: 规则匹配（关键词匹配）
      if (!categoryId && item.type === 'expense' && item.merchant) {
        const predictedName = detectCategoryName(item.merchant, item.description || '')
        if (predictedName) {
          const cat = await prisma.category.findFirst({
            where: { name: predictedName, type: 'expense' },
          })
          if (cat) { categoryId = cat.id; categoryName = cat.name }
        }
        if (!categoryId && predictedName) {
          const parentCat = await prisma.category.findFirst({
            where: { name: { contains: predictedName }, type: 'expense', children: { some: {} } },
          })
          if (parentCat) {
            const child = await prisma.category.findFirst({ where: { parentId: parentCat.id } })
            if (child) { categoryId = child.id; categoryName = `${parentCat.name} > ${child.name}` }
          }
        }
      }

      if (!categoryId && item.type === 'income') {
        const incomeCat = await prisma.category.findFirst({
          where: { type: 'income', name: '其他收入' },
        })
        if (incomeCat) { categoryId = incomeCat.id; categoryName = incomeCat.name }
      }

      ruleResults.push({
        item,
        idx,
        categoryId,
        categoryName,
        needLlm: !categoryId && useLlm && item.type === 'expense' && !!item.merchant,
      })
    }

    // Phase 2: 批量 LLM 分类（优先级 3: 最低优先级）
    const needLlmItems = ruleResults.filter(r => r.needLlm)
    if (needLlmItems.length > 0) {
      const llmInputs = needLlmItems.map(r => ({
        merchant: r.item.merchant || '',
        description: r.item.description || '',
        amount: r.item.amount || 0,
        type: r.item.type || 'expense',
        transactionTime: r.item.transactionDate,
      }))

      const llmResults = await batchClassifyTransactions(llmInputs)

      for (let j = 0; j < needLlmItems.length; j++) {
        const lr = llmResults[j]
        if (lr?.categoryId) {
          const cat = await prisma.category.findUnique({ where: { id: lr.categoryId } })
          if (cat) {
            needLlmItems[j].categoryId = cat.id
            needLlmItems[j].categoryName = cat.name
          }
        }
      }
    }

    // Phase 3: 创建交易 + 去重检查
    const results: Array<{ success: boolean; category: string | null; learned: boolean; refundMatched?: boolean }> = [...refundResults]
    const allDedupWarnings: DedupPair[] = []
    let totalLearned = 0
    let failCount = 0

    for (const r of ruleResults) {
      const item = r.item
      const ledgerId = item.ledgerId || globalLedgerId

      try {
        // 去重检查
        let dupWarnings: DedupPair[] = []
        if (item.type !== 'income' && item.merchant && item.amount) {
          dupWarnings = await findDuplicates(
            item.merchant,
            item.amount,
            item.transactionDate || new Date().toISOString()
          )
          if (dupWarnings.length > 0) {
            allDedupWarnings.push(...dupWarnings)
          }
        }

        // 创建交易
        let txTime: Date
        if (item.transactionDate) {
          if (item.transactionDate.includes('T')) {
            txTime = new Date(item.transactionDate)
          } else {
            const [y, m, d] = item.transactionDate.slice(0, 10).split('-').map(Number)
            txTime = new Date(y, m - 1, d)
          }
        } else {
          txTime = new Date()
        }
        await prisma.transaction.create({
          data: {
            type: item.type || 'expense',
            amount: parseFloat(String(item.amount)) || 0,
            merchant: item.merchant || '',
            description: item.description || '',
            transactionTime: txTime,
            categoryId: r.categoryId,
            createdById: user.id,
            isConfirmed: quickImport ? false : !!r.categoryId,
            ...(ledgerId ? {
              transactionLedgers: { create: { ledgerId } },
            } : {}),
          },
        })

        // 分类完成后执行自动学习（缓存/规则/LLM 都已走完，此时分类结果是最终结果）
        let learned = false
        if (item.merchant && r.categoryId) {
          learned = await autoLearnCategory(item.merchant, r.categoryId)
        }

        results.push({
          success: true,
          category: r.categoryName,
          learned,
        })
        if (learned) totalLearned++
      } catch (itemErr) {
        failCount++
        logger.error('batch-confirm:item-failed', {
          merchant: item.merchant,
          amount: item.amount,
          date: item.transactionDate,
          error: itemErr instanceof Error ? itemErr.message : String(itemErr),
        })
        results.push({
          success: false,
          category: r.categoryName,
          learned: false,
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    logger.info('batch-confirm:done', { total: ruleResults.length + refundResults.length, failCount, successCount })

    return NextResponse.json({
      success: failCount === 0,
      results,
      learned: totalLearned,
      correctionsApplied,
      dedupWarnings: allDedupWarnings.length > 0 ? allDedupWarnings : undefined,
      summary: {
        imported: successCount,
        failed: failCount,
        learned: totalLearned,
        corrections: correctionsApplied,
        dedupWarningCount: allDedupWarnings.length,
      },
    })
  } catch (error) {
    logger.error('batch-confirm:fatal', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json(
      { error: `批量导入失败: ${error instanceof Error ? error.message : ''}` },
      { status: 500 }
    )
  }
}
