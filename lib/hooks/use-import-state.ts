'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import type { ParsedBillItem } from '@/lib/parsers'
import { detectCategoryName } from '@/lib/category-detector'
import { quickCreateCategory } from '@/lib/actions/categories'

// ── 导出类型 ──────────────────────────────────────────────

export interface QualityIssue {
  type: 'error' | 'warning'
  message: string
}

export interface DuplicateCheck {
  isDuplicate: boolean
  duplicateScore: number
  duplicateReasons: string[]
}

export interface DedupWarningItem {
  merchant: string
  amount: number
  reasons: string[]
}

export interface QuickCreateState {
  rowIndex: number
  suggestedName: string
  selectedParentId: string
  itemName: string
  creating: boolean
}

export interface SmartSuggestion {
  sourceIdx: number
  targetIndices: number[]
  merchant: string
  categoryId: string
  categoryName: string
  dismissed: boolean
}

export interface CategoryOption {
  id: string
  name: string
  type: string
  icon?: string
  parentName?: string
}

export interface LedgerOption {
  id: string
  name: string
}

export interface ImportSummary {
  imported: number
  skipped: number
  duplicates: number
  learned: number
  totalAmount: number
  corrections?: number
}

// ── 常量 ──────────────────────────────────────────────────

export const PAGE_SIZE = 50

// ── 模块级工具函数 ────────────────────────────────────────

