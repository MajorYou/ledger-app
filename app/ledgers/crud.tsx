'use client'

import { useState, useTransition } from 'react'
import { createLedger, updateLedger, deleteLedger } from '@/lib/actions/ledgers'

const LEDGER_TYPES: Record<string, string> = {
  daily: '日常',
  travel: '旅行',
  project: '项目',
  annual: '年度',
}

const COLORS = [
  '#3b82f6', '#ef4444', '#f59e0b', '#10b981',
  '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1',
]

interface LedgerItem {
  id: string
  name: string
  type: string
  color: string
  parentId: string | null
  _count: { transactionLedgers: number }
}

export function LedgerCRUD({
  ledgers,
  parentOptions,
}: {
  ledgers: LedgerItem[]
  parentOptions: LedgerItem[]
}) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<LedgerItem | null>(null)

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这个账本？')) return
    await deleteLedger(id)
  }

  // 构建层级结构
  const rootLedgers = ledgers.filter((l) => !l.parentId)
  const childLedgers = (parentId: string) =>
    ledgers.filter((l) => l.parentId === parentId)

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => {
            setEditing(null)
            setShowForm(true)
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + 新建账本
        </button>
      </div>

      {showForm && (
        <LedgerForm
          parentOptions={parentOptions}
          editing={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            setEditing(null)
          }}
        />
      )}

      <div className="space-y-2">
        {rootLedgers.map((ledger) => (
          <div key={ledger.id}>
            <LedgerItem
              item={ledger}
              onEdit={() => {
                setEditing(ledger)
                setShowForm(true)
              }}
              onDelete={() => handleDelete(ledger.id)}
            />
            {childLedgers(ledger.id).map((child) => (
              <div key={child.id} className="ml-8">
                <LedgerItem
                  item={child}
                  onEdit={() => {
                    setEditing(child)
                    setShowForm(true)
                  }}
                  onDelete={() => handleDelete(child.id)}
                />
              </div>
            ))}
          </div>
        ))}
        {ledgers.length === 0 && (
          <p className="text-center text-zinc-400 py-8">暂无账本</p>
        )}
      </div>
    </div>
  )
}

function LedgerItem({
  item,
  onEdit,
  onDelete,
}: {
  item: LedgerItem
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4 flex items-center justify-between hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: item.color }}
        />
        <div>
          <p className="font-medium text-zinc-900">{item.name}</p>
          <p className="text-xs text-zinc-400">
            {LEDGER_TYPES[item.type] || item.type}
            {item._count.transactionLedgers > 0 &&
              ` · ${item._count.transactionLedgers} 笔交易`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onEdit}
          className="text-xs text-zinc-400 hover:text-blue-500"
        >
          编辑
        </button>
        <button
          onClick={onDelete}
          className="text-xs text-zinc-400 hover:text-red-500"
        >
          删除
        </button>
      </div>
    </div>
  )
}

function LedgerForm({
  parentOptions,
  editing,
  onClose,
  onSaved,
}: {
  parentOptions: LedgerItem[]
  editing: LedgerItem | null
  onClose: () => void
  onSaved: () => void
}) {
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (formData: FormData) => {
    const action = editing ? updateLedger.bind(null, editing.id) : createLedger
    startTransition(async () => {
      await action(formData)
      onSaved()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {editing ? '编辑账本' : '新建账本'}
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-xl">
            ✕
          </button>
        </div>
        <form
          action={handleSubmit}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">名称</label>
            <input
              name="name"
              defaultValue={editing?.name || ''}
              required
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="账本名称"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">类型</label>
            <select
              name="type"
              defaultValue={editing?.type || 'daily'}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {Object.entries(LEDGER_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">颜色</label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <label key={c}>
                  <input
                    type="radio"
                    name="color"
                    value={c}
                    defaultChecked={editing ? editing.color === c : c === '#3b82f6'}
                    className="sr-only peer"
                  />
                  <div
                    className="w-8 h-8 rounded-full cursor-pointer border-2 border-transparent peer-checked:border-zinc-900"
                    style={{ backgroundColor: c }}
                  />
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              父账本
            </label>
            <select
              name="parentId"
              defaultValue={editing?.parentId || ''}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">无（顶级账本）</option>
              {parentOptions
                .filter((l) => l.id !== editing?.id)
                .map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isPending ? '保存中...' : (editing ? '更新' : '创建')}
          </button>
        </form>
      </div>
    </div>
  )
}
