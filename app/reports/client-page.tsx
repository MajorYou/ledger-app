'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ReportData } from './page'

interface CatItem { name: string; icon: string; color: string; type: string; amount: number; count: number }
interface LedgerItem { name: string; color: string; amount: number; count: number }
interface MonthItem { month: string; expense: number; income: number }
interface AccountItem { name: string; amount: number; count: number }
interface CrossItem {
  ledgerId: string; ledgerName: string; ledgerColor: string
  categoryId: string; categoryName: string; categoryIcon: string; categoryColor: string
  expense: number; income: number
}

const PERIODS = [
  { value: 'this-month', label: '本月' },
  { value: 'last-month', label: '上月' },
  { value: 'this-year', label: '今年' },
  { value: 'custom', label: '自定义' },
]

// 简易水平条图
function BarChart({
  data,
  maxValue,
  formatValue,
}: {
  data: Array<{ name: string; value: number; color: string }>
  maxValue: number
  formatValue?: (v: number) => string
}) {
  return (
    <div className="space-y-2">
      {data.map((item) => (
        <div key={item.name} className="flex items-center gap-2 text-sm">
          <span className="w-20 text-right text-zinc-500 truncate">{item.name}</span>
          <div className="flex-1 h-5 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${maxValue > 0 ? (item.value / maxValue) * 100 : 0}%`,
                backgroundColor: item.color,
              }}
            />
          </div>
          <span className="w-20 text-zinc-700 font-medium">
            {formatValue ? formatValue(item.value) : `¥${item.value.toFixed(0)}`}
          </span>
        </div>
      ))}
    </div>
  )
}

// 简易柱状图 (SVG)
function ColumnChart({
  data,
  maxValue,
}: {
  data: Array<{ label: string; expense: number; income: number }>
  maxValue: number
}) {
  const w = 300
  const h = 120
  const pad = 25
  const barW = Math.max(((w - pad * 2) / data.length) * 0.35, 6)

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
      {/* 基线 */}
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#e4e4e7" />
      {data.map((d, i) => {
        const x = pad + ((w - pad * 2) / data.length) * i + ((w - pad * 2) / data.length - barW * 2) / 2
        const expH = maxValue > 0 ? (d.expense / maxValue) * (h - pad * 2) : 0
        const incH = maxValue > 0 ? (d.income / maxValue) * (h - pad * 2) : 0
        return (
          <g key={`${d.label}-${i}`}>
            <rect
              x={x}
              y={h - pad - expH}
              width={barW}
              height={expH}
              fill="#ef4444"
              rx={2}
            />
            <rect
              x={x + barW}
              y={h - pad - incH}
              width={barW}
              height={incH}
              fill="#22c55e"
              rx={2}
            />
            <text
              x={x + barW}
              y={h - 5}
              textAnchor="middle"
              className="text-[10px]"
              fill="#71717a"
            >
              {d.label}
            </text>
          </g>
        )
      })}
      {/* 图例 */}
      <rect x={w - 80} y={5} width={10} height={10} fill="#ef4444" rx={2} />
      <text x={w - 66} y={14} className="text-[10px]" fill="#71717a">支出</text>
      <rect x={w - 42} y={5} width={10} height={10} fill="#22c55e" rx={2} />
      <text x={w - 28} y={14} className="text-[10px]" fill="#71717a">收入</text>
    </svg>
  )
}

type CrossViewMode = 'by-ledger' | 'by-category'

