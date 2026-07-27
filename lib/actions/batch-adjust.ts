'use server'

import OpenAI from 'openai'
import { getSetting } from '@/lib/actions/settings'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { logger } from '@/lib/logger'

interface NewTransaction {
  merchant: string
  description?: string
  amount: number
  type: 'expense' | 'income'
  categoryName?: string
  ledgerName?: string
  transactionTime?: string
}

interface ParsedOperation {
  filters: {
    dateRange?: { start: string; end: string }
    amountRange?: { min?: number; max?: number }
    categoryName?: string
    ledgerName?: string
    merchant?: string
    type?: 'expense' | 'income'
    keyword?: string
  }
  operations: Array<{
    type: 'move_ledger' | 'reclassify' | 'update_type' | 'update_merchant' | 'create_transaction'
    targetLedger?: string
    targetCategory?: string
    newValue?: string
    newTransactions?: NewTransaction[]
  }>
  explanation: string
}

async function getAIClient(): Promise<OpenAI | null> {
  const apiKey = await getSetting('DEEPSEEK_API_KEY')
  if (!apiKey) return null
  const baseURL = (await getSetting('DEEPSEEK_BASE_URL')) || 'https://api.deepseek.com'
  return new OpenAI({ apiKey, baseURL })
}

export async function parseNaturalLanguage(
  input: string
): Promise<{ success: true; parsed: ParsedOperation } | { success: false; error: string }> {
  const client = await getAIClient()
  if (!client) {
    return { success: false, error: '未配置 AI API Key' }
  }

  const [categories, ledgers] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true, type: true } }),
    prisma.ledger.findMany({ select: { id: true, name: true } }),
  ])

  const model = (await getSetting('DEEPSEEK_MODEL')) || 'deepseek-chat'

  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const yesterdayStr = new Date(now.getTime() - 86400000).toISOString().slice(0, 10)
  const dayBeforeStr = new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10)

  const prompt = `你是一个记账批量操作解析器。将用户的自然语言指令解析为结构化操作。

【重要】当前日期：${now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
今天 = ${todayStr}，昨天 = ${yesterdayStr}，前天 = ${dayBeforeStr}

可用分类（含层级，优先匹配子分类）：${JSON.stringify(categories.map(c => ({ name: c.name, type: c.type })))}
可用账本：${JSON.stringify(ledgers.map(l => l.name))}

用户指令：「${input}」

首先判断意图类型：
- 如果用户是在"记录/添加/花了/收入"一笔新交易 → operations 用 create_transaction
- 如果用户是在"修改/调整/移动/归类"已有交易 → operations 用 move_ledger/reclassify 等

请返回 JSON：
{
  "filters": {
    "dateRange": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } 或 null,
    "amountRange": { "min": 数字, "max": 数字 } 或 null,
    "categoryName": "分类名" 或 null,
    "ledgerName": "账本名" 或 null,
    "merchant": "商户名" 或 null,
    "type": "expense"|"income" 或 null,
    "keyword": "关键词" 或 null
  },
  "operations": [
    {
      "type": "move_ledger"|"reclassify"|"update_type"|"update_merchant"|"create_transaction",
      "targetLedger": "目标账本" 仅 move_ledger,
      "targetCategory": "目标分类" 仅 reclassify,
      "newValue": "新值" 仅 update_type/update_merchant,
      "newTransactions": [  // 仅 create_transaction
        {
          "merchant": "商户名",
          "description": "备注",
          "amount": 数字,
          "type": "expense"|"income",
          "categoryName": "分类名（必须选子分类，不要选父分类）",
          "ledgerName": "账本名",
          "transactionTime": "YYYY-MM-DDTHH:mm" 或 null(表示现在)
        }
      ]
    }
  ],
  "explanation": "用中文一句话解释你理解的操作"
}

新增交易解析规则：
- "今天午饭35块麦当劳" → merchant:"麦当劳", amount:35, type:"expense", categoryName:"三餐"
- "昨天晚上吃饭100块" → merchant:"吃饭"（无具体商户名时，用行为描述作为商户名，不要填 null）
- merchant 字段绝对不能为 null，没有商户名就用描述词（如"吃饭""购物""打车"）
- 分类必须选具体子分类：中午/晚上吃饭→"三餐"、奶茶咖啡→"零食饮料"、美团饿了么→"外卖"、多人→"聚餐"
- 打车/滴滴→"打车"、公交地铁→"公共交通"、加油→"加油"
- 金额数字后面的"块/元"忽略；"花了/用了/消费"→expense；"收入/入账/到账"→income

时间解析规则（必须转为 YYYY-MM-DDTHH:mm 格式）：
- "现在/刚刚" → null（表示当前时间）
- "今天" + 时间段 → 今天的日期，时间按上下文推断
- "今天中午/今天午饭" → ${todayStr}T12:00
- "今天晚上/今晚/晚饭" → ${todayStr}T19:00
- "今天早上/早餐" → ${todayStr}T08:00
- "昨天/昨晚/昨天晚上" → ${yesterdayStr}，时间按上下文
- "昨天晚上/昨晚晚饭" → ${yesterdayStr}T19:00
- "前天" → ${dayBeforeStr}
- "上周一/二…" → 计算上周对应日期
- "XX月XX号" → 当前年份的该日期
- 没有时间信息 → null（表示当前时间）
- transactionTime 要么填 null，要么填完整的 "YYYY-MM-DDTHH:mm"

修改交易规则：
- "上周" → 上周一到上周日；"本月" → 本月1日到今天
- 匹配分类/账本时用模糊匹配。找不到匹配时填 null。`

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 800,
  })

  const content = response.choices[0]?.message?.content || ''
  logger.info('batch-adjust:llm-response', content.substring(0, 500))
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return { success: false, error: 'AI 解析失败，请换一种说法试试' }
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as ParsedOperation
    // 规范化：LLM 可能返回 null 的字段用空字符串替代
    if (parsed.operations) {
      for (const op of parsed.operations) {
        if (op.newTransactions) {
          for (const nt of op.newTransactions) {
            nt.merchant = nt.merchant || ''
            nt.description = nt.description || ''
          }
        }
      }
    }
    return { success: true, parsed }
  } catch {
    return { success: false, error: 'AI 返回格式异常，请重试' }
  }
}

