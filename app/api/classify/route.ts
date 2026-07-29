import { NextRequest, NextResponse } from 'next/server'
import { classifyTransaction, type ClassifyResult } from '@/lib/ai/classifier'
import { getSession } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/db'

// 关键词到父分类名的映射，用于推断合适的父分类
const PARENT_KEYWORDS: Array<{ keywords: string[]; parentName: string }> = [
  { keywords: ['早餐', '午餐', '晚餐', '三餐', '外卖', '聚餐', '零食', '饮料', '咖啡', '奶茶'], parentName: '餐饮' },
  { keywords: ['公交', '地铁', '打车', '加油', '停车', '交通'], parentName: '交通' },
  { keywords: ['购物', '日用', '服饰', '数码'], parentName: '购物' },
  { keywords: ['房租', '水电', '物业', '住房'], parentName: '住房' },
  { keywords: ['娱乐', '游戏', '电影'], parentName: '娱乐' },
  { keywords: ['医疗', '药品', '医院'], parentName: '医疗' },
  { keywords: ['教育', '学习', '培训'], parentName: '教育' },
  { keywords: ['通讯', '话费', '充值'], parentName: '通讯' },
]

async function inferParentCategory(type: string, newCategoryName: string): Promise<{ id: string; name: string } | null> {
  // 根据分类名关键词推断父分类
  for (const { keywords, parentName } of PARENT_KEYWORDS) {
    if (keywords.some(k => newCategoryName.includes(k))) {
      const parent = await prisma.category.findFirst({
        where: { name: parentName, type, parentId: null },
        select: { id: true, name: true },
      })
      if (parent) return parent
    }
  }
  // 默认选第一个顶级分类
  const defaultParent = await prisma.category.findFirst({
    where: { type, parentId: null },
    select: { id: true, name: true },
  })
  return defaultParent
}

export async function POST(request: NextRequest) {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { merchant, description, amount, type, transactionTime } = body

    logger.info('classify:request', { merchant, amount, type, transactionTime })

    if (!amount || !type) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 })
    }

    const result = await classifyTransaction({
      merchant: merchant || '',
      description: description || '',
      amount: parseFloat(amount),
      type,
      transactionTime: transactionTime || undefined,
    })

    if (!result) {
      return NextResponse.json(null)
    }

    // 如果建议创建新分类但没有父分类信息，进行推断
    let enrichedResult: ClassifyResult = { ...result }
    if (result.suggestNewCategory && result.newCategoryName && !result.suggestedParentId) {
      const parent = await inferParentCategory(type, result.newCategoryName)
      if (parent) {
        enrichedResult = {
          ...result,
          suggestedParentId: parent.id,
          suggestedParentName: parent.name,
        }
      }
    }

    logger.info('classify:result', enrichedResult)
    return NextResponse.json(enrichedResult)
  } catch (error) {
    logger.error('classify:error', error instanceof Error ? error.message : String(error))
    return NextResponse.json(
      { error: '分类失败' },
      { status: 500 }
    )
  }
}
