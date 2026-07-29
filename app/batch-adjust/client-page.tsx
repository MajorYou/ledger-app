'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { parseNaturalLanguage, dryRunAdjust, executeAdjust } from '@/lib/actions/batch-adjust'
import type { DryRunResult } from '@/lib/actions/batch-adjust'

interface CatItem { id: string; name: string; icon: string; type: string }
interface LedgerItem { id: string; name: string }

const EXAMPLES = [
  { label: '调整', text: '把上周所有餐饮支出挪到日本旅行账本' },
  { label: '调整', text: '把美团上超过 50 块的都改成聚餐' },
  { label: '记账', text: '今天午饭麦当劳花了 35' },
  { label: '记账', text: '昨天打车 28 块' },
  { label: '记账', text: '工资入账 15000' },
]

interface NewTx {
  merchant: string
  description?: string
  amount: number
  type: 'expense' | 'income'
  categoryName?: string
  ledgerName?: string
  transactionTime?: string
}

export function BatchAdjustClient({
  categories,
  ledgers,
}: {
  categories: CatItem[]
  ledgers: LedgerItem[]
}) {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState('')
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null)
  const [executing, setExecuting] = useState(false)
  const [done, setDone] = useState(false)
  const [editableTx, setEditableTx] = useState<NewTx[]>([])
  const [editIdx, setEditIdx] = useState<number | null>(null)

  const handleParse = async () => {
    if (!input.trim()) return
    setError('')
    setParsing(true)
    setDryRun(null)
    setDone(false)

    const result = await parseNaturalLanguage(input)
    setParsing(false)

    if (!result.success) {
      setError(result.error)
      return
    }

    const preview = await dryRunAdjust(result.parsed.filters, result.parsed.operations)
    setDryRun(preview)
    setEditableTx([...preview.newTransactions])
    setEditIdx(null)

    if (preview.count === 0) {
      setError('没有匹配到任何交易，请调整描述')
    }
  }

  const handleExecute = async () => {
    if (!dryRun) return
    setExecuting(true)
    await executeAdjust(dryRun.filters, dryRun.operations, editableTx)
    setExecuting(false)
    setDone(true)
    setDryRun(null)
    setEditableTx([])
    setInput('')
    router.refresh()
  }

  const updateTx = (idx: number, field: string, value: string) => {
    setEditableTx((prev) =>
      prev.map((tx, i) => (i === idx ? { ...tx, [field]: value } : tx))
    )
  }

  const isCreate = dryRun?.operations.some((op) => op.type === 'create_transaction')

  const expenseCats = categories.filter((c) => c.type === 'expense')
  const incomeCats = categories.filter((c) => c.type === 'income')

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-zinc-200 p-5">
        <div className="flex gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleParse()
              }
            }}
            placeholder={'试试这些：\n• "今天午饭麦当劳花了35"\n• "昨天打车28块"\n• "把上周餐饮挪到旅行账本"'}
            rows={3}
            className="flex-1 px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div className="flex items-center justify-between mt-3">
          <div className="flex gap-2 flex-wrap">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.text}
                onClick={() => setInput(ex.text)}
                className="text-xs text-zinc-400 hover:text-blue-500 bg-zinc-50 px-2 py-1 rounded"
              >
                <span className="text-[10px] text-zinc-300 mr-1">{ex.label}</span>
                {ex.text.length > 14 ? ex.text.slice(0, 14) + '…' : ex.text}
              </button>
            ))}
          </div>
          <button
            onClick={handleParse}
            disabled={parsing || !input.trim()}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {parsing ? '🤖 解析中...' : '解析并预览'}
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      </div>

      {dryRun && dryRun.count > 0 && (
        <div className="bg-white rounded-xl border border-zinc-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-zinc-900">
                {isCreate ? '预览新增' : '预览变更'}
              </h3>
              <p className="text-sm text-zinc-500">
                {editableTx.length > 0 && <span>新增 {editableTx.length} 笔 · </span>}
                {dryRun.preview.length > 0 && <span>修改 {dryRun.preview.length} 笔</span>}
              </p>
              {isCreate && (
                <p className="text-xs text-zinc-400 mt-1">💡 点击分类或账本可修改</p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setDryRun(null); setError(''); setEditableTx([]) }}
                className="px-3 py-1.5 text-sm text-zinc-600 hover:text-zinc-900"
              >
                取消
              </button>
              <button
                onClick={handleExecute}
                disabled={executing}
                className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {executing ? '执行中...' : isCreate ? '确认添加' : '确认执行'}
              </button>
            </div>
          </div>

          <div className="space-y-1 max-h-96 overflow-y-auto">
            {editableTx.map((nt, i) => {
              const cats = nt.type === 'expense' ? expenseCats : incomeCats
              return (
                <div
                  key={`new-${i}`}
                  className="flex items-center gap-2 py-2 border-b border-green-100 text-sm bg-green-50/50 px-2 rounded flex-wrap"
                >
                  <span className="text-green-500 font-bold w-5 shrink-0">+</span>
                  <span className="text-zinc-400 w-20 shrink-0 text-xs">
                    {nt.transactionTime
                      ? new Date(nt.transactionTime).toLocaleDateString('zh-CN')
                      : '现在'}
                  </span>
                  <span className="text-zinc-900 w-20 truncate">{nt.merchant}</span>

                  {/* 可编辑分类 */}
                  {editIdx === i ? (
                    <select
                      value={nt.categoryName || ''}
                      onChange={(e) => { updateTx(i, 'categoryName', e.target.value); setEditIdx(null) }}
                      onBlur={() => setEditIdx(null)}
                      autoFocus
                      className="text-xs border border-blue-300 rounded px-1 py-0.5 bg-white"
                    >
                      <option value="">不分类</option>
                      {cats.map((c) => (
                        <option key={c.id} value={c.name}>{c.icon} {c.name}</option>
                      ))}
                    </select>
                  ) : (
                    <button
                      onClick={() => setEditIdx(i)}
                      className="text-xs text-blue-500 hover:text-blue-700 border border-dashed border-blue-200 rounded px-1.5 py-0.5 cursor-pointer"
                      title="点击修改分类"
                    >
                      {nt.categoryName || '选分类'}
                    </button>
                  )}

                  <span
                    className={`font-medium ${
                      nt.type === 'income' ? 'text-green-500' : 'text-red-500'
                    }`}
                  >
                    {nt.type === 'income' ? '+' : '-'}¥{nt.amount.toFixed(2)}
                  </span>

                  {/* 可编辑账本 */}
                  {nt.ledgerName && (
                    <span className="text-xs text-blue-400 bg-blue-50 px-1.5 py-0.5 rounded">
                      {nt.ledgerName}
                    </span>
                  )}
                </div>
              )
            })}

            {dryRun.preview.slice(0, 20).map((tx) => (
              <div
                key={tx.id}
                className="flex items-center gap-3 py-2 border-b border-zinc-100 text-sm"
              >
                <span className="text-zinc-400 w-24 shrink-0">
                  {new Date(tx.transactionTime).toLocaleDateString('zh-CN')}
                </span>
                <span className="text-zinc-900 flex-1 truncate">
                  {tx.merchant || '未命名'}
                </span>
                <span className="text-zinc-400 text-xs">{tx.categoryName}</span>
                <span
                  className={`font-medium ${
                    tx.type === 'income' ? 'text-green-500' : 'text-red-500'
                  }`}
                >
                  ¥{tx.amount.toFixed(2)}
                </span>
                <span className="text-purple-500 text-xs whitespace-nowrap">
                  → {tx.changes.join(', ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {done && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <p className="text-green-700 font-medium">✅ 批量调整完成</p>
        </div>
      )}
    </div>
  )
}
