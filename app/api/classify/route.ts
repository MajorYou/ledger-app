import { NextRequest, NextResponse } from 'next/server'
import { classifyTransaction } from '@/lib/ai/classifier'
import { getSession } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { merchant, description, amount, type } = body

    if (!amount || !type) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 })
    }

    const result = await classifyTransaction({
      merchant: merchant || '',
      description: description || '',
      amount: parseFloat(amount),
      type,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Classification API error:', error)
    return NextResponse.json(
      { error: '分类失败' },
      { status: 500 }
    )
  }
}
