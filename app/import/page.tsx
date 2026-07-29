'use client'

import { useState, useCallback, useEffect, useMemo, useRef, Fragment } from 'react'
import type { ParsedBillItem } from '@/lib/parsers/pdf-parser'
import { detectCategoryName } from '@/lib/category-detector'
import { quickCreateCategory } from '@/lib/actions/categories'
import { SearchableSelect } from '@/components/searchable-select'

interface QualityIssue {
  type: 'error' | 'warning'
  message: string
}

interface DuplicateCheck {
  isDuplicate: boolean
  duplicateScore: number
  duplicateReasons: string[]
}

interface DedupWarningItem {
  merchant: string
  amount: number
  reasons: string[]
}

// 分页常量
const PAGE_SIZE = 50

// 动态加载 PDF.js（仅客户端）
let pdfjsLib: typeof import('pdfjs-dist') | null = null
async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib
  pdfjsLib = await import('pdfjs-dist')
  pdfjsLib!.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`
  return pdfjsLib
}

interface CategoryOption {
  id: string
  name: string
  type: string
  icon?: string
  parentName?: string
}
interface LedgerOption {
  id: string
  name: string
}

// 从 DedupPair 数组中提取警告信息（模块级函数，供 useCallback 引用）
function extractDedupWarningsFn(pairs: Array<{ a: { merchant: string; amount: number }; b: { merchant: string; amount: number }; reasons: string[] }>): DedupWarningItem[] {
  return pairs.map(p => ({
    merchant: p.b.merchant || p.a.merchant,
    amount: p.b.amount || p.a.amount,
    reasons: p.reasons,
  }))
}

// 数据质量检查
function checkDataQuality(item: ParsedBillItem): QualityIssue[] {
  const issues: QualityIssue[] = []

  // 日期检查
  if (!item.transactionDate || item.transactionDate.trim() === '') {
    issues.push({ type: 'error', message: '日期为空' })
  } else {
    const d = new Date(item.transactionDate)
    if (isNaN(d.getTime())) {
      issues.push({ type: 'error', message: '日期无法解析' })
    } else {
      const year = d.getFullYear()
      if (year < 2020 || year > 2030) {
        issues.push({ type: 'error', message: `日期异常(${year}年)` })
      }
    }
  }

  // 金额检查
  if (item.amount === 0 || item.amount < 0.01) {
    issues.push({ type: 'error', message: '金额为0' })
  }
  if (item.amount > 10000) {
    issues.push({ type: 'warning', message: '金额异常大' })
  }

  // 商户检查
  if (!item.merchant || item.merchant.trim() === '') {
    issues.push({ type: 'error', message: '商户缺失' })
  } else if (item.merchant.trim().length < 2) {
    issues.push({ type: 'warning', message: '商户名过短' })
  }

  return issues
}

// 快速创建弹窗的状态
interface QuickCreateState {
  rowIndex: number
  suggestedName: string
  selectedParentId: string
  itemName: string
  creating: boolean
}

// 智能建议状态
interface SmartSuggestion {
  sourceIdx: number      // 触发建议的行索引
  targetIndices: number[] // 相似商户的行索引
  merchant: string        // 相似商户名
  categoryId: string      // 建议的分类ID
  categoryName: string    // 分类名
  dismissed: boolean      // 是否已忽略
}

export default function ImportPage() {
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<ParsedBillItem[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(0)
  const [learned, setLearned] = useState(0)
  const [dedupWarnings, setDedupWarnings] = useState<DedupWarningItem[]>([])
  const [duplicateChecks, setDuplicateChecks] = useState<DuplicateCheck[]>([])
  const [qualityIssues, setQualityIssues] = useState<QualityIssue[][]>([])

  // 导入模式：'precise' 精细导入，'quick' 快速导入
  const [importMode, setImportMode] = useState<'precise' | 'quick'>('precise')
  // 快速导入中的 loading 状态
  const [quickImporting, setQuickImporting] = useState(false)
  // 标记本次导入是否为快速导入（用于汇总卡片展示）
  const [isQuickImportResult, setIsQuickImportResult] = useState(false)

  // 汇总数据
  const [summary, setSummary] = useState<{
    imported: number
    skipped: number
    duplicates: number
    learned: number
    totalAmount: number
    corrections?: number
  } | null>(null)

  // 退款选择弹窗
  const [refundChoice, setRefundChoice] = useState<{
    item: ParsedBillItem
    itemIdx: number
    matches: Array<{ id: string; merchant: string; amount: number; transactionTime: string; categoryName: string | null }>
  } | null>(null)
  const [refundWaiting, setRefundWaiting] = useState(false)
  const [pendingRefundIndices, setPendingRefundIndices] = useState<number[]>([])

  // 可选账本和分类
  const [ledgers, setLedgers] = useState<LedgerOption[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const categoriesRef = useRef<CategoryOption[]>([])
  const [recentCountByType, setRecentCountByType] = useState<{ expense: number; income: number }>({ expense: 0, income: 0 })
  const [selectedLedgerId, setSelectedLedgerId] = useState('')
  // 每笔交易的分类覆盖：Map<index, categoryId>
  const [categoryOverrides, setCategoryOverrides] = useState<Map<number, string>>(new Map())
  // 记录每笔交易的原始检测分类ID（用于检测用户修正）
  const [originalDetectedCatIds, setOriginalDetectedCatIds] = useState<Map<number, string>>(new Map())

  // 智能建议状态
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<number>>(new Set())

  // 快速创建分类弹窗
  const [quickCreate, setQuickCreate] = useState<QuickCreateState | null>(null)

  // 统计预览折叠状态
  const [statsCollapsed, setStatsCollapsed] = useState(false)
  const categoryDistRef = useRef<HTMLDivElement>(null)
  const transactionListRef = useRef<HTMLDivElement>(null)

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1)

  // 加载账本和分类
  useEffect(() => {
    fetch('/api/import/options').then(r => r.json()).then(d => {
      setLedgers(d.ledgers || [])
      setCategories(d.categories || [])
      categoriesRef.current = d.categories || []
      // 计算每种类型的最近使用数量
      const cats = d.categories || []
      const rc = d.recentCount || 0
      let expRc = 0, incRc = 0
      for (let k = 0; k < Math.min(rc, cats.length); k++) {
        if (cats[k].type === 'expense') expRc++
        else if (cats[k].type === 'income') incRc++
      }
      setRecentCountByType({ expense: expRc, income: incRc })
      if (d.ledgers?.length && !selectedLedgerId) setSelectedLedgerId(d.ledgers[0].id)
    }).catch(() => {})
  }, [])

  // 构建选项
  const ledgerOptions = useMemo(() => ledgers.map(l => ({ value: l.id, label: l.name })), [ledgers])

  const categoryOptionsByType = useMemo(() => {
    const result: Record<string, Array<{ value: string; label: string; group?: string }>> = {}
    for (const t of ['expense', 'income']) {
      result[t] = categories
        .filter(c => c.type === t)
        .map(c => ({
          value: c.id,
          label: c.name,
          group: c.parentName || undefined,
        }))
    }
    return result
  }, [categories])

  // 获取父分类选项（用于快速创建弹窗）
  const parentCategoryOptions = useMemo(() => {
    if (!quickCreate) return []
    const itemType = items[quickCreate.rowIndex]?.type || 'expense'
    return categories
      .filter(c => c.type === itemType && !c.parentName)
      .map(c => ({ value: c.id, label: c.name }))
  }, [categories, quickCreate, items])

  const parseApi = useCallback(async (text: string) => {
    setLoading(true)
    setError('')
    setMessage('')
    setItems([])
    setCategoryOverrides(new Map())
    setDuplicateChecks([])
    setQualityIssues([])
    setSummary(null)
    setIsQuickImportResult(false)
    setCurrentPage(1)
    const fd = new FormData()
    fd.append('text', text)
    const res = await fetch('/api/import', { method: 'POST', body: fd })
    const data = await res.json()
    setLoading(false)
    if (data.error) {
      setError(data.error)
      return
    }
    const parsedItems: ParsedBillItem[] = data.items || []
    setMessage(data.message || '')

    // 快速导入模式：跳过预览，直接批量导入
    if (importMode === 'quick') {
      setQuickImporting(true)
      try {
        const batchRes = await fetch('/api/import/batch-confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: parsedItems,
            ledgerId: selectedLedgerId || undefined,
            quickImport: true,
          }),
        })
        const batchData = await batchRes.json()
        if (batchRes.ok && batchData.success !== false) {
          const totalAmount = parsedItems
            .filter(i => i.type === 'expense')
            .reduce((s, i) => s + i.amount, 0)
          const dupCount = (data.duplicateChecks || []).filter((d: DuplicateCheck) => d.isDuplicate).length
          setSummary({
            imported: batchData.summary?.imported ?? parsedItems.length,
            skipped: 0,
            duplicates: dupCount + (batchData.summary?.dedupWarningCount || 0),
            learned: batchData.summary?.learned ?? 0,
            totalAmount,
          })
          setIsQuickImportResult(true)
          if (batchData.dedupWarnings) {
            setDedupWarnings(extractDedupWarningsFn(batchData.dedupWarnings))
          }
        } else {
          setError(batchData.error || '快速导入失败')
        }
      } catch (err) {
        setError(`快速导入失败: ${err instanceof Error ? err.message : '未知错误'}`)
      } finally {
        setQuickImporting(false)
      }
      return
    }

    // 精细导入模式：展示预览列表
    setItems(parsedItems)
    // 记录原始检测分类ID（用于后续检测用户修正）
    const origCatIds = new Map<number, string>()
    for (let i = 0; i < parsedItems.length; i++) {
      const it = parsedItems[i]
      if (it.type === 'expense') {
        const detName = detectCategoryName(it.merchant, it.description)
        if (detName) {
          const cat = categoriesRef.current.find(c => c.name === detName && c.type === 'expense')
          if (cat) origCatIds.set(i, cat.id)
        }
      }
    }
    setOriginalDetectedCatIds(origCatIds)
    // 处理去重标记
    const checks: DuplicateCheck[] = data.duplicateChecks || []
    setDuplicateChecks(checks)
    // 数据质量检查
    const qIssues: QualityIssue[][] = parsedItems.map(it => checkDataQuality(it))
    setQualityIssues(qIssues)
    // 初始勾选：排除重复和质量错误的行
    const initialSelected = new Set<number>()
    for (let i = 0; i < parsedItems.length; i++) {
      const hasError = qIssues[i].some(q => q.type === 'error')
      if (!checks[i]?.isDuplicate && !hasError) {
        initialSelected.add(i)
      }
    }
    setSelected(initialSelected)
  }, [importMode, selectedLedgerId])

  const handleFile = async (file: File) => {
    try {
      setLoading(true)
      setError('')
      setMessage('')
      setItems([])
      setCategoryOverrides(new Map())
      setSummary(null)
      setCurrentPage(1)

      const pdfjs = await loadPdfJs()
      const arrayBuffer = await file.arrayBuffer()
      const doc = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise

      let text = ''
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i)
        const content = await page.getTextContent()
        text += content.items.map((item) => ('str' in item ? item.str : '')).join(' ') + '\n'
      }

      setMessage('文本提取完成，正在解析...')
      await parseApi(text)
    } catch (e) {
      setLoading(false)
      setError(`PDF 处理失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  const handlePaste = async () => {
    const text = prompt('请粘贴招行账单文本内容：')
    if (!text?.trim()) return
    await parseApi(text)
  }

  const toggleSelect = (i: number) => {
    const next = new Set(selected)
    if (next.has(i)) next.delete(i); else next.add(i)
    setSelected(next)
  }

  const selectAll = () => setSelected(new Set(items.map((_, i) => i)))
  const deselectAll = () => setSelected(new Set())

  // 退款选择：删除对应支出
  const handleRefundDelete = async () => {
    if (!refundChoice) return
    setRefundWaiting(true)
    const best = refundChoice.matches[0]
    const res = await fetch('/api/import/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...refundChoice.item,
        refundAction: 'delete_expense',
        deleteExpenseId: best.id,
        ledgerId: selectedLedgerId || undefined,
      }),
    })
    await res.json()
    setRefundChoice(null)
    setRefundWaiting(false)
    setDone((d) => d + 1)
    // 继续导入剩余退款项
    setImporting(true)
    await continueRefundItems(pendingRefundIndices.filter(i => i !== refundChoice.itemIdx))
  }

  // 退款选择：直接新增收入
  const handleRefundAddIncome = async () => {
    if (!refundChoice) return
    setRefundWaiting(true)
    const res = await fetch('/api/import/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...refundChoice.item,
        refundAction: 'add_income',
        ledgerId: selectedLedgerId || undefined,
      }),
    })
    await res.json()
    setRefundChoice(null)
    setRefundWaiting(false)
    setDone((d) => d + 1)
    // 继续导入剩余退款项
    setImporting(true)
    await continueRefundItems(pendingRefundIndices.filter(i => i !== refundChoice.itemIdx))
  }

  const continueRefundItems = async (remaining: number[]) => {
    for (const idx of remaining) {
      const paused = await processSingleItem(items[idx], idx)
      if (paused) return // 又遇到了需要选择的退款，暂停
    }
    setImporting(false)
    setItems((prev) => prev.filter((_, i) => !selected.has(i)))
    setSelected(new Set())
    setCategoryOverrides(new Map())
    setPendingRefundIndices([])
  }

  // 从 DedupPair 数组中提取警告信息
  const extractDedupWarnings = extractDedupWarningsFn

  const handleImport = async () => {
    const toImport = items.filter((_, i) => selected.has(i))
    if (toImport.length === 0) return
    setImporting(true)
    setDone(0)
    setLearned(0)
    setDedupWarnings([])

    // 局部变量跟踪汇总数据（避免 React state 异步问题）
    let localImported = 0
    let localLearned = 0
    let localDedupWarningCount = 0

    // 分离退款项和普通项
    const refundIndices: number[] = []
    const normalItems: Array<{ item: ParsedBillItem; origIdx: number }> = []
    for (const idx of Array.from(selected).sort((a, b) => a - b)) {
      const item = items[idx]
      if (item.type === 'income') {
        refundIndices.push(idx)
      } else {
        normalItems.push({ item, origIdx: idx })
      }
    }

    // 收集用户修正的分类映射
    const corrections: Array<{ merchant: string; originalCategoryId: string; correctedCategoryId: string }> = []
    for (const { item, origIdx } of normalItems) {
      const overrideId = categoryOverrides.get(origIdx)
      if (overrideId) {
        const originalId = originalDetectedCatIds.get(origIdx)
        if (!originalId || originalId !== overrideId) {
          corrections.push({
            merchant: item.merchant,
            originalCategoryId: originalId || '',
            correctedCategoryId: overrideId,
          })
        }
      }
    }

    // 批量处理普通项
    if (normalItems.length > 0) {
      const batchItems = normalItems.map(({ item, origIdx }) => ({
        ...item,
        categoryId: categoryOverrides.get(origIdx) || undefined,
      }))
      try {
        const res = await fetch('/api/import/batch-confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: batchItems, ledgerId: selectedLedgerId || undefined, categoryCorrections: corrections }),
        })
        const data = await res.json()
        if (res.ok && data.success) {
          setDone(d => d + normalItems.length)
          if (data.learned) setLearned(data.learned)
          if (data.summary) {
            localImported = data.summary.imported
            localLearned = data.summary.learned
            localDedupWarningCount = data.summary.dedupWarningCount || 0
          } else {
            localImported = normalItems.length
          }
          if (data.dedupWarnings) {
            setDedupWarnings(prev => [...prev, ...extractDedupWarnings(data.dedupWarnings)])
          }
        } else {
          // 批量接口返回错误，回退到逐条处理
          console.warn('batch-confirm failed:', data.error)
          for (const { item, origIdx } of normalItems) {
            await processSingleItem(item, origIdx)
          }
          localImported = normalItems.length
        }
      } catch (batchErr) {
        // 批量请求异常，回退到逐条处理
        console.warn('batch-confirm exception:', batchErr)
        for (const { item, origIdx } of normalItems) {
          await processSingleItem(item, origIdx)
        }
        localImported = normalItems.length
      }
    }

    // 逐条处理退款项
    setPendingRefundIndices(refundIndices)
    for (const idx of refundIndices) {
      const paused = await processSingleItem(items[idx], idx)
      if (paused) return // 退款弹窗暂停
    }

    // 计算汇总数据
    const selectedItems = items.filter((_, i) => selected.has(i))
    const totalAmount = selectedItems
      .filter(i => i.type === 'expense')
      .reduce((s, i) => s + i.amount, 0)
    const skippedCount = items.length - selected.size

    setSummary({
      imported: localImported,
      skipped: skippedCount,
      duplicates: duplicateCount + localDedupWarningCount,
      learned: localLearned,
      totalAmount,
      corrections: corrections.length,
    })

    setImporting(false)
    setItems((prev) => prev.filter((_, i) => !selected.has(i)))
    setSelected(new Set())
    setCategoryOverrides(new Map())
  }

  const processSingleItem = async (item: ParsedBillItem, idx: number) => {
    const overrideCategoryId = categoryOverrides.get(idx)
    try {
      const res = await fetch('/api/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...item,
          categoryId: overrideCategoryId || undefined,
          ledgerId: selectedLedgerId || undefined,
        }),
      })
      const r = await res.json()
      if (!res.ok) {
        console.error('confirm API error:', r.error)
        setError(r.error || '导入失败')
        return false
      }
      if (r.needRefundChoice) {
        setImporting(false)
        setRefundChoice({ item, itemIdx: idx, matches: r.matches })
        return true // 返回 true 表示暂停了
      }
      setDone((d) => d + 1)
      if (r.learned) setLearned((l) => l + 1)
      if (r.dedupWarnings) {
        setDedupWarnings(prev => [...prev, ...extractDedupWarnings(r.dedupWarnings)])
      }
    } catch (err) {
      console.error('processSingleItem error:', err)
      setError(`导入失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
    return false
  }

  // 统计预览计算（基于选中的交易）
  const statsPreview = useMemo(() => {
    if (items.length === 0) return null
    const selectedItems: Array<{ item: ParsedBillItem; idx: number }> = []
    for (const idx of Array.from(selected).sort((a, b) => a - b)) {
      selectedItems.push({ item: items[idx], idx })
    }
    if (selectedItems.length === 0) return null

    // 按分类分布
    const catMap = new Map<string, { name: string; amount: number; count: number; color: string; icon: string }>()
    let uncategorizedAmount = 0
    let uncategorizedCount = 0

    for (const { item, idx } of selectedItems) {
      if (item.type !== 'expense') continue
      const overrideId = categoryOverrides.get(idx)
      let catName: string | null = null
      let catColor = '#a1a1aa' // zinc-400
      if (overrideId) {
        const cat = categories.find(c => c.id === overrideId)
        catName = cat?.name || null
        if (cat?.icon) catColor = '#71717a' // zinc-500
      } else {
        catName = detectCategoryName(item.merchant, item.description)
        if (catName) {
          const cat = categories.find(c => c.name === catName && c.type === 'expense')
          if (cat) catColor = '#71717a' // zinc-500
        }
      }
      if (catName) {
        const catObj = categories.find(c => c.name === catName && c.type === 'expense')
        const catIcon = catObj?.icon || '📦'
        const existing = catMap.get(catName) || { name: catName, amount: 0, count: 0, color: catColor, icon: catIcon }
        existing.amount += item.amount
        existing.count += 1
        catMap.set(catName, existing)
      } else {
        uncategorizedAmount += item.amount
        uncategorizedCount += 1
      }
    }

    const topCategories = Array.from(catMap.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
    if (uncategorizedCount > 0) {
      topCategories.push({ name: '未分类', amount: uncategorizedAmount, count: uncategorizedCount, color: '#d4d4d8', icon: '📦' })
    }

    // 金额统计
    const expenses = selectedItems.filter(({ item }) => item.type === 'expense')
    const incomes = selectedItems.filter(({ item }) => item.type === 'income')
    const totalExpense = expenses.reduce((s, { item }) => s + item.amount, 0)
    const totalIncome = incomes.reduce((s, { item }) => s + item.amount, 0)
    const allAmounts = selectedItems.map(({ item }) => item.amount)
    const avgAmount = allAmounts.length > 0 ? allAmounts.reduce((s, a) => s + a, 0) / allAmounts.length : 0
    const maxItem = selectedItems.reduce((max, cur) => cur.item.amount > (max?.item.amount || 0) ? cur : max, selectedItems[0])

    // 日期范围
    const dates = selectedItems
      .map(({ item }) => item.transactionDate)
      .filter(Boolean)
      .map(d => new Date(d))
      .filter(d => !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime())
    const minDate = dates.length > 0 ? dates[0] : null
    const maxDate = dates.length > 0 ? dates[dates.length - 1] : null
    const daySpan = minDate && maxDate ? Math.round((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) + 1 : 0

    // 异常检测
    const largeThreshold = avgAmount * 3
    const largeCount = selectedItems.filter(({ item }) => item.amount > largeThreshold && largeThreshold > 0).length
    const threeMonthsAgo = new Date()
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
    const dateAnomalyCount = dates.filter(d => d < threeMonthsAgo).length

    // Top N 分类占比
    const topNAmount = topCategories.filter(c => c.name !== '未分类').reduce((s, c) => s + c.amount, 0)
    const topNPct = totalExpense > 0 ? Math.round(topNAmount / totalExpense * 100) : 0

    return {
      topCategories,
      totalExpense,
      totalIncome,
      avgAmount,
      maxItem: maxItem ? { merchant: maxItem.item.merchant, amount: maxItem.item.amount } : null,
      minDate,
      maxDate,
      daySpan,
      largeCount,
      dateAnomalyCount,
      totalSelected: selectedItems.length,
      topNCount: topCategories.length,
      topNPct,
    }
  }, [items, selected, categoryOverrides, categories])

  const duplicateCount = duplicateChecks.filter(d => d.isDuplicate).length
  const qualityIssueCount = qualityIssues.filter(q => q.length > 0).length
  const expenseCount = items.filter((i) => i.type === 'expense').length
  const incomeCount = items.filter((i) => i.type === 'income').length
  const totalExpense = items.filter((i) => i.type === 'expense').reduce((s, i) => s + i.amount, 0)

  // 商户相似度判断：前4字符相同 或 文本相似度 > 0.6
  const isMerchantSimilar = useCallback((a: string, b: string): boolean => {
    if (!a || !b) return false
    if (a === b) return true
    const aTrim = a.trim()
    const bTrim = b.trim()
    if (aTrim.length >= 4 && bTrim.length >= 4 && aTrim.slice(0, 4) === bTrim.slice(0, 4)) return true
    // 简单文本相似度（基于字符集 Jaccard）
    const setA = new Set(aTrim.split(''))
    const setB = new Set(bTrim.split(''))
    let intersection = 0
    for (const ch of setA) { if (setB.has(ch)) intersection++ }
    const union = setA.size + setB.size - intersection
    return union > 0 && intersection / union > 0.6
  }, [])

  // 计算智能建议（基于 categoryOverrides 派生）
  const smartSuggestions = useMemo<SmartSuggestion[]>(() => {
    if (categoryOverrides.size === 0 || items.length === 0) return []
    const result: SmartSuggestion[] = []
    for (const [idx, catId] of categoryOverrides.entries()) {
      if (dismissedSuggestions.has(idx)) continue
      // 仅当用户修改的分类与原始检测不同时才触发
      const origCatId = originalDetectedCatIds.get(idx)
      if (origCatId === catId) continue
      const item = items[idx]
      if (!item) continue
      const cat = categories.find(c => c.id === catId)
      if (!cat) continue
      // 找相似商户
      const targetIndices: number[] = []
      for (let j = 0; j < items.length; j++) {
        if (j === idx) continue
        if (categoryOverrides.has(j)) continue // 已手动修改的跳过
        if (items[j].type !== item.type) continue
        if (isMerchantSimilar(item.merchant, items[j].merchant)) {
          targetIndices.push(j)
        }
      }
      if (targetIndices.length > 0) {
        result.push({
          sourceIdx: idx,
          targetIndices,
          merchant: item.merchant,
          categoryId: catId,
          categoryName: cat.name,
          dismissed: false,
        })
      }
    }
    return result
  }, [categoryOverrides, items, categories, isMerchantSimilar, dismissedSuggestions, originalDetectedCatIds])

  // 应用智能建议：批量修改相似商户的分类
  const applySmartSuggestion = useCallback((suggestion: SmartSuggestion) => {
    setCategoryOverrides(prev => {
      const next = new Map(prev)
      for (const ti of suggestion.targetIndices) {
        next.set(ti, suggestion.categoryId)
      }
      return next
    })
    // 标记该建议为已处理
    setDismissedSuggestions(prev => new Set(prev).add(suggestion.sourceIdx))
  }, [])

  // 忽略智能建议
  const dismissSmartSuggestion = useCallback((sourceIdx: number) => {
    setDismissedSuggestions(prev => new Set(prev).add(sourceIdx))
  }, [])

  // 获取某条交易的实际分类（覆盖 > 预测 > null）
  const getEffectiveCategory = (item: ParsedBillItem, idx: number): string | null => {
    if (categoryOverrides.has(idx)) {
      const cat = categories.find(c => c.id === categoryOverrides.get(idx))
      return cat?.name || null
    }
    if (item.type === 'income') return item.category === '还款' ? '其他收入' : '其他收入'
    return detectCategoryName(item.merchant, item.description)
  }

  // 判断某行是否无法匹配分类
  const isUnmatchedRow = (item: ParsedBillItem, idx: number): boolean => {
    if (categoryOverrides.has(idx)) return false
    if (item.type === 'income') return false
    return detectCategoryName(item.merchant, item.description) === null
  }

  // 打开快速创建分类弹窗
  const openQuickCreate = (idx: number) => {
    const item = items[idx]
    // 默认建议一个分类名（基于商户名）
    const suggestedName = item.merchant || '新分类'
    // 默认选第一个顶级分类作为父分类
    const itemType = item.type || 'expense'
    const defaultParent = categories.find(c => c.type === itemType && !c.parentName)
    setQuickCreate({
      rowIndex: idx,
      suggestedName,
      selectedParentId: defaultParent?.id || '',
      itemName: item.merchant || item.description,
      creating: false,
    })
  }

  // 执行快速创建
  const handleQuickCreate = async () => {
    if (!quickCreate) return
    setQuickCreate({ ...quickCreate, creating: true })

    const itemType = items[quickCreate.rowIndex]?.type || 'expense'
    const result = await quickCreateCategory(
      quickCreate.suggestedName,
      quickCreate.selectedParentId,
      itemType
    )

    if (result.success && result.category) {
      const cat = result.category
      // 添加新分类到本地列表
      const newCat: CategoryOption = {
        id: cat.id,
        name: cat.name,
        type: cat.type,
        parentName: categories.find(c => c.id === quickCreate.selectedParentId)?.name,
      }
      setCategories(prev => [...prev, newCat])
      // 自动应用到对应行
      setCategoryOverrides(prev => {
        const next = new Map(prev)
        next.set(quickCreate.rowIndex, cat.id)
        return next
      })
    }
    setQuickCreate(null)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-zinc-900 mb-2">导入账单</h1>
      <p className="text-sm text-zinc-500 mb-6">支持招行信用卡 PDF 账单，或粘贴文本</p>

      {items.length === 0 && !loading && !summary && !quickImporting && (
        <div className="bg-white rounded-xl border border-dashed border-zinc-300 p-12 text-center">
          <p className="text-4xl mb-4">📄</p>
          <p className="text-zinc-600 mb-2">上传招行信用卡 PDF 账单</p>
          <p className="text-xs text-zinc-400 mb-6">或粘贴账单文本</p>
          <div className="flex justify-center gap-3">
            <label className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 cursor-pointer transition-colors">
              选择 PDF 文件
              <input type="file" accept=".pdf" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </label>
            <button onClick={handlePaste}
              className="px-4 py-2 bg-zinc-100 text-zinc-700 rounded-lg text-sm font-medium hover:bg-zinc-200 transition-colors">
              粘贴文本
            </button>
          </div>
        </div>
      )}

      {/* 导入模式选择 */}
      {items.length === 0 && !loading && !summary && !quickImporting && (
        <div className="mt-5">
          <p className="text-sm font-medium text-zinc-700 mb-3">选择导入模式：</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setImportMode('precise')}
              className={`rounded-xl border-2 p-4 text-left transition-all ${
                importMode === 'precise'
                  ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200'
                  : 'border-zinc-200 bg-white hover:border-zinc-300'
              }`}
            >
              <p className="text-lg font-semibold text-zinc-900 mb-1">📋 精细导入</p>
              <p className="text-xs text-zinc-500">解析后展示预览列表，逐行检查/修改分类，确认后导入</p>
            </button>
            <button
              type="button"
              onClick={() => setImportMode('quick')}
              className={`rounded-xl border-2 p-4 text-left transition-all ${
                importMode === 'quick'
                  ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200'
                  : 'border-zinc-200 bg-white hover:border-zinc-300'
              }`}
            >
              <p className="text-lg font-semibold text-zinc-900 mb-1">⚡ 快速导入</p>
              <p className="text-xs text-zinc-500">解析后直接导入，跳过预览，交易标记为“待审核”</p>
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="text-center py-12">
          <p className="text-2xl mb-2">🤖</p>
          <p className="text-zinc-500">{message || '正在解析账单...'}</p>
        </div>
      )}

      {quickImporting && (
        <div className="text-center py-12">
          <p className="text-2xl mb-2">⚡</p>
          <p className="text-zinc-500">正在快速导入...</p>
        </div>
      )}

      {/* 导入完成汇总卡片 */}
      {summary && items.length === 0 && !loading && !importing && !quickImporting && (
        <div className="bg-white rounded-xl border border-zinc-200 p-6 mb-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="text-xl">✅</span>
            <h2 className="text-lg font-semibold text-zinc-900">导入完成</h2>
            {isQuickImportResult && (
              <span className="ml-2 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">待审核</span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
            {/* 成功导入 */}
            <div className={`${isQuickImportResult ? 'bg-yellow-50' : 'bg-emerald-50'} rounded-lg p-4 text-center`}>
              <p className={`text-2xl font-bold ${isQuickImportResult ? 'text-yellow-600' : 'text-emerald-600'}`}>{summary.imported}</p>
              <p className={`text-xs ${isQuickImportResult ? 'text-yellow-600' : 'text-emerald-600'} mt-1`}>
                {isQuickImportResult ? '已导入（待审核）' : '成功导入'}
              </p>
              <p className={`text-xs ${isQuickImportResult ? 'text-yellow-500' : 'text-emerald-500'} mt-0.5`}>¥{summary.totalAmount.toFixed(2)}</p>
            </div>
            {/* 跳过 */}
            <div className="bg-zinc-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-zinc-500">{summary.skipped}</p>
              <p className="text-xs text-zinc-500 mt-1">跳过（未勾选）</p>
            </div>
            {/* 疑似重复 */}
            <div className="bg-orange-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-orange-500">{summary.duplicates}</p>
              <p className="text-xs text-orange-500 mt-1">疑似重复（已排除）</p>
            </div>
            {/* 学习规则 */}
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{summary.learned}</p>
              <p className="text-xs text-blue-500 mt-1">新学习规则</p>
            </div>
          </div>
          {/* 分类修正提示 */}
          {summary.corrections && summary.corrections > 0 && (
            <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 mb-5">
              <div className="flex items-center gap-2">
                <span className="text-sm">🧠</span>
                <span className="text-xs font-semibold text-violet-700">
                  已记忆 {summary.corrections} 条分类修正，下次导入同一商户时将自动应用
                </span>
              </div>
            </div>
          )}
          {/* 重复警告详情 */}
          {dedupWarnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm">⚠️</span>
                <span className="text-xs font-semibold text-amber-700">{dedupWarnings.length} 笔疑似重复交易已导入，建议检查</span>
              </div>
              <div className="space-y-1">
                {dedupWarnings.slice(0, 3).map((w, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-amber-600">
                    <span className="truncate">{w.merchant}</span>
                    <span className="shrink-0">¥{w.amount.toFixed(2)}</span>
                  </div>
                ))}
                {dedupWarnings.length > 3 && (
                  <p className="text-xs text-amber-400">...还有 {dedupWarnings.length - 3} 笔</p>
                )}
              </div>
              <a href="/dedup" className="text-xs text-amber-700 underline hover:text-amber-800 mt-2 inline-block">
                前往去重页面查看 →
              </a>
            </div>
          )}
          <div className="flex items-center gap-3">
            {isQuickImportResult ? (
              <>
                <a
                  href="/transactions?confirmed=false"
                  className="px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600 transition-colors"
                >
                  去审核 →
                </a>
                <a
                  href="/transactions"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  查看刚导入的交易 →
                </a>
              </>
            ) : (
              <a
                href="/transactions"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                查看刚导入的交易 →
              </a>
            )}
            <button
              onClick={() => { setSummary(null); setError(''); setMessage(''); setIsQuickImportResult(false) }}
              className="px-4 py-2 bg-zinc-100 text-zinc-700 rounded-lg text-sm font-medium hover:bg-zinc-200 transition-colors"
            >
              继续导入
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600 mb-4">{error}</div>
      )}

      {message && !error && !loading && !summary && !quickImporting && (
        <div className={`rounded-xl p-4 text-sm mb-4 ${
          items.length > 0 ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-amber-50 border border-amber-200 text-amber-700'
        }`}>{message}</div>
      )}

      {importing && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-600 mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span>正在导入 {done}/{selected.size}...</span>
            {learned > 0 && <span>🧠 已学习 {learned} 条分类规则</span>}
          </div>
          <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${selected.size > 0 ? Math.min(done / selected.size * 100, 100) : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* 重复交易警告 */}
      {!importing && dedupWarnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">⚠️</span>
            <span className="text-sm font-semibold text-amber-700">发现 {dedupWarnings.length} 笔疑似重复交易</span>
          </div>
          <div className="space-y-1.5 mb-3">
            {dedupWarnings.map((w, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-amber-600">
                <span className="truncate">{w.merchant}</span>
                <span className="shrink-0">¥{w.amount.toFixed(2)}</span>
                <span className="text-xs text-amber-400 shrink-0">疑似与已有交易重复</span>
              </div>
            ))}
          </div>
          <a href="/dedup" className="text-sm text-amber-700 underline hover:text-amber-800">
            前往去重页面查看 →
          </a>
        </div>
      )}

      {/* 退款选择弹窗 */}
      {refundChoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-amber-600 mb-2">🔄 检测到退款交易</h3>
            <p className="text-sm text-zinc-600 mb-3">
              <span className="font-medium">{refundChoice.item.merchant}</span>{' '}
              退款 ¥{refundChoice.item.amount.toFixed(2)}
              （{refundChoice.item.transactionDate}）
            </p>
            {refundChoice.matches.length > 0 && (
              <>
                <p className="text-sm text-zinc-600 mb-2">找到以下可能对应的支出记录：</p>
                <div className="bg-zinc-50 rounded-lg p-3 mb-4 space-y-2 max-h-32 overflow-y-auto">
                  {refundChoice.matches.slice(0, 5).map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-700 truncate flex-1 mr-2">{m.merchant}</span>
                      <span className="text-xs text-zinc-400">{m.transactionTime}</span>
                      <span className="text-red-500 text-xs ml-2">-¥{m.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            <p className="text-xs text-zinc-400 mb-4">选择处理方式：</p>
            <div className="flex gap-3">
              <button
                onClick={handleRefundAddIncome}
                disabled={refundWaiting}
                className="flex-1 px-4 py-2.5 border border-zinc-200 rounded-lg text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
              >
                ➕ 新增收入
              </button>
              {refundChoice.matches.length > 0 && (
                <button
                  onClick={handleRefundDelete}
                  disabled={refundWaiting}
                  className="flex-1 px-4 py-2.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
                >
                  🗑 抵消支出
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 快速创建分类弹窗 */}
      {quickCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-amber-600 mb-2">📁 快速创建分类</h3>
            <p className="text-sm text-zinc-500 mb-4">
              为 <span className="font-medium text-zinc-700">{quickCreate.itemName}</span> 创建新分类
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">分类名称</label>
                <input
                  type="text"
                  value={quickCreate.suggestedName}
                  onChange={(e) => setQuickCreate({ ...quickCreate, suggestedName: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">父分类</label>
                <SearchableSelect
                  options={parentCategoryOptions}
                  value={quickCreate.selectedParentId}
                  onChange={(v) => setQuickCreate({ ...quickCreate, selectedParentId: v })}
                  placeholder="选择父分类"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setQuickCreate(null)}
                className="flex-1 px-4 py-2 border border-zinc-200 rounded-lg text-sm font-medium hover:bg-zinc-50"
              >
                取消
              </button>
              <button
                onClick={handleQuickCreate}
                disabled={quickCreate.creating || !quickCreate.suggestedName.trim() || !quickCreate.selectedParentId}
                className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
              >
                {quickCreate.creating ? '创建中...' : '创建并应用'}
              </button>
            </div>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <>
          {/* 账本选择 + 操作 */}
          <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-zinc-500">账本:</span>
                <SearchableSelect
                  options={ledgerOptions}
                  value={selectedLedgerId}
                  onChange={setSelectedLedgerId}
                  placeholder="选择账本"
                  size="sm"
                  className="w-32"
                />
              </div>
              <div className="flex gap-4 text-sm">
                <span className="text-zinc-500">共 {items.length} 笔</span>
                <span className="text-red-500">支出 {expenseCount} 笔 ¥{totalExpense.toFixed(2)}</span>
                <span className="text-green-500">收入 {incomeCount} 笔</span>
              </div>
              {duplicateCount > 0 && (
                <span className="text-sm text-amber-600 font-medium">
                  ⚠️ 检测到 {duplicateCount} 笔疑似重复交易，已自动取消勾选
                </span>
              )}
              {qualityIssueCount > 0 && (
                <span className="text-sm text-red-500 font-medium">
                  {qualityIssueCount} 条数据异常
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-xs text-blue-500 hover:underline">全选</button>
              <button onClick={deselectAll} className="text-xs text-zinc-400 hover:underline">取消全选</button>
              <button onClick={handleImport} disabled={selected.size === 0 || importing}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
                导入选中 ({selected.size})
              </button>
            </div>
          </div>



          {/* 统计预览 */}
          {statsPreview && (
            <div className="bg-white rounded-xl border border-zinc-200 mb-3">
              <button
                onClick={() => setStatsCollapsed(!statsCollapsed)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors rounded-xl"
              >
                <span>📊 统计预览</span>
                <span className="text-zinc-400 text-xs">{statsCollapsed ? '▶ 展开' : '▼ 收起'}</span>
              </button>
              {!statsCollapsed && (
                <>
                <div className="px-4 pb-4 space-y-4">
                  {/* 按分类分布 */}
                  {statsPreview.topCategories.length > 0 && (
                    <div ref={categoryDistRef}>
                      <h4 className="text-xs font-medium text-zinc-500 mb-2">按分类分布（Top {statsPreview.topCategories.length}）</h4>
                      <div className="space-y-1.5">
                        {statsPreview.topCategories.map((cat) => {
                          const pct = statsPreview.totalExpense > 0 ? (cat.amount / statsPreview.totalExpense * 100) : 0
                          return (
                            <div key={cat.name} className="flex items-center gap-2 text-xs">
                              <span className="w-20 text-zinc-600 truncate shrink-0" title={cat.name}>
                                <span className="mr-1">{cat.icon}</span>{cat.name}
                              </span>
                              <div className="flex-1 h-4 bg-zinc-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: cat.color }}
                                />
                              </div>
                              <span className="w-20 text-right text-zinc-500 shrink-0">¥{cat.amount.toFixed(2)}</span>
                              <span className="w-10 text-right text-zinc-400 shrink-0">{pct.toFixed(0)}%</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* 金额统计 */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-zinc-50 rounded-lg p-3 text-center">
                      <p className="text-xs text-zinc-500 mb-1">总金额</p>
                      <p className="text-sm font-bold text-red-500">-¥{statsPreview.totalExpense.toFixed(2)}</p>
                      {statsPreview.totalIncome > 0 && (
                        <p className="text-xs text-green-500 mt-0.5">+¥{statsPreview.totalIncome.toFixed(2)} 收入</p>
                      )}
                    </div>
                    <div className="bg-zinc-50 rounded-lg p-3 text-center">
                      <p className="text-xs text-zinc-500 mb-1">平均单笔</p>
                      <p className="text-sm font-bold text-zinc-700">¥{statsPreview.avgAmount.toFixed(2)}</p>
                    </div>
                    <div className="bg-zinc-50 rounded-lg p-3 text-center">
                      <p className="text-xs text-zinc-500 mb-1">最大单笔</p>
                      <p className="text-sm font-bold text-zinc-700">¥{statsPreview.maxItem?.amount.toFixed(2) || '0.00'}</p>
                      {statsPreview.maxItem && (
                        <p className="text-xs text-zinc-400 mt-0.5 truncate" title={statsPreview.maxItem.merchant}>{statsPreview.maxItem.merchant}</p>
                      )}
                    </div>
                  </div>

                  {/* 日期范围 */}
                  {statsPreview.minDate && statsPreview.maxDate && (
                    <div className="text-xs text-zinc-500 text-center">
                      {statsPreview.minDate.toISOString().slice(0, 10)} 至 {statsPreview.maxDate.toISOString().slice(0, 10)}，共 {statsPreview.daySpan} 天
                    </div>
                  )}

                  {/* 异常高亮 */}
                  <div className="flex flex-wrap gap-2">
                    {statsPreview.largeCount > 0 && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                        <span>⚠️</span>
                        <span>存在 {statsPreview.largeCount} 笔大额交易（超过平均值 3 倍）</span>
                      </div>
                    )}
                    {statsPreview.dateAnomalyCount > 0 && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                        <span>⚠️</span>
                        <span>存在 {statsPreview.dateAnomalyCount} 笔日期异常交易（不在近 3 个月内）</span>
                      </div>
                    )}
                  </div>
                </div>
                {/* 汇总行 */}
                <div className="px-4 pb-3 flex items-center justify-between text-xs border-t border-zinc-100 pt-3">
                  <div className="flex items-center gap-3">
                    <span className="text-zinc-500">
                      共 {statsPreview.totalSelected} 笔交易，¥{statsPreview.totalExpense.toFixed(2)}（前 {statsPreview.topNCount} 名分类占 {statsPreview.topNPct}%）
                    </span>
                    {categoryOverrides.size > 0 && (
                      <button
                        onClick={() => transactionListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                        className="flex items-center gap-1 px-2 py-0.5 bg-violet-50 border border-violet-200 rounded text-violet-600 hover:bg-violet-100 transition-colors"
                      >
                        <span>🧠</span>
                        <span>已修正 {categoryOverrides.size} 笔分类</span>
                      </button>
                    )}
                  </div>
                  {statsPreview.topCategories.length > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => categoryDistRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                        className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 rounded text-blue-600 hover:bg-blue-100 transition-colors"
                      >
                        <span>📊</span>
                        <span>查看分类详情</span>
                      </button>
                      <button
                        onClick={() => transactionListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                        className="flex items-center gap-1 px-2 py-0.5 bg-zinc-100 border border-zinc-200 rounded text-zinc-600 hover:bg-zinc-200 transition-colors"
                      >
                        <span>📝</span>
                        <span>查看交易列表</span>
                      </button>
                    </div>
                  )}
                </div>
                </>
              )}
            </div>
          )}

          {/* 分页提示 */}
          {items.length > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-t-xl text-xs text-zinc-500">
              <span>共 {items.length} 笔交易，当前显示第 {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, items.length)} 笔</span>
              <span>第 {currentPage} 页，共 {Math.ceil(items.length / PAGE_SIZE)} 页</span>
            </div>
          )}

          <div ref={transactionListRef} className={`bg-white rounded-xl border border-zinc-200 divide-y divide-zinc-100 max-h-[60vh] overflow-y-auto${items.length > PAGE_SIZE ? ' rounded-t-none border-t-0' : ''}`}>
            {items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((item, sliceIdx) => {
              const i = (currentPage - 1) * PAGE_SIZE + sliceIdx
              const unmatched = isUnmatchedRow(item, i)
              const isDup = duplicateChecks[i]?.isDuplicate
              const dupScore = duplicateChecks[i]?.duplicateScore || 0
              const dupReasons = duplicateChecks[i]?.duplicateReasons || []
              const dupTooltip = isDup ? `疑似与已有交易重复（相似度 ${Math.round(dupScore * 100)}%）${dupReasons.length > 0 ? '：' + dupReasons.join('，') : ''}` : ''
              const qIssuesForRow = qualityIssues[i] || []
              return (
                <Fragment key={i}>
                <div
                  className={`flex items-center gap-2 p-3 text-sm hover:bg-zinc-50 ${
                    selected.has(i) ? '' : 'opacity-40'
                  } ${unmatched ? 'bg-amber-50/70' : ''} ${isDup ? 'bg-orange-50/50' : ''}`}
                  title={dupTooltip}
                >
                  <input type="checkbox" checked={selected.has(i)} onChange={() => toggleSelect(i)} className="rounded shrink-0" />
                  {isDup && (
                    <span className="text-orange-400 shrink-0" title={dupTooltip}>⚠️</span>
                  )}
                  <span className="text-zinc-400 w-20 shrink-0 text-xs">{item.transactionDate}</span>
                  <span className="flex-1 truncate">
                    <span className="text-zinc-900">{item.merchant}</span>
                    {item.description !== item.merchant && (
                      <span className="text-zinc-400 text-xs ml-1">({item.description})</span>
                    )}
                  </span>
                  {/* 数据质量标签 */}
                  {qIssuesForRow.length > 0 && (
                    <span className="flex gap-1 shrink-0 flex-wrap justify-end">
                      {qIssuesForRow.map((q, qi) => (
                        <span key={qi} className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium leading-tight whitespace-nowrap ${
                          q.type === 'error' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
                        }`} title={q.message}>
                          {q.message}
                        </span>
                      ))}
                    </span>
                  )}
                  <span className="text-xs text-zinc-400 w-10 shrink-0">{item.category}</span>
                  {/* 分类下拉 */}
                  <div className="flex items-center gap-1 w-36 shrink-0">
                    <SearchableSelect
                      options={categoryOptionsByType[item.type] || []}
                      value={categoryOverrides.get(i) || ''}
                      onChange={(v) => {
                        const next = new Map(categoryOverrides)
                        if (v) next.set(i, v); else next.delete(i)
                        setCategoryOverrides(next)
                      }}
                      placeholder={getEffectiveCategory(item, i) || '—'}
                      size="sm"
                      className="flex-1"
                      recentCount={recentCountByType[item.type as keyof typeof recentCountByType] || 0}
                    />
                    {unmatched && (
                      <button
                        type="button"
                        onClick={() => openQuickCreate(i)}
                        className="shrink-0 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium hover:bg-amber-200 transition-colors whitespace-nowrap"
                        title="创建新分类"
                      >
                        +新
                      </button>
                    )}
                  </div>
                  <span className={`font-medium w-24 text-right shrink-0 ${item.type === 'income' ? 'text-green-500' : 'text-red-500'}`}>
                    {item.type === 'income' ? '+' : '-'}¥{item.amount.toFixed(2)}
                  </span>
                  <span className="text-xs text-zinc-300 w-8 text-right shrink-0">{item.currency}</span>
                </div>
                {/* 智能建议条 */}
                {smartSuggestions.filter(s => s.sourceIdx === i).map(suggestion => (
                  <div key={`sug-${i}`} className="bg-blue-50 border-x border-blue-200 px-4 py-2.5 flex items-center gap-3 text-sm">
                    <span className="shrink-0">📝</span>
                    <span className="text-blue-700 flex-1">
                      还有 <strong>{suggestion.targetIndices.length}</strong> 笔交易商户类似（&lsquo;{suggestion.merchant}&rsquo;），是否一起修改为 <strong>[{suggestion.categoryName}]</strong>？
                    </span>
                    <button
                      onClick={() => applySmartSuggestion(suggestion)}
                      className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition-colors shrink-0"
                    >
                      全部修改
                    </button>
                    <button
                      onClick={() => dismissSmartSuggestion(i)}
                      className="px-3 py-1 bg-white border border-zinc-200 text-zinc-500 rounded text-xs font-medium hover:bg-zinc-50 transition-colors shrink-0"
                    >
                      忽略
                    </button>
                  </div>
                ))}
              </Fragment>
              )
            })}
          </div>

          {/* 分页控件 */}
          {items.length > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-3 mt-3 mb-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← 上一页
              </button>
              <span className="text-xs text-zinc-500">
                第 {currentPage} / {Math.ceil(items.length / PAGE_SIZE)} 页
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(Math.ceil(items.length / PAGE_SIZE), p + 1))}
                disabled={currentPage >= Math.ceil(items.length / PAGE_SIZE)}
                className="px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                下一页 →
              </button>
            </div>
          )}
        </>
      )}

    </div>
  )
}
