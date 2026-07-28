'use client'

import { createTransaction, updateTransaction } from '@/lib/actions/transactions'
import { useActionState, useState, useEffect, useCallback, useMemo } from 'react'
import { SearchableSelect } from '@/components/searchable-select'

interface Category {
  id: string
  name: string
  icon: string
  type: string
  parentId: string | null
}

interface Account {
  id: string
  name: string
}

interface Ledger {
  id: string
  name: string
}

interface Transaction {
  id: string
  type: string
  amount: number
  merchant: string
  description: string
  transactionTime: Date
  categoryId: string | null
  accountId: string | null
  transactionLedgers: { ledgerId: string }[]
}

interface ClassifyResult {
  categoryId: string | null
  categoryName: string
  confidence: number
  suggestNewCategory: boolean
  newCategoryName?: string
  reason: string
}

export function TransactionForm({
  categories,
  accounts,
  ledgers,
  transaction,
  onSuccess,
}: {
  categories: Category[]
  accounts: Account[]
  ledgers: Ledger[]
  transaction?: Transaction
  onSuccess?: () => void
}) {
  const isEdit = !!transaction
  const action = isEdit
    ? updateTransaction.bind(null, transaction!.id)
    : createTransaction

  const [state, formAction, isPending] = useActionState(action, null)
  const [selectedLedgerIds, setSelectedLedgerIds] = useState<string[]>(
    transaction?.transactionLedgers?.map((tl) => tl.ledgerId) || []
  )
  const [type, setType] = useState(transaction?.type || 'expense')
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    transaction?.categoryId || ''
  )
  const [selectedAccountId, setSelectedAccountId] = useState(
    transaction?.accountId || ''
  )
  const [classifyResult, setClassifyResult] = useState<ClassifyResult | null>(null)
  const [classifying, setClassifying] = useState(false)
  const [amountStr, setAmountStr] = useState(transaction?.amount?.toString() || '')

  useEffect(() => {
    if (state?.success) {
      onSuccess?.()
    }
  }, [state, onSuccess])

  const expenseCategories = categories.filter((c) => c.type === 'expense')
  const incomeCategories = categories.filter((c) => c.type === 'income')
  const visibleCategories = type === 'expense' ? expenseCategories : incomeCategories

  // 构建可搜索下拉的选项
  const categoryOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string; group?: string }> = []
    const parents = visibleCategories.filter((c) => !c.parentId)
    for (const parent of parents) {
      opts.push({ value: parent.id, label: `${parent.icon} ${parent.name}`, group: parent.name })
      const children = visibleCategories.filter((c) => c.parentId === parent.id)
      for (const child of children) {
        opts.push({ value: child.id, label: `  ${child.icon} ${child.name}`, group: parent.name })
      }
    }
    return opts
  }, [visibleCategories])

  const accountOptions = useMemo(
    () => accounts.map((a) => ({ value: a.id, label: a.name })),
    [accounts]
  )

  const toggleLedger = (id: string) => {
    setSelectedLedgerIds((prev) =>
      prev.includes(id) ? prev.filter((lid) => lid !== id) : [...prev, id]
    )
  }

  const handleClassify = useCallback(async () => {
    const merchant = (document.querySelector('input[name="merchant"]') as HTMLInputElement)?.value || ''
    const description = (document.querySelector('input[name="description"]') as HTMLInputElement)?.value || ''
    const timeInput = (document.querySelector('input[name="transactionTime"]') as HTMLInputElement)?.value || ''

    if (!amountStr || parseFloat(amountStr) <= 0) return

    setClassifying(true)
    try {
      const res = await fetch('/api/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant,
          description,
          amount: parseFloat(amountStr),
          type,
          transactionTime: timeInput || undefined,
        }),
      })
      const data = await res.json()
      if (data && data.categoryId) {
        setClassifyResult(data)
        setSelectedCategoryId(data.categoryId)
      } else if (data) {
        setClassifyResult(data)
      }
    } catch (err) {
      console.error('Classify error:', err)
    } finally {
      setClassifying(false)
    }
  }, [amountStr, type])

  return (
    <form action={formAction} className="space-y-4">
      {/* 类型选择 */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-2">
          类型
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setType('expense')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              type === 'expense'
                ? 'bg-red-100 text-red-700 border-2 border-red-300'
                : 'bg-zinc-100 text-zinc-600 border-2 border-transparent'
            }`}
          >
            💸 支出
          </button>
          <button
            type="button"
            onClick={() => setType('income')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              type === 'income'
                ? 'bg-green-100 text-green-700 border-2 border-green-300'
                : 'bg-zinc-100 text-zinc-600 border-2 border-transparent'
            }`}
          >
            💰 收入
          </button>
        </div>
        <input type="hidden" name="type" value={type} />
      </div>

      {/* 金额 */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1">
          金额
        </label>
        <input
          name="amount"
          type="number"
          step="0.01"
          required
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="0.00"
        />
      </div>

      {/* 商户 */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1">
          商户/备注
        </label>
        <input
          name="merchant"
          type="text"
          defaultValue={transaction?.merchant || ''}
          className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="例如：星巴克"
        />
      </div>

      {/* 描述 */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1">
          详细描述
        </label>
        <input
          name="description"
          type="text"
          defaultValue={transaction?.description || ''}
          className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="可选"
        />
      </div>

      {/* 日期 */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1">
          日期
        </label>
        <input
          name="transactionTime"
          type="datetime-local"
          defaultValue={
            (() => {
              const d = transaction
                ? new Date(transaction.transactionTime)
                : new Date()
              const pad = (n: number) => String(n).padStart(2, '0')
              return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
            })()
          }
          className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* 分类 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-zinc-700">
            分类
          </label>
          <button
            type="button"
            onClick={handleClassify}
            disabled={classifying}
            className="text-xs text-purple-600 hover:text-purple-700 disabled:opacity-50 font-medium"
          >
            {classifying ? '🤖 分析中...' : '🤖 AI 分类'}
          </button>
        </div>
        <SearchableSelect
          options={categoryOptions}
          value={selectedCategoryId}
          onChange={setSelectedCategoryId}
          placeholder="选择分类"
        />
        <input type="hidden" name="categoryId" value={selectedCategoryId} />
        {classifyResult && (
          <div className="mt-2 p-2 bg-purple-50 rounded-lg text-xs">
            <p className="text-purple-700">
              🤖 AI 建议: {classifyResult.reason}
              <span className="ml-1 text-purple-400">
                (置信度: {Math.round(classifyResult.confidence * 100)}%)
              </span>
            </p>
            {classifyResult.suggestNewCategory && classifyResult.newCategoryName && (
              <p className="text-purple-600 mt-1">
                💡 建议新分类: "{classifyResult.newCategoryName}"
              </p>
            )}
          </div>
        )}
      </div>

      {/* 账户 */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1">
          支付账户
        </label>
        <SearchableSelect
          options={accountOptions}
          value={selectedAccountId}
          onChange={setSelectedAccountId}
          placeholder="选择账户"
        />
        <input type="hidden" name="accountId" value={selectedAccountId} />
      </div>

      {/* 账本 */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1">
          关联账本
        </label>
        <div className="flex flex-wrap gap-2">
          {ledgers.map((ledger) => (
            <button
              key={ledger.id}
              type="button"
              onClick={() => toggleLedger(ledger.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedLedgerIds.includes(ledger.id)
                  ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                  : 'bg-zinc-100 text-zinc-600 border-2 border-transparent'
              }`}
            >
              {ledger.name}
            </button>
          ))}
        </div>
        {selectedLedgerIds.map((id) => (
          <input key={id} type="hidden" name="ledgerIds" value={id} />
        ))}
      </div>

      {state?.error && (
        <p className="text-sm text-red-500">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? '保存中...' : isEdit ? '更新' : '添加交易'}
      </button>
    </form>
  )
}
