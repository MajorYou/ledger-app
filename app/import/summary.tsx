'use client'

import type { ImportSummary, DedupWarningItem } from '@/lib/hooks/use-import-state'
import { CheckCircle, Brain, AlertTriangle } from 'lucide-react'

interface SummaryProps {
  summary: ImportSummary
  dedupWarnings: DedupWarningItem[]
  isQuickImportResult: boolean
  onReset: () => void
}

export function Summary({ summary, dedupWarnings, isQuickImportResult, onReset }: SummaryProps) {
  return (
    <div className="bg-card rounded-lg border border-border p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex items-center gap-2 mb-5">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-md bg-emerald-100 dark:bg-emerald-900/30">
          <span className="text-xl"><CheckCircle className="h-5 w-5 text-emerald-600" /></span>
        </div>
        <h2 className="text-lg font-semibold text-foreground">导入完成</h2>
        {isQuickImportResult && (
          <span className="ml-2 px-2.5 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">待审核</span>
        )}
      </div>

      {/* 指标卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className={`rounded-md p-4 text-center border ${isQuickImportResult ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800' : 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800'}`}>
          <p className={`text-2xl font-bold font-mono ${isQuickImportResult ? 'text-yellow-600' : 'text-emerald-600'}`}>{summary.imported}</p>
          <p className={`text-xs ${isQuickImportResult ? 'text-yellow-600' : 'text-emerald-600'} mt-1`}>
            {isQuickImportResult ? '已导入（待审核）' : '成功导入'}
          </p>
          <p className={`text-xs font-mono ${isQuickImportResult ? 'text-yellow-500' : 'text-emerald-500'} mt-0.5`}>¥{summary.totalAmount.toFixed(2)}</p>
        </div>
        <div className="bg-muted/50 rounded-md p-4 text-center border border-border">
          <p className="text-2xl font-bold font-mono text-muted-foreground">{summary.skipped}</p>
          <p className="text-xs text-muted-foreground mt-1">跳过（未勾选）</p>
        </div>
        <div className="bg-orange-50 rounded-md p-4 text-center border border-orange-200 dark:bg-orange-900/20 dark:border-orange-800">
          <p className="text-2xl font-bold font-mono text-orange-500">{summary.duplicates}</p>
          <p className="text-xs text-orange-500 mt-1">疑似重复（已排除）</p>
        </div>
        <div className="bg-blue-50 rounded-md p-4 text-center border border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
          <p className="text-2xl font-bold font-mono text-blue-600">{summary.learned}</p>
          <p className="text-xs text-blue-500 mt-1">新学习规则</p>
        </div>
      </div>

      {/* 分类修正提示 */}
      {summary.corrections && summary.corrections > 0 && (
        <div className="bg-violet-50 border border-violet-200 dark:bg-violet-900/20 dark:border-violet-800 rounded-md p-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm"><Brain className="inline h-4 w-4 mr-1" /></span>
            <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">
              已记忆 {summary.corrections} 条分类修正，下次导入同一商户时将自动应用
            </span>
          </div>
        </div>
      )}

      {/* 重复警告 */}
      {dedupWarnings.length > 0 && (
        <div className="bg-warning/10 border border-warning/20 rounded-md p-3 mb-4">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm"><AlertTriangle className="inline h-4 w-4 mr-1" /></span>
            <span className="text-xs font-semibold text-warning">{dedupWarnings.length} 笔疑似重复交易已导入，建议检查</span>
          </div>
          <div className="space-y-1">
            {dedupWarnings.slice(0, 3).map((w, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-warning/80">
                <span className="truncate">{w.merchant}</span>
                <span className="shrink-0 font-mono">¥{w.amount.toFixed(2)}</span>
              </div>
            ))}
            {dedupWarnings.length > 3 && (
              <p className="text-xs text-warning/60">...还有 {dedupWarnings.length - 3} 笔</p>
            )}
          </div>
          <a href="/dedup" className="text-xs text-warning underline hover:opacity-80 mt-2 inline-block">
            前往去重页面查看 →
          </a>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-3">
        {isQuickImportResult ? (
          <>
            <a href="/transactions?confirmed=false"
              className="px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600 transition-colors">
              去审核 →
            </a>
            <a href="/transactions"
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
              查看刚导入的交易 →
            </a>
          </>
        ) : (
          <a href="/transactions"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
            查看刚导入的交易 →
          </a>
        )}
        <button onClick={onReset}
          className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors">
          继续导入
        </button>
      </div>
    </div>
  )
}
