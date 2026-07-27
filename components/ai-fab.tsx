'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'

export function AiFab() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // 登录/注册页不显示
  if (pathname === '/login' || pathname === '/register') return null

  return (
    <>
      {/* 悬浮按钮 */}
      <button
        onClick={() => setOpen(!open)}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-2xl transition-all duration-300 hover:scale-110 ${
          open
            ? 'bg-zinc-700 rotate-45'
            : 'bg-gradient-to-br from-purple-500 to-blue-600 animate-pulse'
        }`}
        title="AI 助手"
      >
        {open ? (
          <span className="text-white -rotate-45 text-xl">✕</span>
        ) : (
          <span>🤖</span>
        )}
      </button>

      {/* 面板 */}
      {open && <AiPanel onClose={() => setOpen(false)} />}
    </>
  )
}

function AiPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden flex flex-col"
      style={{ maxHeight: 'calc(100vh - 140px)' }}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-500 to-blue-600 text-white">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <span className="font-semibold text-sm">AI 记账助手</span>
        </div>
        <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none">
          ✕
        </button>
      </div>

      {/* 内容 */}
      <AiChat />
    </div>
  )
}

function AiChat() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'ai'; content: string; preview?: unknown }>>([
    { role: 'ai', content: '你好！我是记账助手，你可以直接跟我说：\n\n• "今天午饭麦当劳 35"\n• "昨晚打车 28"\n• "把上周餐饮挪到旅行账本"\n\n我会帮你记账或整理账单 👇' },
  ])
  const [loading, setLoading] = useState(false)

  const handleSend = async () => {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)

    try {
      // 动态导入服务端逻辑
      const { parseNaturalLanguage, dryRunAdjust, executeAdjust } = await import('@/lib/actions/batch-adjust')

      const result = await parseNaturalLanguage(userMsg)
      if (!result.success) {
        setMessages((prev) => [...prev, { role: 'ai', content: `❌ ${result.error}` }])
        setLoading(false)
        return
      }

      const preview = await dryRunAdjust(result.parsed.filters, result.parsed.operations)

      if (preview.count === 0) {
        setMessages((prev) => [...prev, {
          role: 'ai',
          content: `「${result.parsed.explanation}」\n\n但没有匹配到任何交易，请调整描述。`,
        }])
        setLoading(false)
        return
      }


      let previewText = result.parsed.explanation + '\n\n'
      if (preview.newTransactions.length > 0) {
        previewText += `📝 将新增 ${preview.newTransactions.length} 笔：\n`
        preview.newTransactions.slice(0, 5).forEach((nt) => {
          previewText += `  • ${nt.merchant || '消费'} ${nt.type === 'income' ? '+' : '-'}¥${nt.amount.toFixed(2)} ${nt.categoryName ? `[${nt.categoryName}]` : ''}\n`
        })
      }
      if (preview.preview.length > 0) {
        previewText += `🔄 将修改 ${preview.preview.length} 笔：\n`
        preview.preview.slice(0, 5).forEach((tx) => {
          previewText += `  • ${tx.merchant} ¥${tx.amount.toFixed(2)} → ${tx.changes.join(', ')}\n`
        })
      }

      setMessages((prev) => [...prev, {
        role: 'ai',
        content: previewText + '\n需要我执行吗？',
        preview: { filters: result.parsed.filters, operations: result.parsed.operations },
      }])

    } catch (err) {
      setMessages((prev) => [...prev, { role: 'ai', content: '⚠️ 处理出错，请稍后再试' }])
    }
    setLoading(false)
  }

  const handleConfirm = async (filters: unknown, operations: unknown) => {
    setLoading(true)
    try {
      const { executeAdjust } = await import('@/lib/actions/batch-adjust')
      await executeAdjust(filters as any, operations as any)
      setMessages((prev) => [...prev, { role: 'ai', content: '✅ 已完成！' }])
    } catch {
      setMessages((prev) => [...prev, { role: 'ai', content: '⚠️ 执行失败' }])
    }
    setLoading(false)
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ minHeight: 200, maxHeight: 360 }}>
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-md'
                  : 'bg-zinc-100 text-zinc-800 rounded-bl-md'
              }`}
            >
              {msg.content}
              {msg.preview ? (
                <button
                  onClick={() => handleConfirm((msg.preview as any).filters, (msg.preview as any).operations)}
                  disabled={loading}
                  className="mt-2 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50 w-full"
                >
                  {loading ? '处理中...' : '✓ 确认执行'}
                </button>
              ) : null}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-zinc-100 rounded-xl px-3 py-2 text-sm text-zinc-400">
              🤖 思考中...
            </div>
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="border-t border-zinc-200 p-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder={'说点什么... 比如「午饭花了30」'}
          className="flex-1 px-3 py-2 border border-zinc-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          disabled={loading}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          发送
        </button>
      </div>
    </>
  )
}
