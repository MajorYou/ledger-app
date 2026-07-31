'use client'

import { useState, Fragment } from 'react'
import type { ParsedBillItem } from '@/lib/parsers'
import { SearchableSelect } from '@/components/searchable-select'
import type { QualityIssue, DuplicateCheck, CategoryOption, SmartSuggestion, PAGE_SIZE } from '@/lib/hooks/use-import-state'
import { AlertTriangle, MessageSquare } from 'lucide-react'

interface PreviewTableProps {
  items: ParsedBillItem[]
  selected: Set<number>
  categoryOverrides: Map<number, string>
  duplicateChecks: DuplicateCheck[]
  qualityIssues: QualityIssue[][]
  categories: CategoryOption[]
  categoryOptionsByType: Record<string, Array<{ value: string; label: string; group?: string }>>
  recentCountByType: { expense: number; income: number }
  currentPage: number
  smartSuggestions: SmartSuggestion[]
  onSelect: (i: number) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onCategoryChange: (index: number, value: string) => void
  onPageChange: (page: number) => void
  onQuickCreate: (idx: number) => void
  onApplySuggestion: (suggestion: SmartSuggestion) => void
  onDismissSuggestion: (sourceIdx: number) => void
  getEffectiveCategory: (item: ParsedBillItem, idx: number) => string | null
  isUnmatchedRow: (item: ParsedBillItem, idx: number) => boolean
  transactionListRef: React.RefObject<HTMLDivElement | null>
}

const PAGE_SIZE_CONST = 50

