'use client'

import { useRouter } from 'next/navigation'
import type { ReportData } from './page'

interface CatItem { name: string; icon: string; color: string; type: string; amount: number; count: number }
interface LedgerItem { name: string; color: string; amount: number; count: number }
interface MonthItem { month: string; expense: number; income: number }
interface AccountItem { name: string; amount: number; count: number }

const PERIODS = [
  { value: 'this-month', label: '本月' },
  { value: 'last-month', label: '上月' },
  { value: 'this-year', label: '今年' },
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

export function ReportsClient({
  data,
  currentPeriod,
}: {
  data: ReportData
  currentPeriod: string
}) {
  const router = useRouter()

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

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* 时间筛选 + 总额 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => router.push(`/reports?period=${p.value}`)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                currentPeriod === p.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {p.label}
            </button>
          ))}
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
    </div>
  )
}
