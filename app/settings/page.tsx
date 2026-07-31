import { prisma } from '@/lib/db'
import { loadAllSettings } from '@/lib/actions/settings'
import { SettingsForm } from './settings-form'
import { LearnedRules } from './learned-rules'
import { AgentRulesForm } from './agent-rules'
import { UserRulesManager } from './user-rules'
import { OperationTemplatesManager } from './operation-templates'
import { getUserRules, getTemplates } from '@/lib/actions/user-rules'

export default async function SettingsPage() {
  const settings = await loadAllSettings()

  const rules = await prisma.classificationCache.findMany({
    include: { category: { select: { name: true, icon: true } } },
    orderBy: { hitCount: 'desc' },
  })

  const userRules = await getUserRules()
  const templates = await getTemplates()

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
      <div>
        <h1 className="text-xl font-bold text-foreground mb-6">系统设置</h1>
        <SettingsForm settings={settings} />
      </div>

      <div>
        <AgentRulesForm settings={settings} />
      </div>

      <div>
        <h2 className="text-lg font-bold text-foreground mb-4">用户规则</h2>
        <p className="text-sm text-muted-foreground mb-4">
          定义通用规则，AI 会优先匹配这些规则，跳过 LLM 调用。
        </p>
        <UserRulesManager rules={JSON.parse(JSON.stringify(userRules))} />
      </div>

      <div>
        <h2 className="text-lg font-bold text-foreground mb-4">操作模板</h2>
        <p className="text-sm text-muted-foreground mb-4">
          定义常用操作组合，说出触发词即可快速执行。
        </p>
        <OperationTemplatesManager templates={JSON.parse(JSON.stringify(templates))} />
      </div>

      <div>
        <h2 className="text-lg font-bold text-foreground mb-4">已学规则</h2>
        <LearnedRules
          rules={JSON.parse(JSON.stringify(rules))}
          userRules={JSON.parse(JSON.stringify(userRules))}
        />
      </div>
    </div>
  )
}
