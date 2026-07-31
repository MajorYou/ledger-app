'use client'

import { useState } from 'react'
import { createUserRule, updateUserRule, deleteUserRule } from '@/lib/actions/user-rules'

interface UserRule {
  id: string
  name: string
  condition: string
  action: string
  priority: number
  isActive: boolean
  source: string
  confidence: number
  createdAt: Date
}

interface Condition {
  field: 'merchant' | 'amount' | 'description' | 'type'
  operator: 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'gt' | 'lt'
  value: string | number
}

interface Action {
  type: 'reclassify' | 'move_ledger' | 'update_type' | 'update_merchant'
  params: {
    categoryName?: string
    ledgerName?: string
    newType?: 'expense' | 'income' | 'transfer'
    newMerchant?: string
  }
}

const FIELD_OPTIONS = [
  { value: 'merchant', label: '商户名' },
  { value: 'amount', label: '金额' },
  { value: 'description', label: '描述' },
  { value: 'type', label: '类型' },
]

const OPERATOR_OPTIONS = [
  { value: 'contains', label: '包含' },
  { value: 'equals', label: '等于' },
  { value: 'startsWith', label: '开头是' },
  { value: 'endsWith', label: '结尾是' },
  { value: 'gt', label: '大于' },
  { value: 'lt', label: '小于' },
]

const ACTION_TYPE_OPTIONS = [
  { value: 'reclassify', label: '重新分类' },
  { value: 'move_ledger', label: '移动到账本' },
  { value: 'update_type', label: '修改类型' },
  { value: 'update_merchant', label: '修改商户名' },
]

function parseJson<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str) as T
  } catch {
    return fallback
  }
}

