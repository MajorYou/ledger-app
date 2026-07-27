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

    const prompt = `你是一个记账分类助手。根据以下交易信息，选择最合适的分类。

已有分类树（${transaction.type === 'expense' ? '支出' : '收入'}）：
${JSON.stringify(categoryTree, null, 2)}

交易信息：
- 商户：${transaction.merchant || '未知'}
- 描述：${transaction.description || '无'}
- 金额：¥${transaction.amount}
- 类型：${transaction.type === 'expense' ? '支出' : '收入'}

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
