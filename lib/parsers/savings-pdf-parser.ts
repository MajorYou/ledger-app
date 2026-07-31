'use server'

import { getSetting } from '@/lib/actions/settings'
import OpenAI from 'openai'
import { logger } from '@/lib/logger'
import type { ParsedBillItem } from './types'

export async function parseSavingsPdf(rawText: string): Promise<ParsedBillItem[]> {
  const apiKey = await getSetting('DEEPSEEK_API_KEY')
  if (!apiKey) {
    logger.info('savings-parse:no-api-key, using rules')
    return ruleBasedParse(rawText)
  }

  try {
    const baseURL = (await getSetting('DEEPSEEK_BASE_URL')) || 'https://api.deepseek.com'
    const model = (await getSetting('DEEPSEEK_MODEL')) || 'deepseek-chat'
    const client = new OpenAI({ apiKey, baseURL })

    const textSample = rawText.substring(0, 4000)

    const prompt = `从招商银行储蓄卡交易流水文本中提取交易记录，只返回JSON数组。

每笔交易格式：
{
  "transactionDate": "YYYY-MM-DD",
  "amount": 数字(正数),
  "type": "expense|income|transfer",
  "description": "交易摘要原文",
  "merchant": "对手方/商户名",
  "channel": "支付渠道",
  "paymentMethod": "招商银行储蓄卡(XXXX)",
  "currency": "CNY"
}

规则：
1. 从文本头部提取账号后四位填入 paymentMethod 的 XXXX
2. 金额为负 → expense，金额为正 → income
3. 但以下情况 type=transfer：
   - 理财产品相关：朝朝宝、朝朝盈、朝朝盈2号、日日宝、日日盈、朝招金、天添盈 的转入/转出
   - 跨行转出、跨行转入
4. 交易摘要中如包含支付渠道信息，提取到 channel 字段：
   - 银联快捷支付 → "银联"
   - 一网通支付 → "一网通"
   - 财付通快捷支付 → "微信"
   - 支付宝 → "支付宝"
   - 京东支付 → "京东"
   - 美团支付 → "美团"
5. merchant 填对手方名称（去掉支付渠道前缀）
6. 跳过"合并统计"、"币种"等汇总行和表头行
7. description 保留交易摘要原文

文本：
${textSample}`

    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 4000,
    })

    const content = response.choices[0]?.message?.content || ''
    logger.info('savings-parse:llm-response', content.substring(0, 300))

    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const items = JSON.parse(jsonMatch[0]) as ParsedBillItem[]
      if (Array.isArray(items) && items.length > 0) {
        logger.info('savings-parse:llm-ok', { count: items.length })
        return items
      }
    }

    logger.warn('savings-parse:llm-failed, fallback to rules')
    return ruleBasedParse(rawText)
  } catch (err) {
    logger.error('savings-parse:llm-error', { message: err instanceof Error ? err.message : String(err) })
    return ruleBasedParse(rawText)
  }
}