export function UserRulesManager({ rules }: { rules: UserRule[] }) {
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  
  // Form state
  const [name, setName] = useState('')
  const [condition, setCondition] = useState<Condition>({ field: 'merchant', operator: 'contains', value: '' })
  const [action, setAction] = useState<Action>({ type: 'reclassify', params: {} })
  const [priority, setPriority] = useState(10)

  const resetForm = () => {
    setName('')
    setCondition({ field: 'merchant', operator: 'contains', value: '' })
    setAction({ type: 'reclassify', params: {} })
    setPriority(10)
    setIsAdding(false)
    setEditingId(null)
  }

  const validateActionParams = (): string | null => {
    switch (action.type) {
      case 'reclassify':
        if (!action.params.categoryName?.trim()) return '请填写目标分类'
        break
      case 'move_ledger':
        if (!action.params.ledgerName?.trim()) return '请填写目标账本'
        break
      case 'update_type':
        if (!action.params.newType) return '请选择新类型'
        break
      case 'update_merchant':
        if (!action.params.newMerchant?.trim()) return '请填写新商户名'
        break
    }
    return null
  }

  const handleAdd = async () => {
    if (!name.trim() || !condition.value) return
    const paramErr = validateActionParams()
    if (paramErr) { alert(paramErr); return }
    
    await createUserRule({
      name: name.trim(),
      condition: JSON.stringify(condition),
      action: JSON.stringify(action),
      priority,
      source: 'manual',
    })
    resetForm()
  }

  const handleEdit = (rule: UserRule) => {
    const cond = parseJson<Condition>(rule.condition, { field: 'merchant', operator: 'contains', value: '' })
    const act = parseJson<Action>(rule.action, { type: 'reclassify', params: {} })
    
    setName(rule.name)
    setCondition(cond)
    setAction(act)
    setPriority(rule.priority)
    setEditingId(rule.id)
    setIsAdding(true)
  }

  const handleUpdate = async () => {
    if (!editingId || !name.trim() || !condition.value) return
    const paramErr = validateActionParams()
    if (paramErr) { alert(paramErr); return }
    
    await updateUserRule(editingId, {
      name: name.trim(),
      condition: JSON.stringify(condition),
      action: JSON.stringify(action),
      priority,
    })
    resetForm()
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    await deleteUserRule(id)
    setDeleting(null)
  }

  const handleToggle = async (rule: UserRule) => {
    await updateUserRule(rule.id, { isActive: !rule.isActive })
  }

  const renderCondition = (cond: Condition) => {
    const fieldLabel = FIELD_OPTIONS.find(f => f.value === cond.field)?.label || cond.field
    const opLabel = OPERATOR_OPTIONS.find(o => o.value === cond.operator)?.label || cond.operator
    return `${fieldLabel} ${opLabel} "${cond.value}"`
  }

  const renderAction = (act: Action) => {
    const typeLabel = ACTION_TYPE_OPTIONS.find(t => t.value === act.type)?.label || act.type
    const paramValue = act.params.categoryName || act.params.ledgerName || act.params.newType || act.params.newMerchant || ''
    return `${typeLabel}: ${paramValue}`
  }

  return (
    <div className="space-y-4">
      {/* 添加/编辑表单 */}
      {isAdding && (
        <div className="bg-card rounded-md border border-border p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">
            {editingId ? '编辑规则' : '新增规则'}
          </h3>
          
          <div>
            <label className="block text-xs text-muted-foreground mb-1">规则名称</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="如：食堂归三餐"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">字段</label>
              <select
                value={condition.field}
                onChange={e => setCondition({ ...condition, field: e.target.value as Condition['field'] })}
                className="w-full px-2 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {FIELD_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">操作符</label>
              <select
                value={condition.operator}
                onChange={e => setCondition({ ...condition, operator: e.target.value as Condition['operator'] })}
                className="w-full px-2 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {OPERATOR_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">值</label>
              <input
                type={condition.field === 'amount' ? 'number' : 'text'}
                value={condition.value}
                onChange={e => setCondition({ ...condition, value: condition.field === 'amount' ? Number(e.target.value) : e.target.value })}
                placeholder="匹配值"
                className="w-full px-2 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">动作类型</label>
              <select
                value={action.type}
                onChange={e => setAction({ ...action, type: e.target.value as Action['type'], params: {} })}
                className="w-full px-2 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {ACTION_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                {action.type === 'reclassify' ? '目标分类' : 
                 action.type === 'move_ledger' ? '目标账本' :
                 action.type === 'update_type' ? '新类型' : '新商户名'}
              </label>
              {action.type === 'update_type' ? (
                <select
                  value={action.params.newType || ''}
                  onChange={e => setAction({ ...action, params: { newType: e.target.value as 'expense' | 'income' | 'transfer' } })}
                  className="w-full px-2 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="expense">支出</option>
                  <option value="income">收入</option>
                  <option value="transfer">转账</option>
                </select>
              ) : (
                <input
                  type="text"
                  value={action.params.categoryName || action.params.ledgerName || action.params.newMerchant || ''}
                  onChange={e => {
                    const key = action.type === 'reclassify' ? 'categoryName' :
                               action.type === 'move_ledger' ? 'ledgerName' : 'newMerchant'
                    setAction({ ...action, params: { [key]: e.target.value } })
                  }}
                  placeholder="输入值"
                  className="w-full px-2 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">优先级（数字越大越优先）</label>
            <input
              type="number"
              value={priority}
              onChange={e => setPriority(Number(e.target.value))}
              className="w-24 px-2 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={editingId ? handleUpdate : handleAdd}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              {editingId ? '更新' : '添加'}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 规则列表 */}
      {rules.length === 0 && !isAdding ? (
        <div className="bg-card rounded-md border border-border p-5">
          <p className="text-sm text-muted-foreground text-center py-4">
            还没有用户规则。点击「新增规则」创建你的第一条规则。
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-md border border-border divide-y divide-border">
          {rules.map(rule => (
            <div key={rule.id} className={`flex items-center justify-between p-4 ${!rule.isActive ? 'opacity-50' : ''}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground truncate">
                    {rule.name}
                  </p>
                  {rule.source === 'auto' && (
                    <span className="px-1.5 py-0.5 text-xs bg-primary/10 text-primary rounded">自动学习</span>
                  )}
                  <span className="px-1.5 py-0.5 text-xs bg-muted text-muted-foreground rounded">
                    优先级 {rule.priority}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  当 {renderCondition(parseJson<Condition>(rule.condition, { field: 'merchant', operator: 'contains', value: '' }))}
                </p>
                <p className="text-xs text-muted-foreground">
                  → {renderAction(parseJson<Action>(rule.action, { type: 'reclassify', params: {} }))}
                </p>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => handleToggle(rule)}
                  className={`text-xs px-2 py-1 rounded ${rule.isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}
                >
                  {rule.isActive ? '启用' : '禁用'}
                </button>
                <button
                  onClick={() => handleEdit(rule)}
                  className="text-xs text-muted-foreground hover:text-primary"
                >
                  编辑
                </button>
                <button
                  onClick={() => handleDelete(rule.id)}
                  disabled={deleting === rule.id}
                  className="text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
                >
                  {deleting === rule.id ? '删除中...' : '删除'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新增按钮 */}
      {!isAdding && (
        <button
          onClick={() => setIsAdding(true)}
          className="w-full py-3 border-2 border-dashed border-border rounded-md text-sm text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
        >
          + 新增规则
        </button>
      )}
    </div>
  )
}
