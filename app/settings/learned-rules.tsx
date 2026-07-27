'use client'

import { deleteRule } from '@/lib/actions/settings'
import { useState } from 'react'

interface Rule {
  id: string
  merchantPattern: string
  suggestedCategoryId: string
  category: { name: string; icon: string }
  confidence: number
  hitCount: number
}

export function LearnedRules({ rules }: { rules: Rule[] }) {
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    setDeleting(id)
    await deleteRule(id)
    setDeleting(null)
  }

  if (rules.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-zinc-200 p-5">
        <p className="text-sm text-zinc-400 text-center py-4">
          还没有自动学习的规则。当同一商户被确认到同一分类 ≥3 次后，会自动生成规则。
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200 divide-y divide-zinc-100">
      {rules.map((rule) => (
        <div key={rule.id} className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <span className="text-lg">{rule.category.icon}</span>
            <div>
              <p className="text-sm font-medium text-zinc-900">
                &ldquo;{rule.merchantPattern}&rdquo;
              </p>
              <p className="text-xs text-zinc-400">
                → {rule.category.name} · 置信度 {Math.round(rule.confidence * 100)}% · 命中 {rule.hitCount} 次
              </p>
            </div>
          </div>
          <button
            onClick={() => handleDelete(rule.id)}
            disabled={deleting === rule.id}
            className="text-xs text-zinc-400 hover:text-red-500 disabled:opacity-50"
          >
            {deleting === rule.id ? '删除中...' : '删除'}
          </button>
        </div>
      ))}
    </div>
  )
}
