'use client'

import { useState, useEffect } from 'react'
import { useRefresh } from '@/components/refresh-provider'
import { Search, Package, CheckCircle, ArrowDownRight, Repeat, CreditCard, FolderOpen, Pin, EyeOff, AlertTriangle, Radio } from 'lucide-react'

// ---- 类型定义 ----

interface ReasonDetail {
  dimension: 'merchant' | 'amount' | 'time'
  label: string
  description: string
}

interface DedupPair {
  a: { id: string; merchant: string; amount: number; type: string; transactionTime: string; categoryName: string | null; channel?: string | null; sourceAccountName?: string | null }
  b: { id: string; merchant: string; amount: number; type: string; transactionTime: string; categoryName: string | null; channel?: string | null; sourceAccountName?: string | null }
  score: number
  reasons: string[]
  reasonDetails: ReasonDetail[]
  isRefund: boolean
  duplicateType: 'exact' | 'cross_platform' | 'fuzzy'
}

interface MergeTransaction {
  id: string
  merchant: string
  amount: number
  type: string
  description: string
  transactionTime: string
  categoryId: string | null
  categoryName: string | null
}

interface MergeGroup {
  id: string
  merchant: string
  categoryId: string
  categoryName: string
  categoryIcon: string
  transactions: MergeTransaction[]
  stats: {
    count: number
    totalAmount: number
    avgAmount: number
    dateRange: { from: string; to: string }
    isPeriodic: boolean
  }
}

interface CategoryOption {
  id: string
  name: string
  icon: string
}

type TabType = 'dedup' | 'merge'

