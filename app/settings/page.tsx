import { prisma } from '@/lib/db'
import { loadAllSettings } from '@/lib/actions/settings'
import { SettingsForm } from './settings-form'
import { LearnedRules } from './learned-rules'
import { AgentRulesForm } from './agent-rules'

export default async function SettingsPage() {
  const settings = await loadAllSettings()

  const rules = await prisma.classificationCache.findMany({
    include: { category: { select: { name: true, icon: true } } },
    orderBy: { hitCount: 'desc' },
  })

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 mb-6">系统设置</h1>
        <SettingsForm settings={settings} />
      </div>

      <div>
        <AgentRulesForm settings={settings} />
      </div>

      <div>
        <h2 className="text-lg font-bold text-zinc-900 mb-4">已学规则</h2>
        <LearnedRules
          rules={JSON.parse(JSON.stringify(rules))}
        />
      </div>
    </div>
  )
}