export interface DryRunResult {
  count: number
  preview: Array<{
    id: string
    merchant: string
    amount: number
    type: string
    transactionTime: string
    categoryName: string
    ledgerNames: string[]
    changes: string[]
  }>
  newTransactions: NewTransaction[]
  filters: ParsedOperation['filters']
  operations: ParsedOperation['operations']
}

export async function dryRunAdjust(
  filters: ParsedOperation['filters'],
  operations: ParsedOperation['operations']
): Promise<DryRunResult> {
  // 分离新增交易操作
  const createOps = operations.filter((op) => op.type === 'create_transaction')
  const modifyOps = operations.filter((op) => op.type !== 'create_transaction')

  const newTransactions: NewTransaction[] = []
  for (const op of createOps) {
    if (op.newTransactions) {
      newTransactions.push(...op.newTransactions)
    }
  }

  // 如果没有修改操作，跳过查询
  let preview: DryRunResult['preview'] = []
  if (modifyOps.length === 0) {
    return { count: newTransactions.length, preview: [], newTransactions, filters, operations }
  }

  // 构建查询条件
  const where: Record<string, unknown> = {}

  if (filters.dateRange) {
    where.transactionTime = {
      gte: new Date(filters.dateRange.start),
      lte: new Date(filters.dateRange.end + 'T23:59:59'),
    }
  }

  if (filters.amountRange) {
    const amountFilter: Record<string, number> = {}
    if (filters.amountRange.min !== undefined) amountFilter.gte = filters.amountRange.min
    if (filters.amountRange.max !== undefined) amountFilter.lte = filters.amountRange.max
    if (Object.keys(amountFilter).length > 0) where.amount = amountFilter
  }

  if (filters.type) where.type = filters.type

  if (filters.merchant) {
    where.merchant = { contains: filters.merchant }
  }

  if (filters.keyword) {
    where.OR = [
      { merchant: { contains: filters.keyword } },
      { description: { contains: filters.keyword } },
    ]
  }

  if (filters.categoryName) {
    const cat = await prisma.category.findFirst({
      where: { name: { contains: filters.categoryName } },
    })
    if (cat) where.categoryId = cat.id
  }

  if (filters.ledgerName) {
    const ledger = await prisma.ledger.findFirst({
      where: { name: { contains: filters.ledgerName } },
    })
    if (ledger) {
      where.transactionLedgers = { some: { ledgerId: ledger.id } }
    }
  }

  const transactions = await prisma.transaction.findMany({
    where: where as any,
    include: {
      category: { select: { name: true } },
      transactionLedgers: {
        include: { ledger: { select: { name: true } } },
      },
    },
    orderBy: { transactionTime: 'desc' },
  })

  preview = transactions.map((tx) => {
    const changes: string[] = []
    for (const op of modifyOps) {
      if (op.type === 'move_ledger' && op.targetLedger) {
        changes.push(`账本 → ${op.targetLedger}`)
      } else if (op.type === 'reclassify' && op.targetCategory) {
        changes.push(`分类 → ${op.targetCategory}`)
      }
    }
    return {
      id: tx.id,
      merchant: tx.merchant,
      amount: tx.amount,
      type: tx.type,
      transactionTime: tx.transactionTime.toISOString(),
      categoryName: tx.category?.name || '未分类',
      ledgerNames: tx.transactionLedgers.map((tl) => tl.ledger.name),
      changes,
    }
  })

  return { count: preview.length + newTransactions.length, preview, newTransactions, filters, operations }
}

