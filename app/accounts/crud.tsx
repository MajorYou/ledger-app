'use client'

import { useState, useEffect } from 'react'
import { useActionState } from 'react'
import { createAccount, updateAccount, deleteAccount } from '@/lib/actions/accounts'
import { SearchableSelect } from '@/components/searchable-select'

const ACCOUNT_TYPES: Record<string, { label: string; emoji: string }> = {
  savings:    { label: '储蓄账户', emoji: '💳' },
  credit:     { label: '信用账户', emoji: '💰' },
  prepaid:    { label: '预付账户', emoji: '📱' },
  investment: { label: '投资账户', emoji: '📈' },
  cash:       { label: '现金',     emoji: '💵' },
}

const TYPE_ORDER = ['savings', 'credit', 'prepaid', 'investment', 'cash'] as const

const TYPE_OPTIONS = [
  { value: 'savings',    label: '💳 储蓄账户' },
  { value: 'credit',     label: '💰 信用账户' },
  { value: 'prepaid',    label: '📱 预付账户' },
  { value: 'investment', label: '📈 投资账户' },
  { value: 'cash',       label: '💵 现金' },
]

interface AccountItem {
  id: string
  name: string
  type: string
  institution: string | null
  last4Digits: string | null
  currency: string
  balance: number
  isActive: boolean
}

export function AccountCRUD({ accounts }: { accounts: AccountItem[] }) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<AccountItem | null>(null)

  const handleDelete = async (id: string) => {
    if (!confirm('确定停用此账户？停用后不会物理删除，关联的交易记录不受影响。')) return
    await deleteAccount(id)
  }

  const grouped = TYPE_ORDER.map((type) => ({
    type,
    ...ACCOUNT_TYPES[type],
    items: accounts.filter((a) => a.type === type),
  })).filter((g) => g.items.length > 0)

  const emptyTypes = TYPE_ORDER.filter(
    (type) => !accounts.some((a) => a.type === type)
  )

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
          + 新建账户
        </button>
      </div>

      {showForm && (
        <AccountForm
          editing={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            setEditing(null)
          }}
        />
      )}

      <div className="space-y-6">
        {grouped.map((group) => (
          <div key={group.type}>
            <h2 className="text-sm font-semibold text-zinc-600 mb-3">
              {group.emoji} {group.label}
            </h2>
            <div className="space-y-2">
              {group.items.map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  onEdit={() => {
                    setEditing(account)
                    setShowForm(true)
                  }}
                  onDelete={() => handleDelete(account.id)}
                />
              ))}
            </div>
          </div>
        ))}

        {accounts.length === 0 && (
          <p className="text-center text-zinc-400 py-8">暂无账户，点击上方按钮创建</p>
        )}

        {emptyTypes.length > 0 && accounts.length > 0 && (
          <p className="text-xs text-zinc-400 pt-2">
            尚未创建：{emptyTypes.map((t) => ACCOUNT_TYPES[t].emoji + ACCOUNT_TYPES[t].label).join('、')}
          </p>
        )}
      </div>
    </div>
  )
}

function AccountRow({
  account,
  onEdit,
  onDelete,
}: {
  account: AccountItem
  onEdit: () => void
  onDelete: () => void
}) {
  const typeInfo = ACCOUNT_TYPES[account.type] || ACCOUNT_TYPES.savings

  return (
    <div className="bg-white rounded-xl border border-zinc-200 px-4 py-3 flex items-center justify-between hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3">
        <span className="text-xl">{typeInfo.emoji}</span>
        <div>
          <p className="font-medium text-zinc-900 text-sm">{account.name}</p>
          <p className="text-xs text-zinc-400">
            {[account.institution, account.last4Digits ? `尾号 ${account.last4Digits}` : null]
              .filter(Boolean)
              .join(' · ') || '—'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-zinc-700 tabular-nums">
          ¥{account.balance.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
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
            停用
          </button>
        </div>
      </div>
    </div>
  )
}

function AccountForm({
  editing,
  onClose,
  onSaved,
}: {
  editing: AccountItem | null
  onClose: () => void
  onSaved: () => void
}) {
  const [accountType, setAccountType] = useState(editing?.type || 'savings')

  const action = editing
    ? updateAccount.bind(null, editing.id)
    : createAccount
  const [state, formAction, isPending] = useActionState(action, null)

  useEffect(() => {
    if (state?.success) onSaved()
  }, [state, onSaved])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {editing ? '编辑账户' : '新建账户'}
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-xl">
            ✕
          </button>
        </div>

        {state?.error && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {state.error}
          </div>
        )}

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="type" value={accountType} />

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">账户名称 *</label>
            <input
              name="name"
              defaultValue={editing?.name || ''}
              required
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="如：招商银行储蓄卡"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">账户类型</label>
            <SearchableSelect
              options={TYPE_OPTIONS}
              value={accountType}
              onChange={setAccountType}
              placeholder="选择账户类型"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              机构名称 <span className="text-zinc-400">（可选）</span>
            </label>
            <input
              name="institution"
              defaultValue={editing?.institution || ''}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="如：招商银行、支付宝、微信"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              卡号后四位 <span className="text-zinc-400">（可选）</span>
            </label>
            <input
              name="last4Digits"
              defaultValue={editing?.last4Digits || ''}
              maxLength={4}
              pattern="\d{4}"
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="银行卡后4位数字"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              初始余额 <span className="text-zinc-400">（可选，默认 0）</span>
            </label>
            <input
              name="balance"
              type="number"
              step="0.01"
              defaultValue={editing?.balance ?? 0}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? '保存中...' : editing ? '更新' : '创建'}
          </button>
        </form>
      </div>
    </div>
  )
}
