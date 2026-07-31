/**
 * 构建时校验脚本：确保 lib/ai-capabilities.ts 中的 allPageMetadata
 * 覆盖 app/ 目录下所有页面。
 *
 * 运行方式：npx tsx scripts/validate-ai-features.ts
 */

import * as fs from 'fs'
import * as path from 'path'

// ─── 配置 ────────────────────────────────────────────────────────────────────

const APP_DIR = path.resolve(__dirname, '..', 'app')

/** 需要排除的目录/路由（认证页面、API 路由等不需要 AI 感知） */
const EXCLUDED_ROUTES = new Set([
  '/login',
  '/register',
])

/** 排除的目录前缀（app/ 下的子目录名） */
const EXCLUDED_DIR_PREFIXES = ['api']

// ─── 1. 扫描 app/ 目录，收集所有页面路由 ──────────────────────────────────────

function collectPageRoutes(dir: string, segments: string[] = []): string[] {
  const routes: string[] = []

  // 检查当前目录是否有 page.tsx（处理 app/ 根目录的情况）
  const rootPage = path.join(dir, 'page.tsx')
  if (fs.existsSync(rootPage) && segments.length === 0) {
    routes.push('/')
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const name = entry.name
    // 跳过排除的目录前缀
    if (EXCLUDED_DIR_PREFIXES.includes(name)) continue

    const fullPath = path.join(dir, name)

    if (name.startsWith('(') && name.endsWith(')')) {
      // Next.js route group: app/(group)/xxx → 路由中不含 (group)
      routes.push(...collectPageRoutes(fullPath, segments))
    } else {
      const newSegments = [...segments, name]
      const pageFile = path.join(fullPath, 'page.tsx')
      if (fs.existsSync(pageFile)) {
        const route = '/' + newSegments.join('/')
        if (!EXCLUDED_ROUTES.has(route)) {
          routes.push(route)
        }
      }
      // 继续递归（可能有嵌套页面）
      routes.push(...collectPageRoutes(fullPath, newSegments))
    }
  }

  return routes
}

// ─── 2. 读取 allPageMetadata 中已注册的 path ──────────────────────────────────

function getRegisteredPaths(): string[] {
  // 直接 import 源文件（tsx 可以处理 TypeScript）
  // 使用 require 动态加载以避免 ESM/CJS 兼容问题
  const mod = require(path.resolve(__dirname, '..', 'lib', 'ai-capabilities.ts'))
  const metadata: { path: string }[] = mod.allPageMetadata
  return metadata.map(m => m.path)
}

// ─── 3. 对比校验 ──────────────────────────────────────────────────────────────

function validate() {
  const pageRoutes = collectPageRoutes(APP_DIR).sort()
  const registeredPaths = getRegisteredPaths().sort()

  const pageSet = new Set(pageRoutes)
  const registeredSet = new Set(registeredPaths)

  let hasError = false

  // 页面存在但未注册 → warning
  const unregistered = pageRoutes.filter(r => !registeredSet.has(r))
  for (const route of unregistered) {
    console.warn(`⚠️  [WARNING] 页面 ${route} 未在 ai-capabilities.ts 的 allPageMetadata 中注册`)
  }

  // 已注册但页面不存在 → error
  const stale = registeredPaths.filter(r => !pageSet.has(r))
  for (const route of stale) {
    console.error(`❌ [ERROR] allPageMetadata 中的路径 ${route} 对应的页面不存在`)
    hasError = true
  }

  // 汇总
  console.log('')
  console.log(`📄 扫描到 ${pageRoutes.length} 个页面，allPageMetadata 注册了 ${registeredPaths.length} 个`)

  if (unregistered.length > 0) {
    console.log(`⚠️  ${unregistered.length} 个页面未注册`)
  }
  if (stale.length > 0) {
    console.log(`❌ ${stale.length} 个注册路径已失效`)
  }

  if (hasError) {
    console.error('\n校验失败：存在失效的注册路径，请修复后重新构建。')
    process.exit(1)
  }

  if (unregistered.length > 0) {
    console.warn('\n校验警告：存在未注册的页面，建议在 ai-capabilities.ts 中补充注册。')
    // warning 不阻断构建
  }

  if (unregistered.length === 0 && stale.length === 0) {
    console.log('✅ 校验通过：allPageMetadata 完整覆盖所有页面')
  }
}

validate()
