'use server'

import { getSetting } from '@/lib/actions/settings'
import OpenAI from 'openai'
import { logger } from '@/lib/logger'

export interface ParsedBillItem {
  transactionDate: string
  postDate: string
  description: string
  merchant: string
  amount: number
  type: 'expense' | 'income'
  category: '还款' | '分期' | '退款' | '消费'
  currency: string
}

export async function parseBillText(rawText: string): Promise<ParsedBillItem[]> {
  const apiKey = await getSetting('DEEPSEEK_API_KEY')
  if (!apiKey) {
    logger.info('bill-parse:no-api-key, using rules')
    return ruleBasedParse(rawText)
  }

  try {
    const baseURL = (await getSetting('DEEPSEEK_BASE_URL')) || 'https://api.deepseek.com'
    const model = (await getSetting('DEEPSEEK_MODEL')) || 'deepseek-chat'
    const client = new OpenAI({ apiKey, baseURL })

    const textSample = rawText.substring(0, 4000)

    const prompt = `从招行信用卡账单文本提取交易，只返回JSON数组：
${textSample}

格式：[{"transactionDate":"2026-07-09","postDate":"2026-07-10","description":"原始描述","merchant":"商户名（去掉财付通-/支付宝-等前缀）","amount":100,"type":"expense","category":"消费","currency":"CNY"}]
规则：还款/退款→income, 消费/分期→expense。`

    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 4000,
    })

    const content = response.choices[0]?.message?.content || ''
    logger.info('bill-parse:llm-response', content.substring(0, 300))

    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const items = JSON.parse(jsonMatch[0]) as ParsedBillItem[]
      if (Array.isArray(items) && items.length > 0) {
        logger.info('bill-parse:llm-ok', { count: items.length })
        return items
      }
    }

    logger.warn('bill-parse:llm-failed, fallback to rules')
    return ruleBasedParse(rawText)
  } catch (err) {
    logger.error('bill-parse:llm-error', { message: err instanceof Error ? err.message : String(err) })
    return ruleBasedParse(rawText)
  }
}

// 规则解析
function ruleBasedParse(rawText: string): ParsedBillItem[] {
  const items: ParsedBillItem[] = []

  // 全局匹配双日期交易: MM/DD MM/DD description amount 4digits amount(CN)
  const txnRegex = /(\d{2}\/\d{2})\s+(\d{2}\/\d{2})\s+(.+?)\s+(-?[\d,]+\.\d{2})\s+(\d{4})\s+(-?[\d,]+\.\d{2})\(?(CN|HK)?\)?/g

  // 单日期还款
  const repayRegex = /(\d{2}\/\d{2})\s+(自动还款)\s+(-[\d,]+\.\d{2})\s+(\d{4})\s+(-[\d,]+\.\d{2})/g

  // 找出分类区域
  const sectionMatches = [...rawText.matchAll(/(还款|退款|消费|分期)(?=\s+\d{2}\/\d{2}|$)/g)]

  // 双日期交易
  const matches = [...rawText.matchAll(txnRegex)]
  for (const match of matches) {
    const [, transDate, postDate, desc, , , origAmount, currency] = match

    if (desc.trim() === '交易摘要') continue
    if (desc.trim().includes('Transaction Details')) continue

    const matchPos = match.index!
    let cat: ParsedBillItem['category'] = '消费'
    for (let i = sectionMatches.length - 1; i >= 0; i--) {
      if (sectionMatches[i].index < matchPos) {
        cat = sectionMatches[i][1] as ParsedBillItem['category']
        break
      }
    }

    let merchant = desc.trim()
      .replace(/^(财付通|支付宝|京东支付|云闪付|掌上生活优惠商户)-/, '')
      .replace(/^（特约）/, '')
      .trim()

    const amount = parseFloat(origAmount.replace(/,/g, ''))
    const isIncome = cat === '还款' || cat === '退款'

    items.push({
      transactionDate: `2026-${transDate}`,
      postDate: `2026-${postDate}`,
      description: desc.trim(),
      merchant,
      amount: Math.abs(amount),
      type: isIncome ? 'income' : 'expense',
      category: cat,
      currency: currency || 'CNY',
    })
  }

  // 单日期还款
  const repayMatches = [...rawText.matchAll(repayRegex)]
  for (const match of repayMatches) {
    const [, date, desc, , , origAmount] = match
    const amount = parseFloat(origAmount.replace(/,/g, ''))
    items.push({
      transactionDate: `2026-${date}`,
      postDate: `2026-${date}`,
      description: desc,
      merchant: '信用卡还款',
      amount: Math.abs(amount),
      type: 'income',
      category: '还款',
      currency: 'CNY',
    })
  }

  logger.info('bill-parse:rule-result', { count: items.length, first5: items.slice(0, 5).map(i => i.merchant) })
  return items
}
