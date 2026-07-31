'use client'

import { useRef } from 'react'
import type { CategoryOption } from '@/lib/hooks/use-import-state'
import { BarChart3, AlertTriangle, Brain, MessageSquare } from 'lucide-react'

interface StatsPreviewData {
  topCategories: Array<{ name: string; amount: number; count: number; color: string; icon: string }>
  totalExpense: number
  totalIncome: number
  avgAmount: number
  maxItem: { merchant: string; amount: number } | null
  minDate: Date | null
  maxDate: Date | null
  daySpan: number
  largeCount: number
  dateAnomalyCount: number
  totalSelected: number
  topNCount: number
  topNPct: number
}

interface StatsPreviewProps {
  statsPreview: StatsPreviewData | null
  statsCollapsed: boolean
  onToggle: () => void
  categoryOverridesSize: number
  categoryDistRef: React.RefObject<HTMLDivElement | null>
  transactionListRef: React.RefObject<HTMLDivElement | null>
}

export function StatsPreview({
  statsPreview, statsCollapsed, onToggle, categoryOverridesSize,
  categoryDistRef, transactionListRef,
}: StatsPreviewProps) {
  if (!statsPreview) return null

  return (
    <div className="bg-card rounded-md border border-border">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted/50 transition-colors rounded-md"
      >
        <span><BarChart3 className="inline h-4 w-4 mr-1" />统计预览</span>
        <span className="text-muted-foreground text-xs">{statsCollapsed ? '▶ 展开' : '▼ 收起'}</span>
      </button>
      {!statsCollapsed && (
        <>
          <div className="px-4 pb-4 space-y-4">
            {/* 分类分布 */}
            {statsPreview.topCategories.length > 0 && (
              <div ref={categoryDistRef}>
                <h4 className="text-xs font-medium text-muted-foreground mb-2">
                  按分类分布（Top {statsPreview.topCategories.length}）
                </h4>
                <div className="space-y-1.5">
                  {statsPreview.topCategories.map((cat) => {
                    const pct = statsPreview.totalExpense > 0 ? (cat.amount / statsPreview.totalExpense * 100) : 0
                    return (
                      <div key={cat.name} className="flex items-center gap-2 text-xs">
                        <span className="w-20 text-muted-foreground truncate shrink-0" title={cat.name}>
                          <span className="mr-1">{cat.icon}</span>{cat.name}
                        </span>
                        <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: cat.color }} />
                        </div>
                        <span className="w-20 text-right font-mono text-muted-foreground shrink-0">¥{cat.amount.toFixed(2)}</span>
                        <span className="w-10 text-right text-muted-foreground shrink-0">{pct.toFixed(0)}%</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 金额统计 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">总金额</p>
                <p className="text-sm font-bold font-mono text-destructive">-¥{statsPreview.totalExpense.toFixed(2)}</p>
                {statsPreview.totalIncome > 0 && (
                  <p className="text-xs text-green-600 dark:text-green-400 font-mono mt-0.5">+¥{statsPreview.totalIncome.toFixed(2)} 收入</p>
                )}
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">平均单笔</p>
                <p className="text-sm font-bold font-mono text-foreground">¥{statsPreview.avgAmount.toFixed(2)}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">最大单笔</p>
                <p className="text-sm font-bold font-mono text-foreground">¥{statsPreview.maxItem?.amount.toFixed(2) || '0.00'}</p>
                {statsPreview.maxItem && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate" title={statsPreview.maxItem.merchant}>
                    {statsPreview.maxItem.merchant}
                  </p>
                )}
              </div>
            </div>

            {/* 日期范围 */}
            {statsPreview.minDate && statsPreview.maxDate && (
              <div className="text-xs text-muted-foreground text-center">
                {statsPreview.minDate.toISOString().slice(0, 10)} 至 {statsPreview.maxDate.toISOString().slice(0, 10)}，共 {statsPreview.daySpan} 天
              </div>
            )}

            {/* 异常提示 */}
            <div className="flex flex-wrap gap-2">
              {statsPreview.largeCount > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-300">
                  <span><AlertTriangle className="inline h-3 w-3" /></span>
                  <span>存在 {statsPreview.largeCount} 笔大额交易（超过平均值 3 倍）</span>
                </div>
              )}
              {statsPreview.dateAnomalyCount > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-300">
                  <span><AlertTriangle className="inline h-3 w-3" /></span>
                  <span>存在 {statsPreview.dateAnomalyCount} 笔日期异常交易（不在近 3 个月内）</span>
                </div>
              )}
            </div>
          </div>

          {/* 汇总行 */}
          <div className="px-4 pb-3 flex items-center justify-between text-xs border-t border-border pt-3">
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground">
                共 {statsPreview.totalSelected} 笔交易，¥{statsPreview.totalExpense.toFixed(2)}（前 {statsPreview.topNCount} 名分类占 {statsPreview.topNPct}%）
              </span>
              {categoryOverridesSize > 0 && (
                <button
                  onClick={() => transactionListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="flex items-center gap-1 px-2 py-0.5 bg-violet-50 border border-violet-200 dark:bg-violet-900/20 dark:border-violet-800 rounded text-violet-600 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
                >
                  <span><Brain className="inline h-3 w-3 mr-1" /></span>
                  <span>已修正 {categoryOverridesSize} 笔分类</span>
                </button>
              )}
            </div>
            {statsPreview.topCategories.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => categoryDistRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                  className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 rounded text-blue-600 dark:text-blue-300 hover:bg-blue-100 transition-colors"
                >
                  <span><BarChart3 className="inline h-3 w-3 mr-1" /></span>
                  <span>查看分类详情</span>
                </button>
                <button
                  onClick={() => transactionListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="flex items-center gap-1 px-2 py-0.5 bg-muted border border-border rounded text-muted-foreground hover:bg-muted/80 transition-colors"
                >
                  <span><MessageSquare className="inline h-3 w-3 mr-1" /></span>
                  <span>查看交易列表</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
