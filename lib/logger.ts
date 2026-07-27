import fs from 'fs'
import path from 'path'

const LOG_DIR = path.join(process.cwd(), 'logs')

let _sessionFile = ''
let _latestFile = ''
let _initialized = false

function ensureInit() {
  if (_initialized) return

  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true })
    }

    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`

    _sessionFile = path.join(LOG_DIR, `app-${ts}.log`)
    _latestFile = path.join(LOG_DIR, 'app-latest.log')

    // 清空 latest 文件
    fs.writeFileSync(_latestFile, '')
    // 写入启动标记
    const startLine = `=== 会话启动 ${d.toISOString()} ===\n`
    fs.appendFileSync(_sessionFile, startLine)
    fs.appendFileSync(_latestFile, startLine)

    _initialized = true
  } catch (err) {
    console.error('[logger] 初始化失败，日志将仅输出到控制台:', err)
    // 标记为已初始化避免反复报错，但文件留空导致后续写入跳过
    _initialized = true
  }
}

function formatTime(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

function writeLine(level: string, message: string, data?: unknown) {
  // 控制台始终输出
  const time = formatTime()
  const prefix = `[${time}] [${level}]`
  if (level === 'ERROR') console.error(`${prefix} ${message}`, data ?? '')
  else console.log(`${prefix} ${message}`, data ?? '')

  // 文件写入
  ensureInit()
  if (!_sessionFile) return

  let line = `${prefix} ${message}`
  if (data !== undefined) {
    const extra = typeof data === 'string' ? data : JSON.stringify(data)
    line += ' | ' + extra.substring(0, 2000)
  }
  line += '\n'

  try {
    fs.appendFileSync(_sessionFile, line)
    fs.appendFileSync(_latestFile, line)
  } catch {
    // 静默失败，控制台已有输出
  }
}

export const logger = {
  info(msg: string, data?: unknown) {
    writeLine('INFO', msg, data)
  },
  warn(msg: string, data?: unknown) {
    writeLine('WARN', msg, data)
  },
  error(msg: string, data?: unknown) {
    writeLine('ERROR', msg, data)
  },
}

export { LOG_DIR }
