export interface ParsedBillItem {
  transactionDate: string
  postDate?: string
  description: string
  merchant: string
  amount: number
  type: 'expense' | 'income' | 'transfer' | 'neutral'
  category?: string
  currency: string
  // 新增字段
  paymentMethod?: string     // "招商银行信用卡(9496)" / "余额宝" / "零钱通"
  channel?: string           // "支付宝" / "微信"
  transactionStatus?: string // "交易成功" / "已全额退款" / "交易关闭" / "支付成功"
  externalOrderId?: string   // 外部订单号
  counterpartName?: string   // 交易对方
}

/**
 * 标准 CSV 行解析：支持引号内逗号和转义引号（双引号）
 */
export function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result.map(s => s.trim())
}