let pdfjsLib: typeof import('pdfjs-dist') | null = null
async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib
  pdfjsLib = await import('pdfjs-dist')
  pdfjsLib!.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`
  return pdfjsLib
}

export function extractDedupWarningsFn(
  pairs: Array<{ a: { merchant: string; amount: number }; b: { merchant: string; amount: number }; reasons: string[] }>
): DedupWarningItem[] {
  return pairs.map(p => ({
    merchant: p.b.merchant || p.a.merchant,
    amount: p.b.amount || p.a.amount,
    reasons: p.reasons,
  }))
}

export function checkDataQuality(item: ParsedBillItem): QualityIssue[] {
  const issues: QualityIssue[] = []
  if (!item.transactionDate || item.transactionDate.trim() === '') {
    issues.push({ type: 'error', message: '日期为空' })
  } else {
    const d = new Date(item.transactionDate)
    if (isNaN(d.getTime())) {
      issues.push({ type: 'error', message: '日期无法解析' })
    } else {
      const year = d.getFullYear()
      if (year < 2020 || year > 2030) issues.push({ type: 'error', message: `日期异常(${year}年)` })
    }
  }
  if (item.amount === 0 || item.amount < 0.01) issues.push({ type: 'error', message: '金额为0' })
  if (item.amount > 10000) issues.push({ type: 'warning', message: '金额异常大' })
  if (!item.merchant || item.merchant.trim() === '') {
    issues.push({ type: 'error', message: '商户缺失' })
  } else if (item.merchant.trim().length < 2) {
    issues.push({ type: 'warning', message: '商户名过短' })
  }
  return issues
}

// ── Hook ──────────────────────────────────────────────────

export function useImportState() {
  // 文件解析状态
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

  // 导入模式
  const [importMode, setImportMode] = useState<'precise' | 'quick'>('precise')
  const [quickImporting, setQuickImporting] = useState(false)
  const [isQuickImportResult, setIsQuickImportResult] = useState(false)

  // 汇总
  const [summary, setSummary] = useState<ImportSummary | null>(null)

  // 退款弹窗
  const [refundChoice, setRefundChoice] = useState<{
    item: ParsedBillItem
    itemIdx: number
    matches: Array<{ id: string; merchant: string; amount: number; transactionTime: string; categoryName: string | null }>
  } | null>(null)
  const [refundWaiting, setRefundWaiting] = useState(false)
  const [pendingRefundIndices, setPendingRefundIndices] = useState<number[]>([])

  // 账本和分类
  const [ledgers, setLedgers] = useState<LedgerOption[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const categoriesRef = useRef<CategoryOption[]>([])
  const [recentCountByType, setRecentCountByType] = useState<{ expense: number; income: number }>({ expense: 0, income: 0 })
  const [selectedLedgerId, setSelectedLedgerId] = useState('')
  const [categoryOverrides, setCategoryOverrides] = useState<Map<number, string>>(new Map())
  const [originalDetectedCatIds, setOriginalDetectedCatIds] = useState<Map<number, string>>(new Map())

  // 智能建议
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<number>>(new Set())

  // 快速创建分类弹窗
  const [quickCreate, setQuickCreate] = useState<QuickCreateState | null>(null)

  // 统计折叠
  const [statsCollapsed, setStatsCollapsed] = useState(false)
  const categoryDistRef = useRef<HTMLDivElement>(null)
  const transactionListRef = useRef<HTMLDivElement>(null)

  // 分页
  const [currentPage, setCurrentPage] = useState(1)

  // 加载账本和分类
  useEffect(() => {
    fetch('/api/import/options').then(r => r.json()).then(d => {
      setLedgers(d.ledgers || [])
      setCategories(d.categories || [])
      categoriesRef.current = d.categories || []
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

  // ── 计算属性 ────────────────────────────────────────────

  const ledgerOptions = useMemo(() => ledgers.map(l => ({ value: l.id, label: l.name })), [ledgers])

  const categoryOptionsByType = useMemo(() => {
    const result: Record<string, Array<{ value: string; label: string; group?: string }>> = {}
    for (const t of ['expense', 'income']) {
      result[t] = categories
        .filter(c => c.type === t)
        .map(c => ({ value: c.id, label: c.name, group: c.parentName || undefined }))
    }
    return result
  }, [categories])

  const parentCategoryOptions = useMemo(() => {
    if (!quickCreate) return []
    const itemType = items[quickCreate.rowIndex]?.type || 'expense'
    return categories
      .filter(c => c.type === itemType && !c.parentName)
      .map(c => ({ value: c.id, label: c.name }))
  }, [categories, quickCreate, items])

  // ── 核心业务逻辑 ────────────────────────────────────────

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
    if (data.error) { setError(data.error); return }
    const parsedItems: ParsedBillItem[] = data.items || []
    setMessage(data.message || '')

    if (importMode === 'quick') {
      setQuickImporting(true)
      try {
        const batchRes = await fetch('/api/import/batch-confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: parsedItems, ledgerId: selectedLedgerId || undefined, quickImport: true }),
        })
        const batchData = await batchRes.json()
        if (batchRes.ok && batchData.success !== false) {
          const totalAmount = parsedItems.filter(i => i.type === 'expense').reduce((s, i) => s + i.amount, 0)
          const dupCount = (data.duplicateChecks || []).filter((d: DuplicateCheck) => d.isDuplicate).length
          setSummary({
            imported: batchData.summary?.imported ?? parsedItems.length,
            skipped: 0,
            duplicates: dupCount + (batchData.summary?.dedupWarningCount || 0),
            learned: batchData.summary?.learned ?? 0,
            totalAmount,
          })
          setIsQuickImportResult(true)
          if (batchData.dedupWarnings) setDedupWarnings(extractDedupWarningsFn(batchData.dedupWarnings))
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

    // 精细导入
    setItems(parsedItems)
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
    const checks: DuplicateCheck[] = data.duplicateChecks || []
    setDuplicateChecks(checks)
    const qIssues: QualityIssue[][] = parsedItems.map(it => checkDataQuality(it))
    setQualityIssues(qIssues)
    const initialSelected = new Set<number>()
    for (let i = 0; i < parsedItems.length; i++) {
      const hasError = qIssues[i].some(q => q.type === 'error')
      if (!checks[i]?.isDuplicate && !hasError) initialSelected.add(i)
    }
    setSelected(initialSelected)
  }, [importMode, selectedLedgerId])

  const handleFile = async (file: File) => {
    try {
      setLoading(true); setError(''); setMessage(''); setItems([])
      setCategoryOverrides(new Map()); setSummary(null); setCurrentPage(1)
      let text = ''
      if (file.name.toLowerCase().endsWith('.xlsx')) {
        const buffer = await file.arrayBuffer()
        const workbook = XLSX.read(buffer)
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        text = XLSX.utils.sheet_to_csv(sheet)
      } else if (file.name.toLowerCase().endsWith('.csv')) {
        const buffer = await file.arrayBuffer()
        text = new TextDecoder('utf-8').decode(new Uint8Array(buffer))
        if (!text.includes('交易时间') && !text.includes('交易分类')) {
          try {
            const gbkText = new TextDecoder('gbk').decode(new Uint8Array(buffer))
            if (gbkText.includes('交易时间') || gbkText.includes('交易分类') ||
                gbkText.includes('支付宝') || gbkText.includes('微信支付')) text = gbkText
          } catch { /* GBK 解码失败 */ }
        }
      } else {
        const pdfjs = await loadPdfJs()
        const arrayBuffer = await file.arrayBuffer()
        const doc = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i)
          const content = await page.getTextContent()
          // Sort by position (y desc = top-to-bottom, x asc = left-to-right)
          // pdfjs-dist returns items in content-stream order, not visual order
          const sorted = [...content.items].sort((a, b) => {
            const ay = (a as any).transform?.[5] ?? 0
            const by = (b as any).transform?.[5] ?? 0
            const ax = (a as any).transform?.[4] ?? 0
            const bx = (b as any).transform?.[4] ?? 0
            const yDiff = by - ay // higher y = higher on page (PDF coords)
            if (Math.abs(yDiff) > 5) return yDiff
            return ax - bx
          })
          let prevY: number | null = null
          let pageText = ''
          for (const item of sorted) {
            if (!('str' in item)) continue
            const y = (item as any).transform?.[5] ?? null
            if (prevY !== null && y !== null && Math.abs(y - prevY) > 5) {
              pageText += '\n'
            } else if (pageText.length > 0) {
              pageText += ' '
            }
            pageText += item.str
            prevY = y
          }
          text += pageText + '\n'
        }
      }
      setMessage('文本提取完成，正在解析...')
      await parseApi(text)
    } catch (e) {
      setLoading(false)
      setError(`文件处理失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  const handlePaste = async () => {
    const text = prompt('请粘贴账单文本内容（招行PDF/支付宝CSV/微信CSV）：')
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

  const processSingleItem = async (item: ParsedBillItem, idx: number): Promise<boolean> => {
    const overrideCategoryId = categoryOverrides.get(idx)
    try {
      const res = await fetch('/api/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...item, categoryId: overrideCategoryId || undefined, ledgerId: selectedLedgerId || undefined }),
      })
      const r = await res.json()
      if (!res.ok) { setError(r.error || '导入失败'); return false }
      if (r.needRefundChoice) { setImporting(false); setRefundChoice({ item, itemIdx: idx, matches: r.matches }); return true }
      setDone((d) => d + 1)
      if (r.learned) setLearned((l) => l + 1)
      if (r.dedupWarnings) setDedupWarnings(prev => [...prev, ...extractDedupWarningsFn(r.dedupWarnings)])
    } catch (err) {
      setError(`导入失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
    return false
  }

  const continueRefundItems = async (remaining: number[]) => {
    for (const idx of remaining) {
      const paused = await processSingleItem(items[idx], idx)
      if (paused) return
    }
    setImporting(false)
    setItems((prev) => prev.filter((_, i) => !selected.has(i)))
    setSelected(new Set())
    setCategoryOverrides(new Map())
    setPendingRefundIndices([])
  }

  const handleRefundDelete = async () => {
    if (!refundChoice) return
    setRefundWaiting(true)
    const best = refundChoice.matches[0]
    const res = await fetch('/api/import/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...refundChoice.item, refundAction: 'delete_expense', deleteExpenseId: best.id, ledgerId: selectedLedgerId || undefined }),
    })
    await res.json()
    setRefundChoice(null); setRefundWaiting(false); setDone((d) => d + 1)
    setImporting(true)
    await continueRefundItems(pendingRefundIndices.filter(i => i !== refundChoice.itemIdx))
  }

  const handleRefundAddIncome = async () => {
    if (!refundChoice) return
    setRefundWaiting(true)
    const res = await fetch('/api/import/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...refundChoice.item, refundAction: 'add_income', ledgerId: selectedLedgerId || undefined }),
    })
    await res.json()
    setRefundChoice(null); setRefundWaiting(false); setDone((d) => d + 1)
    setImporting(true)
    await continueRefundItems(pendingRefundIndices.filter(i => i !== refundChoice.itemIdx))
  }

  const handleImport = async () => {
    const toImport = items.filter((_, i) => selected.has(i))
    if (toImport.length === 0) return
    setImporting(true); setDone(0); setLearned(0); setDedupWarnings([])
    let localImported = 0, localLearned = 0, localDedupWarningCount = 0
    const refundIndices: number[] = []
    const normalProps: Array<{ item: ParsedBillItem; origIdx: number }> = []
    for (const idx of Array.from(selected).sort((a, b) => a - b)) {
      const item = items[idx]
      if (item.type === 'income') refundIndices.push(idx)
      else normalProps.push({ item, origIdx: idx })
    }
    const corrections: Array<{ merchant: string; originalCategoryId: string; correctedCategoryId: string }> = []
    for (const { item, origIdx } of normalProps) {
      const overrideId = categoryOverrides.get(origIdx)
      if (overrideId) {
        const originalId = originalDetectedCatIds.get(origIdx)
        if (!originalId || originalId !== overrideId) {
          corrections.push({ merchant: item.merchant, originalCategoryId: originalId || '', correctedCategoryId: overrideId })
        }
      }
    }
    if (normalProps.length > 0) {
      const batchItems = normalProps.map(({ item, origIdx }) => ({ ...item, categoryId: categoryOverrides.get(origIdx) || undefined }))
      try {
        const res = await fetch('/api/import/batch-confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: batchItems, ledgerId: selectedLedgerId || undefined, categoryCorrections: corrections }),
        })
        const data = await res.json()
        if (res.ok && data.success) {
          setDone(d => d + normalProps.length)
          if (data.learned) setLearned(data.learned)
          if (data.summary) { localImported = data.summary.imported; localLearned = data.summary.learned; localDedupWarningCount = data.summary.dedupWarningCount || 0 }
          else localImported = normalProps.length
          if (data.dedupWarnings) setDedupWarnings(prev => [...prev, ...extractDedupWarningsFn(data.dedupWarnings)])
        } else {
          console.warn('batch-confirm failed:', data.error)
          for (const { item, origIdx } of normalProps) await processSingleItem(item, origIdx)
          localImported = normalProps.length
        }
      } catch (batchErr) {
        console.warn('batch-confirm exception:', batchErr)
        for (const { item, origIdx } of normalProps) await processSingleItem(item, origIdx)
        localImported = normalProps.length
      }
    }
    setPendingRefundIndices(refundIndices)
    for (const idx of refundIndices) {
      const paused = await processSingleItem(items[idx], idx)
      if (paused) return
    }
    const selectedItems = items.filter((_, i) => selected.has(i))
    const totalAmount = selectedItems.filter(i => i.type === 'expense').reduce((s, i) => s + i.amount, 0)
    setSummary({
      imported: localImported,
      skipped: items.length - selected.size,
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

  // ── 统计预览 ────────────────────────────────────────────

  const statsPreview = useMemo(() => {
    if (items.length === 0) return null
    const selectedItems: Array<{ item: ParsedBillItem; idx: number }> = []
    for (const idx of Array.from(selected).sort((a, b) => a - b)) selectedItems.push({ item: items[idx], idx })
    if (selectedItems.length === 0) return null
    const catMap = new Map<string, { name: string; amount: number; count: number; color: string; icon: string }>()
    let uncategorizedAmount = 0, uncategorizedCount = 0
    for (const { item, idx } of selectedItems) {
      if (item.type !== 'expense') continue
      const overrideId = categoryOverrides.get(idx)
      let catName: string | null = null
      let catColor = '#a1a1aa'
      if (overrideId) {
        const cat = categories.find(c => c.id === overrideId)
        catName = cat?.name || null
        if (cat?.icon) catColor = '#71717a'
      } else {
        catName = detectCategoryName(item.merchant, item.description)
        if (catName) { const cat = categories.find(c => c.name === catName && c.type === 'expense'); if (cat) catColor = '#71717a' }
      }
      if (catName) {
        const catObj = categories.find(c => c.name === catName && c.type === 'expense')
        const catIcon = catObj?.icon || '📦'
        const existing = catMap.get(catName) || { name: catName, amount: 0, count: 0, color: catColor, icon: catIcon }
        existing.amount += item.amount; existing.count += 1; catMap.set(catName, existing)
      } else { uncategorizedAmount += item.amount; uncategorizedCount += 1 }
    }
    const topCategories = Array.from(catMap.values()).sort((a, b) => b.amount - a.amount).slice(0, 5)
    if (uncategorizedCount > 0) topCategories.push({ name: '未分类', amount: uncategorizedAmount, count: uncategorizedCount, color: '#d4d4d8', icon: '📦' })
    const expenses = selectedItems.filter(({ item }) => item.type === 'expense')
    const incomes = selectedItems.filter(({ item }) => item.type === 'income')
    const totalExpense = expenses.reduce((s, { item }) => s + item.amount, 0)
    const totalIncome = incomes.reduce((s, { item }) => s + item.amount, 0)
    const allAmounts = selectedItems.map(({ item }) => item.amount)
    const avgAmount = allAmounts.length > 0 ? allAmounts.reduce((s, a) => s + a, 0) / allAmounts.length : 0
    const maxItem = selectedItems.reduce((max, cur) => cur.item.amount > (max?.item.amount || 0) ? cur : max, selectedItems[0])
    const dates = selectedItems.map(({ item }) => item.transactionDate).filter(Boolean)
      .map(d => new Date(d)).filter(d => !isNaN(d.getTime())).sort((a, b) => a.getTime() - b.getTime())
    const minDate = dates.length > 0 ? dates[0] : null
    const maxDate = dates.length > 0 ? dates[dates.length - 1] : null
    const daySpan = minDate && maxDate ? Math.round((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) + 1 : 0
    const largeThreshold = avgAmount * 3
    const largeCount = selectedItems.filter(({ item }) => item.amount > largeThreshold && largeThreshold > 0).length
    const threeMonthsAgo = new Date(); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
    const dateAnomalyCount = dates.filter(d => d < threeMonthsAgo).length
    const topNAmount = topCategories.filter(c => c.name !== '未分类').reduce((s, c) => s + c.amount, 0)
    const topNPct = totalExpense > 0 ? Math.round(topNAmount / totalExpense * 100) : 0
    return {
      topCategories, totalExpense, totalIncome, avgAmount,
      maxItem: maxItem ? { merchant: maxItem.item.merchant, amount: maxItem.item.amount } : null,
      minDate, maxDate, daySpan, largeCount, dateAnomalyCount,
      totalSelected: selectedItems.length, topNCount: topCategories.length, topNPct,
    }
  }, [items, selected, categoryOverrides, categories])

  // ── 派生值 ──────────────────────────────────────────────

  const duplicateCount = duplicateChecks.filter(d => d.isDuplicate).length
  const qualityIssueCount = qualityIssues.filter(q => q.length > 0).length
  const expenseCount = items.filter((i) => i.type === 'expense').length
  const incomeCount = items.filter((i) => i.type === 'income').length
  const totalExpense = items.filter((i) => i.type === 'expense').reduce((s, i) => s + i.amount, 0)

  // ── 智能建议 ────────────────────────────────────────────

  const isMerchantSimilar = useCallback((a: string, b: string): boolean => {
    if (!a || !b) return false
    if (a === b) return true
    const aTrim = a.trim(); const bTrim = b.trim()
    if (aTrim.length >= 4 && bTrim.length >= 4 && aTrim.slice(0, 4) === bTrim.slice(0, 4)) return true
    const setA = new Set(aTrim.split('')); const setB = new Set(bTrim.split(''))
    let intersection = 0
    for (const ch of setA) { if (setB.has(ch)) intersection++ }
    const union = setA.size + setB.size - intersection
    return union > 0 && intersection / union > 0.6
  }, [])

  const smartSuggestions = useMemo<SmartSuggestion[]>(() => {
    if (categoryOverrides.size === 0 || items.length === 0) return []
    const result: SmartSuggestion[] = []
    for (const [idx, catId] of categoryOverrides.entries()) {
      if (dismissedSuggestions.has(idx)) continue
      const origCatId = originalDetectedCatIds.get(idx)
      if (origCatId === catId) continue
      const item = items[idx]
      if (!item) continue
      const cat = categories.find(c => c.id === catId)
      if (!cat) continue
      const targetIndices: number[] = []
      for (let j = 0; j < items.length; j++) {
        if (j === idx || categoryOverrides.has(j) || items[j].type !== item.type) continue
        if (isMerchantSimilar(item.merchant, items[j].merchant)) targetIndices.push(j)
      }
      if (targetIndices.length > 0) {
        result.push({ sourceIdx: idx, targetIndices, merchant: item.merchant, categoryId: catId, categoryName: cat.name, dismissed: false })
      }
    }
    return result
  }, [categoryOverrides, items, categories, isMerchantSimilar, dismissedSuggestions, originalDetectedCatIds])

  const applySmartSuggestion = useCallback((suggestion: SmartSuggestion) => {
    setCategoryOverrides(prev => {
      const next = new Map(prev)
      for (const ti of suggestion.targetIndices) next.set(ti, suggestion.categoryId)
      return next
    })
    setDismissedSuggestions(prev => new Set(prev).add(suggestion.sourceIdx))
  }, [])

  const dismissSmartSuggestion = useCallback((sourceIdx: number) => {
    setDismissedSuggestions(prev => new Set(prev).add(sourceIdx))
  }, [])

  // ── 分类工具 ────────────────────────────────────────────

  const getEffectiveCategory = (item: ParsedBillItem, idx: number): string | null => {
    if (categoryOverrides.has(idx)) {
      const cat = categories.find(c => c.id === categoryOverrides.get(idx))
      return cat?.name || null
    }
    if (item.type === 'income') return '其他收入'
    return detectCategoryName(item.merchant, item.description)
  }

  const isUnmatchedRow = (item: ParsedBillItem, idx: number): boolean => {
    if (categoryOverrides.has(idx)) return false
    if (item.type === 'income') return false
    return detectCategoryName(item.merchant, item.description) === null
  }

  // ── 快速创建 ────────────────────────────────────────────

  const openQuickCreate = (idx: number) => {
    const item = items[idx]
    const suggestedName = item.merchant || '新分类'
    const itemType = item.type || 'expense'
    const defaultParent = categories.find(c => c.type === itemType && !c.parentName)
    setQuickCreate({ rowIndex: idx, suggestedName, selectedParentId: defaultParent?.id || '', itemName: item.merchant || item.description, creating: false })
  }

  const handleQuickCreate = async () => {
    if (!quickCreate) return
    setQuickCreate({ ...quickCreate, creating: true })
    const itemType = items[quickCreate.rowIndex]?.type || 'expense'
    const result = await quickCreateCategory(quickCreate.suggestedName, quickCreate.selectedParentId, itemType)
    if (result.success && result.category) {
      const cat = result.category
      const newCat: CategoryOption = {
        id: cat.id, name: cat.name, type: cat.type,
        parentName: categories.find(c => c.id === quickCreate.selectedParentId)?.name,
      }
      setCategories(prev => [...prev, newCat])
      setCategoryOverrides(prev => { const next = new Map(prev); next.set(quickCreate.rowIndex, cat.id); return next })
    }
    setQuickCreate(null)
  }

  // ── 重置完成状态 ────────────────────────────────────────

  const resetSummary = useCallback(() => {
    setSummary(null); setError(''); setMessage(''); setIsQuickImportResult(false)
  }, [])

  return {
    // 文件解析
    loading, error, message, items, selected, importing, done, learned, summary,
    dedupWarnings, duplicateChecks, qualityIssues, importMode, quickImporting, isQuickImportResult,
    // 弹窗
    refundChoice, refundWaiting, quickCreate,
    // 数据
    ledgers, categories, selectedLedgerId, categoryOverrides, currentPage,
    ledgerOptions, categoryOptionsByType, parentCategoryOptions,
    recentCountByType, statsCollapsed, duplicateCount, qualityIssueCount,
    expenseCount, incomeCount, totalExpense,
    // 计算
    statsPreview, smartSuggestions,
    // Refs
    categoryDistRef, transactionListRef,
    // Actions
    handleFile, handlePaste, setImportMode, toggleSelect, selectAll, deselectAll,
    handleImport, handleRefundDelete, handleRefundAddIncome,
    setCategoryOverrides, setCurrentPage, setStatsCollapsed,
    setSelectedLedgerId, setQuickCreate, openQuickCreate, handleQuickCreate,
    applySmartSuggestion, dismissSmartSuggestion,
    getEffectiveCategory, isUnmatchedRow, resetSummary,
  }
}
