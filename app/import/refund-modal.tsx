'use client'

import type { ParsedBillItem } from '@/lib/parsers'
import { Repeat, Plus, Trash2 } from 'lucide-react'

interface RefundModalProps {
  refundChoice: {
    item: ParsedBillItem
    itemIdx: number
    matches: Array<{ id: string; merchant: string; amount: number; transactionTime: string; categoryName: string | null }>
  }
  waiting: boolean
  onAddIncome: () => void
  onDeleteExpense: () => void
}

export function RefundModal({ refundChoice, waiting, onAddIncome, onDeleteExpense }: RefundModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-md p-6 border border-border">
        <h3 className="text-lg font-semibold text-amber-600 mb-2"><Repeat className="inline h-5 w-5 mr-1" />检测到退款交易</h3>
        <p className="text-sm text-muted-foreground mb-3">
          <span className="font-medium text-foreground">{refundChoice.item.merchant}</span>{' '}
          退款 ¥{refundChoice.item.amount.toFixed(2)}
          （{refundChoice.item.transactionDate}）
        </p>
        {refundChoice.matches.length > 0 && (
          <>
            <p className="text-sm text-muted-foreground mb-2">找到以下可能对应的支出记录：</p>
            <div className="bg-muted rounded-lg p-3 mb-4 space-y-2 max-h-32 overflow-y-auto">
              {refundChoice.matches.slice(0, 5).map((m) => (
                <div key={m.id} className="flex items-center justify-between text-sm">
                  <span className="text-foreground truncate flex-1 mr-2">{m.merchant}</span>
                  <span className="text-xs text-muted-foreground">{m.transactionTime}</span>
                  <span className="text-destructive text-xs ml-2">-¥{m.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <p className="text-xs text-muted-foreground mb-4">选择处理方式：</p>
        <div className="flex gap-3">
          <button
            onClick={onAddIncome}
            disabled={waiting}
            className="flex-1 px-4 py-2.5 border border-border rounded-lg text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            <Plus className="inline h-4 w-4 mr-1" />新增收入
          </button>
          {refundChoice.matches.length > 0 && (
            <button
              onClick={onDeleteExpense}
              disabled={waiting}
              className="flex-1 px-4 py-2.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
            >
              <Trash2 className="inline h-4 w-4 mr-1" />抵消支出
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
