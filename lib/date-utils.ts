/**
 * 安全解析日期字符串，兼容以下格式：
 * - "2026-07-27 21:57:53" (支付宝带空格，空格分隔日期和时间)
 * - "2026-07-27T21:57:53" (ISO 格式)
 * - "2026-07-27" (仅日期)
 * - "2026/07/27" (斜杠分隔)
 *
 * 关键：将空格替换为 T 以确保 Node.js 能正确解析日期时间字符串。
 * 对于仅日期的字符串（如 "2026-07-27"），使用 new Date(y, m-1, d) 避免 UTC 时区偏移。
 */
export function safeParseDate(dateStr: string): Date {
  if (!dateStr) return new Date()

  // 将斜杠替换为短横线
  let normalized = dateStr.replace(/\//g, '-')

  // 将空格替换为 T（仅当不含 T 时）
  if (!normalized.includes('T')) {
    normalized = normalized.replace(' ', 'T')
  }

  const d = new Date(normalized)
  if (isNaN(d.getTime())) {
    // 兜底：尝试只取前10个字符 YYYY-MM-DD，用构造函数避免 UTC 偏移
    const short = dateStr.slice(0, 10).replace(/\//g, '-')
    const parts = short.split('-').map(Number)
    if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
      return new Date(parts[0], parts[1] - 1, parts[2])
    }
    return new Date()
  }
  return d
}