function ruleBasedParse(rawText: string): ParsedBillItem[] {
  const items: ParsedBillItem[] = []

  // 1. 提取账号后四位
  const accountMatch = rawText.match(/账号[：:]\s*\d{4}\*{8}(\d{4})/)
  const last4 = accountMatch ? accountMatch[1] : '0000'
  const paymentMethod = `招商银行储蓄卡(${last4})`

  // 2. 关键词字典
  const CHANNEL_MAP: Record<string, string> = {
    '银联快捷支付': '银联',
    '一网通支付': '一网通',
    '财付通快捷支付': '微信',
    '支付宝': '支付宝',
    '京东支付': '京东',
    '美团支付': '美团',
  }

  const WEALTH_PRODUCTS = ['朝朝宝', '朝朝盈2号', '朝朝盈', '日日盈', '日日宝', '朝招金', '天添盈']

  const TRANSFER_KEYWORDS = [
    '跨行转出', '跨行转入',
    '朝朝宝转出', '朝朝宝转入',
    '朝朝盈转出', '朝朝盈转入',
    '朝朝盈2号转出', '朝朝盈2号转入',
    '日日宝转出', '日日宝转入',
    '日日盈转出', '日日盈转入',
    '朝招金转出', '朝招金转入',
    '天添盈转出', '天添盈转入',
  ]

  // 3. 以日期为锚点匹配交易行
  // 格式：日期 CNY 金额(含负号和千分位) 余额 剩余文本
  const txnRegex = /(\d{4}-\d{2}-\d{2})\s*CNY\s*(-?[\d,]+\.\d{2})\s*([\d,]+\.\d{2})\s*([\s\S]+?)(?=\d{4}-\d{2}-\d{2}\s*CNY|$)/g

  const matches = [...rawText.matchAll(txnRegex)]

  for (const match of matches) {
    const [, date, rawAmount, , rawRest] = match

    // 截断汇总段：最后一笔交易的 rest 可能包含后续的汇总信息
    let rest = rawRest
    const summaryIdx = rest.indexOf('合并统计')
    if (summaryIdx !== -1) {
      rest = rest.substring(0, summaryIdx)
    }

    // 跳过汇总行和表头行
    if (rest.includes('合并统计') || rest.includes('币种') || rest.includes('合并收入') || rest.includes('合并支出')) {
      continue
    }
    if (rest.includes('Transaction Type') || rest.includes('Date') || rest.includes('Currency')) {
      continue
    }

    // 解析金额
    const amount = parseFloat(rawAmount.replace(/,/g, ''))
    const absAmount = Math.abs(amount)

    // 提取交易摘要和对手信息
    // rest 包含交易摘要 + 对手信息（可能连在一起）
    const restTrimmed = rest.trim()

    // 判断类型
    let type: 'expense' | 'income' | 'transfer' = amount < 0 ? 'expense' : 'income'

    // 检查是否为转账（理财/跨行）
    for (const keyword of TRANSFER_KEYWORDS) {
      if (restTrimmed.includes(keyword)) {
        type = 'transfer'
        break
      }
    }
    // 检查理财产品关键词
    if (type !== 'transfer') {
      for (const product of WEALTH_PRODUCTS) {
        if (restTrimmed.includes(product)) {
          type = 'transfer'
          break
        }
      }
    }

    // 提取 channel
    let channel = ''
    let channelKey = ''
    for (const [key, value] of Object.entries(CHANNEL_MAP)) {
      if (restTrimmed.includes(key)) {
        channel = value
        channelKey = key
        break
      }
    }

    // 提取 merchant：去掉 channel 关键词后的剩余文本
    // rest 可能包含交易摘要和对手信息，尝试分离
    let description = restTrimmed
    let merchant = restTrimmed

    // 如果有 channel 关键词，merchant 去掉 channel 前缀
    if (channelKey) {
      merchant = restTrimmed.replace(channelKey, '').trim()
    }

    // 尝试分离交易摘要和对手信息
    // 摘要通常在前，对手信息在后
    // 对于储蓄卡流水，摘要和对手信息在文本中可能直接拼接
    // 取前部分作为 description，后部分作为 merchant
    // 简单策略：如果有换行或明显分隔，取第一段为摘要
    const parts = restTrimmed.split(/\s{2,}/)
    if (parts.length >= 2) {
      description = parts[0].trim()
      // merchant 取去掉 channel 后的部分
      merchant = parts.slice(1).join(' ').trim()
      if (channelKey) {
        merchant = merchant.replace(channelKey, '').trim()
      }
    } else {
      description = restTrimmed
      // merchant 尝试去掉 channel 关键词
      if (channelKey) {
        merchant = restTrimmed.replace(channelKey, '').trim()
      }
    }

    // 清理 merchant 中可能残留的换行/空白
    merchant = merchant.replace(/\s+/g, ' ').trim()
    description = description.replace(/\s+/g, ' ').trim()

    items.push({
      transactionDate: date,
      description,
      merchant: merchant || description,
      amount: absAmount,
      type,
      channel: channel || undefined,
      paymentMethod,
      currency: 'CNY',
    })
  }

  logger.info('savings-parse:rule-result', { count: items.length, first5: items.slice(0, 5).map(i => i.merchant) })
  return items
}
