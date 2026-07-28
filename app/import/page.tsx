'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import type { ParsedBillItem } from '@/lib/parsers/pdf-parser'
import { detectCategoryName } from '@/lib/category-detector'
import { SearchableSelect } from '@/components/searchable-select'

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
  parentName?: string
}
interface LedgerOption {
  id: string
  name: string
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

  // 退款选择弹窗
  const [refundChoice, setRefundChoice] = useState<{
    item: ParsedBillItem
    itemIdx: number
    matches: Array<{ id: string; merchant: string; amount: number; transactionTime: string; categoryName: string | null }>
  } | null>(null)
  const [refundWaiting, setRefundWaiting] = useState(false)

  // 可选账本和分类
  const [ledgers, setLedgers] = useState<LedgerOption[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [selectedLedgerId, setSelectedLedgerId] = useState('')
  // 每笔交易的分类覆盖：Map<index, categoryId>
  const [categoryOverrides, setCategoryOverrides] = useState<Map<number, string>>(new Map())

  // 加载账本和分类
  useEffect(() => {
    fetch('/api/import/options').then(r => r.json()).then(d => {
      setLedgers(d.ledgers || [])
      setCategories(d.categories || [])
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

  const parseApi = useCallback(async (text: string) => {
    setLoading(true)
    setError('')
    setMessage('')
    setItems([])
    setCategoryOverrides(new Map())
    const fd = new FormData()
    fd.append('text', text)
    const res = await fetch('/api/import', { method: 'POST', body: fd })
    const data = await res.json()
    setLoading(false)
    if (data.error) setError(data.error)
    else {
      setItems(data.items || [])
      setMessage(data.message || '')
      setSelected(new Set((data.items || []).map((_: unknown, i: number) => i)))
    }
  }, [])

  const handleFile = async (file: File) => {
    try {
      setLoading(true)
      setError('')
      setMessage('')
      setItems([])
      setCategoryOverrides(new Map())

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
    // 继续导入剩余
    setImporting(true)
    await continueImport(refundChoice.itemIdx + 1)
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
    // 继续导入剩余
    setImporting(true)
    await continueImport(refundChoice.itemIdx + 1)
  }

  const continueImport = async (startIdx: number) => {
    for (let idx = startIdx; idx < items.length; idx++) {
      if (!selected.has(idx)) continue
      const item = items[idx]
      const overrideCategoryId = categoryOverrides.get(idx)
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
      if (r.needRefundChoice) {
        setImporting(false)
        setRefundChoice({ item, itemIdx: idx, matches: r.matches })
        return
      }
      setDone((d) => d + 1)
      if (r.learned) setLearned((l) => l + 1)
    }
    setImporting(false)
    setItems((prev) => prev.filter((_, i) => !selected.has(i)))
    setSelected(new Set())
    setCategoryOverrides(new Map())
  }

  const handleImport = async () => {
    const toImport = items.filter((_, i) => selected.has(i))
    if (toImport.length === 0) return
    setImporting(true)
    setDone(0)
    setLearned(0)
    await continueImport(0)
  }

  const expenseCount = items.filter((i) => i.type === 'expense').length
  const incomeCount = items.filter((i) => i.type === 'income').length
  const totalExpense = items.filter((i) => i.type === 'expense').reduce((s, i) => s + i.amount, 0)

  // 获取某条交易的实际分类（覆盖 > 预测 > null）
  const getEffectiveCategory = (item: ParsedBillItem, idx: number): string | null => {
    if (categoryOverrides.has(idx)) {
      const cat = categories.find(c => c.id === categoryOverrides.get(idx))
      return cat?.name || null
    }
    if (item.type === 'income') return item.category === '还款' ? '其他收入' : '其他收入'
    return detectCategoryName(item.merchant, item.description)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-zinc-900 mb-2">导入账单</h1>
      <p className="text-sm text-zinc-500 mb-6">支持招行信用卡 PDF 账单，或粘贴文本</p>

      {items.length === 0 && !loading && (
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

      {loading && (
        <div className="text-center py-12">
          <p className="text-2xl mb-2">🤖</p>
          <p className="text-zinc-500">{message || '正在解析账单...'}</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600 mb-4">{error}</div>
      )}

      {message && !error && !loading && (
        <div className={`rounded-xl p-4 text-sm mb-4 ${
          items.length > 0 ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-amber-50 border border-amber-200 text-amber-700'
        }`}>{message}</div>
      )}

      {importing && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-600 mb-4">
          导入中... {done}/{items.filter((_, i) => selected.has(i)).length}
          {learned > 0 && ` · 🧠 已学习 ${learned} 条分类规则`}
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

          <div className="bg-white rounded-xl border border-zinc-200 divide-y divide-zinc-100 max-h-[60vh] overflow-y-auto">
            {items.map((item, i) => (
              <div key={i}
                className={`flex items-center gap-2 p-3 text-sm hover:bg-zinc-50 ${selected.has(i) ? '' : 'opacity-40'}`}>
                <input type="checkbox" checked={selected.has(i)} onChange={() => toggleSelect(i)} className="rounded shrink-0" />
                <span className="text-zinc-400 w-20 shrink-0 text-xs">{item.transactionDate}</span>
                <span className="flex-1 truncate">
                  <span className="text-zinc-900">{item.merchant}</span>
                  {item.description !== item.merchant && (
                    <span className="text-zinc-400 text-xs ml-1">({item.description})</span>
                  )}
                </span>
                <span className="text-xs text-zinc-400 w-10 shrink-0">{item.category}</span>
                {/* 分类下拉 */}
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
                  className="w-28 shrink-0"
                />
                <span className={`font-medium w-24 text-right shrink-0 ${item.type === 'income' ? 'text-green-500' : 'text-red-500'}`}>
                  {item.type === 'income' ? '+' : '-'}¥{item.amount.toFixed(2)}
                </span>
                <span className="text-xs text-zinc-300 w-8 text-right shrink-0">{item.currency}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
