'use client'

import { useState } from 'react'
import { createTemplate, updateTemplate, deleteTemplate } from '@/lib/actions/user-rules'

interface Template {
  id: string
  name: string
  triggerPhrases: string
  operations: string
  isActive: boolean
  createdAt: Date
}

interface OperationItem {
  type: 'create_transaction' | 'reclassify' | 'move_ledger'
  newTransactions?: Array<{
    merchant: string
    amount: number
    type: 'expense' | 'income'
    categoryName?: string
    ledgerName?: string
  }>
  targetCategory?: string
  targetLedger?: string
}

function parseJson<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str) as T
  } catch {
    return fallback
  }
}

export function OperationTemplatesManager({ templates }: { templates: Template[] }) {
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  
  // Form state
  const [name, setName] = useState('')
  const [triggerPhrases, setTriggerPhrases] = useState('')
  const [operations, setOperations] = useState<OperationItem[]>([
    { type: 'create_transaction', newTransactions: [{ merchant: '', amount: 0, type: 'expense', categoryName: '' }] }
  ])

  const resetForm = () => {
    setName('')
    setTriggerPhrases('')
    setOperations([{ type: 'create_transaction', newTransactions: [{ merchant: '', amount: 0, type: 'expense', categoryName: '' }] }])
    setIsAdding(false)
    setEditingId(null)
  }

  const handleAdd = async () => {
    if (!name.trim() || !triggerPhrases.trim()) return
    
    // 过滤空交易
    const validOps = operations.map(op => {
      if (op.type === 'create_transaction' && op.newTransactions) {
        return {
          ...op,
          newTransactions: op.newTransactions.filter(t => t.merchant.trim() || t.amount > 0)
        }
      }
      return op
    }).filter(op => {
      if (op.type === 'create_transaction') {
        return op.newTransactions && op.newTransactions.length > 0
      }
      return true
    })
    
    await createTemplate({
      name: name.trim(),
      triggerPhrases: triggerPhrases.split('\n').map(s => s.trim()).filter(Boolean),
      operations: JSON.stringify(validOps),
    })
    resetForm()
  }

  const handleEdit = (template: Template) => {
    setName(template.name)
    const phrases: string[] = parseJson(template.triggerPhrases, [])
    setTriggerPhrases(phrases.join('\n'))
    const ops: OperationItem[] = parseJson(template.operations, [])
    setOperations(ops.length > 0 ? ops : [{ type: 'create_transaction', newTransactions: [{ merchant: '', amount: 0, type: 'expense', categoryName: '' }] }])
    setEditingId(template.id)
    setIsAdding(true)
  }

  const handleUpdate = async () => {
    if (!editingId || !name.trim() || !triggerPhrases.trim()) return
    
    const validOps = operations.map(op => {
      if (op.type === 'create_transaction' && op.newTransactions) {
        return {
          ...op,
          newTransactions: op.newTransactions.filter(t => t.merchant.trim() || t.amount > 0)
        }
      }
      return op
    }).filter(op => {
      if (op.type === 'create_transaction') {
        return op.newTransactions && op.newTransactions.length > 0
      }
      return true
    })
    
    await updateTemplate(editingId, {
      name: name.trim(),
      triggerPhrases: triggerPhrases.split('\n').map(s => s.trim()).filter(Boolean),
      operations: JSON.stringify(validOps),
    })
    resetForm()
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    await deleteTemplate(id)
    setDeleting(null)
  }

  const handleToggle = async (template: Template) => {
    await updateTemplate(template.id, { isActive: !template.isActive })
  }

  const addTransactionToTemplate = () => {
    setOperations(prev => [...prev, { 
      type: 'create_transaction', 
      newTransactions: [{ merchant: '', amount: 0, type: 'expense', categoryName: '' }] 
    }])
  }

  const updateTransaction = (opIndex: number, txIndex: number, field: string, value: string | number) => {
    setOperations(prev => {
      const newOps = [...prev]
      const op = { ...newOps[opIndex] }
      if (op.type === 'create_transaction' && op.newTransactions) {
        const txs = [...op.newTransactions]
        txs[txIndex] = { ...txs[txIndex], [field]: value }
        op.newTransactions = txs
      }
      newOps[opIndex] = op
      return newOps
    })
  }

  return (
    <div className="space-y-4">
      {/* 添加/编辑表单 */}
      {isAdding && (
        <div className="bg-card rounded-md border border-border p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">
            {editingId ? '编辑模板' : '新增模板'}
          </h3>
          
          <div>
            <label className="block text-xs text-muted-foreground mb-1">模板名称</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="如：月度固定支出"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">触发词（每行一个）</label>
            <textarea
              value={triggerPhrases}
              onChange={e => setTriggerPhrases(e.target.value)}
              placeholder={"月度固定支出\n记固定支出\n每月固定开支"}
              rows={3}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y font-mono"
            />
          </div>

          <div className="space-y-3">
            <label className="block text-xs text-muted-foreground">操作定义</label>
            {operations.map((op, opIndex) => (
              <div key={opIndex} className="p-3 bg-muted rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">操作 {opIndex + 1}</span>
                  {operations.length > 1 && (
                    <button
                      onClick={() => setOperations(prev => prev.filter((_, i) => i !== opIndex))}
                      className="text-xs text-destructive hover:text-destructive/80"
                    >
                      删除
                    </button>
                  )}
                </div>
                
                {op.type === 'create_transaction' && op.newTransactions?.map((tx, txIndex) => (
                  <div key={txIndex} className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={tx.merchant}
                      onChange={e => updateTransaction(opIndex, txIndex, 'merchant', e.target.value)}
                      placeholder="商户名"
                      className="px-2 py-1.5 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <input
                      type="number"
                      value={tx.amount}
                      onChange={e => updateTransaction(opIndex, txIndex, 'amount', Number(e.target.value))}
                      placeholder="金额"
                      className="px-2 py-1.5 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <select
                      value={tx.type}
                      onChange={e => updateTransaction(opIndex, txIndex, 'type', e.target.value)}
                      className="px-2 py-1.5 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="expense">支出</option>
                      <option value="income">收入</option>
                    </select>
                    <input
                      type="text"
                      value={tx.categoryName || ''}
                      onChange={e => updateTransaction(opIndex, txIndex, 'categoryName', e.target.value)}
                      placeholder="分类名"
                      className="px-2 py-1.5 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                ))}
              </div>
            ))}
            
            <button
              onClick={addTransactionToTemplate}
              className="text-xs text-primary hover:text-primary/80"
            >
              + 添加交易
            </button>
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

      {/* 模板列表 */}
      {templates.length === 0 && !isAdding ? (
        <div className="bg-card rounded-md border border-border p-5">
          <p className="text-sm text-muted-foreground text-center py-4">
            还没有操作模板。点击「新增模板」创建你的第一个模板。
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-md border border-border divide-y divide-border">
          {templates.map(template => {
            const phrases: string[] = parseJson(template.triggerPhrases, [])
            const ops: OperationItem[] = parseJson(template.operations, [])
            
            return (
              <div key={template.id} className={`flex items-center justify-between p-4 ${!template.isActive ? 'opacity-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {template.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    触发词: {phrases.slice(0, 3).join(', ')}{phrases.length > 3 ? '...' : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ops.length} 个操作
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => handleToggle(template)}
                    className={`text-xs px-2 py-1 rounded ${template.isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}
                  >
                    {template.isActive ? '启用' : '禁用'}
                  </button>
                  <button
                    onClick={() => handleEdit(template)}
                    className="text-xs text-muted-foreground hover:text-primary"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(template.id)}
                    disabled={deleting === template.id}
                    className="text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    {deleting === template.id ? '删除中...' : '删除'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 新增按钮 */}
      {!isAdding && (
        <button
          onClick={() => setIsAdding(true)}
          className="w-full py-3 border-2 border-dashed border-border rounded-md text-sm text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
        >
          + 新增模板
        </button>
      )}
    </div>
  )
}