function CrossTable({
  data,
  viewMode,
}: {
  data: CrossItem[]
  viewMode: CrossViewMode
}) {
  if (data.length === 0) {
    return <p className="text-sm text-zinc-400 py-8 text-center">暂无交叉数据</p>
  }

  const isByLedger = viewMode === 'by-ledger'

  // 行维度 & 列维度
  const rowKey = isByLedger ? 'ledgerId' : 'categoryId'
  const colKey = isByLedger ? 'categoryId' : 'ledgerId'

  const rowName = isByLedger ? 'ledgerName' : 'categoryName'
  const colName = isByLedger ? 'categoryName' : 'ledgerName'
  const rowColor = isByLedger ? 'ledgerColor' : 'categoryColor'
  const colColor = isByLedger ? 'categoryColor' : 'ledgerColor'
  const colIcon = isByLedger ? 'categoryIcon' : null

  // 收集唯一的行和列
  const rowSet = new Map<string, { name: string; color: string }>()
  const colSet = new Map<string, { name: string; icon: string; color: string }>()

  for (const item of data) {
    const rKey = item[rowKey] as string
    const cKey = item[colKey] as string
    if (!rowSet.has(rKey)) {
      rowSet.set(rKey, {
        name: item[rowName as keyof CrossItem] as string,
        color: item[rowColor as keyof CrossItem] as string,
      })
    }
    if (!colSet.has(cKey)) {
      colSet.set(cKey, {
        name: item[colName as keyof CrossItem] as string,
        icon: item.categoryIcon,
        color: item[colColor as keyof CrossItem] as string,
      })
    }
  }

  const rows = [...rowSet.entries()]
  const cols = [...colSet.entries()]

  // 构建值映射：(rowKey, colKey) -> { expense, income }
  const valueMap = new Map<string, { expense: number; income: number }>()
  for (const item of data) {
    const rKey = item[rowKey] as string
    const cKey = item[colKey] as string
    valueMap.set(`${rKey}::${cKey}`, { expense: item.expense, income: item.income })
  }

  // 计算行合计 & 列合计
  const rowTotals = new Map<string, { expense: number; income: number }>()
  const colTotals = new Map<string, { expense: number; income: number }>()
  let grandExpense = 0
  let grandIncome = 0

  for (const item of data) {
    const rKey = item[rowKey] as string
    const cKey = item[colKey] as string
    const rt = rowTotals.get(rKey) || { expense: 0, income: 0 }
    const ct = colTotals.get(cKey) || { expense: 0, income: 0 }
    rt.expense += item.expense; rt.income += item.income
    ct.expense += item.expense; ct.income += item.income
    rowTotals.set(rKey, rt)
    colTotals.set(cKey, ct)
    grandExpense += item.expense
    grandIncome += item.income
  }

  const cellClass = "px-3 py-2 text-sm text-right whitespace-nowrap border-b border-r border-zinc-100"
  const headerClass = "px-3 py-2 text-sm font-medium text-zinc-600 bg-zinc-50 border-b border-r border-zinc-200 whitespace-nowrap"

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={`${headerClass} text-left sticky left-0 z-10 bg-zinc-50 min-w-[100px]`}>
              {isByLedger ? '账本' : '分类'}
            </th>
            {cols.map(([cKey, cInfo]) => (
              <th key={cKey} className={headerClass}>
                <span className="flex items-center gap-1 justify-end">
                  {colIcon && <span>{(data.find(d => (d[colKey as keyof CrossItem] as string) === cKey) as CrossItem)?.categoryIcon}</span>}
                  <span>{cInfo.name}</span>
                </span>
              </th>
            ))}
            <th className={`${headerClass} text-right bg-zinc-100 font-semibold`}>合计</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([rKey, rInfo]) => {
            const rt = rowTotals.get(rKey) || { expense: 0, income: 0 }
            return (
              <tr key={rKey} className="hover:bg-zinc-50/50">
                <td className={`${cellClass} text-left font-medium sticky left-0 z-10 bg-white min-w-[100px]`}>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: rInfo.color }}
                    />
                    {rInfo.name}
                  </span>
                </td>
                {cols.map(([cKey]) => {
                  const val = valueMap.get(`${rKey}::${cKey}`) || { expense: 0, income: 0 }
                  return (
                    <td key={cKey} className={cellClass}>
                      {val.expense === 0 && val.income === 0 ? (
                        <span className="text-zinc-300">—</span>
                      ) : val.expense > 0 && val.income > 0 ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-red-500 text-xs">-¥{val.expense.toFixed(2)}</span>
                          <span className="text-green-500 text-xs">+¥{val.income.toFixed(2)}</span>
                        </div>
                      ) : val.expense > 0 ? (
                        <span className="text-red-500">-¥{val.expense.toFixed(2)}</span>
                      ) : (
                        <span className="text-green-500">+¥{val.income.toFixed(2)}</span>
                      )}
                    </td>
                  )
                })}
                {/* 行合计 */}
                <td className={`${cellClass} bg-zinc-50/70 font-medium`}>
                  {rt.expense === 0 && rt.income === 0 ? (
                    <span className="text-zinc-300">—</span>
                  ) : (
                    <div className="flex flex-col items-end gap-0.5">
                      {rt.expense > 0 && <span className="text-red-500 text-xs">-¥{rt.expense.toFixed(2)}</span>}
                      {rt.income > 0 && <span className="text-green-500 text-xs">+¥{rt.income.toFixed(2)}</span>}
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
          {/* 列合计行 */}
          <tr className="bg-zinc-50 font-semibold">
            <td className={`${cellClass} sticky left-0 z-10 bg-zinc-100 font-semibold`}>合计</td>
            {cols.map(([cKey]) => {
              const ct = colTotals.get(cKey) || { expense: 0, income: 0 }
              return (
                <td key={cKey} className={`${cellClass} bg-zinc-50`}>
                  {ct.expense === 0 && ct.income === 0 ? (
                    <span className="text-zinc-300">—</span>
                  ) : (
                    <div className="flex flex-col items-end gap-0.5">
                      {ct.expense > 0 && <span className="text-red-500 text-xs">-¥{ct.expense.toFixed(2)}</span>}
                      {ct.income > 0 && <span className="text-green-500 text-xs">+¥{ct.income.toFixed(2)}</span>}
                    </div>
                  )}
                </td>
              )
            })}
            {/* 总计 */}
            <td className={`${cellClass} bg-zinc-100 font-bold`}>
              <div className="flex flex-col items-end gap-0.5">
                {grandExpense > 0 && <span className="text-red-500 text-xs">-¥{grandExpense.toFixed(2)}</span>}
                {grandIncome > 0 && <span className="text-green-500 text-xs">+¥{grandIncome.toFixed(2)}</span>}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export function ReportsClient({
  data,
  currentPeriod,
  startDate: initStartDate,
  endDate: initEndDate,
}: {
  data: ReportData
  currentPeriod: string
  startDate?: string
  endDate?: string
}) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'summary' | 'cross'>('summary')
  const [crossViewMode, setCrossViewMode] = useState<CrossViewMode>('by-ledger')
  const [customStart, setCustomStart] = useState(initStartDate || '')
  const [customEnd, setCustomEnd] = useState(initEndDate || '')

  const expenseByCat: CatItem[] = data.categoryBreakdown.filter((c: CatItem) => c.type === 'expense')
  const incomeByCat: CatItem[] = data.categoryBreakdown.filter((c: CatItem) => c.type === 'income')
  const maxCat = Math.max(
    ...data.categoryBreakdown.map((c: CatItem) => c.amount),
    1
  )
  const maxMonth = Math.max(
    ...data.monthTrend.map((m: MonthItem) => Math.max(m.expense, m.income)),
    1
  )
  const maxLedger = Math.max(
    ...data.ledgerBreakdown.map((l: LedgerItem) => l.amount),
    1
  )

  const handlePeriodChange = (period: string) => {
    if (period === 'custom') {
      router.push(`/reports?period=custom`)
    } else {
      router.push(`/reports?period=${period}`)
    }
  }

  const handleCustomDateApply = () => {
    if (customStart && customEnd) {
      router.push(`/reports?period=custom&startDate=${customStart}&endDate=${customEnd}`)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* 时间筛选 + 总额 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 items-center flex-wrap">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => handlePeriodChange(p.value)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                currentPeriod === p.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {p.label}
            </button>
          ))}
          {currentPeriod === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-2 py-1 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <span className="text-zinc-400">~</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2 py-1 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button
                onClick={handleCustomDateApply}
                disabled={!customStart || !customEnd}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
              >
                查询
              </button>
            </div>
          )}
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <p className="text-xs text-zinc-400">总支出</p>
            <p className="text-lg font-bold text-red-500">
              ¥{data.totalExpense.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-400">总收入</p>
            <p className="text-lg font-bold text-green-500">
              ¥{data.totalIncome.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-1 border-b border-zinc-200">
        <button
          onClick={() => setActiveTab('summary')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'summary'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-zinc-500 hover:text-zinc-700'
          }`}
        >
          汇总概览
        </button>
        <button
          onClick={() => setActiveTab('cross')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'cross'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-zinc-500 hover:text-zinc-700'
          }`}
        >
          交叉汇总
        </button>
      </div>

      {activeTab === 'summary' ? (
        <>
          {/* 月度趋势 */}
          <div className="bg-white rounded-xl border border-zinc-200 p-5">
            <h3 className="font-semibold text-zinc-900 mb-3">月度趋势</h3>
            <ColumnChart data={data.monthTrend} maxValue={maxMonth} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 支出分类 */}
            <div className="bg-white rounded-xl border border-zinc-200 p-5">
              <h3 className="font-semibold text-zinc-900 mb-3">支出分类</h3>
              {expenseByCat.length === 0 ? (
                <p className="text-sm text-zinc-400 py-4">暂无数据</p>
              ) : (
                <BarChart
                  data={expenseByCat.map((c) => ({
                    name: c.name,
                    value: c.amount,
                    color: c.color,
                  }))}
                  maxValue={maxCat}
                />
              )}
            </div>

            {/* 收入分类 */}
            <div className="bg-white rounded-xl border border-zinc-200 p-5">
              <h3 className="font-semibold text-zinc-900 mb-3">收入分类</h3>
              {incomeByCat.length === 0 ? (
                <p className="text-sm text-zinc-400 py-4">暂无数据</p>
              ) : (
                <BarChart
                  data={incomeByCat.map((c) => ({
                    name: c.name,
                    value: c.amount,
                    color: c.color,
                  }))}
                  maxValue={maxCat}
                />
              )}
            </div>

            {/* 账本维度 */}
            <div className="bg-white rounded-xl border border-zinc-200 p-5">
              <h3 className="font-semibold text-zinc-900 mb-3">账本支出</h3>
              {data.ledgerBreakdown.length === 0 ? (
                <p className="text-sm text-zinc-400 py-4">暂无数据</p>
              ) : (
                <BarChart
                  data={data.ledgerBreakdown.map((l: LedgerItem) => ({
                    name: l.name,
                    value: l.amount,
                    color: l.color,
                  }))}
                  maxValue={maxLedger}
                />
              )}
            </div>

            {/* 账户维度 */}
            <div className="bg-white rounded-xl border border-zinc-200 p-5">
              <h3 className="font-semibold text-zinc-900 mb-3">支付账户</h3>
              {data.accountBreakdown.length === 0 ? (
                <p className="text-sm text-zinc-400 py-4">暂无数据</p>
              ) : (
                <BarChart
                  data={data.accountBreakdown.map((a: AccountItem) => ({
                    name: a.name,
                    value: a.amount,
                    color: '#6366f1',
                  }))}
                  maxValue={
                    Math.max(...data.accountBreakdown.map((a: AccountItem) => a.amount), 1)
                  }
                />
              )}
            </div>
          </div>
        </>
      ) : (
        /* 交叉汇总 Tab */
        <div className="bg-white rounded-xl border border-zinc-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-zinc-900">交叉汇总（账本 × 分类）</h3>
            <div className="flex gap-1 bg-zinc-100 rounded-lg p-0.5">
              <button
                onClick={() => setCrossViewMode('by-ledger')}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  crossViewMode === 'by-ledger'
                    ? 'bg-white text-zinc-800 shadow-sm font-medium'
                    : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                按账本展开
              </button>
              <button
                onClick={() => setCrossViewMode('by-category')}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  crossViewMode === 'by-category'
                    ? 'bg-white text-zinc-800 shadow-sm font-medium'
                    : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                按分类展开
              </button>
            </div>
          </div>
          <CrossTable data={data.crossBreakdown} viewMode={crossViewMode} />
        </div>
      )}
    </div>
  )
}
