'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function createCategory(_prevState: unknown, formData: FormData): Promise<{ success: boolean }> {
  const name = formData.get('name') as string
  const type = (formData.get('type') as string) || 'expense'
  const icon = (formData.get('icon') as string) || '📦'
  const color = (formData.get('color') as string) || '#6b7280'
  const parentId = (formData.get('parentId') as string) || null

  if (!name) return { success: false }

  await prisma.category.create({
    data: { name, type, icon, color, parentId },
  })

  revalidatePath('/categories')
  return { success: true }
}

export async function updateCategory(id: string, _prevState: unknown, formData: FormData): Promise<{ success: boolean }> {
  const name = formData.get('name') as string
  const type = (formData.get('type') as string) || 'expense'
  const icon = (formData.get('icon') as string) || '📦'
  const color = (formData.get('color') as string) || '#6b7280'
  const parentId = (formData.get('parentId') as string) || null

  if (!name) return { success: false }

  await prisma.category.update({
    where: { id },
    data: { name, type, icon, color, parentId },
  })

  revalidatePath('/categories')
  return { success: true }
}

export async function deleteCategory(id: string): Promise<void> {
  await prisma.category.delete({ where: { id } })
  revalidatePath('/categories')
}

/**
 * 快速创建分类（用于 AI 建议一键创建）
 * 返回新分类的完整信息
 */
export async function quickCreateCategory(
  name: string,
  parentId: string,
  type: string = 'expense',
  icon?: string
): Promise<{ success: boolean; category?: { id: string; name: string; parentId: string; type: string; icon: string }; error?: string }> {
  if (!name || !parentId) {
    return { success: false, error: '分类名和父分类不能为空' }
  }

  try {
    // 检查是否已存在同名同级分类
    const existing = await prisma.category.findFirst({
      where: { name, parentId },
    })
    if (existing) {
      return {
        success: true,
        category: {
          id: existing.id,
          name: existing.name,
          parentId: existing.parentId!,
          type: existing.type,
          icon: existing.icon,
        },
      }
    }

    const category = await prisma.category.create({
      data: {
        name,
        type,
        parentId,
        icon: icon || '📦',
      },
    })

    revalidatePath('/categories')
    revalidatePath('/import')

    return {
      success: true,
      category: {
        id: category.id,
        name: category.name,
        parentId: category.parentId!,
        type: category.type,
        icon: category.icon,
      },
    }
  } catch (error) {
    console.error('quickCreateCategory error:', error)
    return { success: false, error: '创建分类失败' }
  }
}
