'use client'

import { saveSettings } from '@/lib/actions/settings'
import { useState } from 'react'

const SETTING_FIELDS = [
  {
    key: 'DEEPSEEK_API_KEY',
    label: 'DeepSeek API Key',
    description: '用于 AI 智能分类。在 DeepSeek 平台申请，留空则禁用 AI 分类。',
    placeholder: 'sk-...',
    type: 'password',
  },
  {
    key: 'DEEPSEEK_BASE_URL',
    label: 'API 地址',
    description: 'DeepSeek 兼容 API 地址，默认 https://api.deepseek.com',
    placeholder: 'https://api.deepseek.com',
    type: 'text',
  },
  {
    key: 'DEEPSEEK_MODEL',
    label: '模型名称',
    description: '使用的模型，可选 deepseek-chat / deepseek-reasoner',
    placeholder: 'deepseek-chat',
    type: 'text',
  },
]

export function SettingsForm({
  settings,
}: {
  settings: Record<string, string>
}) {
  const [saved, setSaved] = useState(false)

  return (
    <form
      action={async (formData) => {
        await saveSettings(formData)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }}
      className="space-y-6"
    >
      {SETTING_FIELDS.map((field) => (
        <div
          key={field.key}
          className="bg-white rounded-xl border border-zinc-200 p-5"
        >
          <label className="block text-sm font-semibold text-zinc-900 mb-1">
            {field.label}
          </label>
          <p className="text-xs text-zinc-400 mb-3">{field.description}</p>
          <input
            name={field.key}
            type={field.type}
            defaultValue={settings[field.key] || ''}
            placeholder={field.placeholder}
            className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      ))}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          保存设置
        </button>
        {saved && (
          <span className="text-sm text-green-600">✓ 已保存</span>
        )}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-sm text-amber-700">
          💡 提示：修改 API 配置后，新的交易记录将使用新配置进行分类。已有缓存不受影响。
        </p>
      </div>
    </form>
  )
}
