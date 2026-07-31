'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { parseNaturalLanguage, dryRunAdjust, executeAdjust } from '@/lib/actions/batch-adjust'
import { ALLOWED_REDIRECT_PATHS } from '@/lib/ai-capabilities'
import type { DryRunResult, QueryTransaction, ConversationContext } from '@/lib/actions/batch-adjust'
import { shouldResetContext, PRONOUN_REGEX } from '@/lib/conversation-context'
import { Bot, CheckCircle, AlertTriangle, Ban, Search, Lightbulb } from 'lucide-react'

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
  const [queryResult, setQueryResult] = useState<{ reply: string; transactions?: QueryTransaction[]; confidence?: number } | null>(null)
  const [unsupportedRedirect, setUnsupportedRedirect] = useState<{ message: string; redirect: string } | null>(null)
  const [conversationContext, setConversationContext] = useState<ConversationContext | undefined>(undefined)
  const [clarifyResult, setClarifyResult] = useState<{ reply: string; suggestions: string[] } | null>(null)
  const [currentConfidence, setCurrentConfidence] = useState<number | undefined>(undefined)
  const [showLowConfWarning, setShowLowConfWarning] = useState(false)

  const handleParse = async () => {
    if (!input.trim()) return
    setError('')
    setParsing(true)
    setDryRun(null)
    setDone(false)
    setQueryResult(null)
    setUnsupportedRedirect(null)
    setClarifyResult(null)
    setCurrentConfidence(undefined)
    setShowLowConfWarning(false)

    // 检查是否需要手动清理上下文
    let effectiveContext = conversationContext
    let effectiveTurnCount = conversationContext?.turnCount || 0
    if (shouldResetContext(input.trim())) {
      effectiveContext = undefined
      effectiveTurnCount = 0
      setConversationContext(undefined)
    }

    // 自动淡化：超过 5 轮且新消息不包含指代词时，清空上下文
    if (effectiveContext && effectiveTurnCount > 5) {
      const hasPronoun = PRONOUN_REGEX.test(input.trim())
      if (!hasPronoun) {
        effectiveContext = undefined
        effectiveTurnCount = 0
        setConversationContext(undefined)
      }
    }

    const result = await parseNaturalLanguage(input, effectiveContext)
    setParsing(false)

    if (!result.success) {
      setError(result.error)
      return
    }

    // 澄清模式
    if (result.mode === 'clarify') {
      setClarifyResult({ reply: result.reply, suggestions: result.suggestions })
      return
    }

    // 查询模式
    if (result.mode === 'query') {
      setQueryResult({ reply: result.reply, transactions: result.transactions, confidence: result.confidence })
      setCurrentConfidence(result.confidence)
      // 无论查询结果是否为空，都更新上下文（避免旧的 previousQueryTransactions 残留）
      setConversationContext({
        previousQueryTransactions: (result.transactions || []).map(tx => ({
          id: tx.id,
          merchant: tx.merchant,
          amount: tx.amount,
          categoryName: tx.categoryName,
          date: new Date(tx.transactionTime).toLocaleDateString('zh-CN'),
        })),
        turnCount: effectiveTurnCount + 1,
      })
      return
    }

    // 不支持的操作
    if (result.mode === 'unsupported') {
      if (ALLOWED_REDIRECT_PATHS.includes(result.redirect)) {
        setUnsupportedRedirect({ message: result.message, redirect: result.redirect })
      } else {
        setError(result.message)
      }
      return
    }

    // 操作模式：清空上下文
    setConversationContext(undefined)
    setCurrentConfidence(result.confidence)

    const preview = await dryRunAdjust(result.parsed.filters, result.parsed.operations)
    setDryRun(preview)
    setEditableTx([...preview.newTransactions])
    setEditIdx(null)

    if (preview.count === 0) {
      setError('没有匹配到任何交易，请调整描述')
    }
  }

  const safeConf = (c: number | undefined) => {
    if (c === undefined || isNaN(c)) return 0.8
    return c
  }

  const handleExecute = async () => {
    if (!dryRun) return
    // 低信心度时先显示警告，等待二次确认
    if (safeConf(currentConfidence) < 0.5 && !showLowConfWarning) {
      setShowLowConfWarning(true)
      return
    }
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
      <div className="bg-card rounded-md border border-border p-5">
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
            className="flex-1 px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>

        <div className="flex items-center justify-between mt-3">
          <div className="flex gap-2 flex-wrap">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.text}
                onClick={() => setInput(ex.text)}
                className="text-xs text-muted-foreground hover:text-primary bg-background px-2 py-1 rounded"
              >
                <span className="text-[10px] text-muted-foreground mr-1">{ex.label}</span>
                {ex.text.length > 14 ? ex.text.slice(0, 14) + '…' : ex.text}
              </button>
            ))}
          </div>
          <button
            onClick={handleParse}
            disabled={parsing || !input.trim()}
            className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {parsing ? <><Bot className="inline h-4 w-4 mr-1" />解析中...</> : '解析并预览'}
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        {/* 澄清模式：建议按钮 */}
        {clarifyResult && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-800 mb-3">{clarifyResult.reply}</p>
            <div className="flex flex-wrap gap-2">
              {clarifyResult.suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => { setInput(s); setClarifyResult(null) }}
                  className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-full text-sm font-medium transition-colors border border-purple-200"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {unsupportedRedirect && (
          <div className="mt-3 flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{unsupportedRedirect.message}</span>
            <a
              href={unsupportedRedirect.redirect}
              className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-white rounded-md text-xs font-medium transition-colors"
            >
              前往操作 →
            </a>
          </div>
        )}
      </div>

      {dryRun && dryRun.count > 0 && (
        <div className="bg-card rounded-md border border-border p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-foreground">
                {isCreate ? '预览新增' : '预览变更'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {editableTx.length > 0 && <span>新增 {editableTx.length} 笔 · </span>}
                {dryRun.preview.length > 0 && <span>修改 {dryRun.preview.length} 笔</span>}
              </p>
              {isCreate && (
                <p className="text-xs text-muted-foreground mt-1"><Lightbulb className="inline h-3 w-3 mr-1" /> 点击分类或账本可修改</p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setDryRun(null); setError(''); setEditableTx([]); setShowLowConfWarning(false) }}
                className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                取消
              </button>
              {/* 低信心度警告 + 二次确认 */}
              {showLowConfWarning && safeConf(currentConfidence) < 0.5 ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-destructive"><AlertTriangle className="inline h-3 w-3 mr-1" />AI 非常不确定（信心度 {Math.round(safeConf(currentConfidence) * 100)}%），确认继续？</span>
                  <button
                    onClick={handleExecute}
                    disabled={executing}
                    className="px-4 py-1.5 text-white bg-destructive hover:bg-destructive/90 rounded-md text-sm font-medium disabled:opacity-50"
                  >
                    {executing ? '执行中...' : '确认执行'}
                  </button>
                  <button
                    onClick={() => setShowLowConfWarning(false)}
                    className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleExecute}
                  disabled={executing}
                  className={`px-4 py-1.5 text-white rounded-md text-sm font-medium disabled:opacity-50 ${
                    safeConf(currentConfidence) < 0.8 && safeConf(currentConfidence) >= 0.5
                      ? 'bg-amber-500 hover:bg-amber-600'
                      : 'bg-primary hover:bg-primary/90'
                  }`}
                >
                  {executing ? '执行中...' : isCreate ? '确认添加' : '确认执行'}
                </button>
              )}
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
                  <span className="text-muted-foreground w-20 shrink-0 text-xs">
                    {nt.transactionTime
                      ? new Date(nt.transactionTime).toLocaleDateString('zh-CN')
                      : '现在'}
                  </span>
                  <span className="text-foreground w-20 truncate">{nt.merchant}</span>

                  {/* 可编辑分类 */}
                  {editIdx === i ? (
                    <select
                      value={nt.categoryName || ''}
                      onChange={(e) => { updateTx(i, 'categoryName', e.target.value); setEditIdx(null) }}
                      onBlur={() => setEditIdx(null)}
                      autoFocus
                      className="text-xs border border-primary rounded px-1 py-0.5 bg-card"
                    >
                      <option value="">不分类</option>
                      {cats.map((c) => (
                        <option key={c.id} value={c.name}>{c.icon} {c.name}</option>
                      ))}
                    </select>
                  ) : (
                    <button
                      onClick={() => setEditIdx(i)}
                      className="text-xs text-primary hover:text-primary/80 border border-dashed border-primary/50 rounded px-1.5 py-0.5 cursor-pointer"
                      title="点击修改分类"
                    >
                      {nt.categoryName || '选分类'}
                    </button>
                  )}

                  <span
                    className={`font-medium ${
                      nt.type === 'income' ? 'text-green-500' : 'text-destructive'
                    }`}
                  >
                    {nt.type === 'income' ? '+' : '-'}¥{nt.amount.toFixed(2)}
                  </span>

                  {/* 可编辑账本 */}
                  {nt.ledgerName && (
                    <span className="text-xs text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded">
                      {nt.ledgerName}
                    </span>
                  )}
                </div>
              )
            })}

            {dryRun.preview.slice(0, 20).map((tx) => (
              <div
                key={tx.id}
                className="flex items-center gap-3 py-2 border-b border-border text-sm"
              >
                <span className="text-muted-foreground w-24 shrink-0">
                  {new Date(tx.transactionTime).toLocaleDateString('zh-CN')}
                </span>
                <span className="text-foreground flex-1 truncate">
                  {tx.merchant || '未命名'}
                </span>
                <span className="text-muted-foreground text-xs">{tx.categoryName}</span>
                <span
                  className={`font-medium ${
                    tx.type === 'income' ? 'text-green-500' : 'text-destructive'
                  }`}
                >
                  ¥{tx.amount.toFixed(2)}
                </span>
                <span className="text-primary text-xs whitespace-nowrap">
                  → {tx.changes.join(', ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {done && (
        <div className="bg-green-50 border border-green-200 rounded-md p-4 text-center">
          <p className="text-green-700 font-medium"><CheckCircle className="inline h-4 w-4 mr-1" />批量调整完成</p>
        </div>
      )}

      {queryResult && (
        <div className="bg-card rounded-md border border-border p-5">
          <h3 className="font-semibold text-foreground flex items-center gap-2"><Search className="h-4 w-4" />查询结果</h3>
          {/* 信心度提示 */}
          {queryResult.confidence !== undefined && !isNaN(queryResult.confidence) && queryResult.confidence < 0.8 && queryResult.confidence >= 0.5 && (
            <div className="mb-2 flex items-center gap-1 text-xs text-amber-600">
              <span><AlertTriangle className="inline h-3 w-3 mr-1" /></span>
              <span>AI 可能理解有误，请仔细核对查询结果</span>
            </div>
          )}
          {queryResult.confidence !== undefined && !isNaN(queryResult.confidence) && queryResult.confidence < 0.5 && (
            <div className="mb-2 flex items-center gap-1 text-xs text-destructive">
              <span><Ban className="inline h-3 w-3 mr-1" /></span>
              <span>AI 非常不确定，建议手动操作</span>
            </div>
          )}
          <p className="text-sm text-muted-foreground whitespace-pre-wrap mb-3">{queryResult.reply}</p>
          {queryResult.transactions && queryResult.transactions.length > 0 && (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {queryResult.transactions.map((tx) => (
                <div key={tx.id} className="flex items-center gap-3 py-2 border-b border-border text-sm">
                  <span className="text-muted-foreground w-24 shrink-0">
                    {new Date(tx.transactionTime).toLocaleDateString('zh-CN')}
                  </span>
                  <span className="text-foreground flex-1 truncate">{tx.merchant}</span>
                  <span className="text-muted-foreground text-xs">{tx.categoryName}</span>
                  <span className={tx.type === 'income' ? 'text-green-600 font-medium' : 'text-destructive font-medium'}>
                    {tx.type === 'income' ? '+' : '-'}¥{tx.amount.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {queryResult.transactions && queryResult.transactions.length === 0 && (
            <p className="text-sm text-muted-foreground">未找到匹配的交易记录</p>
          )}
        </div>
      )}
    </div>
  )
}
