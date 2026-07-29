import type { ParsedBillItem } from './types'
import { parseCsvLine } from './types'
import { logger } from '@/lib/logger'

/**
 * 解析支付宝 CSV 账单文本
 * 支付宝 CSV 格式：前 23 行是表头/元信息，第 24 行是列头
 */
export function parseAlipayCsv(text: string): ParsedBillItem[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '')
  const items: ParsedBillItem[] = []

  // 找到列头行（包含"交易时间,交易分类"）
  let headerIdx = -1
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    if (lines[i].includes('交易时间') && lines[i].includes('交易分类')) {
      headerIdx = i
      break
    }
  }

  if (headerIdx === -1) {
    logger.warn('alipay-parser:no-header-found')
    return []
  }

  // 解析数据行（从 headerIdx+1 开始）
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // 跳过汇总行
    if (line.startsWith('---') || line.startsWith('合计') || line.startsWith('总计')) continue

    const cols = parseCsvLine(line)
    if (cols.length < 9) continue // 至少需要9列有效数据

    const [
      transactionTime,  // 0: 交易时间
      category,         // 1: 交易分类
      counterpart,      // 2: 交易对方
      _counterpartAcc,  // 3: 对方账号
      description,      // 4: 商品说明
      incomeExpense,    // 5: 收/支
      amountStr,        // 6: 金额
      paymentMethod,    // 7: 收/付款方式
      status,           // 8: 交易状态
      orderId,          // 9: 交易订单号
    ] = cols

    // 过滤规则：跳过"交易关闭"
    if (status?.trim() === '交易关闭') continue

    // 解析金额（去掉"元"后缀和空白）
    const amount = parseFloat((amountStr || '0').replace(/元/g, '').trim())
    if (isNaN(amount) || amount <= 0) continue

    // 类型映射
    let type: ParsedBillItem['type']
    const ie = incomeExpense?.trim() || ''
    if (ie === '支出') {
      type = 'expense'
    } else if (ie === '收入') {
      type = 'income'
    } else if (ie === '不计收支') {
      type = 'neutral'
    } else {
      type = 'neutral'
    }

    // 退款处理：transactionStatus 为 "退款成功" 时，type 设为 "income"
    if (status?.trim() === '退款成功') {
      type = 'income'
    }

    // 过滤规则：跳过 neutral 类型且金额 < 0.1 的记录（余额宝每日收益）
    if (type === 'neutral' && amount < 0.1) continue

    items.push({
      transactionDate: (transactionTime || '').trim(),
      description: (description || '').trim(),
      merchant: (counterpart || '').trim(),
      amount,
      type,
      category: (category || '').trim() || undefined,
      currency: 'CNY',
      paymentMethod: (paymentMethod || '').trim() || undefined,
      channel: '支付宝',
      transactionStatus: (status || '').trim() || undefined,
      externalOrderId: (orderId || '').replace(/[\t\s]/g, '').trim() || undefined,
      counterpartName: (counterpart || '').trim() || undefined,
    })
  }

  logger.info('alipay-parser:parsed', { count: items.length })
  return items
}
