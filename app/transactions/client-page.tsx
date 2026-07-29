'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { TransactionForm } from '@/components/transaction-form'
import { deleteTransaction, getTransactionsPaginated, type TransactionFilters, type SortOption } from '@/lib/actions/transactions'
import { SearchableSelect } from '@/components/searchable-select'
import { useRefresh } from '@/components/refresh-provider'

interface Props {
  initialData: { transactions: any[]; hasMore: boolean }
  categories: any[]
  accounts: any[]
  ledgers: any[]
  initialFilters: TransactionFilters
  initialSort: SortOption
}

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'time_desc', label: '时间倒序' },
  { value: 'time_asc', label: '时间正序' },
  { value: 'amount_desc', label: '金额从高到低' },
  { value: 'amount_asc', label: '金额从低到高' },
]

function filtersToParams(filters: TransactionFilters, sort: SortOption): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.categoryId) params.set('category', filters.categoryId)
  if (filters.ledgerId) params.set('ledger', filters.ledgerId)
  if (filters.accountId) params.set('account', filters.accountId)
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
  if (filters.dateTo) params.set('dateTo', filters.dateTo)
  if (filters.amountMin) params.set('amountMin', filters.amountMin)
  if (filters.amountMax) params.set('amountMax', filters.amountMax)
  if (filters.type && filters.type !== 'all') params.set('type', filters.type)
  if (filters.keyword) params.set('keyword', filters.keyword)
  if (sort !== 'time_desc') params.set('sort', sort)
  return params
}

function paramsToFilters(params: URLSearchParams): TransactionFilters {
  return {
    categoryId: params.get('category') || undefined,
    ledgerId: params.get('ledger') || undefined,
    accountId: params.get('account') || undefined,
    dateFrom: params.get('dateFrom') || undefined,
    dateTo: params.get('dateTo') || undefined,
    amountMin: params.get('amountMin') || undefined,
    amountMax: params.get('amountMax') || undefined,
    type: params.get('type') || undefined,
    keyword: params.get('keyword') || undefined,
  }
}

