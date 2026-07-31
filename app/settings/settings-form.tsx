'use client'

import { saveSettings } from '@/lib/actions/settings'
import { useState } from 'react'
import { Lightbulb } from 'lucide-react'

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
          className="bg-card rounded-md border border-border p-5"
        >
          <label className="block text-sm font-semibold text-foreground mb-1">
            {field.label}
          </label>
          <p className="text-xs text-muted-foreground mb-3">{field.description}</p>
          <input
            name={field.key}
            type={field.type}
            defaultValue={settings[field.key] || ''}
            placeholder={field.placeholder}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      ))}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          className="px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          保存设置
        </button>
        {saved && (
          <span className="text-sm text-green-600 dark:text-green-400">✓ 已保存</span>
        )}
      </div>

      <div className="bg-muted border border-border rounded-md p-4">
        <p className="text-sm text-muted-foreground">
          <Lightbulb className="inline h-4 w-4 mr-1" /> 提示：修改 API 配置后，新的交易记录将使用新配置进行分类。已有缓存不受影响。
        </p>
      </div>
    </form>
  )
}
