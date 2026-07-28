import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { scanAllDuplicates, resolveDedup } from '@/lib/dedup'

export async function GET(_request: NextRequest) {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const pairs = await scanAllDuplicates()
    return NextResponse.json({ pairs })
  } catch (error) {
    return NextResponse.json(
      { error: `${error instanceof Error ? error.message : ''}` },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { action, keepId, deleteId } = await request.json()
    if (action === 'resolve' && keepId && deleteId) {
      await resolveDedup(keepId, deleteId)
      return NextResponse.json({ success: true })
    }
    return NextResponse.json({ error: '无效操作' }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: `${error instanceof Error ? error.message : ''}` },
      { status: 500 }
    )
  }
}