export function PreviewTable({
  items, selected, categoryOverrides, duplicateChecks, qualityIssues,
  categories, categoryOptionsByType, recentCountByType,
  currentPage, smartSuggestions,
  onSelect, onSelectAll, onDeselectAll, onCategoryChange, onPageChange,
  onQuickCreate, onApplySuggestion, onDismissSuggestion,
  getEffectiveCategory, isUnmatchedRow, transactionListRef,
}: PreviewTableProps) {
  // 惰性分类编辑：只有被点击的行才显示下拉
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const totalPages = Math.ceil(items.length / PAGE_SIZE_CONST)
  const startIdx = (currentPage - 1) * PAGE_SIZE_CONST
  const endIdx = Math.min(currentPage * PAGE_SIZE_CONST, items.length)
  const pageItems = items.slice(startIdx, endIdx)

  return (
    <div className="space-y-3">
      {/* 分页提示 */}
      {items.length > PAGE_SIZE_CONST && (
        <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border border-border rounded-t-md text-xs text-muted-foreground">
          <span>共 {items.length} 笔交易，当前显示第 {startIdx + 1}-{endIdx} 笔</span>
          <span>第 {currentPage} 页，共 {totalPages} 页</span>
        </div>
      )}

      {/* 交易列表 */}
      <div
        ref={transactionListRef}
        className={`bg-card rounded-md border border-border divide-y divide-border max-h-[60vh] overflow-y-auto${items.length > PAGE_SIZE_CONST ? ' rounded-t-none border-t-0' : ''}`}
      >
        {pageItems.map((item, sliceIdx) => {
          const i = startIdx + sliceIdx
          const unmatched = isUnmatchedRow(item, i)
          const isDup = duplicateChecks[i]?.isDuplicate
          const dupScore = duplicateChecks[i]?.duplicateScore || 0
          const dupReasons = duplicateChecks[i]?.duplicateReasons || []
          const dupTooltip = isDup ? `疑似与已有交易重复（相似度 ${Math.round(dupScore * 100)}%）${dupReasons.length > 0 ? '：' + dupReasons.join('，') : ''}` : ''
          const qIssuesForRow = qualityIssues[i] || []
          const isEditing = editingIndex === i

          return (
            <Fragment key={i}>
              <div
                className={`flex items-center gap-2 p-3 text-sm hover:bg-muted/30 ${
                  selected.has(i) ? '' : 'opacity-40'
                } ${unmatched ? 'bg-amber-50/70 dark:bg-amber-900/10' : ''} ${isDup ? 'bg-orange-50/50 dark:bg-orange-900/10' : ''}`}
                title={dupTooltip}
              >
                <input type="checkbox" checked={selected.has(i)} onChange={() => onSelect(i)} className="rounded shrink-0" />
                {isDup && (
                  <span className="text-orange-400 shrink-0" title={dupTooltip}><AlertTriangle className="h-4 w-4" /></span>
                )}
                <span className="text-muted-foreground w-20 shrink-0 text-xs">{item.transactionDate}</span>
                <span className="flex-1 truncate">
                  <span className="text-foreground">{item.merchant}</span>
                  {item.description !== item.merchant && (
                    <span className="text-muted-foreground text-xs ml-1">({item.description})</span>
                  )}
                  {item.paymentMethod && (
                    <span className="ml-1.5 px-1.5 py-0.5 bg-muted text-muted-foreground rounded text-[10px]">{item.paymentMethod}</span>
                  )}
                </span>
                {/* 数据质量标签 */}
                {qIssuesForRow.length > 0 && (
                  <span className="flex gap-1 shrink-0 flex-wrap justify-end">
                    {qIssuesForRow.map((q, qi) => (
                      <span key={qi} className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium leading-tight whitespace-nowrap ${
                        q.type === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'
                      }`} title={q.message}>
                        {q.message}
                      </span>
                    ))}
                  </span>
                )}
                <span className="text-xs text-muted-foreground w-10 shrink-0">{item.category}</span>

                {/* 惰性分类编辑：仅编辑中的行显示下拉 */}
                <div className="flex items-center gap-1 w-36 shrink-0">
                  {isEditing ? (
                    <>
                      <SearchableSelect
                        options={categoryOptionsByType[item.type] || []}
                        value={categoryOverrides.get(i) || ''}
                        onChange={(v) => {
                          onCategoryChange(i, v)
                        }}
                        placeholder={getEffectiveCategory(item, i) || '—'}
                        size="sm"
                        className="flex-1"
                        recentCount={recentCountByType[item.type as keyof typeof recentCountByType] || 0}
                      />
                      {unmatched && (
                        <button
                          type="button"
                          onClick={() => onQuickCreate(i)}
                          className="shrink-0 px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded text-xs font-medium hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors whitespace-nowrap"
                          title="创建新分类"
                        >
                          +新
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingIndex(i)}
                      className={`w-full text-left px-2 py-1 rounded text-xs truncate border border-transparent hover:border-border hover:bg-muted/50 transition-colors ${
                        categoryOverrides.has(i) ? 'text-primary font-medium' : 'text-muted-foreground'
                      }`}
                      title="点击修改分类"
                    >
                      {categoryOverrides.has(i)
                        ? categories.find(c => c.id === categoryOverrides.get(i))?.name || '—'
                        : getEffectiveCategory(item, i) || '—'
                      }
                    </button>
                  )}
                </div>

                <span className={`font-medium font-mono w-24 text-right shrink-0 ${item.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                  {item.type === 'income' ? '+' : '-'}¥{item.amount.toFixed(2)}
                </span>
                <span className="text-xs text-muted-foreground w-8 text-right shrink-0">{item.currency}</span>
              </div>

              {/* 智能建议条 */}
              {smartSuggestions.filter(s => s.sourceIdx === i).map(suggestion => (
                <div key={`sug-${i}`} className="bg-blue-50 dark:bg-blue-900/20 border-x border-blue-200 dark:border-blue-800 px-4 py-2.5 flex items-center gap-3 text-sm">
                  <span className="shrink-0"><MessageSquare className="h-4 w-4 text-blue-500" /></span>
                  <span className="text-blue-700 dark:text-blue-300 flex-1">
                    还有 <strong>{suggestion.targetIndices.length}</strong> 笔交易商户类似（&lsquo;{suggestion.merchant}&rsquo;），是否一起修改为 <strong>[{suggestion.categoryName}]</strong>？
                  </span>
                  <button
                    onClick={() => onApplySuggestion(suggestion)}
                    className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 transition-colors shrink-0"
                  >
                    全部修改
                  </button>
                  <button
                    onClick={() => onDismissSuggestion(i)}
                    className="px-3 py-1 bg-card border border-border text-muted-foreground rounded text-xs font-medium hover:bg-muted transition-colors shrink-0"
                  >
                    忽略
                  </button>
                </div>
              ))}
            </Fragment>
          )
        })}
      </div>

      {/* 分页控件 */}
      {items.length > PAGE_SIZE_CONST && (
        <div className="flex items-center justify-center gap-3 mt-3 mb-1">
          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 bg-card border border-border rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← 上一页
          </button>
          <span className="text-xs text-muted-foreground">
            第 {currentPage} / {totalPages} 页
          </span>
          <button
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            className="px-3 py-1.5 bg-card border border-border rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            下一页 →
          </button>
        </div>
      )}
    </div>
  )
}
