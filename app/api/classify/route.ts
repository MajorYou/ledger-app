import { NextRequest, NextResponse } from 'next/server'
import { classifyTransaction } from '@/lib/ai/classifier'
import { getSession } from '@/lib/auth'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { merchant, description, amount, type, transactionTime } = body

    logger.info('classify:request', { merchant, amount, type, transactionTime })

    if (!amount || !type) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 })
    }

    const result = await classifyTransaction({
      merchant: merchant || '',
      description: description || '',
      amount: parseFloat(amount),
      type,
      transactionTime: transactionTime || undefined,
    })

    logger.info('classify:result', result)
    return NextResponse.json(result)
  } catch (error) {
    logger.error('classify:error', error instanceof Error ? error.message : String(error))
    return NextResponse.json(
      { error: '分类失败' },
      { status: 500 }
    )
  }
}
