/**
 * 临时测试脚本：测试招行储蓄卡PDF规则引擎解析器
 * 由于 ruleBasedParse 未导出，且 parseSavingsPdf 依赖 'use server' + getSetting，
 * 此脚本直接复制 ruleBasedParse 的核心逻辑进行独立测试。
 *
 * 用法：npx tsx scripts/test-savings-parser.ts
 */

import type { ParsedBillItem } from '../lib/parsers/types'

// ===== 从 savings-pdf-parser.ts 复制的 ruleBasedParse 逻辑 =====
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

    const restTrimmed = rest.trim()

    // 判断类型
    let type: 'expense' | 'income' | 'transfer' = amount < 0 ? 'expense' : 'income'

    for (const keyword of TRANSFER_KEYWORDS) {
      if (restTrimmed.includes(keyword)) {
        type = 'transfer'
        break
      }
    }
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

    let description = restTrimmed
    let merchant = restTrimmed

    if (channelKey) {
      merchant = restTrimmed.replace(channelKey, '').trim()
    }

    const parts = restTrimmed.split(/\s{2,}/)
    if (parts.length >= 2) {
      description = parts[0].trim()
      merchant = parts.slice(1).join(' ').trim()
      if (channelKey) {
        merchant = merchant.replace(channelKey, '').trim()
      }
    } else {
      description = restTrimmed
      if (channelKey) {
        merchant = restTrimmed.replace(channelKey, '').trim()
      }
    }

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

  return items
}

// ===== 测试数据 =====
// 格式1：位置排序后的实际格式（字段间有空格，行间有换行）
// 这是修复 use-import-state.ts 后 pdfjs-dist 提取的正确文本格式
const sampleTextCorrected = `招商银行交易流水 Transaction Statement of China Merchants Bank 2026-07-20 -- 2026-07-25
户 名：游旻祯 Name 账户类型：ALL/全币种 Account Type
申请时间：2026-07-27 17:17:52 Date
账号：6214********4076 Account No
开 户 行：上海张江支行 Sub Branch
验 证 码：KH9434CK Verification Code
记账日期 货币 交易金额 联机余额 交易摘要 对手信息
Date Currency Transaction Amount Balance Transaction Type Counter Party
2026-07-20 CNY 30.00 30.00 汇入汇款 上海市松江区佘山镇社区党群服 务中心
2026-07-21 CNY -10.00 20.00 信用卡还款 游旻祯
2026-07-21 CNY 1.80 21.80 一网通支付鼓励金 其它应收款-零售客户移动支付 鼓励金专户
2026-07-22 CNY 8,678.20 8,700.00 朝朝宝转出 待清算电子汇差-代销理财快赎 投资
2026-07-22 CNY -8,700.00 0.00 银联快捷支付 微信转账
合并统计 合并收入(+) 合并支出(-)
币种 CNY 8,710.00 -8,710.00`

// 格式3：模拟 pdfjs-dist 内容流顺序返回导致的跨行拼接 bug
// 旧代码 content.items.map(...).join(' ') 按内容流顺序拼接
// 上一行末尾文字与下一行开头日期直接拼接，无换行，仅靠 join 的空格分隔
// 但某些 PDF 的 content stream 中相邻 item 可能无空格，导致直接拼接
// 例如："...社区党群服" + "2026-07-21" → "...社区党群服2026-07-21"
// 这正是正则 lookahead 需要 \s*CNY 的原因
const sampleTextContentStreamOrder = `招商银行交易流水 Transaction Statement of China Merchants Bank 2026-07-20 -- 2026-07-25 户 名：游旻祯 Name 账户类型：ALL/全币种 Account Type 申请时间：2026-07-27 17:17:52 Date 账号：6214********4076 Account No 开 户 行：上海张江支行 Sub Branch 验 证 码：KH9434CK Verification Code 记账日期 货币 交易金额 联机余额 交易摘要 对手信息 Date Currency Transaction Amount Balance Transaction Type Counter Party 2026-07-20 CNY 30.00 30.00 汇入汇款 上海市松江区佘山镇社区党群服 务中心2026-07-21 CNY -10.00 20.00 信用卡还款 游旻祯2026-07-21 CNY 1.80 21.80 一网通支付鼓励金 其它应收款-零售客户移动支付 鼓励金专户2026-07-22 CNY 8,678.20 8,700.00 朝朝宝转出 待清算电子汇差-代销理财快赎 投资2026-07-22 CNY -8,700.00 0.00 银联快捷支付 微信转账 合并统计 合并收入(+) 合并支出(-) 币种 CNY 8,710.00 -8,710.00`

