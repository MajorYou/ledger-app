import { prisma } from './db'

/**
 * 返回按使用频率排序的分类列表（常用分类靠前）。
 *
 * 排序规则：
 *  1. 根据 ClassificationCache 中各 suggestedCategoryId 的 hitCount 总和降序
 *  2. 没有缓存记录的分类保持原始顺序排在后面
 */
export async function getCategoriesWithRecentFirst<
  T extends { id: string },
>(categories: T[]): Promise<{ sorted: T[]; recentCount: number }> {
  // 聚合每个分类的总 hitCount
  const cacheStats = await prisma.classificationCache.groupBy({
    by: ['suggestedCategoryId'],
    _sum: { hitCount: true },
  })

  // 构建 categoryId → totalHitCount 映射
  const hitMap = new Map<string, number>()
  for (const stat of cacheStats) {
    hitMap.set(stat.suggestedCategoryId, stat._sum.hitCount ?? 0)
  }

  // 排序：有 hitCount 的按降序排前面，无 hitCount 的保持原序排后面
  const indexed = categories.map((c, i) => ({ cat: c, idx: i, hits: hitMap.get(c.id) ?? 0 }))
  indexed.sort((a, b) => {
    if (a.hits > 0 && b.hits > 0) return b.hits - a.hits
    if (a.hits > 0) return -1
    if (b.hits > 0) return 1
    return a.idx - b.idx
  })

  // 计算有 hitCount 的分类数量
  const recentCount = indexed.filter(x => x.hits > 0).length

  return { sorted: indexed.map((x) => x.cat), recentCount }
}
