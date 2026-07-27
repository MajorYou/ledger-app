'use client'

import { useState } from 'react'
import { createCategory, updateCategory, deleteCategory } from '@/lib/actions/categories'

const ICONS = ['🍽️','🚗','🛒','🏠','🎮','🏥','📚','📞','💼','💰','🎁','📈','💵','📦','✈️','👔','📱','🧴']
const COLORS = [
  '#ef4444','#f59e0b','#10b981','#6366f1','#8b5cf6',
  '#ec4899','#06b6d4','#0ea5e9','#22c55e','#6b7280',
]

interface CategoryItem {
  id: string
  name: string
  type: string
  icon: string
  color: string
  parentId: string | null
  _count: { transactions: number }
}

export function CategoryCRUD({
  categories,
  parentOptions,
}: {
  categories: CategoryItem[]
  parentOptions: CategoryItem[]
}) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<CategoryItem | null>(null)

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这个分类？关联的交易将失去分类。')) return
    await deleteCategory(id)
  }

  const expenseCategories = categories.filter((c) => c.type === 'expense')
  const incomeCategories = categories.filter((c) => c.type === 'income')

  const buildTree = (list: CategoryItem[]) => {
    const roots = list.filter((c) => !c.parentId)
    const children = (parentId: string) => list.filter((c) => c.parentId === parentId)
    return { roots, children }
  }

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
          + 新建分类
        </button>
      </div>

      {showForm && (
        <CategoryForm
          parentOptions={parentOptions}
          editing={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            setEditing(null)
          }}
        />
      )}

      <div className="space-y-6">
        {/* 支出分类 */}
        <div>
          <h2 className="text-sm font-semibold text-red-500 mb-3">支出分类</h2>
          <CategoryList
            categories={expenseCategories}
            onEdit={(item) => { setEditing(item); setShowForm(true) }}
            onDelete={handleDelete}
            buildTree={buildTree}
          />
        </div>

        {/* 收入分类 */}
        <div>
          <h2 className="text-sm font-semibold text-green-500 mb-3">收入分类</h2>
          <CategoryList
            categories={incomeCategories}
            onEdit={(item) => { setEditing(item); setShowForm(true) }}
            onDelete={handleDelete}
            buildTree={buildTree}
          />
        </div>
      </div>
    </div>
  )
}

function CategoryList({
  categories,
  onEdit,
  onDelete,
  buildTree,
}: {
  categories: CategoryItem[]
  onEdit: (item: CategoryItem) => void
  onDelete: (id: string) => void
  buildTree: (list: CategoryItem[]) => { roots: CategoryItem[]; children: (pid: string) => CategoryItem[] }
}) {
  const { roots, children } = buildTree(categories)

  return (
    <div className="space-y-1">
      {roots.map((cat) => (
        <div key={cat.id}>
          <CategoryItemRow item={cat} onEdit={onEdit} onDelete={onDelete} />
          {children(cat.id).map((child) => (
            <div key={child.id} className="ml-8">
              <CategoryItemRow item={child} onEdit={onEdit} onDelete={onDelete} />
            </div>
          ))}
        </div>
      ))}
      {categories.length === 0 && (
        <p className="text-sm text-zinc-400 py-4">暂无分类</p>
      )}
    </div>
  )
}

function CategoryItemRow({
  item,
  onEdit,
  onDelete,
}: {
  item: CategoryItem
  onEdit: (item: CategoryItem) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 bg-white rounded-lg border border-zinc-100 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-2">
        <span className="text-lg">{item.icon}</span>
        <span
          className="text-sm font-medium"
          style={{ color: item.color }}
        >
          {item.name}
        </span>
        {item._count.transactions > 0 && (
          <span className="text-xs text-zinc-400">
            {item._count.transactions} 笔
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onEdit(item)}
          className="text-xs text-zinc-400 hover:text-blue-500"
        >
          编辑
        </button>
        <button
          onClick={() => onDelete(item.id)}
          className="text-xs text-zinc-400 hover:text-red-500"
        >
          删除
        </button>
      </div>
    </div>
  )
}

function CategoryForm({
  parentOptions,
  editing,
  onClose,
  onSaved,
}: {
  parentOptions: CategoryItem[]
  editing: CategoryItem | null
  onClose: () => void
  onSaved: () => void
}) {
  const [selectedIcon, setSelectedIcon] = useState(editing?.icon || '📦')
  const [selectedColor, setSelectedColor] = useState(editing?.color || '#6b7280')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {editing ? '编辑分类' : '新建分类'}
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-xl">
            ✕
          </button>
        </div>
        <form
          action={editing ? updateCategory.bind(null, editing.id) : createCategory}
          className="space-y-4"
        >
          <input type="hidden" name="icon" value={selectedIcon} />
          <input type="hidden" name="color" value={selectedColor} />

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">名称</label>
            <input
              name="name"
              defaultValue={editing?.name || ''}
              required
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="分类名称"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">类型</label>
            <select
              name="type"
              defaultValue={editing?.type || 'expense'}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="expense">支出</option>
              <option value="income">收入</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">图标</label>
            <div className="flex flex-wrap gap-1">
              {ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setSelectedIcon(icon)}
                  className={`text-xl p-1 rounded ${
                    selectedIcon === icon ? 'bg-blue-100 ring-2 ring-blue-300' : ''
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">颜色</label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <label key={c}>
                  <input
                    type="radio"
                    name="_color"
                    value={c}
                    checked={selectedColor === c}
                    onChange={() => setSelectedColor(c)}
                    className="sr-only"
                  />
                  <div
                    className="w-7 h-7 rounded-full cursor-pointer border-2"
                    style={{
                      backgroundColor: c,
                      borderColor: selectedColor === c ? '#18181b' : 'transparent',
                    }}
                  />
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              父分类
            </label>
            <select
              name="parentId"
              defaultValue={editing?.parentId || ''}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">无（顶级分类）</option>
              {parentOptions
                .filter((c) => c.id !== editing?.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
            </select>
          </div>

          <button
            type="submit"
            onClick={onSaved}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            {editing ? '更新' : '创建'}
          </button>
        </form>
      </div>
    </div>
  )
}
