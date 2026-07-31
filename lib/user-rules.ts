import { prisma } from '@/lib/db'

export interface RuleCondition {
  field: 'merchant' | 'amount' | 'description' | 'type'
  operator: 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'gt' | 'lt'
  value: string | number
}

export interface RuleAction {
  type: 'reclassify' | 'move_ledger' | 'update_type' | 'update_merchant'
  params: {
    categoryName?: string
    ledgerName?: string
    newType?: 'expense' | 'income' | 'transfer'
    newMerchant?: string
  }
}

export interface UserRuleData {
  id: string
  userId: string
  name: string
  condition: string
  action: string
  priority: number
  isActive: boolean
  source: string
  confidence: number
  createdAt: Date
  updatedAt: Date
}

export interface TransactionInput {
  merchant?: string
  amount?: number
  description?: string
  type?: 'expense' | 'income' | 'transfer'
}

/**
 * 加载用户所有活跃规则，按 priority 降序
 */
export async function loadUserRules(userId: string): Promise<UserRuleData[]> {
  return await prisma.userRule.findMany({
    where: { userId, isActive: true },
    orderBy: { priority: 'desc' },
  })
}

/**
 * 解析规则条件 JSON
 */
function parseCondition(conditionStr: string): RuleCondition | null {
  try {
    return JSON.parse(conditionStr) as RuleCondition
  } catch {
    return null
  }
}

/**
 * 解析规则动作 JSON
 */
export function parseAction(actionStr: string): RuleAction | null {
  try {
    return JSON.parse(actionStr) as RuleAction
  } catch {
    return null
  }
}

/**
 * 检查交易是否匹配规则条件
 */
function matchCondition(condition: RuleCondition, transaction: TransactionInput): boolean {
  const fieldValue = transaction[condition.field]
  
  if (fieldValue === undefined || fieldValue === null) {
    return false
  }

  // 数值比较
  if (condition.operator === 'gt' || condition.operator === 'lt') {
    const numValue = Number(fieldValue)
    const condValue = Number(condition.value)
    if (isNaN(numValue) || isNaN(condValue)) return false
    
    if (condition.operator === 'gt') return numValue > condValue
    if (condition.operator === 'lt') return numValue < condValue
  }

  // 字符串操作
  const strValue = String(fieldValue).toLowerCase()
  const condValue = String(condition.value).toLowerCase()

  switch (condition.operator) {
    case 'contains':
      return strValue.includes(condValue)
    case 'equals':
      return strValue === condValue
    case 'startsWith':
      return strValue.startsWith(condValue)
    case 'endsWith':
      return strValue.endsWith(condValue)
    default:
      return false
  }
}

/**
 * 遍历规则，找到第一个匹配的规则
 */
export function matchRule(
  rules: UserRuleData[],
  transaction: TransactionInput
): { rule: UserRuleData; action: RuleAction } | null {
  for (const rule of rules) {
    const condition = parseCondition(rule.condition)
    if (!condition) continue

    if (matchCondition(condition, transaction)) {
      const action = parseAction(rule.action)
      if (action) {
        return { rule, action }
      }
    }
  }
  return null
}

/**
 * 记录用户反馈，自动学习规则
 * 当用户修正了 AI 的操作时调用
 */
export async function recordFeedback(
  userId: string,
  merchant: string,
  originalCategoryName: string,
  correctedCategoryName: string
): Promise<void> {
  // 查找是否已存在相同商户的规则
  const existingRules = await prisma.userRule.findMany({
    where: {
      userId,
      source: 'auto',
    },
  })

  // 查找匹配相同商户的现有规则（精确匹配 value，不使用 toLowerCase）
  let existingRule: UserRuleData | null = null
  for (const rule of existingRules) {
    try {
      const condition = JSON.parse(rule.condition) as RuleCondition
      if (
        condition.field === 'merchant' &&
        condition.operator === 'contains' &&
        String(condition.value) === merchant
      ) {
        existingRule = rule
        break
      }
    } catch {
      continue
    }
  }

  if (existingRule) {
    // 更新现有规则：增加置信度（clamp 到 1.0），更新动作
    const newConfidence = Math.min((existingRule.confidence ?? 0.5) + 0.1, 1.0)
    await prisma.userRule.update({
      where: { id: existingRule.id },
      data: {
        action: JSON.stringify({
          type: 'reclassify',
          params: { categoryName: correctedCategoryName },
        }),
        confidence: newConfidence,
      },
    })
  } else {
    // 创建新的自动学习规则
    await prisma.userRule.create({
      data: {
        userId,
        name: `自动学习：${merchant} → ${correctedCategoryName}`,
        condition: JSON.stringify({
          field: 'merchant',
          operator: 'contains',
          value: merchant,
        }),
        action: JSON.stringify({
          type: 'reclassify',
          params: { categoryName: correctedCategoryName },
        }),
        priority: 0, // 自动学习规则优先级较低
        isActive: true,
        source: 'auto',
        confidence: 0.5,
      },
    })
  }
}
