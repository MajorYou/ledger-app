'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function createLedger(formData: FormData): Promise<void> {
  const name = formData.get('name') as string
  const type = (formData.get('type') as string) || 'daily'
  const color = (formData.get('color') as string) || '#3b82f6'
  const parentId = (formData.get('parentId') as string) || null

  if (!name) return

  await prisma.ledger.create({
    data: { name, type, color, parentId },
  })

  revalidatePath('/ledgers')
}

export async function updateLedger(id: string, formData: FormData): Promise<void> {
  const name = formData.get('name') as string
  const type = (formData.get('type') as string) || 'daily'
  const color = (formData.get('color') as string) || '#3b82f6'
  const parentId = (formData.get('parentId') as string) || null

  if (!name) return

  await prisma.ledger.update({
    where: { id },
    data: { name, type, color, parentId },
  })

  revalidatePath('/ledgers')
}

export async function deleteLedger(id: string): Promise<void> {
  await prisma.ledger.delete({ where: { id } })
  revalidatePath('/ledgers')
}
