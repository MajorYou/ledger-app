'use client'

import { useState, useEffect } from 'react'

interface DedupPair {
  a: { id: string; merchant: string; amount: number; type: string; transactionTime: string; categoryName: string | null }
  b: { id: string; merchant: string; amount: number; type: string; transactionTime: string; categoryName: string | null }
  score: number
  reasons: string[]
}

export default function DedupPage() {
  const [pairs, setPairs] = useState<DedupPair[]>([])
  const [loading, setLoading] = useState(false)
  const [resolved, setResolved] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [resolving, setResolving] = useState(false)

  const scan = async () => {
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

  useEffect(() => { scan() }, [])

  const handleResolve = async (keepId: string, deleteId: string, pairIdx: number) => {
    setResolving(true)
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
    setResolving(false)
  }

  const typeClass = (t: string) => t === 'income' ? 'text-green-500' : 'text-red-500'
  const typeSymbol = (t: string) => t === 'income' ? '+' : '-'
  const scoreColor = (s: number) => s >= 0.9 ? 'bg-red-100 text-red-700' : s >= 0.7 ? 'bg-amber-100 text-amber-700' : 'bg-yellow-50 text-yellow-700'

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">去重检查</h1>
          <p className="text-sm text-zinc-500 mt-1">
            基于时间、金额、商户三个维度检测疑似重复交易
          </p>
        </div>
        <button
          onClick={scan}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? '扫描中...' : '重新扫描'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600 mb-4">{error}</div>
      )}

      {!loading && pairs.length === 0 && (
        <div className="text-center py-16">
          <p className="text-4xl mb-4">✅</p>
          <p className="text-zinc-500">未发现重复交易</p>
        </div>
      )}

      <div className="space-y-4">
        {pairs.map((pair, i) => {
          const key = `${pair.a.id}:${pair.b.id}`
          if (resolved.has(key)) return null

          return (
            <div key={key} className="bg-white rounded-xl border border-zinc-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${scoreColor(pair.score)}`}>
                    相似度 {(pair.score * 100).toFixed(0)}%
                  </span>
                  {pair.reasons.map((r) => (
                    <span key={r} className="text-xs text-zinc-400">{r}</span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleResolve(pair.a.id, pair.b.id, i)}
                    disabled={resolving}
                    className="px-3 py-1 text-xs font-medium text-zinc-500 hover:text-zinc-700 border border-zinc-200 rounded-lg hover:bg-zinc-50"
                  >
                    保留两者
                  </button>
                  <button
                    onClick={() => handleResolve(pair.a.id, pair.b.id, i)}
                    disabled={resolving}
                    className="px-3 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50"
                  >
                    合并到此
                  </button>
                </div>
              </div>

              {/* 两笔交易对比 */}
              <div className="grid grid-cols-2 gap-3">
                {[pair.a, pair.b].map((tx, j) => (
                  <div key={tx.id} className="bg-zinc-50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-medium ${typeClass(tx.type)}`}>
                        {typeSymbol(tx.type)}¥{tx.amount.toFixed(2)}
                      </span>
                      <span className="text-xs text-zinc-400">{tx.transactionTime.replace('T', ' ')}</span>
                    </div>
                    <p className="text-sm text-zinc-700 truncate">{tx.merchant || '未命名'}</p>
                    {tx.categoryName && (
                      <span className="text-xs text-zinc-400">{tx.categoryName}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
