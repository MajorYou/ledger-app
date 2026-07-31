'use client'

import { deleteRule } from '@/lib/actions/settings'
import { deleteUserRule } from '@/lib/actions/user-rules'
import { useState } from 'react'
import { GraduationCap } from 'lucide-react'

interface ClassificationRule {
  id: string
  merchantPattern: string
  suggestedCategoryId: string
  category: { name: string; icon: string }
  confidence: number
  hitCount: number
}

interface UserRuleItem {
  id: string
  name: string
  condition: string
  action: string
  confidence: number
  source: string
}

interface Condition {
  field: string
  operator: string
  value: string | number
}

interface Action {
  type: string
  params: Record<string, string>
}

function parseJson<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str) as T
  } catch {
    return fallback
  }
}

export function LearnedRules({ 
  rules, 
  userRules = [] 
}: { 
  rules: ClassificationRule[]
  userRules?: UserRuleItem[]
}) {
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleDeleteClassification = async (id: string) => {
    setDeleting(id)
    await deleteRule(id)
    setDeleting(null)
  }

  const handleDeleteUserRule = async (id: string) => {
    setDeleting(`ur_${id}`)
    await deleteUserRule(id)
    setDeleting(null)
  }

  // 过滤自动学习的用户规则
  const autoLearnedRules = userRules.filter(r => r.source === 'auto')

  if (rules.length === 0 && autoLearnedRules.length === 0) {
    return (
      <div className="bg-card rounded-md border border-border p-5">
        <p className="text-sm text-muted-foreground text-center py-4">
          还没有自动学习的规则。当同一商户被确认到同一分类 ≥3 次后，会自动生成规则。
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 分类缓存规则 */}
      {rules.length > 0 && (
        <div className="bg-card rounded-md border border-border divide-y divide-border">
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <span className="text-lg">{rule.category.icon}</span>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    &ldquo;{rule.merchantPattern}&rdquo;
                  </p>
                  <p className="text-xs text-muted-foreground">
                    → {rule.category.name} · 置信度 {Math.round(rule.confidence * 100)}% · 命中 {rule.hitCount} 次
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleDeleteClassification(rule.id)}
                disabled={deleting === rule.id}
                className="text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                {deleting === rule.id ? '删除中...' : '删除'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 自动学习的用户规则 */}
      {autoLearnedRules.length > 0 && (
        <div className="bg-card rounded-md border border-border divide-y divide-border">
          {autoLearnedRules.map((rule) => {
            const condition = parseJson<Condition>(rule.condition, { field: '', operator: '', value: '' })
            const action = parseJson<Action>(rule.action, { type: '', params: {} })
            
            return (
              <div key={rule.id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <span className="text-lg"><GraduationCap className="h-5 w-5" /></span>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {rule.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      当{condition.field} {condition.operator} &ldquo;{String(condition.value)}&rdquo; → {action.type}: {action.params.categoryName || action.params.ledgerName || ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      置信度 {Math.round(rule.confidence * 100)}%
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteUserRule(rule.id)}
                  disabled={deleting === `ur_${rule.id}`}
                  className="text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
                >
                  {deleting === `ur_${rule.id}` ? '删除中...' : '删除'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
