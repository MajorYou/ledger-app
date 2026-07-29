'use client'

import { useState } from 'react'
import { useRefresh } from './refresh-provider'

export function RefreshButton() {
  const { refresh } = useRefresh()
  const [spinning, setSpinning] = useState(false)

  const handleClick = () => {
    refresh()
    setSpinning(true)
    setTimeout(() => setSpinning(false), 700)
  }

  return (
    <button
      onClick={handleClick}
      className="p-1.5 text-zinc-400 hover:text-zinc-700 transition-colors rounded-lg hover:bg-zinc-100"
      title="刷新页面数据"
    >
      <svg
        className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 2v6h-6" />
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M3 22v-6h6" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      </svg>
    </button>
  )
}
