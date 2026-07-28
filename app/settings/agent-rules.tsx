'use client'

import { useState } from 'react'
import { saveSettings } from '@/lib/actions/settings'

const REFUND_MODES = [
  { value: 'add_income', label: '直接新增收入', desc: '退款直接作为收入记录，不关联原支出' },
  { value: 'match_deduct', label: '自动匹配抵消', desc: '找到对应支出自动删除，避免重复计算' },
  { value: 'always_ask', label: '每次都询问', desc: '每次退款都弹窗让你选择处理方式' },
]

const CLASSIFY_MODES = [
  { value: 'keyword', label: '关键词匹配', desc: '快速，基于预设关键词规则' },
  { value: 'llm', label: 'AI 智能分类', desc: '调用 LLM 分析，更准确但需 API Key' },
  { value: 'hybrid', label: '混合模式', desc: '优先关键词，未命中时回退 AI' },
]

export function AgentRulesForm({
  settings,
}: {
  settings: Record<string, string>
}) {
  const [saved, setSaved] = useState(false)
  const [refundMode, setRefundMode] = useState(settings['AGENT_REFUND_MODE'] || 'always_ask')
  const [classifyMode, setClassifyMode] = useState(settings['AGENT_CLASSIFY_MODE'] || 'keyword')

  return (
    <form
      action={async (formData) => {
        await saveSettings(formData)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }}
      className="space-y-6"
    >
      <h2 className="text-lg font-bold text-zinc-900">🤖 Agent 行为规则</h2>

      {/* 退款处理模式 */}
      <div className="bg-white rounded-xl border border-zinc-200 p-5">
        <label className="block text-sm font-semibold text-zinc-900 mb-1">
          退款处理方式
        </label>
        <p className="text-xs text-zinc-400 mb-3">
          导入账单或新增退款时，如何处理退款交易
        </p>
        <input type="hidden" name="AGENT_REFUND_MODE" value={refundMode} />
        <div className="space-y-2">
          {REFUND_MODES.map((mode) => (
            <label
              key={mode.value}
              className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer border-2 transition-colors ${
                refundMode === mode.value
                  ? 'border-blue-300 bg-blue-50'
                  : 'border-transparent hover:bg-zinc-50'
              }`}
            >
              <input
                type="radio"
                name="_refund_mode"
                value={mode.value}
                checked={refundMode === mode.value}
                onChange={() => setRefundMode(mode.value)}
                className="mt-0.5"
              />
              <div>
                <span className="text-sm font-medium text-zinc-800">{mode.label}</span>
                <p className="text-xs text-zinc-500 mt-0.5">{mode.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* 分类模式 */}
      <div className="bg-white rounded-xl border border-zinc-200 p-5">
        <label className="block text-sm font-semibold text-zinc-900 mb-1">
          导入分类方式
        </label>
        <p className="text-xs text-zinc-400 mb-3">
          导入账单时如何为每笔交易分配分类
        </p>
        <input type="hidden" name="AGENT_CLASSIFY_MODE" value={classifyMode} />
        <div className="space-y-2">
          {CLASSIFY_MODES.map((mode) => (
            <label
              key={mode.value}
              className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer border-2 transition-colors ${
                classifyMode === mode.value
                  ? 'border-blue-300 bg-blue-50'
                  : 'border-transparent hover:bg-zinc-50'
              }`}
            >
              <input
                type="radio"
                name="_classify_mode"
                value={mode.value}
                checked={classifyMode === mode.value}
                onChange={() => setClassifyMode(mode.value)}
                className="mt-0.5"
              />
              <div>
                <span className="text-sm font-medium text-zinc-800">{mode.label}</span>
                <p className="text-xs text-zinc-500 mt-0.5">{mode.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* 自定义指令 */}
      <div className="bg-white rounded-xl border border-zinc-200 p-5">
        <label className="block text-sm font-semibold text-zinc-900 mb-1">
          自定义 Agent 指令
        </label>
        <p className="text-xs text-zinc-400 mb-3">
          额外的分类规则或行为偏好，将追加到 AI 提示词中（仅 AI/混合模式生效）。
          <br />
          {'例如："同城停车归入交通＞停车"、"Nintendo 消费归入娱乐＞游戏"'}
        </p>
        <textarea
          name="AGENT_CUSTOM_RULES"
          defaultValue={settings['AGENT_CUSTOM_RULES'] || ''}
          rows={4}
          placeholder={'停车归入交通＞停车\nNintendo 归入娱乐＞游戏'}
          className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y font-mono"
        />
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          保存规则
        </button>
        {saved && (
          <span className="text-sm text-green-600">✓ 已保存</span>
        )}
      </div>
    </form>
  )
}
