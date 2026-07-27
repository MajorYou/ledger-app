import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'

const SESSION_COOKIE = 'ledger_session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

export interface SessionUser {
  id: string
  name: string
  email: string
  isFamilyHost: boolean
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  const hashed = await hashPassword(password)
  return hashed === hash
}

export async function createSession(userId: string): Promise<void> {
  const token = Buffer.from(`${userId}:${Date.now()}`).toString('base64')
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  })
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
    if (!token) return null

    const decoded = Buffer.from(token, 'base64').toString('utf-8')
    const [userId] = decoded.split(':')
    if (!userId) return null

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, isFamilyHost: true },
    })
    return user
  } catch {
    return null
  }
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}

export function requireAuth(user: SessionUser | null): asserts user is SessionUser {
  if (!user) {
    throw new Error('Unauthorized')
  }
}
