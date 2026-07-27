'use client'

import { useState } from 'react'
import { TransactionForm } from '@/components/transaction-form'
import { deleteTransaction } from '@/lib/actions/transactions'
import type { PageData } from './page'

export function ClientTransactionsPage({ data }: { data: PageData }) {
  const { transactions, categories, accounts, ledgers } = data
  const [showForm, setShowForm] = useState(false)
  const [editingTx, setEditingTx] = useState<any>(null)

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这条交易记录？')) return
    await deleteTransaction(id)
  }

  const handleEdit = (tx: any) => {
    setEditingTx(tx)
    setShowForm(true)
  }

  const handleAdd = () => {
    setEditingTx(null)
    setShowForm(true)
  }

  const handleSuccess = () => {
    setShowForm(false)
    setEditingTx(null)
  }

  const formatDate = (d: string) => {
    const date = new Date(d)
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      weekday: 'short',
    })
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-zinc-900">交易记录</h1>
        <button
          onClick={handleAdd}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + 添加交易
        </button>
      </div>

      {/* 添加/编辑弹窗 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {editingTx ? '编辑交易' : '添加交易'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-zinc-400 hover:text-zinc-600 text-xl"
              >
                ✕
              </button>
            </div>
            <TransactionForm
              categories={categories}
              accounts={accounts}
              ledgers={ledgers}
              transaction={
                editingTx
                  ? {
                      ...editingTx,
                      transactionTime: new Date(editingTx.transactionTime),
                      transactionLedgers: editingTx.transactionLedgers || [],
                    }
                  : undefined
              }
              onSuccess={handleSuccess}
            />
          </div>
        </div>
      )}

      {/* 列表 */}
      {transactions.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-4">📝</p>
          <p className="text-zinc-500">还没有交易记录</p>
          <p className="text-sm text-zinc-400 mt-1">点击上方按钮开始记账</p>
        </div>
      ) : (
        <div className="space-y-2">
          {transactions.map((tx: any) => (
            <div
              key={tx.id}
              className="bg-white rounded-xl border border-zinc-200 p-4 hover:shadow-sm transition-shadow group"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl mt-0.5">
                  {tx.category?.icon || '📦'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-zinc-900 truncate">
                      {tx.merchant || tx.description || '未命名交易'}
                    </p>
                    {tx.transactionLedgers?.length > 0 && (
                      <div className="flex gap-1">
                        {tx.transactionLedgers.map((tl: any) => (
                          <span
                            key={tl.ledgerId}
                            className="text-[10px] px-1.5 py-0.5 rounded-full"
                            style={{
                              backgroundColor: tl.ledger.color + '20',
                              color: tl.ledger.color,
                            }}
                          >
                            {tl.ledger.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-400">
                    <span>{formatDate(tx.transactionTime)}</span>
                    {tx.account && <span>· {tx.account.name}</span>}
                    {tx.category && (
                      <span className="text-zinc-500">
                        · {tx.category.name}
                      </span>
                    )}
                  </div>
                  {tx.description && (
                    <p className="text-xs text-zinc-400 mt-0.5 truncate">
                      {tx.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-semibold whitespace-nowrap ${
                      tx.type === 'income' ? 'text-green-500' : 'text-red-500'
                    }`}
                  >
                    {tx.type === 'income' ? '+' : '-'}¥
                    {Number(tx.amount).toFixed(2)}
                  </span>
                  <div className="hidden group-hover:flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(tx)}
                      className="text-xs text-zinc-400 hover:text-blue-500 p-1"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(tx.id)}
                      className="text-xs text-zinc-400 hover:text-red-500 p-1"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
