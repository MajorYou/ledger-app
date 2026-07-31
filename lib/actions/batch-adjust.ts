'use server'

import OpenAI from 'openai'
import { getSetting } from '@/lib/actions/settings'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { revalidatePath } from 'next/cache'
import { quickCreateCategory } from './categories'
import { loadAgentSettings } from '@/lib/agent-settings'
import { allPageMetadata, ALLOWED_REDIRECT_PATHS, AI_CAPABILITIES } from '@/lib/ai-capabilities'
import { loadUserRules, matchRule, parseAction } from '@/lib/user-rules'

interface NewTransaction {
  merchant: string
  description?: string
  amount: number
  type: 'expense' | 'income'
  categoryName?: string
  ledgerName?: string
  accountName?: string
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
    targetIds?: string[]
  }
  operations: Array<{
    type: 'move_ledger' | 'reclassify' | 'update_type' | 'update_merchant' | 'create_transaction' | 'delete_transactions' | 'duplicate_transaction'
    targetLedger?: string
    targetCategory?: string
    newValue?: string
    newType?: 'expense' | 'income' | 'transfer'
    newMerchant?: string
    newTransactions?: NewTransaction[]
    count?: number
  }>
  explanation: string
}

export interface ConversationContext {
  previousQueryTransactions?: Array<{
    id: string
    merchant: string
    amount: number
    categoryName: string
    date: string
  }>
  turnCount?: number
}

export interface QueryTransaction {
  id: string
  merchant: string
  amount: number
  type: string
  transactionTime: string
  categoryName: string
  ledgerNames: string[]
}

export type ParseResult =
  | { success: true; mode: 'operation'; parsed: ParsedOperation; confidence: number }
  | { success: true; mode: 'query'; reply: string; transactions?: QueryTransaction[]; confidence: number }
  | { success: true; mode: 'unsupported'; message: string; redirect: string; confidence: number }
  | { success: true; mode: 'clarify'; reply: string; suggestions: string[]; confidence: number }
  | { success: false; error: string }

async function getAIClient(): Promise<OpenAI | null> {
  const apiKey = await getSetting('DEEPSEEK_API_KEY')
  if (!apiKey) return null
  const baseURL = (await getSetting('DEEPSEEK_BASE_URL')) || 'https://api.deepseek.com'
  return new OpenAI({ apiKey, baseURL })
}

