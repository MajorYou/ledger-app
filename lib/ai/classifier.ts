import OpenAI from 'openai'
import { prisma } from '@/lib/db'
import { getSetting } from '@/lib/actions/settings'

interface ClassifyResult {
  categoryId: string | null
  categoryName: string
  confidence: number
  suggestNewCategory: boolean
  newCategoryName?: string
  reason: string
}

async function getAIClient(): Promise<OpenAI | null> {
  const apiKey = await getSetting('DEEPSEEK_API_KEY')
  if (!apiKey) return null

  const baseURL =
    (await getSetting('DEEPSEEK_BASE_URL')) || 'https://api.deepseek.com'

  return new OpenAI({
    apiKey,
    baseURL,
  })
}

async function getModelName(): Promise<string> {
  return (await getSetting('DEEPSEEK_MODEL')) || 'deepseek-chat'
}

export async function classifyTransaction(
  transaction: {
    merchant: string
    description: string
    amount: number
    type: string
    transactionTime?: string
  }
): Promise<ClassifyResult | null> {
  try {
    // 1. 先查缓存
    const cache = await prisma.classificationCache.findFirst({
      where: { merchantPattern: transaction.merchant },
    })

    if (cache && cache.confidence >= 0.8) {
      return {
        categoryId: cache.suggestedCategoryId,
        categoryName: '',
        confidence: cache.confidence,
        suggestNewCategory: false,
        reason: `缓存命中 (${cache.hitCount} 次)`,
      }
    }

    // 2. 检查 API 是否配置
    const client = await getAIClient()
    if (!client) {
      return {
        categoryId: null,
        categoryName: '',
        confidence: 0,
        suggestNewCategory: false,
        reason: '未配置 AI API Key，请在设置中配置',
      }
    }

    // 3. LLM 分类
    const categories = await prisma.category.findMany({
      where: { type: transaction.type },
      include: { parent: { select: { id: true, name: true } } },
    })

    const categoryTree = categories
      .filter((c) => !c.parentId)
      .map((parent) => {
        const children = categories.filter((c) => c.parentId === parent.id)
        return {
          id: parent.id,
          name: parent.name,
          children: children.map((c) => ({ id: c.id, name: c.name })),
        }
      })

    // 构建时间提示
    let timeHint = ''
    if (transaction.transactionTime) {
      const date = new Date(transaction.transactionTime)
      const hour = date.getHours()
      const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
      const timeStr = date.toLocaleString('zh-CN')

      if (hour >= 6 && hour < 10) {
        timeHint = `\n- 交易时间：${timeStr} (${weekday}，早上时段，可能是早餐)`
      } else if (hour >= 11 && hour < 14) {
        timeHint = `\n- 交易时间：${timeStr} (${weekday}，午餐时段)`
      } else if (hour >= 17 && hour < 21) {
        timeHint = `\n- 交易时间：${timeStr} (${weekday}，晚餐时段)`
      } else if (hour >= 14 && hour < 17) {
        timeHint = `\n- 交易时间：${timeStr} (${weekday}，下午茶时段)`
      } else if (hour >= 21 || hour < 6) {
        timeHint = `\n- 交易时间：${timeStr} (${weekday}，夜间时段，可能是夜宵/娱乐)`
      } else {
        timeHint = `\n- 交易时间：${timeStr} (${weekday})`
      }
    }

    const prompt = `你是一个记账分类助手。你必须从已有分类树中选择最具体的子分类（叶子节点），而不是父分类。

已有分类树（${transaction.type === 'expense' ? '支出' : '收入'}，带 children 的是父分类，无 children 或 children 为空的才是应该选的子分类）：
${JSON.stringify(categoryTree, null, 2)}

交易信息：
- 商户：${transaction.merchant || '未知'}
- 描述：${transaction.description || '无'}
- 金额：¥${transaction.amount}${timeHint}
- 类型：${transaction.type === 'expense' ? '支出' : '收入'}

【必须遵守的分类规则】
1. 优先选择最底层的子分类（叶子节点），不要选有 children 的父分类
2. 餐饮相关 → 必须根据时间选具体子分类：
   - 早餐(6-10点) → 三餐
   - 午餐(11-14点) → 三餐
   - 晚餐(17-21点) → 三餐
   - 夜宵(21-6点) → 三餐
   - 如果明显是小吃/奶茶/咖啡 → 零食饮料
   - 多人或高金额(>100) → 聚餐
   - 外卖平台(美团/饿了么) → 外卖
3. 交通相关 → 必须选具体子分类：
   - 公交/地铁 → 公共交通
   - 滴滴/出租车 → 打车
   - 加油站/充电 → 加油
   - 停车场 → 停车
4. 购物相关 → 日用/服饰/数码 按商品类型选子分类
5. 住房相关 → 房租/水电/物业 按费用类型选子分类

请返回 JSON 格式（不要包含其他内容）：
{
  "categoryId": "分类ID（从分类树中选择最匹配的）",
  "confidence": 0.0-1.0（置信度）,
  "suggestNewCategory": true/false（是否建议创建新分类）,
  "newCategoryName": "建议的新分类名称（仅当 suggestNewCategory 为 true 时）",
  "reason": "分类理由（一句话）"
}`

    const model = await getModelName()
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 300,
    })

    const content = response.choices[0]?.message?.content || ''
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('Failed to parse LLM response:', content)
      return null
    }

    const result = JSON.parse(jsonMatch[0]) as ClassifyResult

    // 4. 更新缓存
    if (result.categoryId && result.confidence >= 0.7) {
      await prisma.classificationCache.upsert({
        where: { merchantPattern: transaction.merchant || '__empty__' },
        update: {
          hitCount: { increment: 1 },
          confidence: result.confidence,
        },
        create: {
          merchantPattern: transaction.merchant || '__empty__',
          suggestedCategoryId: result.categoryId,
          confidence: result.confidence,
          hitCount: 1,
        },
      })
    }

    return result
  } catch (error) {
    console.error('AI classification error:', error)
    return null
  }
}
