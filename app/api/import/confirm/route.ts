import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { detectCategoryName } from '@/lib/category-detector'
import { loadAgentSettings, findMatchingExpenses } from '@/lib/agent-settings'
import { findDuplicates, DedupPair } from '@/lib/dedup'

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

export async function POST(request: NextRequest) {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const item = await request.json()
    const { merchant, amount, type, transactionDate, description, categoryId: manualCategoryId, ledgerId, refundAction } = item

    const agentSettings = await loadAgentSettings()

    // 退款匹配：如果设置了 ask，需要先查匹配
    if (type === 'income' && refundAction === undefined) {
      if (agentSettings.refundMode === 'match_deduct' || agentSettings.refundMode === 'always_ask') {
        const matches = await findMatchingExpenses(merchant || '', amount, transactionDate || '')
        if (matches.length > 0) {
          if (agentSettings.refundMode === 'match_deduct') {
            // 自动匹配：删除最匹配的支出
            const best = matches[0]
            await prisma.transaction.delete({ where: { id: best.id } })
            return NextResponse.json({
              success: true,
              refundMatched: true,
              deletedExpense: { merchant: best.merchant, amount: best.amount, date: best.transactionTime },
            })
          }
          // always_ask: 返回匹配列表让前端展示选择
          return NextResponse.json({
            success: false,
            needRefundChoice: true,
            matches,
            refundItem: { merchant, amount, transactionDate, description },
          })
        }
      }
    }

    // 退款模式：delete_expense — 删除指定支出
    if (refundAction === 'delete_expense') {
      const expenseId = item.deleteExpenseId
      if (expenseId) {
        await prisma.transaction.delete({ where: { id: expenseId } })
        return NextResponse.json({ success: true, refundMatched: true })
      }
    }

    // 分类匹配
    let categoryId: string | null = manualCategoryId || null
    let categoryName: string | null = null

    // 导入前去重检查（非退款交易）
    let dupWarnings: DedupPair[] = []
    if (type !== 'income' && merchant && amount) {
      dupWarnings = await findDuplicates(merchant, amount, transactionDate || new Date().toISOString())
    }

    if (!categoryId && type === 'expense' && merchant) {
      const predictedName = detectCategoryName(merchant, description || '')
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

    // 收入类交易：分配默认收入分类
    if (!categoryId && type === 'income') {
      const incomeCat = await prisma.category.findFirst({
        where: { type: 'income', name: '其他收入' },
      })
      if (incomeCat) { categoryId = incomeCat.id; categoryName = incomeCat.name }
    }

    // 创建交易
    await prisma.transaction.create({
      data: {
        type: type || 'expense',
        amount: parseFloat(amount) || 0,
        merchant: merchant || '',
        description: description || '',
        transactionTime: transactionDate ? new Date(transactionDate) : new Date(),
        categoryId,
        createdById: user.id,
        isConfirmed: !!categoryId,
        ...(ledgerId ? {
          transactionLedgers: { create: { ledgerId } },
        } : {}),
      },
    })

    let learned = false
    if (merchant && categoryId) {
      learned = await autoLearnCategory(merchant, categoryId)
    }

    return NextResponse.json({ success: true, category: categoryName, learned, dedupWarnings: dupWarnings.length > 0 ? dupWarnings : undefined })
  } catch (error) {
    return NextResponse.json(
      { error: `创建失败: ${error instanceof Error ? error.message : ''}` },
      { status: 500 }
    )
  }
}
