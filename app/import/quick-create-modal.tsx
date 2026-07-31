'use client'

import { SearchableSelect } from '@/components/searchable-select'
import type { QuickCreateState } from '@/lib/hooks/use-import-state'
import { FolderTree } from 'lucide-react'

interface QuickCreateModalProps {
  quickCreate: QuickCreateState
  parentOptions: Array<{ value: string; label: string }>
  onCreate: () => void
  onCancel: () => void
  onUpdate: (state: QuickCreateState) => void
}

export function QuickCreateModal({ quickCreate, parentOptions, onCreate, onCancel, onUpdate }: QuickCreateModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-sm p-6 border border-border">
        <h3 className="text-lg font-semibold text-amber-600 mb-2"><FolderTree className="inline h-5 w-5 mr-1" />快速创建分类</h3>
        <p className="text-sm text-muted-foreground mb-4">
          为 <span className="font-medium text-foreground">{quickCreate.itemName}</span> 创建新分类
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">分类名称</label>
            <input
              type="text"
              value={quickCreate.suggestedName}
              onChange={(e) => onUpdate({ ...quickCreate, suggestedName: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">父分类</label>
            <SearchableSelect
              options={parentOptions}
              value={quickCreate.selectedParentId}
              onChange={(v) => onUpdate({ ...quickCreate, selectedParentId: v })}
              placeholder="选择父分类"
            />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted"
          >
            取消
          </button>
          <button
            onClick={onCreate}
            disabled={quickCreate.creating || !quickCreate.suggestedName.trim() || !quickCreate.selectedParentId}
            className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
          >
            {quickCreate.creating ? '创建中...' : '创建并应用'}
          </button>
        </div>
      </div>
    </div>
  )
}
