'use server'

import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

// ==================== 校验工具 ====================

const VALID_CONDITION_FIELDS = ['merchant', 'amount', 'description', 'type'] as const
const VALID_CONDITION_OPERATORS = ['contains', 'equals', 'startsWith', 'endsWith', 'gt', 'lt'] as const
const VALID_ACTION_TYPES = ['reclassify', 'move_ledger', 'update_type', 'update_merchant'] as const

function validateCondition(conditionStr: string): string | null {
  try {
    const cond = JSON.parse(conditionStr)
    if (!cond || typeof cond !== 'object') return 'condition 必须是对象'
    if (!VALID_CONDITION_FIELDS.includes(cond.field)) return `condition.field 无效: ${cond.field}`
    if (!VALID_CONDITION_OPERATORS.includes(cond.operator)) return `condition.operator 无效: ${cond.operator}`
    if (cond.value === undefined || cond.value === null || cond.value === '') return 'condition.value 不能为空'
    return null
  } catch {
    return 'condition JSON 解析失败'
  }
}

function validateAction(actionStr: string): string | null {
  try {
    const action = JSON.parse(actionStr)
    if (!action || typeof action !== 'object') return 'action 必须是对象'
    if (!VALID_ACTION_TYPES.includes(action.type)) return `action.type 无效: ${action.type}`
    if (!action.params || typeof action.params !== 'object') return 'action.params 不能为空'
    // 根据 action.type 校验必填 params
    switch (action.type) {
      case 'reclassify':
        if (!action.params.categoryName) return 'reclassify 需要 params.categoryName'
        break
      case 'move_ledger':
        if (!action.params.ledgerName) return 'move_ledger 需要 params.ledgerName'
        break
      case 'update_type':
        if (!action.params.newType) return 'update_type 需要 params.newType'
        break
      case 'update_merchant':
        if (!action.params.newMerchant) return 'update_merchant 需要 params.newMerchant'
        break
    }
    return null
  } catch {
    return 'action JSON 解析失败'
  }
}

// ==================== User Rules ====================

export async function createUserRule(data: {
  name: string
  condition: string
  action: string
  priority?: number
  isActive?: boolean
  source?: string
}): Promise<{ success: boolean; error?: string }> {
  const user = await getSession()
  if (!user) return { success: false, error: 'Unauthorized' }

  // 校验 condition 和 action 结构
  const condErr = validateCondition(data.condition)
  if (condErr) return { success: false, error: condErr }
  const actErr = validateAction(data.action)
  if (actErr) return { success: false, error: actErr }

  try {
    await prisma.userRule.create({
      data: {
        userId: user.id,
        name: data.name,
        condition: data.condition,
        action: data.action,
        priority: data.priority ?? 10,
        isActive: data.isActive ?? true,
        source: data.source ?? 'manual',
      },
    })
    revalidatePath('/settings')
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export async function updateUserRule(
  id: string,
  data: {
    name?: string
    condition?: string
    action?: string
    priority?: number
    isActive?: boolean
  }
): Promise<{ success: boolean; error?: string }> {
  const user = await getSession()
  if (!user) return { success: false, error: 'Unauthorized' }

  // 校验 condition 和 action 结构（如果提供了的话）
  if (data.condition !== undefined) {
    const condErr = validateCondition(data.condition)
    if (condErr) return { success: false, error: condErr }
  }
  if (data.action !== undefined) {
    const actErr = validateAction(data.action)
    if (actErr) return { success: false, error: actErr }
  }

  try {
    await prisma.userRule.update({
      where: { id, userId: user.id },
      data,
    })
    revalidatePath('/settings')
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export async function deleteUserRule(id: string): Promise<{ success: boolean; error?: string }> {
  const user = await getSession()
  if (!user) return { success: false, error: 'Unauthorized' }

  try {
    await prisma.userRule.delete({ where: { id, userId: user.id } })
    revalidatePath('/settings')
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export async function getUserRules(): Promise<
  Array<{
    id: string
    name: string
    condition: string
    action: string
    priority: number
    isActive: boolean
    source: string
    confidence: number
    createdAt: Date
  }>
> {
  const user = await getSession()
  if (!user) return []

  const rules = await prisma.userRule.findMany({
    where: { userId: user.id },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
  })

  return rules
}

// ==================== Operation Templates ====================

export async function createTemplate(data: {
  name: string
  triggerPhrases: string[]
  operations: string
}): Promise<{ success: boolean; error?: string }> {
  const user = await getSession()
  if (!user) return { success: false, error: 'Unauthorized' }

  try {
    await prisma.operationTemplate.create({
      data: {
        userId: user.id,
        name: data.name,
        triggerPhrases: JSON.stringify(data.triggerPhrases),
        operations: data.operations,
        isActive: true,
      },
    })
    revalidatePath('/settings')
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export async function updateTemplate(
  id: string,
  data: {
    name?: string
    triggerPhrases?: string[]
    operations?: string
    isActive?: boolean
  }
): Promise<{ success: boolean; error?: string }> {
  const user = await getSession()
  if (!user) return { success: false, error: 'Unauthorized' }

  try {
    const updateData: Record<string, unknown> = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.triggerPhrases !== undefined) updateData.triggerPhrases = JSON.stringify(data.triggerPhrases)
    if (data.operations !== undefined) updateData.operations = data.operations
    if (data.isActive !== undefined) updateData.isActive = data.isActive

    await prisma.operationTemplate.update({
      where: { id, userId: user.id },
      data: updateData,
    })
    revalidatePath('/settings')
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export async function deleteTemplate(id: string): Promise<{ success: boolean; error?: string }> {
  const user = await getSession()
  if (!user) return { success: false, error: 'Unauthorized' }

  try {
    await prisma.operationTemplate.delete({ where: { id, userId: user.id } })
    revalidatePath('/settings')
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export async function getTemplates(): Promise<
  Array<{
    id: string
    name: string
    triggerPhrases: string
    operations: string
    isActive: boolean
    createdAt: Date
  }>
> {
  const user = await getSession()
  if (!user) return []

  const templates = await prisma.operationTemplate.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  })

  return templates
}
