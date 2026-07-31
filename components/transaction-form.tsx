'use client'

import { createTransaction, updateTransaction } from '@/lib/actions/transactions'
import { quickCreateCategory } from '@/lib/actions/categories'
import { useActionState, useState, useEffect, useCallback, useMemo } from 'react'
import { SearchableSelect } from '@/components/searchable-select'
import { ArrowDownRight, Wallet, Repeat, Bot, Lightbulb } from 'lucide-react'

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
  type?: string
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
  sourceAccountId: string | null
  toAccountId: string | null
  channel: string | null
  transactionLedgers: { ledgerId: string }[]
}

interface ClassifyResult {
  categoryId: string | null
  categoryName: string
  confidence: number
  suggestNewCategory: boolean
  newCategoryName?: string
  suggestedParentId?: string | null
  suggestedParentName?: string
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
  const [sourceAccountId, setSourceAccountId] = useState(
    transaction?.sourceAccountId || ''
  )
  const [toAccountId, setToAccountId] = useState(
    transaction?.toAccountId || ''
  )
  const [channel, setChannel] = useState(
    transaction?.channel || ''
  )
  const [classifyResult, setClassifyResult] = useState<ClassifyResult | null>(null)
  const [classifying, setClassifying] = useState(false)
  const [classifyError, setClassifyError] = useState<string | null>(null)
  const [amountStr, setAmountStr] = useState(transaction?.amount?.toString() || '')
  const [creatingCategory, setCreatingCategory] = useState(false)

  // 本地分类列表，支持动态添加新创建的分类
  const [localCategories, setLocalCategories] = useState<Category[]>(categories)

  useEffect(() => {
    if (state?.success) {
      onSuccess?.()
    }
  }, [state, onSuccess])

  const expenseCategories = localCategories.filter((c) => c.type === 'expense')
  const incomeCategories = localCategories.filter((c) => c.type === 'income')
  const visibleCategories = type === 'expense' ? expenseCategories : incomeCategories

