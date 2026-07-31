'use client'

import { useImportState } from '@/lib/hooks/use-import-state'
import { SearchableSelect } from '@/components/searchable-select'
import { FileUpload } from './file-upload'
import { PreviewTable } from './preview-table'
import { StatsPreview } from './stats-preview'
import { Summary } from './summary'
import { RefundModal } from './refund-modal'
import { QuickCreateModal } from './quick-create-modal'
import { Brain, AlertTriangle } from 'lucide-react'

export default function ImportPage() {
  const state = useImportState()
  const {
    loading, error, message, items, selected, importing, done, learned, summary,
    dedupWarnings, duplicateChecks, qualityIssues, importMode, quickImporting, isQuickImportResult,
    refundChoice, refundWaiting, quickCreate,
    categories, selectedLedgerId, categoryOverrides, currentPage,
    categoryOptionsByType, parentCategoryOptions,
    recentCountByType, statsCollapsed, duplicateCount, qualityIssueCount,
    expenseCount, incomeCount, totalExpense,
    statsPreview, smartSuggestions,
    categoryDistRef, transactionListRef,
    handleFile, handlePaste, setImportMode, toggleSelect, selectAll, deselectAll,
    handleImport, handleRefundDelete, handleRefundAddIncome,
    setCategoryOverrides, setCurrentPage, setStatsCollapsed,
    setQuickCreate, openQuickCreate, handleQuickCreate,
    applySmartSuggestion, dismissSmartSuggestion,
    getEffectiveCategory, isUnmatchedRow, resetSummary,
  } = state

  const showUpload = items.length === 0 && !loading && !summary && !quickImporting
  const showPreview = items.length > 0

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground mb-1">导入账单</h1>
        <p className="text-sm text-muted-foreground">支持招商银行 PDF、支付宝/微信 CSV、微信 XLSX 账单，或粘贴文本</p>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4 text-sm text-destructive mb-4">{error}</div>
      )}

      {/* 消息提示 */}
      {message && !error && !loading && !summary && !quickImporting && (
        <div className={`rounded-md p-4 text-sm mb-4 ${
          items.length > 0
            ? 'bg-green-50 border border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300'
            : 'bg-warning/10 border border-warning/20 text-warning'
        }`}>{message}</div>
      )}

      {/* 导入进度条 */}
      {importing && (
        <div className="bg-card border border-border rounded-md p-4 text-sm mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-foreground">正在导入 {done}/{selected.size}...</span>
            {learned > 0 && <span className="text-muted-foreground"><Brain className="inline h-4 w-4 mr-1" />已学习 {learned} 条分类规则</span>}
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent to-primary rounded-full transition-all duration-300"
              style={{ width: `${selected.size > 0 ? Math.min(done / selected.size * 100, 100) : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* 重复交易警告 */}
      {!importing && dedupWarnings.length > 0 && showPreview && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg"><AlertTriangle className="h-5 w-5" /></span>
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">发现 {dedupWarnings.length} 笔疑似重复交易</span>
          </div>
          <div className="space-y-1.5 mb-3">
            {dedupWarnings.map((w, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                <span className="truncate">{w.merchant}</span>
                <span className="shrink-0 font-mono">¥{w.amount.toFixed(2)}</span>
                <span className="text-xs text-amber-400 shrink-0">疑似与已有交易重复</span>
              </div>
            ))}
          </div>
          <a href="/dedup" className="text-sm text-amber-700 dark:text-amber-300 underline hover:text-amber-800">
            前往去重页面查看 →
          </a>
        </div>
      )}

      {/* 导入完成汇总 */}
      {summary && items.length === 0 && !loading && !importing && !quickImporting && (
        <Summary summary={summary} dedupWarnings={dedupWarnings} isQuickImportResult={isQuickImportResult} onReset={resetSummary} />
      )}

      {/* 上传阶段：全宽居中 */}
      {showUpload && (
        <FileUpload
          onFileParsed={handleFile}
          onPaste={handlePaste}
          importMode={importMode}
          onModeChange={setImportMode}
          loading={loading}
          quickImporting={quickImporting}
        />
      )}

      {/* 预览阶段：双栏布局 */}
      {showPreview && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
          {/* 左侧：预览表格 */}
          <div className="min-w-0">
            <PreviewTable
              items={items}
              selected={selected}
              categoryOverrides={categoryOverrides}
              duplicateChecks={duplicateChecks}
              qualityIssues={qualityIssues}
              categories={categories}
              categoryOptionsByType={categoryOptionsByType}
              recentCountByType={recentCountByType}
              currentPage={currentPage}
              smartSuggestions={smartSuggestions}
              onSelect={toggleSelect}
              onSelectAll={selectAll}
              onDeselectAll={deselectAll}
              onCategoryChange={(index, value) => {
                const next = new Map(categoryOverrides)
                if (value) next.set(index, value); else next.delete(index)
                setCategoryOverrides(next)
              }}
              onPageChange={setCurrentPage}
              onQuickCreate={openQuickCreate}
              onApplySuggestion={applySmartSuggestion}
              onDismissSuggestion={dismissSmartSuggestion}
              getEffectiveCategory={getEffectiveCategory}
              isUnmatchedRow={isUnmatchedRow}
              transactionListRef={transactionListRef}
            />
          </div>

          {/* 右侧：统计 + 操作面板 */}
          <div className="space-y-3">
            {/* 账本选择 + 概览 */}
            <div className="bg-card rounded-md border border-border p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground shrink-0">账本:</span>
                <SearchableSelect
                  options={state.ledgerOptions}
                  value={selectedLedgerId}
                  onChange={state.setSelectedLedgerId}
                  placeholder="选择账本"
                  size="sm"
                  className="flex-1"
                />
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>共 {items.length} 笔</span>
                <span className="text-destructive font-mono">支出 {expenseCount} 笔 ¥{totalExpense.toFixed(2)}</span>
                <span className="text-green-600 dark:text-green-400">收入 {incomeCount} 笔</span>
              </div>
              {duplicateCount > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                  <AlertTriangle className="inline h-3 w-3 mr-1" />检测到 {duplicateCount} 笔疑似重复交易，已自动取消勾选
                </p>
              )}
              {qualityIssueCount > 0 && (
                <p className="text-xs text-destructive font-medium">{qualityIssueCount} 条数据异常</p>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={selectAll} className="text-xs text-primary hover:underline">全选</button>
                <button onClick={deselectAll} className="text-xs text-muted-foreground hover:underline">取消全选</button>
              </div>
              <button
                onClick={handleImport}
                disabled={selected.size === 0 || importing}
                className="w-full px-4 py-2.5 rounded-lg text-sm font-medium text-white shadow-sm bg-gradient-to-r from-[#34dbcb] to-[#3445db] hover:from-[#2bc4b6] hover:to-[#2d3bc4] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                导入选中 ({selected.size})
              </button>
            </div>

            {/* 统计预览 */}
            <StatsPreview
              statsPreview={statsPreview}
              statsCollapsed={statsCollapsed}
              onToggle={() => setStatsCollapsed(!statsCollapsed)}
              categoryOverridesSize={categoryOverrides.size}
              categoryDistRef={categoryDistRef}
              transactionListRef={transactionListRef}
            />
          </div>
        </div>
      )}

      {/* 退款选择弹窗 */}
      {refundChoice && (
        <RefundModal
          refundChoice={refundChoice}
          waiting={refundWaiting}
          onAddIncome={handleRefundAddIncome}
          onDeleteExpense={handleRefundDelete}
        />
      )}

      {/* 快速创建分类弹窗 */}
      {quickCreate && (
        <QuickCreateModal
          quickCreate={quickCreate}
          parentOptions={parentCategoryOptions}
          onCreate={handleQuickCreate}
          onCancel={() => setQuickCreate(null)}
          onUpdate={setQuickCreate}
        />
      )}
    </div>
  )
}
