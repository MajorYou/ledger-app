import { loadAllSettings } from '@/lib/actions/settings'
import { SettingsForm } from './settings-form'

export default async function SettingsPage() {
  const settings = await loadAllSettings()

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-zinc-900 mb-6">系统设置</h1>
      <SettingsForm settings={settings} />
    </div>
  )
}