// 格式2：原始无空格格式（修复前的旧格式，用于对比测试）
const sampleTextOriginal = `招商银行交易流水 Transaction Statement of China Merchants Bank 2026-07-20 -- 2026-07-25 户  名：游旻祯 Name 账户类型：ALL/全币种 Account Type 申请时间：2026-07-27 17:17:52 Date 账号：6214********4076 Account No 开 户 行：上海张江支行 Sub Branch 验 证 码：KH9434CK Verification Code 记账日期货币交易金额联机余额交易摘要对手信息 DateCurrencyTransaction AmountBalanceTransaction TypeCounter Party 2026-07-20CNY30.0030.00汇入汇款 上海市松江区佘山镇社区党群服 务中心 2026-07-21CNY-10.0020.00信用卡还款游旻祯 2026-07-21CNY1.8021.80一网通支付鼓励金 其它应收款-零售客户移动支付 鼓励金专户 2026-07-22CNY8,678.208,700.00朝朝宝转出 待清算电子汇差-代销理财快赎 投资 2026-07-22CNY-8,700.000.00银联快捷支付微信转账 合并统计合并收入(+)合并支出(-) 币种 CNY8,710.00-8,710.00`

// ===== 预期结果 =====
const expected = [
  { date: '2026-07-20', amount: 30.00, type: 'income', desc: '汇入汇款', channel: undefined },
  { date: '2026-07-21', amount: 10.00, type: 'expense', desc: '信用卡还款', channel: undefined },
  { date: '2026-07-21', amount: 1.80, type: 'income', desc: '一网通支付鼓励金', channel: '一网通' },
  { date: '2026-07-22', amount: 8678.20, type: 'transfer', desc: '朝朝宝转出', channel: undefined },
  { date: '2026-07-22', amount: 8700.00, type: 'expense', desc: '银联快捷支付', channel: '银联' },
]

// ===== 测试函数 =====
function runTest(label: string, sampleText: string): number {
  console.log(`\n${'='.repeat(50)}`)
  console.log(`测试: ${label}`)
  console.log(`${'='.repeat(50)}`)
  console.log('输入文本长度:', sampleText.length, '字符\n')

  const results = ruleBasedParse(sampleText)

  console.log(`解析结果：共 ${results.length} 笔交易\n`)

  for (let i = 0; i < results.length; i++) {
    const item = results[i]
    console.log(`交易 #${i + 1}: ${item.transactionDate} | ${item.amount} | ${item.type} | ${item.description} | merchant=${item.merchant} | channel=${item.channel || '(无)'}`)
  }

  // 验证
  console.log('\n--- 验证 ---')
  let pass = 0
  let fail = 0

  if (results.length !== 5) {
    console.log(`❌ 交易数量：期望 5 笔，实际 ${results.length} 笔`)
    fail++
  } else {
    console.log(`✅ 交易数量：5 笔`)
    pass++
  }

  for (let i = 0; i < Math.min(results.length, expected.length); i++) {
    const r = results[i]
    const e = expected[i]
    const errors: string[] = []

    if (r.transactionDate !== e.date) errors.push(`date: 期望 ${e.date}, 实际 ${r.transactionDate}`)
    if (Math.abs(r.amount - e.amount) > 0.001) errors.push(`amount: 期望 ${e.amount}, 实际 ${r.amount}`)
    if (r.type !== e.type) errors.push(`type: 期望 ${e.type}, 实际 ${r.type}`)
    if (e.channel !== undefined && r.channel !== e.channel) errors.push(`channel: 期望 ${e.channel}, 实际 ${r.channel}`)
    if (!r.description.includes(e.desc)) errors.push(`description 应包含 "${e.desc}", 实际 "${r.description}"`)

    if (errors.length === 0) {
      console.log(`✅ 交易 #${i + 1} (${e.date} ${e.amount}): 全部字段正确`)
      pass++
    } else {
      console.log(`❌ 交易 #${i + 1} (${e.date} ${e.amount}):`)
      errors.forEach(err => console.log(`   - ${err}`))
      fail++
    }
  }

  // 检查 paymentMethod
  const pm = results[0]?.paymentMethod
  if (pm === '招商银行储蓄卡(4076)') {
    console.log(`✅ paymentMethod: ${pm}`)
    pass++
  } else {
    console.log(`❌ paymentMethod: 期望 "招商银行储蓄卡(4076)", 实际 "${pm}"`)
    fail++
  }

  // 检查汇总行是否被跳过
  const hasSummary = results.some(r => r.description.includes('合并统计') || r.description.includes('币种'))
  if (!hasSummary) {
    console.log(`✅ 汇总行已正确跳过`)
    pass++
  } else {
    console.log(`❌ 汇总行未被跳过`)
    fail++
  }

  console.log(`\n--- ${label}: ${pass} 通过, ${fail} 失败 ---`)
  return pass
}

// ===== 执行测试 =====
console.log('=== 招行储蓄卡PDF规则引擎解析器测试 ===')

const pass1 = runTest('格式1: 位置排序后（空格+换行）', sampleTextCorrected)
const pass2 = runTest('格式2: 原始无空格格式（对比）', sampleTextOriginal)
const pass3 = runTest('格式3: pdfjs-dist内容流顺序（跨行拼接bug复现）', sampleTextContentStreamOrder)

console.log(`\n\n=== 总结 ===`)
console.log(`格式1（修复后）: ${pass1} 通过`)
console.log(`格式2（修复前）: ${pass2} 通过`)
console.log(`格式3（跨行拼接bug）: ${pass3} 通过`)

// 输出格式1的完整 JSON
console.log('\n\n=== 格式1 完整 JSON 输出 ===\n')
console.log(JSON.stringify(ruleBasedParse(sampleTextCorrected), null, 2))
