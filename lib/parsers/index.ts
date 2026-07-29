import { parseBillText as parseCmbPdf } from './pdf-parser'
import { parseAlipayCsv } from './alipay-parser'
import { parseWechatCsv } from './wechat-parser'
import type { ParsedBillItem } from './types'

export type BillFormat = 'alipay-csv' | 'wechat-csv' | 'cmb-pdf' | 'unknown'

export function detectFormat(text: string): BillFormat {
  if (text.includes('支付宝交易明细') || text.includes('支付宝支付科技有限公司')) {
    return 'alipay-csv'
  }
  // 微信格式检测：
  // 1. 元数据关键字（CSV 直接导出或 XLSX 转 CSV 后保留的元信息）
  if (text.includes('微信支付账单明细') || text.includes('微信昵称')) {
    return 'wechat-csv'
  }
  // 2. 微信账单列头指纹（XLSX 转 CSV 后元数据行可能丢失，但列头结构不变）
  //    微信特有列：交易时间 + 交易类型 + 收/支 + 支付方式
  if (text.includes('交易时间') && text.includes('交易类型') &&
      text.includes('收/支') && text.includes('支付方式')) {
    return 'wechat-csv'
  }
  // 其他（可能是 PDF 文本）→ cmb-pdf
  return 'cmb-pdf'
}

/**
 * 合并组合支付：同一 externalOrderId 的多条记录合并为一条
 * - 金额求和
 * - paymentMethod 取第一个非空值（主要支付方式）
 * - 其他字段取第一条记录的值
 */
function mergeCombinedPayments(items: ParsedBillItem[]): ParsedBillItem[] {
  const orderMap = new Map<string, ParsedBillItem>()

  for (const item of items) {
    // 没有 externalOrderId 的或 neutral/transfer 类型不合并
    if (!item.externalOrderId || item.type === 'neutral' || item.type === 'transfer') {
      continue
    }

    const existing = orderMap.get(item.externalOrderId)
    if (existing) {
      // 合并：金额求和
      existing.amount += item.amount
      // paymentMethod 保留第一个（主要支付方式）
      // 其他字段保持不变
    } else {
      orderMap.set(item.externalOrderId, { ...item })
    }
  }

  // 按原始顺序输出合并后的记录
  const seen = new Set<string>()
  const merged: ParsedBillItem[] = []

  for (const item of items) {
    if (!item.externalOrderId || item.type === 'neutral' || item.type === 'transfer') {
      merged.push(item)
      continue
    }

    if (seen.has(item.externalOrderId)) continue
    seen.add(item.externalOrderId)

    const orderItem = orderMap.get(item.externalOrderId)
    if (orderItem) {
      merged.push(orderItem)
    }
  }

  return merged
}

export async function parseBillTextAuto(text: string): Promise<ParsedBillItem[]> {
  const format = detectFormat(text)
  let items: ParsedBillItem[]
  switch (format) {
    case 'alipay-csv': items = parseAlipayCsv(text); break
    case 'wechat-csv': items = parseWechatCsv(text); break
    case 'cmb-pdf': items = await parseCmbPdf(text); break
    default: return []
  }
  return mergeCombinedPayments(items)
}

export type { ParsedBillItem } from './types'
