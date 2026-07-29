import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { parseBillTextAuto } from '@/lib/parsers'
import { logger } from '@/lib/logger'
import { batchCheckDuplicates } from '@/lib/dedup'

export async function POST(request: NextRequest) {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const text = formData.get('text') as string

    if (!text?.trim()) {
      return NextResponse.json({ error: '请粘贴账单文本' }, { status: 400 })
    }

    logger.info('import:text', { length: text.length })
    const items = await parseBillTextAuto(text)
    logger.info('import:done', { count: items.length })

    // 批量检查重复
    const duplicateChecks = items.length > 0
      ? await batchCheckDuplicates(items)
      : []

    const duplicateCount = duplicateChecks.filter(d => d.isDuplicate).length
    if (duplicateCount > 0) {
      logger.info('import:duplicates', { count: duplicateCount })
    }

    return NextResponse.json({
      items, count: items.length,
      duplicateChecks,
      message: items.length > 0
        ? `解析成功：${items.length} 条记录${duplicateCount > 0 ? `，检测到 ${duplicateCount} 笔疑似重复` : ''}`
        : `未识别到交易记录。文本已接收（${text.length} 字），但未匹配到交易格式。请确认是招行信用卡账单`
    })
  } catch (error) {
    logger.error('import:error', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.substring(0, 300) : '',
    })
    return NextResponse.json(
      { error: `解析失败: ${error instanceof Error ? error.message : '未知错误'}`, items: [], count: 0 },
      { status: 500 }
    )
  }
}