export default function DedupPage() {
  const { dataVersion } = useRefresh()
  const [activeTab, setActiveTab] = useState<TabType>('dedup')

  // 去重状态
  const [pairs, setPairs] = useState<DedupPair[]>([])
  const [loading, setLoading] = useState(false)
  const [resolved, setResolved] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [resolving, setResolving] = useState<string | null>(null)

  // 归并状态
  const [groups, setGroups] = useState<MergeGroup[]>([])
  const [loadingMerge, setLoadingMerge] = useState(false)
  const [ignoredGroups, setIgnoredGroups] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [mergeError, setMergeError] = useState('')

  // 批量分类修改弹窗
  const [categoryModal, setCategoryModal] = useState<{ groupId: string; transactionIds: string[] } | null>(null)
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  const [savingCategory, setSavingCategory] = useState(false)
  const [markingFixed, setMarkingFixed] = useState<string | null>(null)

  // 扫描去重
  const scanDedup = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/dedup')
      const data = await res.json()
      if (data.error) setError(data.error)
      else setPairs(data.pairs || [])
    } catch {
      setError('扫描失败')
    }
    setLoading(false)
  }

  // 扫描归并建议
  const scanMerge = async () => {
    setLoadingMerge(true)
    setMergeError('')
    try {
      const res = await fetch('/api/dedup?type=merge')
      const data = await res.json()
      if (data.error) setMergeError(data.error)
      else setGroups(data.groups || [])
    } catch {
      setMergeError('扫描失败')
    }
    setLoadingMerge(false)
  }

  useEffect(() => { scanDedup() }, [])

  // 监听全局刷新（AI 助手操作 / 导航栏刷新按钮）
  useEffect(() => {
    if (dataVersion === 0) return
    scanDedup()
    if (activeTab === 'merge') scanMerge()
  }, [dataVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tab 切换时自动加载
  useEffect(() => {
    if (activeTab === 'merge' && groups.length === 0 && !loadingMerge) {
      scanMerge()
    }
  }, [activeTab])

  // 加载分类列表
  const loadCategories = async () => {
    try {
      const res = await fetch('/api/import/options')
      const data = await res.json()
      if (data.categories) {
        setCategories(data.categories.map((c: any) => ({ id: c.id, name: c.name, icon: c.icon })))
      }
    } catch { /* ignore */ }
  }

  // 打开分类选择弹窗
  const openCategoryModal = async (groupId: string, transactionIds: string[]) => {
    setCategoryModal({ groupId, transactionIds })
    await loadCategories()
    setSelectedCategoryId('')
  }

  // 批量修改分类
  const handleBatchCategory = async () => {
    if (!categoryModal || !selectedCategoryId) return
    setSavingCategory(true)
    try {
      const res = await fetch('/api/dedup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'batchCategory',
          transactionIds: categoryModal.transactionIds,
          categoryId: selectedCategoryId,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setCategoryModal(null)
      }
    } catch { /* ignore */ }
    setSavingCategory(false)
  }

  // 标记为固定支出
  const handleMarkFixed = async (groupId: string, transactionIds: string[]) => {
    setMarkingFixed(groupId)
    try {
      const res = await fetch('/api/dedup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'markFixed', transactionIds }),
      })
      const data = await res.json()
      if (data.success) {
        // 刷新归并建议
        await scanMerge()
      }
    } catch { /* ignore */ }
    setMarkingFixed(null)
  }

  // 忽略此组
  const handleIgnoreGroup = (groupId: string) => {
    setIgnoredGroups((prev) => new Set(prev).add(groupId))
  }

  // 展开/折叠
  const toggleExpand = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  // ---- 去重操作 ----
  const handleSkip = async (idA: string, idB: string) => {
    const key = `skip:${idA}:${idB}`
    setResolving(key)
    try {
      const res = await fetch('/api/dedup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'skip', idA, idB }),
      })
      const data = await res.json()
      if (data.success) {
        setResolved((prev) => new Set(prev).add(`${idA}:${idB}`))
      }
    } catch { /* ignore */ }
    setResolving(null)
  }

  const handleResolve = async (keepId: string, deleteId: string) => {
    const key = `resolve:${keepId}:${deleteId}`
    setResolving(key)
    try {
      const res = await fetch('/api/dedup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve', keepId, deleteId }),
      })
      const data = await res.json()
      if (data.success) {
        setResolved((prev) => new Set(prev).add(`${keepId}:${deleteId}`))
      }
    } catch { /* ignore */ }
    setResolving(null)
  }

  const handleOffset = async (keepId: string, deleteId: string) => {
    const key = `offset:${keepId}:${deleteId}`
    setResolving(key)
    try {
      const res = await fetch('/api/dedup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'offset', keepId, deleteId }),
      })
      const data = await res.json()
      if (data.success) {
        setResolved((prev) => new Set(prev).add(`${keepId}:${deleteId}`))
      }
    } catch { /* ignore */ }
    setResolving(null)
  }

  // ---- 工具函数 ----
  const typeClass = (t: string) => t === 'income' ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-destructive font-semibold'
  const typeSymbol = (t: string) => t === 'income' ? '+' : '-'
  const typeBadge = (t: string) => t === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
  const scoreColor = (s: number) => s >= 0.9 ? 'bg-red-100 text-red-700 border border-red-200' : s >= 0.7 ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-yellow-50 text-yellow-700 border border-yellow-200'

  const reasonDimensionColor = (dim: string) => {
    if (dim === 'merchant') return 'bg-purple-100 text-purple-700 border-purple-200'
    if (dim === 'amount') return 'bg-green-100 text-green-700 border-green-200'
    if (dim === 'time') return 'bg-blue-100 text-blue-700 border-blue-200'
    return 'bg-muted text-muted-foreground border-border'
  }

  const getOffsetPreview = (a: DedupPair['a'], b: DedupPair['b']) => {
    const aSigned = a.type === 'income' ? a.amount : -a.amount
    const bSigned = b.type === 'income' ? b.amount : -b.amount
    const net = aSigned + bSigned
    return {
      netAmount: net,
      netType: net >= 0 ? '收入' : '支出',
      netAbs: Math.abs(net),
      diff: Math.abs(Math.abs(a.amount) - Math.abs(b.amount)),
    }
  }

  const isBusy = (key: string) => resolving === key

  const formatDate = (iso: string) => iso.replace('T', ' ').slice(0, 16)

  return (
    <div className="mx-auto px-4 py-6">
      {/* Tab 切换 */}
      <div className="flex border-b border-border mb-6">
        <button
          onClick={() => setActiveTab('dedup')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'dedup'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Search className="inline h-4 w-4 mr-1" />重复检测
        </button>
        <button
          onClick={() => setActiveTab('merge')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'merge'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Package className="inline h-4 w-4 mr-1" />归并建议
        </button>
      </div>

      {/* ========== 重复检测 Tab ========== */}
      {activeTab === 'dedup' && (
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold text-foreground">去重检查</h1>
              <p className="text-sm text-muted-foreground mt-1">
                基于时间、金额、商户三个维度检测疑似重复交易
              </p>
            </div>
            <button
              onClick={scanDedup}
              disabled={loading}
              className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary disabled:opacity-50"
            >
              {loading ? '扫描中...' : '重新扫描'}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-destructive mb-4">{error}</div>
          )}

          {!loading && pairs.length === 0 && (
            <div className="text-center py-16">
              <p className="text-4xl mb-4"><CheckCircle className="inline h-8 w-8 text-green-600 dark:text-green-400" /></p>
              <p className="text-muted-foreground">未发现重复交易</p>
            </div>
          )}

          <div className="space-y-5">
            {pairs.map((pair, i) => {
              const key = `${pair.a.id}:${pair.b.id}`
              if (resolved.has(key)) return null

              const preview = pair.isRefund ? getOffsetPreview(pair.a, pair.b) : null

              return (
                <div key={key} className="bg-card rounded-md border border-border shadow-sm overflow-hidden">

                  {/* 顶部：相似度 + 退款标签 + 重复原因 */}
                  <div className="px-4 pt-4 pb-3 border-b border-border">
                    <div className="flex items-center flex-wrap gap-2 mb-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${scoreColor(pair.score)}`}>
                        相似度 {(pair.score * 100).toFixed(0)}%
                      </span>
                      {pair.duplicateType === 'exact' && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                          <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />精确重复
                        </span>
                      )}
                      {pair.duplicateType === 'cross_platform' && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">
                          <span className="inline-block w-2 h-2 rounded-full bg-orange-500 mr-1" />跨平台重复
                        </span>
                      )}
                      {pair.duplicateType === 'fuzzy' && !pair.isRefund && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-200">
                          <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1" />疑似重复
                        </span>
                      )}
                      {pair.isRefund && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                          <ArrowDownRight className="inline h-3 w-3 mr-1" />退款匹配
                        </span>
                      )}
                      {pair.reasonDetails.map((rd) => (
                        <span
                          key={rd.dimension}
                          className={`text-xs font-medium px-2 py-0.5 rounded-full border ${reasonDimensionColor(rd.dimension)}`}
                          title={rd.description}
                        >
                          {rd.label}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      重复原因：
                      {pair.reasonDetails.map((rd, idx) => (
                        <span key={rd.dimension}>
                          {idx > 0 && ' + '}
                          <span className={
                            rd.dimension === 'merchant' ? 'text-purple-600' :
                            rd.dimension === 'amount' ? 'text-green-600 dark:text-green-400' : 'text-primary'
                          }>
                            {rd.description}
                          </span>
                        </span>
                      ))}
                    </p>
                  </div>

                  {/* 两笔交易对比 */}
                  <div className="grid grid-cols-2 gap-0">
                    <div className="p-4 border-r-2 border-blue-200 bg-blue-50/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">
                          交易 A
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${typeBadge(pair.a.type)}`}>
                          {pair.a.type === 'income' ? '收入' : '支出'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-lg ${typeClass(pair.a.type)}`}>
                          {typeSymbol(pair.a.type)}¥{pair.a.amount.toFixed(2)}
                        </span>
                      </div>
                      <p className="text-sm text-foreground truncate font-medium">{pair.a.merchant || '未命名商户'}</p>
                      <p className="text-xs text-muted-foreground mt-1">{pair.a.transactionTime.replace('T', ' ')}</p>
                      {pair.a.channel && (
                        <span className="inline-block mt-1 text-xs text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded"><Radio className="inline h-3 w-3 mr-1" />{pair.a.channel}</span>
                      )}
                      {pair.a.sourceAccountName && (
                        <span className="inline-block mt-1 ml-1 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded"><CreditCard className="inline h-3 w-3 mr-1" />{pair.a.sourceAccountName}</span>
                      )}
                      {pair.a.categoryName && (
                        <span className="inline-block mt-1 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{pair.a.categoryName}</span>
                      )}
                    </div>

                    <div className="p-4 bg-orange-50/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-200">
                          交易 B
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${typeBadge(pair.b.type)}`}>
                          {pair.b.type === 'income' ? '收入' : '支出'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-lg ${typeClass(pair.b.type)}`}>
                          {typeSymbol(pair.b.type)}¥{pair.b.amount.toFixed(2)}
                        </span>
                      </div>
                      <p className="text-sm text-foreground truncate font-medium">{pair.b.merchant || '未命名商户'}</p>
                      <p className="text-xs text-muted-foreground mt-1">{pair.b.transactionTime.replace('T', ' ')}</p>
                      {pair.b.channel && (
                        <span className="inline-block mt-1 text-xs text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded"><Radio className="inline h-3 w-3 mr-1" />{pair.b.channel}</span>
                      )}
                      {pair.b.sourceAccountName && (
                        <span className="inline-block mt-1 ml-1 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded"><CreditCard className="inline h-3 w-3 mr-1" />{pair.b.sourceAccountName}</span>
                      )}
                      {pair.b.categoryName && (
                        <span className="inline-block mt-1 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{pair.b.categoryName}</span>
                      )}
                    </div>
                  </div>

                  {pair.isRefund && preview && (
                    <div className="px-4 py-3 bg-red-50 border-t border-red-100">
                      <p className="text-xs font-medium text-red-700 mb-1"><ArrowDownRight className="inline h-3 w-3 mr-1" />退款金额预览</p>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>抵消后净额：<span className="font-semibold text-red-700">{preview.netType} ¥{preview.netAbs.toFixed(2)}</span></span>
                        <span>差额：<span className="font-medium">¥{preview.diff.toFixed(2)}</span></span>
                      </div>
                    </div>
                  )}

                  <div className="px-4 py-3 bg-muted border-t border-border flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleSkip(pair.a.id, pair.b.id)}
                      disabled={resolving !== null}
                      className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-muted disabled:opacity-50 transition-colors"
                    >
                      {isBusy(`skip:${pair.a.id}:${pair.b.id}`) ? '处理中...' : '跳过此对（保留两笔）'}
                    </button>

                    <div className="flex gap-2">
                      {pair.isRefund && (
                        <button
                          onClick={() => handleOffset(pair.a.id, pair.b.id)}
                          disabled={resolving !== null}
                          className="px-3 py-1.5 text-xs font-medium text-orange-600 hover:text-orange-700 border border-orange-200 rounded-md hover:bg-orange-50 disabled:opacity-50 transition-colors"
                        >
                          {isBusy(`offset:${pair.a.id}:${pair.b.id}`) ? '处理中...' : '抵消金额（合并净额）'}
                        </button>
                      )}

                      <button
                        onClick={() => handleResolve(pair.a.id, pair.b.id)}
                        disabled={resolving !== null}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 border border-red-500 rounded-md disabled:opacity-50 transition-colors"
                      >
                        {isBusy(`resolve:${pair.a.id}:${pair.b.id}`) ? '处理中...' : '删除右侧，保留左侧'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ========== 归并建议 Tab ========== */}
      {activeTab === 'merge' && (
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold text-foreground">归并建议</h1>
              <p className="text-sm text-muted-foreground mt-1">
                识别周期性或相似的同类支出，提供归并建议
              </p>
            </div>
            <button
              onClick={scanMerge}
              disabled={loadingMerge}
              className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary disabled:opacity-50"
            >
              {loadingMerge ? '扫描中...' : '重新扫描'}
            </button>
          </div>

          {mergeError && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-destructive mb-4">{mergeError}</div>
          )}

          {loadingMerge && (
            <div className="text-center py-16">
              <p className="text-4xl mb-4"><Search className="inline h-8 w-8 text-muted-foreground" /></p>
              <p className="text-muted-foreground">正在分析交易数据...</p>
            </div>
          )}

          {!loadingMerge && groups.filter((g) => !ignoredGroups.has(g.id)).length === 0 && (
            <div className="text-center py-16">
              <p className="text-4xl mb-4"><CheckCircle className="inline h-8 w-8 text-green-600 dark:text-green-400" /></p>
              <p className="text-muted-foreground">暂无归并建议</p>
            </div>
          )}

          <div className="space-y-4">
            {groups
              .filter((g) => !ignoredGroups.has(g.id))
              .map((group) => {
                const isExpanded = expandedGroups.has(group.id)
                const txIds = group.transactions.map((t) => t.id)

                return (
                  <div
                    key={group.id}
                    className="bg-card rounded-md border border-border shadow-sm overflow-hidden"
                  >
                    {/* 卡片头部 */}
                    <div
                      className="px-4 py-3 cursor-pointer hover:bg-muted transition-colors"
                      onClick={() => toggleExpand(group.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{group.categoryIcon}</span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground">{group.merchant}</span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                                {group.stats.count} 笔
                              </span>
                              {group.stats.isPeriodic && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                                  <Repeat className="inline h-3 w-3 mr-1" />周期性支出
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{group.categoryName}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-right">
                          <div>
                            <p className="text-sm font-semibold text-foreground">¥{group.stats.totalAmount.toFixed(2)}</p>
                            <p className="text-xs text-muted-foreground">均 ¥{group.stats.avgAmount.toFixed(2)}</p>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <p>{formatDate(group.stats.dateRange.from)}</p>
                            <p>至 {formatDate(group.stats.dateRange.to)}</p>
                          </div>
                          <span className="text-muted-foreground">{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </div>
                    </div>

                    {/* 展开的交易明细 */}
                    {isExpanded && (
                      <>
                        <div className="border-t border-border">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-muted text-xs text-muted-foreground">
                                <th className="text-left px-4 py-2 font-medium">时间</th>
                                <th className="text-left px-4 py-2 font-medium">商户</th>
                                <th className="text-right px-4 py-2 font-medium">金额</th>
                                <th className="text-left px-4 py-2 font-medium">分类</th>
                                <th className="text-left px-4 py-2 font-medium">描述</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.transactions.map((tx) => (
                                <tr key={tx.id} className="border-t border-border hover:bg-muted">
                                  <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                                    {formatDate(tx.transactionTime)}
                                  </td>
                                  <td className="px-4 py-2 text-foreground">{tx.merchant || '-'}</td>
                                  <td className={`px-4 py-2 text-right font-medium ${tx.type === 'income' ? 'text-green-600' : 'text-destructive'}`}>
                                    {tx.type === 'income' ? '+' : '-'}¥{tx.amount.toFixed(2)}
                                  </td>
                                  <td className="px-4 py-2 text-xs text-muted-foreground">{tx.categoryName || '-'}</td>
                                  <td className="px-4 py-2 text-xs text-muted-foreground truncate max-w-32">{tx.description || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* 操作按钮 */}
                        <div className="px-4 py-3 bg-muted border-t border-border flex items-center gap-2">
                          <button
                            onClick={() => openCategoryModal(group.id, txIds)}
                            className="px-3 py-1.5 text-xs font-medium text-primary hover:text-primary/80 border border-primary/30 rounded-md hover:bg-primary/5 transition-colors"
                          >
                            <FolderOpen className="inline h-3 w-3 mr-1" />批量修改分类
                          </button>
                          <button
                            onClick={() => handleMarkFixed(group.id, txIds)}
                            disabled={markingFixed === group.id}
                            className="px-3 py-1.5 text-xs font-medium text-purple-600 hover:text-purple-700 border border-purple-200 rounded-md hover:bg-purple-50 disabled:opacity-50 transition-colors"
                          >
                            {markingFixed === group.id ? '处理中...' : <><Pin className="inline h-3 w-3 mr-1" />标记为固定支出</>}
                          </button>
                          <button
                            onClick={() => handleIgnoreGroup(group.id)}
                            className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-muted transition-colors"
                          >
                            <EyeOff className="inline h-3 w-3 mr-1" />忽略此组
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
          </div>
        </>
      )}

      {/* ========== 批量修改分类弹窗 ========== */}
      {categoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setCategoryModal(null)}>
          <div
            className="bg-card rounded-md shadow-xl w-full max-w-sm mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-foreground mb-4">批量修改分类</h3>
            <p className="text-xs text-muted-foreground mb-4">
              将选中的交易分类统一修改为：
            </p>
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring mb-4"
            >
              <option value="">请选择分类...</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCategoryModal(null)}
                className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-md hover:bg-muted"
              >
                取消
              </button>
              <button
                onClick={handleBatchCategory}
                disabled={!selectedCategoryId || savingCategory}
                className="px-4 py-2 text-sm text-white bg-primary rounded-md hover:bg-primary disabled:opacity-50"
              >
                {savingCategory ? '保存中...' : '确认修改'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
