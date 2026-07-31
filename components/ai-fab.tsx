'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useRefresh } from './refresh-provider'
import { ALLOWED_REDIRECT_PATHS } from '@/lib/ai-capabilities'
import type { ConversationContext } from '@/lib/actions/batch-adjust'
import { shouldResetContext, PRONOUN_REGEX } from '@/lib/conversation-context'
import { Bot, X, XCircle, PenLine, Trash2, ClipboardList, Repeat, AlertTriangle, Ban, CheckCircle, ArrowDown } from 'lucide-react'

interface ChatMessage {
  role: 'user' | 'ai'
  content: string | React.ReactNode
  preview?: unknown
  isDelete?: boolean
  deleteIds?: string[]
  queryTransactions?: Array<{
    id: string; merchant: string; amount: number; type: string
    transactionTime: string; categoryName: string; ledgerNames: string[]
  }>
  unsupported?: { message: string; redirect: string }
  confidence?: number
  clarifySuggestions?: string[]
  showQuickActions?: boolean
}

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
            ? 'bg-muted rotate-45'
            : 'bg-gradient-to-br from-[#34dbcb] to-[#3445db] animate-pulse'
        }`}
        title="AI 助手"
      >
        {open ? (
          <span className="text-white -rotate-45 text-xl"><X className="h-5 w-5" /></span>
        ) : (
          <span><Bot className="h-6 w-6 text-white" /></span>
        )}
      </button>

      {/* 面板 */}
      {open && <AiPanel onClose={() => setOpen(false)} />}
    </>
  )
}

function AiPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] bg-card rounded-lg shadow-2xl border border-border overflow-hidden flex flex-col"
      style={{ maxHeight: 'calc(100vh - 140px)' }}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#34dbcb] to-[#3445db] text-white">
        <div className="flex items-center gap-2">
          <span className="text-lg"><Bot className="h-5 w-5 text-white" /></span>
          <span className="font-semibold text-sm">AI 记账助手</span>
        </div>
        <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* 内容 */}
      <AiChat />
    </div>
  )
}

function AiChat() {
  const { refresh } = useRefresh()
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'ai', content: '你好！我是记账助手，你可以直接跟我说：\n\n• "今天午饭麦当劳 35"\n• "昨晚打车 28"\n• "把上周餐饮挪到旅行账本"\n• "删除本月所有停车记录"\n• "帮我查一下上周的交易"\n\n我会帮你记账或整理账单。试试直接输入吧：'}
  ])
  const [loading, setLoading] = useState(false)
  const [confirmedIdx, setConfirmedIdx] = useState<number | null>(null)
  const [lowConfConfirm, setLowConfConfirm] = useState<number | null>(null)
  const [conversationContext, setConversationContext] = useState<ConversationContext | undefined>(undefined)

  const handleSend = async () => {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)

    // 检查是否需要手动清理上下文
    let effectiveContext = conversationContext
    let effectiveTurnCount = conversationContext?.turnCount || 0
    if (shouldResetContext(userMsg)) {
      effectiveContext = undefined
      effectiveTurnCount = 0
      setConversationContext(undefined)
      setMessages((prev) => [...prev, { role: 'ai', content: '好的，已开启新对话。' }])
    }

    // 自动淡化：超过 5 轮且新消息不包含指代词时，清空上下文
    if (effectiveContext && effectiveTurnCount > 5) {
      const hasPronoun = PRONOUN_REGEX.test(userMsg)
      if (!hasPronoun) {
        effectiveContext = undefined
        effectiveTurnCount = 0
        setConversationContext(undefined)
      }
    }

    try {
      // 动态导入服务端逻辑
      const { parseNaturalLanguage, dryRunAdjust, executeAdjust } = await import('@/lib/actions/batch-adjust')

      const result = await parseNaturalLanguage(userMsg, effectiveContext)
      if (!result.success) {
        setMessages((prev) => [...prev, { role: 'ai', content: <><XCircle className="inline h-4 w-4 mr-1" /> {result.error}</> }])
        setLoading(false)
        return
      }

      // 澄清模式：显示建议按钮
      if (result.mode === 'clarify') {
        setMessages((prev) => [...prev, {
          role: 'ai',
          content: result.reply,
          clarifySuggestions: result.suggestions,
        }])
        setLoading(false)
        return
      }

      // 查询模式：直接展示回复，并更新上下文
      if (result.mode === 'query') {
        // 无论查询结果是否为空，都更新上下文（避免旧的 previousQueryTransactions 残留）
        setConversationContext({
          previousQueryTransactions: (result.transactions || []).map(tx => ({
            id: tx.id,
            merchant: tx.merchant,
            amount: tx.amount,
            categoryName: tx.categoryName,
            date: new Date(tx.transactionTime).toLocaleDateString('zh-CN'),
          })),
          turnCount: effectiveTurnCount + 1,
        })
        setMessages((prev) => [...prev, {
          role: 'ai',
          content: result.reply,
          queryTransactions: result.transactions,
          confidence: result.confidence,
          showQuickActions: (result.transactions?.length ?? 0) > 0,
        }])
        setLoading(false)
        return
      }

      // 不支持的操作：友好提示 + 跳转链接
      if (result.mode === 'unsupported') {
        setMessages((prev) => [...prev, {
          role: 'ai',
          content: result.message,
          unsupported: { message: result.message, redirect: result.redirect },
        }])
        setLoading(false)
        return
      }

      // 操作模式：操作完成后清空上下文（因为操作已完成）
      setConversationContext(undefined)

      const preview = await dryRunAdjust(result.parsed.filters, result.parsed.operations)

      if (preview.count === 0) {
        setMessages((prev) => [...prev, {
          role: 'ai',
          content: `「${result.parsed.explanation}」\n\n但没有匹配到任何交易，请调整描述。`,
        }])
        setLoading(false)
        return
      }

      // 检测是否是删除操作
      const isDelete = result.parsed.operations.some((op: { type: string }) => op.type === 'delete_transactions')
      // 检测是否是复制操作
      const isDuplicate = result.parsed.operations.some((op: { type: string }) => op.type === 'duplicate_transaction')

      let previewText = result.parsed.explanation + '\n\n'
      if (preview.newTransactions.length > 0) {
        previewText += <><PenLine className="inline h-3 w-3" /> 将新增 ${preview.newTransactions.length} 笔：\n</>
        preview.newTransactions.slice(0, 5).forEach((nt) => {
          previewText += `  • ${nt.merchant || '消费'} ${nt.type === 'income' ? '+' : '-'}¥${nt.amount.toFixed(2)} ${nt.categoryName ? `[${nt.categoryName}]` : ''}\n`
        })
      }
      if (preview.preview.length > 0) {
        if (isDelete) {
          previewText += <><Trash2 className="inline h-3 w-3" /> 将删除 ${preview.preview.length} 笔：\n</>
        } else if (isDuplicate) {
          previewText += <><ClipboardList className="inline h-3 w-3" /> 将复制 ${preview.preview.length} 笔：\n</>
        } else {
          previewText += <><Repeat className="inline h-3 w-3" /> 将修改 ${preview.preview.length} 笔：\n</>
        }
        preview.preview.slice(0, 5).forEach((tx) => {
          previewText += `  • ${tx.merchant} ¥${tx.amount.toFixed(2)} → ${tx.changes.join(', ')}\n`
        })
      }

      setMessages((prev) => [...prev, {
        role: 'ai',
        content: <>{previewText}{isDelete ? <><AlertTriangle className="inline h-3 w-3" /> 删除不可撤销，确认执行吗？</> : '需要我执行吗？'}</>,
        preview: { filters: result.parsed.filters, operations: result.parsed.operations },
        isDelete,
        confidence: result.confidence,
      }])

    } catch (err) {
      setMessages((prev) => [...prev, { role: 'ai', content: <><AlertTriangle className="inline h-4 w-4 mr-1" />处理出错，请稍后再试</> }])
    }
    setLoading(false)
  }

  const handleConfirm = async (msgIndex: number, filters: unknown, operations: unknown) => {
    setLoading(true)
    try {
      const { executeAdjust } = await import('@/lib/actions/batch-adjust')
      await executeAdjust(filters as any, operations as any)
      // 原地标记已确认，移除按钮
      setConfirmedIdx(msgIndex)
      refresh()
    } catch {
      setMessages((prev) => [...prev, { role: 'ai', content: <><AlertTriangle className="inline h-4 w-4 mr-1" />执行失败</> }])
    }
    setLoading(false)
  }

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion)
    // 自动发送
    setTimeout(() => {
      const sendBtn = document.querySelector('[data-ai-send]') as HTMLButtonElement | null
      sendBtn?.click()
    }, 50)
  }

  const handleQuickAction = (action: string) => {
    if (action === '修改分类') {
      // 需要用户补充目标分类，不直接发送
      setMessages((prev) => [...prev, { role: 'ai', content: '请告诉我要改成什么分类？例如："改成三餐"' }])
      setInput('把这些交易改成')
      return
    }
    if (action === '移到其他账本') {
      // 需要用户补充目标账本，不直接发送
      setMessages((prev) => [...prev, { role: 'ai', content: '请告诉我要移到哪个账本？例如："移到旅行账本"' }])
      setInput('把这些交易移到')
      return
    }
    // 删除可以直接发送（利用上下文指代消解）
    setInput(action)
    setTimeout(() => {
      const sendBtn = document.querySelector('[data-ai-send]') as HTMLButtonElement | null
      sendBtn?.click()
    }, 50)
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ minHeight: 200, maxHeight: 360 }}>
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-md px-3 py-2 text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-primary text-white rounded-md rounded-br-md'
                  : 'bg-muted text-foreground rounded-md rounded-bl-md'
              }`}
            >
              {msg.content}
              {/* 信心度标识 */}
              {msg.confidence !== undefined && !isNaN(msg.confidence) && msg.confidence < 0.8 && msg.confidence >= 0.5 && (
                <div className="mt-1.5 flex items-center gap-1 text-xs text-amber-600">
                  <span><AlertTriangle className="inline h-3 w-3 mr-1" /></span>
                  <span>AI 可能理解有误，请仔细检查预览内容</span>
                </div>
              )}
              {msg.confidence !== undefined && !isNaN(msg.confidence) && msg.confidence < 0.5 && (
                <div className="mt-1.5 flex items-center gap-1 text-xs text-destructive">
                  <span><Ban className="inline h-3 w-3 mr-1" /></span>
                  <span>AI 非常不确定，请仔细核实后再执行</span>
                </div>
              )}
              {/* 查询模式：展示匹配的交易卡片 */}
              {msg.queryTransactions && msg.queryTransactions.length > 0 && (
                <div className="mt-2 space-y-1">
                  {msg.queryTransactions.map((tx) => (
                    <div key={tx.id} className="flex items-center gap-2 bg-card/60 rounded-lg px-2 py-1.5 text-xs">
                      <span className="text-muted-foreground w-16 shrink-0">
                        {new Date(tx.transactionTime).toLocaleDateString('zh-CN')}
                      </span>
                      <span className="text-foreground flex-1 truncate">{tx.merchant}</span>
                      <span className="text-muted-foreground">{tx.categoryName}</span>
                      <span className={tx.type === 'income' ? 'text-green-600 dark:text-green-400 font-medium' : 'text-destructive font-medium'}>
                        {tx.type === 'income' ? '+' : '-'}¥{tx.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {msg.queryTransactions && msg.queryTransactions.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">未找到匹配的交易记录</p>
              )}
              {msg.unsupported ? (ALLOWED_REDIRECT_PATHS.includes(msg.unsupported.redirect) ? (
                <a
                  href={msg.unsupported.redirect}
                  className="mt-2 inline-block px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground rounded-md text-xs font-medium transition-colors"
                >
                  前往操作 →
                </a>
              ) : null) : null}
              {msg.preview ? (
                confirmedIdx !== i ? (
                  <>
                    {/* 低信心度二次确认弹窗 */}
                    {lowConfConfirm === i ? (
                      <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded-lg">
                        <p className="text-xs text-destructive mb-2"><AlertTriangle className="inline h-3 w-3 mr-1" />AI 非常不确定（信心度 {Math.round((isNaN(msg.confidence ?? 0.8) ? 0.8 : msg.confidence ?? 0.8) * 100)}%），确认要继续执行吗？</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setLowConfConfirm(null); handleConfirm(i, (msg.preview as any).filters, (msg.preview as any).operations) }}
                            className="flex-1 px-2 py-1 bg-destructive text-white rounded text-xs font-medium hover:bg-destructive/90"
                          >
                            确认执行
                          </button>
                          <button
                            onClick={() => setLowConfConfirm(null)}
                            className="flex-1 px-2 py-1 bg-muted hover:bg-muted/80 text-foreground rounded-md text-xs font-medium"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          const conf = isNaN(msg.confidence ?? 0.8) ? 0.8 : (msg.confidence ?? 0.8)
                          if (conf < 0.5) {
                            setLowConfConfirm(i)
                          } else {
                            handleConfirm(i, (msg.preview as any).filters, (msg.preview as any).operations)
                          }
                        }}
                        disabled={loading}
                        className={`mt-2 px-3 py-1.5 text-white rounded-lg text-xs font-medium disabled:opacity-50 w-full ${
                          !isNaN(msg.confidence ?? 0.8) && (msg.confidence ?? 0.8) < 0.8 && (msg.confidence ?? 0.8) >= 0.5
                            ? 'bg-amber-500 hover:bg-amber-600'
                            : msg.isDelete
                              ? 'bg-destructive hover:bg-destructive/90'
                              : 'bg-green-600 hover:bg-green-700'
                        }`}
                      >
                        {loading ? '处理中...' : msg.isDelete ? <><AlertTriangle className="inline h-3 w-3 mr-1" />确认删除</> : <><CheckCircle className="inline h-3 w-3 mr-1" />确认执行</>}
                      </button>
                    )}
                  </>
                ) : null
              ) : null}
              {confirmedIdx === i && (
                <p className="mt-2 text-xs text-green-600 dark:text-green-400 font-medium"><CheckCircle className="inline h-3 w-3 mr-1" />已完成！</p>
              )}
              {/* 澄清模式：建议按钮 */}
              {msg.clarifySuggestions && msg.clarifySuggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {msg.clarifySuggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSuggestionClick(s)}
                      className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-full text-xs font-medium transition-colors border border-purple-200"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {/* 查询结果快捷操作按钮 */}
              {msg.showQuickActions && msg.queryTransactions && msg.queryTransactions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    onClick={() => handleQuickAction('修改分类')}
                    className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-full text-xs font-medium transition-colors border border-blue-200"
                  >
                    修改分类
                  </button>
                  <button
                    onClick={() => handleQuickAction('移到其他账本')}
                    className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-full text-xs font-medium transition-colors border border-blue-200"
                  >
                    移到其他账本
                  </button>
                  <button
                    onClick={() => handleQuickAction('删除这些交易')}
                    className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded-full text-xs font-medium transition-colors border border-red-200"
                  >
                    删除这些交易
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-md px-3 py-2 text-sm text-muted-foreground">
              <Bot className="inline h-4 w-4 mr-1" />思考中...
            </div>
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="border-t border-border p-3 flex gap-2">
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
          className="flex-1 px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          disabled={loading}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          data-ai-send
          className="px-4 py-2 bg-gradient-to-r from-[#34dbcb] to-[#3445db] text-white rounded-md text-sm font-medium hover:from-[#2bc4b6] hover:to-[#2d3bc4] disabled:opacity-50 transition-colors"
        >
          发送
        </button>
      </div>
    </>
  )
}
