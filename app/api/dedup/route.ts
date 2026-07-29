import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { scanAllDuplicates, scanMergeSuggestions, resolveDedup, skipDedupPair, mergeWithOffset, batchUpdateCategory, batchMarkAsFixed } from '@/lib/dedup'
import { revalidatePath } from 'next/cache'

export async function GET(request: NextRequest) {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const type = request.nextUrl.searchParams.get('type')

  try {
    if (type === 'merge') {
      const groups = await scanMergeSuggestions()
      return NextResponse.json({ groups })
    }
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
    const body = await request.json()
    const { action, keepId, deleteId, idA, idB, transactionIds, categoryId } = body

    if (action === 'resolve' && keepId && deleteId) {
      await resolveDedup(keepId, deleteId)
      revalidatePath('/')
      revalidatePath('/transactions')
      revalidatePath('/reports')
      return NextResponse.json({ success: true })
    }

    if (action === 'skip' && idA && idB) {
      await skipDedupPair(idA, idB)
      return NextResponse.json({ success: true })
    }

    if (action === 'offset' && keepId && deleteId) {
      const result = await mergeWithOffset(keepId, deleteId)
      revalidatePath('/')
      revalidatePath('/transactions')
      revalidatePath('/reports')
      return NextResponse.json({ success: true, newAmount: result.newAmount })
    }

    if (action === 'batchCategory' && transactionIds && categoryId) {
      const result = await batchUpdateCategory(transactionIds, categoryId)
      revalidatePath('/')
      revalidatePath('/transactions')
      revalidatePath('/reports')
      return NextResponse.json(result)
    }

    if (action === 'markFixed' && transactionIds) {
      const result = await batchMarkAsFixed(transactionIds)
      revalidatePath('/')
      revalidatePath('/transactions')
      revalidatePath('/reports')
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: '无效操作' }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: `${error instanceof Error ? error.message : ''}` },
      { status: 500 }
    )
  }
}