export function ClientTransactionsPage({
  initialData,
  categories,
  accounts,
  ledgers,
  initialFilters,
  initialSort,
}: Props) {
  const [transactions, setTransactions] = useState<any[]>(initialData.transactions)
  const [hasMore, setHasMore] = useState(initialData.hasMore)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState<TransactionFilters>(initialFilters)
  const [sort, setSort] = useState<SortOption>(initialSort)
  const [filterOpen, setFilterOpen] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingTx, setEditingTx] = useState<any>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(false)
  const { dataVersion } = useRefresh()

  // 监听全局刷新（AI 助手操作 / 导航栏刷新按钮）
  useEffect(() => {
    if (dataVersion === 0) return // 初始值不触发
    getTransactionsPaginated(filters, sort).then((result) => {
      setTransactions(result.transactions)
      setHasMore(result.hasMore)
    })
  }, [dataVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  // 分类选项（含子分类分组）
  const categoryOptions = categories.map((c: any) => ({
    value: c.id,
    label: c.icon + ' ' + c.name,
    group: c.parentId ? '子分类' : undefined,
  }))
  const accountOptions = accounts.map((a: any) => ({ value: a.id, label: a.name }))
  const ledgerOptions = ledgers.map((l: any) => ({ value: l.id, label: l.name }))

  // 更新筛选条件 → 同步 URL + 重置列表
  const applyFilters = useCallback(async (newFilters: TransactionFilters, newSort: SortOption) => {
    const params = filtersToParams(newFilters, newSort)
    const qs = params.toString()
    window.history.pushState(null, '', qs ? `?${qs}` : window.location.pathname)
    setLoading(true)
    try {
      const result = await getTransactionsPaginated(newFilters, newSort)
      setTransactions(result.transactions)
      setHasMore(result.hasMore)
    } finally {
      setLoading(false)
    }
  }, [])

  // 浏览器前进后退同步
  useEffect(() => {
    const handler = () => {
      const params = new URLSearchParams(window.location.search)
      const newFilters = paramsToFilters(params)
      const newSort = (params.get('sort') || 'time_desc') as SortOption
      setFilters(newFilters)
      setSort(newSort)
      getTransactionsPaginated(newFilters, newSort).then((result) => {
        setTransactions(result.transactions)
        setHasMore(result.hasMore)
      })
    }
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  // 无限滚动
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingRef.current) {
          loadingRef.current = true
          setLoading(true)
          const lastTx = transactions[transactions.length - 1]
          getTransactionsPaginated(filters, sort, lastTx?.id)
            .then((result) => {
              setTransactions((prev) => [...prev, ...result.transactions])
              setHasMore(result.hasMore)
            })
            .finally(() => {
              setLoading(false)
              loadingRef.current = false
            })
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, transactions, filters, sort])

  const handleFilterChange = (key: keyof TransactionFilters, value: string) => {
    const newFilters = { ...filters, [key]: value || undefined }
    setFilters(newFilters)
    applyFilters(newFilters, sort)
  }

  const handleSortChange = (newSort: SortOption) => {
    setSort(newSort)
    applyFilters(filters, newSort)
  }

  const removeFilter = (key: keyof TransactionFilters) => {
    const newFilters = { ...filters }
    // 日期范围作为一组清除
    if (key === 'dateFrom') {
      newFilters.dateFrom = undefined
      newFilters.dateTo = undefined
    } else if (key === 'amountMin') {
      newFilters.amountMin = undefined
      newFilters.amountMax = undefined
    } else {
      (newFilters as any)[key] = undefined
    }
    setFilters(newFilters)
    applyFilters(newFilters, sort)
  }

  const resetFilters = () => {
    const empty: TransactionFilters = {}
    setFilters(empty)
    setSort('time_desc')
    applyFilters(empty, 'time_desc')
  }

  const hasActiveFilters =
    filters.categoryId || filters.ledgerId || filters.accountId ||
    filters.dateFrom || filters.dateTo || filters.amountMin || filters.amountMax ||
    (filters.type && filters.type !== 'all') || filters.keyword

  const filterChips: { key: keyof TransactionFilters; label: string }[] = []
  if (filters.categoryId) {
    const cat = categories.find((c: any) => c.id === filters.categoryId)
    filterChips.push({ key: 'categoryId', label: cat ? `${cat.icon} ${cat.name}` : '分类' })
  }
  if (filters.ledgerId) {
    const led = ledgers.find((l: any) => l.id === filters.ledgerId)
    filterChips.push({ key: 'ledgerId', label: led ? `📒 ${led.name}` : '账本' })
  }
  if (filters.accountId) {
    const acc = accounts.find((a: any) => a.id === filters.accountId)
    filterChips.push({ key: 'accountId', label: acc ? `💳 ${acc.name}` : '账户' })
  }
  if (filters.dateFrom || filters.dateTo) {
    const from = filters.dateFrom || '...'
    const to = filters.dateTo || '...'
    filterChips.push({ key: 'dateFrom', label: `📅 ${from} ~ ${to}` })
  }
  if (filters.amountMin || filters.amountMax) {
    const min = filters.amountMin || '0'
    const max = filters.amountMax || '∞'
    filterChips.push({ key: 'amountMin', label: `💰 ¥${min} ~ ¥${max}` })
  }
  if (filters.type && filters.type !== 'all') {
    filterChips.push({ key: 'type', label: filters.type === 'expense' ? '支出' : '收入' })
  }
  if (filters.keyword) {
    filterChips.push({ key: 'keyword', label: `🔍 ${filters.keyword}` })
  }

  // 批量选择
  const toggleSelect = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelected(next)
  }

  const selectAll = () => {
    if (selected.size === transactions.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(transactions.map((tx: { id: string }) => tx.id)))
    }
  }

  const handleBatchDelete = async () => {
    if (selected.size === 0) return
    setDeleting(true)
    const ids = [...selected]
    for (const id of ids) {
      await deleteTransaction(id)
    }
    setDeleting(false)
    setSelected(new Set())
    setShowDeleteConfirm(false)
    // 刷新当前列表
    const result = await getTransactionsPaginated(filters, sort)
    setTransactions(result.transactions)
    setHasMore(result.hasMore)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这条交易记录？')) return
    await deleteTransaction(id)
    setTransactions((prev) => prev.filter((tx) => tx.id !== id))
  }

  const handleEdit = (tx: any) => {
    setEditingTx(tx)
    setShowForm(true)
  }

  const handleAdd = () => {
    setEditingTx(null)
    setShowForm(true)
  }

  const handleSuccess = async () => {
    setShowForm(false)
    setEditingTx(null)
    // 刷新列表
    const result = await getTransactionsPaginated(filters, sort)
    setTransactions(result.transactions)
    setHasMore(result.hasMore)
  }

  const formatDate = (d: string) => {
    const date = new Date(d)
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', weekday: 'short' })
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* 顶栏 */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-zinc-900">交易记录</h1>
        <div className="flex gap-2">
          {selected.size > 0 ? (
            <>
              <span className="text-sm text-zinc-500 self-center">已选 {selected.size} 笔</span>
              <button onClick={() => setSelected(new Set())} className="px-3 py-2 text-sm text-zinc-500 hover:text-zinc-700">取消</button>
              <button onClick={() => setShowDeleteConfirm(true)} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">删除选中</button>
            </>
          ) : (
            <>
              <button onClick={selectAll} className="px-3 py-2 text-sm text-zinc-500 hover:text-zinc-700">全选</button>
              <button onClick={handleAdd} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">+ 添加交易</button>
            </>
          )}
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterOpen(!filterOpen)}
            className={`px-3 py-2 text-sm rounded-lg border transition-colors ${hasActiveFilters ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-zinc-300 text-zinc-600 hover:bg-zinc-50'}`}
          >
            {filterOpen ? '收起筛选' : '筛选'}
          </button>
          {/* 排序按钮 */}
          <div className="flex rounded-lg border border-zinc-300 overflow-hidden">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleSortChange(opt.value)}
                className={`px-2.5 py-1.5 text-xs transition-colors ${sort === opt.value ? 'bg-blue-600 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {hasActiveFilters && (
            <button onClick={resetFilters} className="px-3 py-2 text-sm text-red-500 hover:text-red-700">重置</button>
          )}
        </div>

        {/* 展开的筛选面板 */}
        {filterOpen && (
          <div className="mt-3 p-4 bg-white rounded-xl border border-zinc-200 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">分类</label>
                <SearchableSelect
                  options={categoryOptions}
                  value={filters.categoryId || ''}
                  onChange={(v) => handleFilterChange('categoryId', v)}
                  placeholder="全部分类"
                  size="sm"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">账本</label>
                <SearchableSelect
                  options={ledgerOptions}
                  value={filters.ledgerId || ''}
                  onChange={(v) => handleFilterChange('ledgerId', v)}
                  placeholder="全部账本"
                  size="sm"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">账户</label>
                <SearchableSelect
                  options={accountOptions}
                  value={filters.accountId || ''}
                  onChange={(v) => handleFilterChange('accountId', v)}
                  placeholder="全部账户"
                  size="sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">开始日期</label>
                <input
                  type="date"
                  value={filters.dateFrom || ''}
                  onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">结束日期</label>
                <input
                  type="date"
                  value={filters.dateTo || ''}
                  onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">最小金额</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={filters.amountMin || ''}
                  onChange={(e) => handleFilterChange('amountMin', e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-1.5 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">最大金额</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={filters.amountMax || ''}
                  onChange={(e) => handleFilterChange('amountMax', e.target.value)}
                  placeholder="不限"
                  className="w-full px-3 py-1.5 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">类型</label>
                <div className="flex rounded-lg border border-zinc-300 overflow-hidden">
                  {[
                    { value: 'all', label: '全部' },
                    { value: 'expense', label: '支出' },
                    { value: 'income', label: '收入' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleFilterChange('type', opt.value === 'all' ? '' : opt.value)}
                      className={`flex-1 px-3 py-1.5 text-sm transition-colors ${
                        (opt.value === 'all' && !filters.type) || filters.type === opt.value
                          ? 'bg-blue-600 text-white'
                          : 'text-zinc-600 hover:bg-zinc-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">关键词</label>
                <input
                  type="text"
                  value={filters.keyword || ''}
                  onChange={(e) => handleFilterChange('keyword', e.target.value)}
                  placeholder="搜索商户/描述..."
                  className="w-full px-3 py-1.5 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* 筛选标签 chips */}
        {filterChips.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {filterChips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-200"
              >
                {chip.label}
                <button
                  onClick={() => removeFilter(chip.key)}
                  className="text-blue-400 hover:text-blue-700"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 添加/编辑弹窗 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{editingTx ? '编辑交易' : '添加交易'}</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-400 hover:text-zinc-600 text-xl">✕</button>
            </div>
            <TransactionForm
              categories={categories}
              accounts={accounts}
              ledgers={ledgers}
              transaction={
                editingTx
                  ? { ...editingTx, transactionTime: new Date(editingTx.transactionTime), transactionLedgers: editingTx.transactionLedgers || [] }
                  : undefined
              }
              onSuccess={handleSuccess}
            />
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-red-600 mb-2">⚠️ 确认批量删除</h3>
            <p className="text-sm text-zinc-600 mb-1">将删除 <span className="font-bold text-red-500">{selected.size} 笔</span> 交易记录</p>
            <p className="text-xs text-zinc-400 mb-6">此操作不可撤销，请谨慎操作。</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting} className="flex-1 px-4 py-2 border border-zinc-200 rounded-lg text-sm font-medium hover:bg-zinc-50">取消</button>
              <button onClick={handleBatchDelete} disabled={deleting} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {deleting ? '删除中...' : `确认删除 ${selected.size} 笔`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 列表 */}
      {transactions.length === 0 && !loading ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-4">{hasActiveFilters ? '🔍' : '📝'}</p>
          <p className="text-zinc-500">{hasActiveFilters ? '没有匹配的交易记录' : '还没有交易记录'}</p>
          <p className="text-sm text-zinc-400 mt-1">{hasActiveFilters ? '尝试调整筛选条件' : '点击上方按钮开始记账'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {transactions.map((tx: any) => (
            <div
              key={tx.id}
              className={`bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow group ${
                selected.has(tx.id) ? 'border-blue-400 ring-1 ring-blue-200' : 'border-zinc-200'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(tx.id)}
                  onChange={() => toggleSelect(tx.id)}
                  className="mt-1.5 rounded shrink-0"
                />
                <span className="text-2xl mt-0.5">{tx.category?.icon || '📦'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-zinc-900 truncate">{tx.merchant || tx.description || '未命名交易'}</p>
                    {tx.transactionLedgers?.length > 0 && (
                      <div className="flex gap-1">
                        {tx.transactionLedgers.map((tl: any) => (
                          <span key={tl.ledgerId} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: tl.ledger.color + '20', color: tl.ledger.color }}>
                            {tl.ledger.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-400">
                    <span>{formatDate(tx.transactionTime)}</span>
                    {tx.account && <span>· {tx.account.name}</span>}
                    {tx.category && <span className="text-zinc-500">· {tx.category.name}</span>}
                  </div>
                  {tx.description && <p className="text-xs text-zinc-400 mt-0.5 truncate">{tx.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold whitespace-nowrap ${tx.type === 'income' ? 'text-green-500' : 'text-red-500'}`}>
                    {tx.type === 'income' ? '+' : '-'}¥{Number(tx.amount).toFixed(2)}
                  </span>
                  <div className="hidden group-hover:flex items-center gap-1">
                    <button onClick={() => handleEdit(tx)} className="text-xs text-zinc-400 hover:text-blue-500 p-1">编辑</button>
                    <button onClick={() => handleDelete(tx.id)} className="text-xs text-zinc-400 hover:text-red-500 p-1">删除</button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* 哨兵元素 + loading */}
          <div ref={sentinelRef} className="py-4 text-center">
            {loading && (
              <div className="flex items-center justify-center gap-2 text-zinc-400 text-sm">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                加载中...
              </div>
            )}
            {!hasMore && transactions.length > 0 && (
              <p className="text-xs text-zinc-400">已加载全部记录</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