  // 账户类型映射
  const accountOptions = useMemo(
    () => accounts.map((a) => ({
      value: a.id,
      label: a.name,
    })),
    [accounts]
  )

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
    setClassifyError(null)
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
      if (data?.categoryId) {
        setClassifyResult(data)
        setSelectedCategoryId(data.categoryId)
        setClassifyError(null)
      }
    } catch (err) {
      console.error('Classify error:', err)
      setClassifyError('分类失败，请重试')
    } finally {
      setClassifying(false)
    }
  }, [amountStr, type])

  const handleCreateAndUseCategory = useCallback(async () => {
    if (!classifyResult?.newCategoryName || !classifyResult?.suggestedParentId) return

    setCreatingCategory(true)
    try {
      const result = await quickCreateCategory(
        classifyResult.newCategoryName,
        classifyResult.suggestedParentId,
        type
      )
      if (result.success && result.category) {
        // 添加新分类到本地列表
        const newCat: Category = {
          id: result.category.id,
          name: result.category.name,
          icon: result.category.icon,
          type: result.category.type,
          parentId: result.category.parentId,
        }
        setLocalCategories((prev) => [...prev, newCat])
        // 自动选中
        setSelectedCategoryId(result.category.id)
        // 清除建议状态
        setClassifyResult(null)
      }
    } catch (err) {
      console.error('Create category error:', err)
    } finally {
      setCreatingCategory(false)
    }
  }, [classifyResult, type])

  return (
    <form action={formAction} className="space-y-4">
      {/* 类型选择 */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          类型
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setType('expense')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              type === 'expense'
                ? 'bg-red-100 text-red-700 border-2 border-red-300'
                : 'bg-muted text-muted-foreground border-2 border-transparent'
            }`}
          >
            <ArrowDownRight className="inline h-4 w-4 mr-1" />支出
          </button>
          <button
            type="button"
            onClick={() => setType('income')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              type === 'income'
                ? 'bg-green-100 text-green-700 border-2 border-green-300'
                : 'bg-muted text-muted-foreground border-2 border-transparent'
            }`}
          >
            <Wallet className="inline h-4 w-4 mr-1" />收入
          </button>
          <button
            type="button"
            onClick={() => setType('transfer')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              type === 'transfer'
                ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                : 'bg-muted text-muted-foreground border-2 border-transparent'
            }`}
          >
            <Repeat className="inline h-4 w-4 mr-1" />转账
          </button>
        </div>
        <input type="hidden" name="type" value={type} />
      </div>

      {/* 金额 */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          金额
        </label>
        <input
          name="amount"
          type="number"
          step="0.01"
          required
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          className="w-full px-3 py-2 border-border rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="0.00"
        />
      </div>

      {/* 商户 */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          商户/备注
        </label>
        <input
          name="merchant"
          type="text"
          defaultValue={transaction?.merchant || ''}
          className="w-full px-3 py-2 border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="例如：星巴克"
        />
      </div>

      {/* 描述 */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          详细描述
        </label>
        <input
          name="description"
          type="text"
          defaultValue={transaction?.description || ''}
          className="w-full px-3 py-2 border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="可选"
        />
      </div>

      {/* 日期 */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
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
          className="w-full px-3 py-2 border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* 分类 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-foreground">
            分类
          </label>
          <button
            type="button"
            onClick={handleClassify}
            disabled={classifying}
            className="text-xs text-purple-600 hover:text-purple-700 disabled:opacity-50 font-medium"
          >
            {classifying ? <><Bot className="inline h-3 w-3 mr-1" />分析中...</> : <><Bot className="inline h-3 w-3 mr-1" />AI 分类</>}
          </button>
        </div>
        <SearchableSelect
          options={categoryOptions}
          value={selectedCategoryId}
          onChange={setSelectedCategoryId}
          placeholder="选择分类"
        />
        <input type="hidden" name="categoryId" value={selectedCategoryId} />
        {classifyError && (
          <p className="mt-1 text-xs text-destructive">{classifyError}</p>
        )}
        {classifyResult && (
          <div className="mt-2 p-2 bg-purple-50 rounded-md text-xs">
            <p className="text-purple-700">
              <Bot className="inline h-3 w-3 mr-1" />AI 建议: {classifyResult.reason}
              <span className="ml-1 text-purple-400">
                (置信度: {Math.round(classifyResult.confidence * 100)}%)
              </span>
            </p>
            {classifyResult.suggestNewCategory && classifyResult.newCategoryName && (
              <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-md">
                <p className="text-amber-800 font-medium">
                  <Lightbulb className="inline h-3 w-3 mr-1" />AI 建议创建新分类：{classifyResult.newCategoryName}
                  {classifyResult.suggestedParentName && (
                    <span className="font-normal">（父分类：{classifyResult.suggestedParentName}）</span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={handleCreateAndUseCategory}
                  disabled={creatingCategory || !classifyResult.suggestedParentId}
                  className="mt-1.5 px-3 py-1 bg-amber-500 text-white rounded-md text-xs font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {creatingCategory ? '创建中...' : '+ 创建并使用此分类'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 账户选择区域 - 根据交易类型动态展示 */}
      {type === 'expense' && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            支出账户
          </label>
          <SearchableSelect
            options={accountOptions}
            value={sourceAccountId}
            onChange={setSourceAccountId}
            placeholder="选择账户"
          />
          <input type="hidden" name="sourceAccountId" value={sourceAccountId} />
        </div>
      )}
      {type === 'income' && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            收入账户
          </label>
          <SearchableSelect
            options={accountOptions}
            value={toAccountId}
            onChange={setToAccountId}
            placeholder="选择账户"
          />
          <input type="hidden" name="toAccountId" value={toAccountId} />
        </div>
      )}
      {type === 'transfer' && (
        <>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              转出账户
            </label>
            <SearchableSelect
              options={accountOptions}
              value={sourceAccountId}
              onChange={setSourceAccountId}
              placeholder="选择转出账户"
            />
            <input type="hidden" name="sourceAccountId" value={sourceAccountId} />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              转入账户
            </label>
            <SearchableSelect
              options={accountOptions}
              value={toAccountId}
              onChange={setToAccountId}
              placeholder="选择转入账户"
            />
            <input type="hidden" name="toAccountId" value={toAccountId} />
          </div>
        </>
      )}

      {/* 支付通道 */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          支付通道
        </label>
        <select
          name="channel"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className="w-full px-3 py-2 border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">不指定</option>
          <option value="支付宝">支付宝</option>
          <option value="微信">微信</option>
          <option value="云闪付">云闪付</option>
          <option value="现金">现金</option>
          <option value="其他">其他</option>
        </select>
      </div>

      {/* 账本 */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          关联账本
        </label>
        <div className="flex flex-wrap gap-2">
          {ledgers.map((ledger) => (
            <button
              key={ledger.id}
              type="button"
              onClick={() => toggleLedger(ledger.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                selectedLedgerIds.includes(ledger.id)
                  ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                  : 'bg-muted text-muted-foreground border-2 border-transparent'
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
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2.5 bg-gradient-to-r from-[#34dbcb] to-[#3445db] text-white rounded-md text-sm font-medium hover:from-[#2bc4b6] hover:to-[#2d3bc4] disabled:opacity-50 transition-colors"
      >
        {isPending ? '保存中...' : isEdit ? '更新' : '添加交易'}
      </button>
    </form>
  )
}