export async function parseNaturalLanguage(
  input: string,
  context?: ConversationContext
): Promise<ParseResult> {
  const client = await getAIClient()
  if (!client) {
    return { success: false, error: '未配置 AI API Key' }
  }

  const session = await getSession()

  const [categories, ledgers, agentSettings] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true, type: true } }),
    prisma.ledger.findMany({ select: { id: true, name: true } }),
    loadAgentSettings(),
  ])

  // ========== 模板匹配（优先级最高） ==========
  if (session) {
    const templates = await prisma.operationTemplate.findMany({
      where: { userId: session.id, isActive: true },
    })
    
    for (const template of templates) {
      try {
        const phrases: string[] = JSON.parse(template.triggerPhrases)
        const inputLower = input.toLowerCase().trim()
        
        // 精确匹配优先，仅当触发词长度 >= 3 时才允许 includes 匹配
        const matched = phrases.some(phrase => {
          const pl = phrase.toLowerCase()
          return inputLower === pl || (pl.length >= 3 && inputLower.includes(pl))
        })
        
        if (matched) {
          const operations = JSON.parse(template.operations)
          // 校验 operations 结构：必须是数组且每个元素有 type 字段
          if (!Array.isArray(operations) || !operations.every((op: { type?: string }) => op.type)) {
            continue  // 跳过格式异常的模板
          }
          logger.info('batch-adjust:template-matched', { templateId: template.id, name: template.name })
          return {
            success: true,
            mode: 'operation',
            parsed: {
              filters: {},
              operations,
              explanation: `已匹配模板「${template.name}」`,
            },
            confidence: 1.0,
          }
        }
      } catch {
        continue
      }
    }
  }

  // ========== 用户规则匹配 ==========
  if (session) {
    const rules = await loadUserRules(session.id)
    
    // 尝试从输入中提取商户信息用于规则匹配
    // 简单启发式：查找常见模式如“在XX”、“XX花了”等
    const merchantMatch = input.match(/在(.+?)(?:花了|消费|买了|吃了|用了)/) ||
                          input.match(/(.+?)(?:花了|消费|买了|吃了|用了)/)
    const merchant = merchantMatch ? merchantMatch[1].trim() : undefined
    
    // 提取金额（用于匹配 amount 字段规则）
    const amountMatch = input.match(/(\d+(?:\.\d+)?)\s*(?:块|元|¥)?/)
    const amount = amountMatch ? Number(amountMatch[1]) : undefined
    
    // 构建用于规则匹配的交易对象
    const transactionForMatch = { merchant, amount, description: input }
    
    if (merchant || amount) {
      const matched = matchRule(rules, transactionForMatch)
      if (matched) {
        const action = matched.action
        logger.info('batch-adjust:rule-matched', { ruleId: matched.rule.id, name: matched.rule.name })
        
        // 将规则动作转换为操作
        const operations: ParsedOperation['operations'] = []
        
        if (action.type === 'reclassify' && action.params.categoryName) {
          operations.push({
            type: 'create_transaction',
            newTransactions: [{
              merchant: merchant || '未识别',
              amount: amount ?? 0, // 需要用户补充
              type: 'expense',
              categoryName: action.params.categoryName,
            }],
          })
        }
        
        if (operations.length > 0) {
          return {
            success: true,
            mode: 'operation',
            parsed: {
              filters: {},
              operations,
              explanation: `已匹配用户规则「${matched.rule.name}」`,
            },
            confidence: 0.9,
          }
        }
      }
    }
  }

  const model = (await getSetting('DEEPSEEK_MODEL')) || 'deepseek-chat'

  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const yesterdayStr = new Date(now.getTime() - 86400000).toISOString().slice(0, 10)
  const dayBeforeStr = new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10)

  // 构建上下文注入块
  let contextBlock = ''
  if (context?.previousQueryTransactions && context.previousQueryTransactions.length > 0) {
    const txs = context.previousQueryTransactions.slice(0, 20)
    const txList = txs.map((tx, i) => 
      `${i + 1}. ID: ${tx.id}, 商户: ${tx.merchant}, 金额: ¥${tx.amount.toFixed(2)}, 分类: ${tx.categoryName}, 日期: ${tx.date}`
    ).join('\n')
    contextBlock = `

[对话上下文]
上一轮查询到 ${context.previousQueryTransactions.length} 笔交易：
${txList}

如果用户的消息涉及"它们"、"这些"、"上一笔"、"上面那些"等指代词，指的是上述交易。
如果用户要求修改/删除/分类等操作且使用了"它们"等指代词，应在 filters 中使用 targetIds 字段，值为上述交易的 ID 列表。
[/对话上下文]
`
  }

  const prompt = `你是一个记账批量操作解析器。将用户的自然语言指令解析为结构化操作。

【重要】当前日期：${now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
今天 = ${todayStr}，昨天 = ${yesterdayStr}，前天 = ${dayBeforeStr}

可用分类（含层级，优先匹配子分类）：${JSON.stringify(categories.map(c => ({ name: c.name, type: c.type })))}
可用账本：${JSON.stringify(ledgers.map(l => l.name))}

【重要】如果用户提到的账本或分类不在上述列表中，你应该自动创建新的。对于 reclassify 操作，即使分类不存在也可以直接指定名称，系统会自动创建。对于 move_ledger 操作，即使账本不存在也可以直接指定名称，系统会自动创建。

用户指令：「${input}」
${contextBlock}
首先判断意图类型：
- 如果用户是在"记录/添加/花了/收入"一笔新交易 → operations 用 create_transaction
- 如果用户是在"修改/调整/移动/归类"已有交易 → operations 用 move_ledger/reclassify 等

请返回 JSON（注意：所有模式都必须在顶层包含 "confidence" 字段）：

### 操作/查询模式
{
  "mode": "operation" 或 "query",
  "confidence": 0.0-1.0（你对解析结果的确定程度：1.0=完全确定，0.7=基本确定，0.5=不太确定，0.3=很不确定）,
  "filters": {
    "dateRange": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } 或 null,
    "amountRange": { "min": 数字, "max": 数字 } 或 null,
    "categoryName": "分类名" 或 null,
    "ledgerName": "账本名" 或 null,
    "merchant": "商户名" 或 null,
    "type": "expense"|"income" 或 null,
    "keyword": "关键词" 或 null,
    "targetIds": ["id1", "id2"] 或 null（当上下文中有交易 ID 列表且用户使用了"它们"等指代时，填入对应交易 ID）
  },
  "operations": [
    {
      "type": "move_ledger"|"reclassify"|"update_type"|"update_merchant"|"create_transaction"|"delete_transactions"|"duplicate_transaction",
      "targetLedger": "目标账本" 仅 move_ledger,
      "targetCategory": "目标分类" 仅 reclassify,
      "newValue": "新值" 仅 update_type/update_merchant（已废弃，优先用 newType/newMerchant）,
      "newType": "expense"|"income"|"transfer" 仅 update_type,
      "newMerchant": "新商户名" 仅 update_merchant,
      "count": 数字 仅 duplicate_transaction（默认1，表示复制几笔）,
      "newTransactions": [  // 仅 create_transaction
        {
          "merchant": "商户名",
          "description": "备注",
          "amount": 数字,
          "type": "expense"|"income",
          "categoryName": "分类名（必须选子分类，不要选父分类）",
          "ledgerName": "账本名",
          "accountName": "支付账户名（可选，如"余额宝"、"微信零钱"、"招商银行储蓄卡(9496)"）",
          "transactionTime": "YYYY-MM-DDTHH:mm" 或 null(表示现在)
        }
      ]
    }
  ],
  "reply": "查询模式的文字回复（仅 query 模式需要）",
  "explanation": "操作模式的中文解释（仅 operation 模式需要）"
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
- 匹配分类/账本时用模糊匹配。找不到匹配时填 null。

删除交易规则：
- 当用户明确说"删除/删掉/清除"交易时 → type 用 "delete_transactions"
- "删除所有停车记录" → filters: { keyword: "停车" }, operations: [{ type: "delete_transactions" }]
- "删除上个月所有外卖" → filters: { dateRange: 上月, keyword: "外卖" }, operations: [{ type: "delete_transactions" }]
- 删除操作必须精确匹配用户意图，不可扩大范围

修改类型规则（update_type）：
- "把所有交通改成收入" → operations: [{ type: "update_type", newType: "income" }]
- newType 可选值："expense"（支出）、"income"（收入）、"transfer"（转账）

修改商户名规则（update_merchant）：
- "把麦当劳的商户名改成美团外卖" → operations: [{ type: "update_merchant", newMerchant: "美团外卖" }]

复制交易规则（duplicate_transaction）：
- 当用户说"复制/重复/再来一笔/克隆"某笔交易时，用此操作
- filters 用于定位要复制的目标交易
- count 表示复制几笔（默认 1）
- 示例："把95块的门票复制一笔" → filters: { keyword: "门票", amountRange: { min: 95, max: 95 } }, operations: [{ type: "duplicate_transaction", count: 1 }]
- 示例："复制上个月的停车费" → filters: { dateRange: 上月, keyword: "停车" }, operations: [{ type: "duplicate_transaction", count: 1 }]

## 响应模式

你有两种响应模式：

### 操作模式
当用户的指令需要修改数据时（新增、修改、删除、移动、复制交易等），返回上面定义的 JSON 操作指令格式。

### 查询模式
当用户只是在询问信息、请求分析、查看记录时（如"帮我查一下..."、"有哪些..."、"统计一下..."、"检查一下..."），返回文本回复，不要返回操作指令：

{
  "mode": "query",
  "reply": "你的文字回复内容",
  "filters": { ... }
}

在查询模式下：
- reply 是你对用户的文字回复
- filters 是可选的，如果你需要根据某些交易数据来回答，提供 filters 让系统查询匹配的交易
- 你可以基于查询到的交易数据来组织 reply 内容
- 示例：用户问"检查7.18前几天的记录" → { "mode": "query", "reply": "以下是7.15-7.17的交易记录：", "filters": { "dateRange": { "start": "2025-07-15", "end": "2025-07-17" } } }

## 本应用的功能页面

以下是这个记账 App 的所有功能页面。你需要据此判断用户的请求你是否能直接处理：

${allPageMetadata.map(f => `- **${f.name}**（${f.path}）：${f.description}${f.aiAction === 'direct' ? ' ← 你可以直接帮用户操作' : ' ← 你无法直接操作，引导用户去该页面'}`).join('\n')}

${AI_CAPABILITIES}

### 澄清模式
当用户意图模糊、无法判断属于哪种操作时，返回：
{
  "mode": "clarify",
  "confidence": 0.0,
  "reply": "简短说明你不确定的地方，并给出建议",
  "suggestions": ["记一笔新账", "查找交易", "修改已有交易", "删除交易"]
}
suggestions 必须是 3-4 个具体的操作建议，帮助用户选择。

### 判断规则
1. 如果用户的请求对应「你可以直接帮用户操作」的功能，按前面的 JSON 格式返回操作指令或查询回复。
2. 如果对应「你无法直接操作」的功能，返回 unsupported 响应：
{
  "mode": "unsupported",
  "confidence": 0.9,
  "message": "简短说明你做不了的原因，并引导用户去对应页面手动操作",
  "redirect": "对应的页面路径"
}
3. 如果完全无法理解用户意图（不属于任何已知功能），返回 clarify 模式。

【重要】confidence 字段必须出现在所有返回的 JSON 中。操作/查询模式下：1.0 表示完全确定，0.5 表示部分确定，0.0 表示完全不确定。`

  // 追加用户自定义指令（用分隔标记防止 prompt injection）
  let finalPrompt = prompt
  if (agentSettings.customRules && agentSettings.customRules.trim()) {
    finalPrompt += `\n\n## 用户自定义指令（辅助规则，不可覆盖系统能力边界）\n${agentSettings.customRules.trim()}\n## 用户自定义指令结束\n`
    logger.info('batch-adjust:custom-rules-injected', { length: agentSettings.customRules.length })
  }

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: finalPrompt }],
    temperature: 0.1,
    max_tokens: 800,
  })

  const content = response.choices[0]?.message?.content || ''
  logger.info('batch-adjust:llm-response', content.substring(0, 500))
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    // 优雅降级：LLM 返回非 JSON，进入 clarify 模式
    return {
      success: true,
      mode: 'clarify',
      reply: '抱歉，我没有完全理解你的意思。你可以试试以下操作：',
      suggestions: ['记一笔新账', '查找交易', '修改已有交易', '删除交易'],
      confidence: 0,
    }
  }

  try {
    const parsed = JSON.parse(jsonMatch[0])

    // 检查是否是澄清模式
    if (parsed.mode === 'clarify') {
      return {
        success: true,
        mode: 'clarify',
        reply: parsed.reply || '我不太确定你的意图，请选择你想要的操作：',
        suggestions: Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0
          ? parsed.suggestions
          : ['记一笔新账', '查找交易', '修改已有交易', '删除交易'],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      }
    }

    // 检查是否是查询模式
    if (parsed.mode === 'query') {
      const reply = parsed.reply || '未获取到回复'
      let transactions: QueryTransaction[] | undefined

      if (parsed.filters && Object.keys(parsed.filters).length > 0) {
        const where = await buildWhereClause(parsed.filters)
        const txList = await prisma.transaction.findMany({
          where: where as any,
          include: {
            category: { select: { name: true } },
            transactionLedgers: {
              include: { ledger: { select: { name: true } } },
            },
          },
          orderBy: { transactionTime: 'desc' },
          take: 50,
        })
        transactions = txList.map((tx) => ({
          id: tx.id,
          merchant: tx.merchant,
          amount: tx.amount,
          type: tx.type,
          transactionTime: tx.transactionTime.toISOString(),
          categoryName: tx.category?.name || '未分类',
          ledgerNames: tx.transactionLedgers.map((tl) => tl.ledger.name),
        }))
      }

      return { success: true, mode: 'query', reply, transactions, confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8 }
    }

    // 检查是否是不支持的操作
    if (parsed.mode === 'unsupported') {
      const safeRedirect = ALLOWED_REDIRECT_PATHS.includes(parsed.redirect) ? parsed.redirect : '/'
      return {
        success: true,
        mode: 'unsupported',
        message: parsed.message || '抱歉，这个操作我暂时做不了',
        redirect: safeRedirect,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
      }
    }

    // 操作模式：必须有 operations 数组
    if (!parsed.operations || !Array.isArray(parsed.operations)) {
      parsed.operations = []
    }
    if (!parsed.filters) {
      parsed.filters = {}
    }
    // 规范化：LLM 可能返回 null 的字段用空字符串替代
    for (const op of parsed.operations) {
      if (op.newTransactions) {
        for (const nt of op.newTransactions) {
          nt.merchant = nt.merchant || ''
          nt.description = nt.description || ''
        }
      }
      // 向后兼容：将 newValue 映射到 newType / newMerchant
      if (op.type === 'update_type' && !op.newType && op.newValue) {
        op.newType = op.newValue as 'expense' | 'income' | 'transfer'
      }
      if (op.type === 'update_merchant' && !op.newMerchant && op.newValue) {
        op.newMerchant = op.newValue
      }
    }
    return { success: true, mode: 'operation', parsed: parsed as ParsedOperation, confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8 }
  } catch (e) {
    logger.error('batch-adjust:parse-error', { raw: content.substring(0, 300), error: String(e) })
    // 优雅降级：JSON 解析失败，进入 clarify 模式
    return {
      success: true,
      mode: 'clarify',
      reply: 'AI 返回格式异常，我不太确定你想做什么。你可以试试：',
      suggestions: ['记一笔新账', '查找交易', '修改已有交易', '删除交易'],
      confidence: 0,
    }
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

async function buildWhereClause(filters: ParsedOperation['filters']): Promise<Record<string, unknown>> {
  const where: Record<string, unknown> = {}

  // 优先按 targetIds 匹配（多轮对话中通过 ID 精确指定交易）
  if (filters.targetIds && filters.targetIds.length > 0) {
    // 校验 targetIds：确保是字符串数组，过滤空字符串，校验 cuid 格式
    const validIds = Array.isArray(filters.targetIds)
      ? filters.targetIds.filter((id): id is string => typeof id === 'string' && id.length > 0 && /^c[a-z0-9]{24}$/.test(id))
      : []
    if (validIds.length > 0) {
      where.id = { in: validIds }
      return where
    }
    // 如果过滤后没有有效 ID，记录警告并继续走其他筛选条件
    logger.warn('batch-adjust:invalid-targetIds', { targetIds: filters.targetIds })
  }

  if (filters.dateRange) {
    const [sy, sm, sd] = filters.dateRange.start.slice(0, 10).split('-').map(Number)
    const [ey, em, ed] = filters.dateRange.end.slice(0, 10).split('-').map(Number)
    where.transactionTime = {
      gte: new Date(sy, sm - 1, sd),
      lte: new Date(ey, em - 1, ed, 23, 59, 59),
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

  return where
}

export async function dryRunAdjust(
  filters: ParsedOperation['filters'],
  operations: ParsedOperation['operations']
): Promise<DryRunResult> {
  // 分离新增交易操作和复制交易操作
  const createOps = operations.filter((op) => op.type === 'create_transaction')
  const duplicateOps = operations.filter((op) => op.type === 'duplicate_transaction')
  const modifyOps = operations.filter((op) => op.type !== 'create_transaction' && op.type !== 'duplicate_transaction')

  const newTransactions: NewTransaction[] = []
  for (const op of createOps) {
    if (op.newTransactions) {
      newTransactions.push(...op.newTransactions)
    }
  }

  // 处理复制交易：查询目标交易，生成复制预览
  let duplicatePreviews: DryRunResult['preview'] = []
  if (duplicateOps.length > 0) {
    const dupWhere = await buildWhereClause(filters)
    const dupTransactions = await prisma.transaction.findMany({
      where: dupWhere as any,
      include: {
        category: { select: { name: true } },
        transactionLedgers: {
          include: { ledger: { select: { name: true } } },
        },
      },
      orderBy: { transactionTime: 'desc' },
    })
    for (const tx of dupTransactions) {
      for (const op of duplicateOps) {
        const dupCount = op.count || 1
        for (let i = 0; i < dupCount; i++) {
          duplicatePreviews.push({
            id: `${tx.id}_dup_${i}`,
            merchant: tx.merchant,
            amount: tx.amount,
            type: tx.type,
            transactionTime: tx.transactionTime.toISOString(),
            categoryName: tx.category?.name || '未分类',
            ledgerNames: tx.transactionLedgers.map((tl) => tl.ledger.name),
            changes: ['📋 复制'],
          })
        }
      }
    }
  }

  // 如果没有修改操作，跳过查询
  let preview: DryRunResult['preview'] = []
  if (modifyOps.length > 0) {
    const where = await buildWhereClause(filters)

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
        } else if (op.type === 'update_type' && op.newType) {
          changes.push(`类型 → ${op.newType}`)
        } else if (op.type === 'update_merchant' && op.newMerchant) {
          changes.push(`商户 → ${op.newMerchant}`)
        } else if (op.type === 'delete_transactions') {
          changes.push('🗑 删除')
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
  }

  return { count: preview.length + newTransactions.length + duplicatePreviews.length, preview: [...preview, ...duplicatePreviews], newTransactions, filters, operations }
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

    // 查找支付账户
    let sourceAccountId: string | null = null
    if (nt.accountName) {
      const account = await prisma.account.findFirst({
        where: { name: { contains: nt.accountName } },
      })
      if (account) sourceAccountId = account.id
    }

    const tx = await prisma.transaction.create({
      data: {
        type: nt.type,
        amount: nt.amount,
        merchant: nt.merchant || '',
        description: nt.description || '',
        transactionTime: nt.transactionTime ? new Date(nt.transactionTime) : new Date(),
        categoryId,
        sourceAccountId,
        createdById: user.id,
        isConfirmed: !!categoryId,
      },
    })

    // 余额联动
    if (nt.type === 'expense' && sourceAccountId) {
      await prisma.account.update({ where: { id: sourceAccountId }, data: { balance: { increment: -nt.amount } } })
    } else if (nt.type === 'income' && sourceAccountId) {
      await prisma.account.update({ where: { id: sourceAccountId }, data: { balance: { increment: nt.amount } } })
    }

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

  // 处理修改操作（排除复制预览条目，它们的 ID 是虚拟的）
  const modifyOps = operations.filter((op) => op.type !== 'create_transaction' && op.type !== 'duplicate_transaction')
  const modifyPreview = preview.filter((tx) => !tx.id.includes('_dup_'))
  for (const tx of modifyPreview) {
    for (const op of modifyOps) {
      if (op.type === 'move_ledger' && op.targetLedger) {
        let ledger = await prisma.ledger.findFirst({
          where: { name: { contains: op.targetLedger } },
        })
        // 找不到则 upsert
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

      if (op.type === 'delete_transactions') {
        // 先读取被删除的交易，回滚余额
        const txToDelete = await prisma.transaction.findUnique({ where: { id: tx.id } })
        if (txToDelete) {
          if (txToDelete.type === 'expense' && txToDelete.sourceAccountId) {
            await prisma.account.update({ where: { id: txToDelete.sourceAccountId }, data: { balance: { increment: txToDelete.amount } } })
          } else if (txToDelete.type === 'income' && txToDelete.toAccountId) {
            await prisma.account.update({ where: { id: txToDelete.toAccountId }, data: { balance: { increment: -txToDelete.amount } } })
          } else if (txToDelete.type === 'transfer') {
            if (txToDelete.sourceAccountId) await prisma.account.update({ where: { id: txToDelete.sourceAccountId }, data: { balance: { increment: txToDelete.amount } } })
            if (txToDelete.toAccountId) await prisma.account.update({ where: { id: txToDelete.toAccountId }, data: { balance: { increment: -txToDelete.amount } } })
          }
        }
        await prisma.transaction.delete({ where: { id: tx.id } })
        logger.info('batch-adjust:deleted', { id: tx.id, merchant: tx.merchant })
      }

      if (op.type === 'reclassify' && op.targetCategory) {
        let cat = await prisma.category.findFirst({
          where: { name: { contains: op.targetCategory } },
        })
        if (!cat) {
          // 自动创建分类：找到一个根分类作为父分类
          const txData = await prisma.transaction.findUnique({
            where: { id: tx.id },
            select: { type: true },
          })
          const txType = txData?.type || 'expense'
          const rootCategory = await prisma.category.findFirst({
            where: { parentId: null, type: txType },
          })
          if (rootCategory) {
            const result = await quickCreateCategory(op.targetCategory, rootCategory.id, txType)
            if (result.success && result.category) {
              cat = await prisma.category.findUnique({ where: { id: result.category.id } })
            }
          }
        }
        if (cat) {
          await prisma.transaction.update({
            where: { id: tx.id },
            data: { categoryId: cat.id },
          })
        } else {
          logger.warn('batch-adjust:category-not-found', op.targetCategory)
        }
      }

      if (op.type === 'update_type' && op.newType) {
        await prisma.transaction.update({
          where: { id: tx.id },
          data: { type: op.newType },
        })
        logger.info('batch-adjust:update-type', { id: tx.id, newType: op.newType })
      }

      if (op.type === 'update_merchant' && op.newMerchant) {
        await prisma.transaction.update({
          where: { id: tx.id },
          data: { merchant: op.newMerchant },
        })
        logger.info('batch-adjust:update-merchant', { id: tx.id, newMerchant: op.newMerchant })
      }
    }
    count++
  }

  // 处理复制交易操作
  const duplicateOps = operations.filter((op) => op.type === 'duplicate_transaction')
  if (duplicateOps.length > 0) {
    const dupWhere = await buildWhereClause(filters)
    const dupTransactions = await prisma.transaction.findMany({
      where: dupWhere as any,
      include: {
        transactionLedgers: true,
      },
    })
    for (const tx of dupTransactions) {
      for (const op of duplicateOps) {
        const dupCount = op.count || 1
        for (let i = 0; i < dupCount; i++) {
          const newTx = await prisma.transaction.create({
            data: {
              type: tx.type,
              amount: tx.amount,
              merchant: tx.merchant,
              description: tx.description,
              transactionTime: new Date(),
              categoryId: tx.categoryId,
              sourceAccountId: tx.sourceAccountId,
              toAccountId: tx.toAccountId,
              channel: tx.channel,
              createdById: user.id,
              isConfirmed: true,
              llmClassified: false,
            },
          })
          // 余额联动
          if (tx.type === 'expense' && tx.sourceAccountId) {
            await prisma.account.update({ where: { id: tx.sourceAccountId }, data: { balance: { increment: -tx.amount } } })
          } else if (tx.type === 'income' && tx.sourceAccountId) {
            await prisma.account.update({ where: { id: tx.sourceAccountId }, data: { balance: { increment: tx.amount } } })
          }
          // 复制账本关联
          for (const tl of tx.transactionLedgers) {
            await prisma.transactionLedger.create({
              data: { transactionId: newTx.id, ledgerId: tl.ledgerId },
            })
          }
          count++
        }
      }
    }
  }

  revalidatePath('/')
  revalidatePath('/transactions')
  revalidatePath('/reports')

  return { count }
}
