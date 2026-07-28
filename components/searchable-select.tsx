'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface Option {
  value: string
  label: string
  group?: string
}

interface SearchableSelectProps {
  options: Option[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  size?: 'sm' | 'md'
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = '请选择...',
  className = '',
  disabled = false,
  size = 'md',
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)

  // 点击外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // 打开时聚焦搜索框
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
    }
  }, [open])

  const filtered = search
    ? options.filter((o) =>
        o.label.toLowerCase().includes(search.toLowerCase()) ||
        (o.group && o.group.toLowerCase().includes(search.toLowerCase()))
      )
    : options

  // 键盘导航
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setSearch('')
      }
      if (e.key === 'Enter' && !open) {
        setOpen(true)
      }
    },
    [open]
  )

  const selectOption = (optValue: string) => {
    onChange(optValue)
    setOpen(false)
    setSearch('')
  }

  const sizeClass = size === 'sm' ? 'py-1 text-xs' : 'py-2 text-sm'

  // Group options
  const grouped = new Map<string, Option[]>()
  const ungrouped: Option[] = []
  for (const opt of filtered) {
    if (opt.group) {
      if (!grouped.has(opt.group)) grouped.set(opt.group, [])
      grouped.get(opt.group)!.push(opt)
    } else {
      ungrouped.push(opt)
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        onKeyDown={handleKeyDown}
        className={`w-full px-3 ${sizeClass} border border-zinc-300 rounded-lg text-left focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white flex items-center justify-between gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
          open ? 'ring-2 ring-blue-500' : ''
        }`}
      >
        <span className={`${selected ? 'text-zinc-900' : 'text-zinc-400'} truncate`}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-lg border border-zinc-200 shadow-xl overflow-hidden">
          {/* 搜索框 */}
          <div className="p-2 border-b border-zinc-100">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="搜索..."
              className="w-full px-2 py-1.5 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          {/* 选项列表 */}
          <div ref={listRef} className="max-h-48 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-sm text-zinc-400 text-center">无匹配选项</div>
            )}

            {/* 清除选择 */}
            {value && (
              <button
                type="button"
                onClick={() => selectOption('')}
                className="w-full text-left px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-50 border-b border-zinc-100"
              >
                ✕ 清除选择
              </button>
            )}

            {/* 分组选项 */}
            {[...grouped.entries()].map(([group, opts]) => (
              <div key={group}>
                <div className="px-3 py-1 text-xs text-zinc-400 font-medium bg-zinc-50">{group}</div>
                {opts.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => selectOption(opt.value)}
                    className={`w-full text-left px-5 py-2 text-sm hover:bg-blue-50 transition-colors ${
                      opt.value === value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-zinc-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            ))}

            {/* 无分组选项 */}
            {ungrouped.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => selectOption(opt.value)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${
                  opt.value === value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-zinc-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
