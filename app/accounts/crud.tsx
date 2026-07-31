'use client'

import { useState, useEffect } from 'react'
import { useActionState } from 'react'
import { createAccount, updateAccount, deleteAccount } from '@/lib/actions/accounts'
import { SearchableSelect } from '@/components/searchable-select'
import { CreditCard, Wallet, Smartphone, TrendingUp, Banknote } from 'lucide-react'

const ACCOUNT_TYPES: Record<string, { label: string; icon: React.ElementType }> = {
  savings:    { label: '储蓄账户', icon: CreditCard },
  credit:     { label: '信用账户', icon: Wallet },
  prepaid:    { label: '预付账户', icon: Smartphone },
  investment: { label: '投资账户', icon: TrendingUp },
  cash:       { label: '现金',     icon: Banknote },
}

const TYPE_ORDER = ['savings', 'credit', 'prepaid', 'investment', 'cash'] as const

const TYPE_OPTIONS = [
  { value: 'savings',    label: '储蓄账户' },
  { value: 'credit',     label: '信用账户' },
  { value: 'prepaid',    label: '预付账户' },
  { value: 'investment', label: '投资账户' },
  { value: 'cash',       label: '现金' },
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
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
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
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
              <group.icon className="h-4 w-4" /> {group.label}
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
          <p className="text-center text-muted-foreground py-8">暂无账户，点击上方按钮创建</p>
        )}

        {emptyTypes.length > 0 && accounts.length > 0 && (
          <p className="text-xs text-muted-foreground pt-2">
            尚未创建：{emptyTypes.map((t) => ACCOUNT_TYPES[t].label).join('、')}
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
  const TypeIcon = typeInfo.icon

  return (
    <div className="bg-card rounded-md border border-border px-4 py-3 flex items-center justify-between hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3">
        <TypeIcon className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="font-medium text-foreground text-sm">{account.name}</p>
          <p className="text-xs text-muted-foreground">
            {[account.institution, account.last4Digits ? `尾号 ${account.last4Digits}` : null]
              .filter(Boolean)
              .join(' · ') || '—'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-foreground tabular-nums">
          ¥{account.balance.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            className="text-xs text-muted-foreground hover:text-primary"
          >
            编辑
          </button>
          <button
            onClick={onDelete}
            className="text-xs text-muted-foreground hover:text-destructive"
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
      <div className="bg-card rounded-lg shadow-xl w-full max-w-sm p-6 border border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {editing ? '编辑账户' : '新建账户'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">
            ✕
          </button>
        </div>

        {state?.error && (
          <div className="mb-3 p-2 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
            {state.error}
          </div>
        )}

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="type" value={accountType} />

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">账户名称 *</label>
            <input
              name="name"
              defaultValue={editing?.name || ''}
              required
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="如：招商银行储蓄卡/信用卡"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">账户类型</label>
            <SearchableSelect
              options={TYPE_OPTIONS}
              value={accountType}
              onChange={setAccountType}
              placeholder="选择账户类型"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              机构名称 <span className="text-muted-foreground">（可选）</span>
            </label>
            <input
              name="institution"
              defaultValue={editing?.institution || ''}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="如：招商银行、支付宝、微信"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              卡号后四位 <span className="text-muted-foreground">（可选）</span>
            </label>
            <input
              name="last4Digits"
              defaultValue={editing?.last4Digits || ''}
              maxLength={4}
              pattern="\d{4}"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="银行卡后4位数字"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              初始余额 <span className="text-muted-foreground">（可选，默认 0）</span>
            </label>
            <input
              name="balance"
              type="number"
              step="0.01"
              defaultValue={editing?.balance ?? 0}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="0.00"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isPending ? '保存中...' : editing ? '更新' : '创建'}
          </button>
        </form>
      </div>
    </div>
  )
}
