'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'

export async function getSetting(key: string): Promise<string | null> {
  const setting = await prisma.setting.findUnique({ where: { key } })
  return setting?.value ?? null
}

export async function saveSetting(key: string, value: string): Promise<void> {
  const user = await getSession()
  if (!user) throw new Error('Unauthorized')

  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  })

  revalidatePath('/settings')
}

export async function saveSettings(formData: FormData): Promise<void> {
  const user = await getSession()
  if (!user) throw new Error('Unauthorized')

  const entries = Array.from(formData.entries())
  for (const [key, value] of entries) {
    if (typeof value === 'string' && value.trim()) {
      await prisma.setting.upsert({
        where: { key },
        update: { value: value.trim() },
        create: { key, value: value.trim() },
      })
    }
  }

  revalidatePath('/settings')
}

export async function loadAllSettings(): Promise<Record<string, string>> {
  const settings = await prisma.setting.findMany()
  const result: Record<string, string> = {}
  for (const s of settings) {
    result[s.key] = s.value
  }
  return result
}

export async function deleteRule(id: string): Promise<void> {
  await prisma.classificationCache.delete({ where: { id } })
  revalidatePath('/settings')
}