export async function executeAdjust(
  filters: ParsedOperation['filters'],
  operations: ParsedOperation['operations'],
  overriddenNewTransactions?: NewTransaction[]
): Promise<{ count: number }> {
  const user = await getSession()
  if (!user) throw new Error('Unauthorized')

  const { preview } = await dryRunAdjust(filters, operations)

  // 使用覆盖的新交易列表（用户在预览中修改过的）
  const effectiveNewTransactions = overriddenNewTransactions ?? []
  if (overriddenNewTransactions === undefined) {
    // 从 operations 中提取原始 newTransactions
    for (const op of operations) {
      if (op.type === 'create_transaction' && op.newTransactions) {
        effectiveNewTransactions.push(...op.newTransactions)
      }
    }
  }

  let count = 0

  // 处理新增交易
  for (const nt of effectiveNewTransactions) {
    let categoryId: string | null = null
    if (nt.categoryName) {
      const cat = await prisma.category.findFirst({
        where: { name: { contains: nt.categoryName }, type: nt.type },
      })
      if (cat) categoryId = cat.id
    }

    const tx = await prisma.transaction.create({
      data: {
        type: nt.type,
        amount: nt.amount,
        merchant: nt.merchant || '',
        description: nt.description || '',
        transactionTime: nt.transactionTime ? new Date(nt.transactionTime) : new Date(),
        categoryId,
        createdById: user.id,
        isConfirmed: !!categoryId,
      },
    })

    // 关联账本
    if (nt.ledgerName) {
      const ledger = await prisma.ledger.upsert({
        where: { name: nt.ledgerName },
        update: {},
        create: { name: nt.ledgerName, type: 'daily', color: '#6366f1' },
      })
      logger.info('batch-adjust:auto-created-ledger', nt.ledgerName)
      await prisma.transactionLedger.create({
        data: { transactionId: tx.id, ledgerId: ledger.id },
      })
    }

    count++
  }

  // 处理修改操作
  const modifyOps = operations.filter((op) => op.type !== 'create_transaction')
  for (const tx of preview) {
    for (const op of modifyOps) {
      if (op.type === 'move_ledger' && op.targetLedger) {
        let ledger = await prisma.ledger.findFirst({
          where: { name: { contains: op.targetLedger } },
        })
        // 找不到则 upsert（自动创建，已有则复用）
        ledger = await prisma.ledger.upsert({
          where: { name: op.targetLedger },
          update: {},
          create: { name: op.targetLedger, type: 'daily', color: '#6366f1' },
        })
        logger.info('batch-adjust:auto-created-ledger', op.targetLedger)
        await prisma.transactionLedger.upsert({
          where: {
            transactionId_ledgerId: { transactionId: tx.id, ledgerId: ledger.id },
          },
          update: {},
          create: { transactionId: tx.id, ledgerId: ledger.id },
        })
      }

      if (op.type === 'reclassify' && op.targetCategory) {
        const cat = await prisma.category.findFirst({
          where: { name: { contains: op.targetCategory } },
        })
        if (cat) {
          await prisma.transaction.update({
            where: { id: tx.id },
            data: { categoryId: cat.id },
          })
        } else {
          logger.warn('batch-adjust:category-not-found', op.targetCategory)
        }
      }
    }
    count++
  }

  return { count }
}
