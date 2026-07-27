'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function createCategory(formData: FormData): Promise<void> {
  const name = formData.get('name') as string
  const type = (formData.get('type') as string) || 'expense'
  const icon = (formData.get('icon') as string) || '📦'
  const color = (formData.get('color') as string) || '#6b7280'
  const parentId = (formData.get('parentId') as string) || null

  if (!name) return

  await prisma.category.create({
    data: { name, type, icon, color, parentId },
  })

  revalidatePath('/categories')
}

export async function updateCategory(id: string, formData: FormData): Promise<void> {
  const name = formData.get('name') as string
  const type = (formData.get('type') as string) || 'expense'
  const icon = (formData.get('icon') as string) || '📦'
  const color = (formData.get('color') as string) || '#6b7280'
  const parentId = (formData.get('parentId') as string) || null

  if (!name) return

  await prisma.category.update({
    where: { id },
    data: { name, type, icon, color, parentId },
  })

  revalidatePath('/categories')
}

export async function deleteCategory(id: string): Promise<void> {
  await prisma.category.delete({ where: { id } })
  revalidatePath('/categories')
}
