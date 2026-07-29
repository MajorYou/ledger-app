import type { ParsedBillItem } from './types'
import { parseCsvLine } from './types'
import { logger } from '@/lib/logger'

/**
 * 解析微信 CSV 账单文本
 * 微信 CSV 格式：前 16 行是表头/元信息，第 17 行是分隔线 `---...---`，第 18 行是列头
 */
export function parseWechatCsv(text: string): ParsedBillItem[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '')
  const items: ParsedBillItem[] = []

  // 找到列头行（包含"交易时间,交易类型"）
  let headerIdx = -1
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    if (lines[i].includes('交易时间') && lines[i].includes('交易类型')) {
      headerIdx = i
      break
    }
  }

  if (headerIdx === -1) {
    logger.warn('wechat-parser:no-header-found')
    return []
  }

  // 解析数据行（从 headerIdx+1 开始）
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // 跳过分隔线
    if (line.startsWith('---')) continue

    const cols = parseCsvLine(line)
    if (cols.length < 9) continue

    const [
      transactionTime,  // 0: 交易时间
      transactionType,  // 1: 交易类型
      counterpart,      // 2: 交易对方
      description,      // 3: 商品
      incomeExpense,    // 4: 收/支
      amountStr,        // 5: 金额(元)
      paymentMethod,    // 6: 支付方式
      status,           // 7: 当前状态
      orderId,          // 8: 交易单号
      merchantOrderId,  // 9: 商户单号
    ] = cols

    // 过滤：已全额退款的记录跳过
    if (status?.trim() === '已全额退款') continue

    // 解析金额
    const amount = parseFloat((amountStr || '0').replace(/元/g, '').trim())
    if (isNaN(amount) || amount <= 0) continue

    // 类型映射
    let type: ParsedBillItem['type']
    const ie = incomeExpense?.trim() || ''
    const txType = (transactionType || '').trim()

    if (ie === '支出') {
      type = 'expense'
    } else if (ie === '收入') {
      type = 'income'
    } else if (ie === '/' || ie === '不计收支') {
      // 中性交易如"转入零钱通-来自零钱"
      type = 'transfer'
    } else {
      // 交易类型本身包含"转入"/"转出"等关键词
      if (txType.includes('转入') || txType.includes('转出') || txType.includes('零钱通')) {
        type = 'transfer'
      } else {
        type = 'neutral'
      }
    }

    // 过滤 neutral 且金额极小的记录
    if (type === 'neutral' && amount < 0.01) continue

    // 处理交易对方：微信转账格式 "ZHAO小丫 (ZHAO小丫)" → counterpartName + merchant
    let merchant = (counterpart || '').trim()
    let counterpartName: string | undefined
    if (merchant === '/') {
      merchant = (description || '').trim() === '/' ? (transactionType || '').trim() : (description || '').trim()
    } else {
      counterpartName = merchant
    }

    items.push({
      transactionDate: (transactionTime || '').trim(),
      description: (description || '').trim() === '/' ? '' : (description || '').trim(),
      merchant,
      amount,
      type,
      currency: 'CNY',
      paymentMethod: (paymentMethod || '').trim() || undefined,
      channel: '微信',
      transactionStatus: (status || '').trim() || undefined,
      externalOrderId: (orderId || '').trim() || undefined,
      counterpartName: counterpartName || undefined,
      category: txType || undefined,
    })
  }

  logger.info('wechat-parser:parsed', { count: items.length })
  return items
}
