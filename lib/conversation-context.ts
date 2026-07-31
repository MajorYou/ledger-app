/**
 * 多轮对话上下文管理 - 共享常量和工具函数
 * 供 ai-fab.tsx 和 batch-adjust/client-page.tsx 共同使用
 */

/** 上下文清理关键词 */
export const CONTEXT_RESET_KEYWORDS = ['新话题', '不相关', '重新开始', '换个话题', '重新开始对话', '清空上下文']

/** 判断用户输入是否包含清理上下文的关键词 */
export function shouldResetContext(message: string): boolean {
  return CONTEXT_RESET_KEYWORDS.some(keyword => message.includes(keyword))
}

/** 自动淡化正则：检测指代词 */
export const PRONOUN_REGEX = /它们|这些|那些|上一笔|上面|刚才|之前的/
