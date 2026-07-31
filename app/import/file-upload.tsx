'use client'

import { useState, useRef } from 'react'
import { Zap, Bot, FileText, ClipboardList } from 'lucide-react'

interface FileUploadProps {
  onFileParsed: (file: File) => void
  onPaste: () => void
  importMode: 'precise' | 'quick'
  onModeChange: (mode: 'precise' | 'quick') => void
  loading: boolean
  quickImporting: boolean
}

export function FileUpload({ onFileParsed, onPaste, importMode, onModeChange, loading, quickImporting }: FileUploadProps) {
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      const ext = file.name.toLowerCase()
      if (ext.endsWith('.pdf') || ext.endsWith('.csv') || ext.endsWith('.xlsx')) {
        onFileParsed(file)
      }
    }
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true) }
  const handleDragLeave = () => setDragOver(false)

  if (loading || quickImporting) {
    return (
      <div className="text-center py-16">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-lg bg-primary/10 mb-4">
          <span className="text-3xl">{quickImporting ? <Zap className="h-8 w-8 text-primary" /> : <Bot className="h-8 w-8 text-primary" />}</span>
        </div>
        <p className="text-muted-foreground">{quickImporting ? '正在快速导入...' : '正在解析账单...'}</p>
        {quickImporting && (
          <div className="mt-4 max-w-xs mx-auto h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-accent to-primary rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* 拖拽上传区域 */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`rounded-lg border-2 border-dashed p-12 text-center transition-all duration-200 ${
          dragOver
            ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
            : 'border-border bg-card hover:border-muted-foreground/30'
        }`}
      >
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-lg bg-muted mb-4">
          <span className="text-3xl"><FileText className="h-8 w-8 text-muted-foreground" /></span>
        </div>
        <p className="text-foreground mb-1">上传账单文件（PDF / CSV / XLSX）</p>
        <p className="text-xs text-muted-foreground mb-6">支持招商银行储蓄卡/信用卡 PDF、支付宝 CSV、微信 CSV / XLSX，或直接拖拽文件到此处</p>
        <div className="flex justify-center gap-3">
          <label className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 cursor-pointer transition-colors shadow-sm">
            选择文件
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.csv,.xlsx"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileParsed(f); if (fileInputRef.current) fileInputRef.current.value = '' }}
            />
          </label>
          <button onClick={onPaste}
            className="px-5 py-2.5 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors">
            粘贴文本
          </button>
        </div>
      </div>

      {/* 导入模式选择 */}
      <div>
        <p className="text-sm font-medium text-foreground mb-3">选择导入模式：</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onModeChange('precise')}
            className={`rounded-md border-2 p-4 text-left transition-all ${
              importMode === 'precise'
                ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                : 'border-border bg-card hover:border-muted-foreground/30'
            }`}
          >
            <p className="text-lg font-semibold text-foreground mb-1"><ClipboardList className="inline h-5 w-5 mr-1" />精细导入</p>
            <p className="text-xs text-muted-foreground">解析后展示预览列表，逐行检查/修改分类，确认后导入</p>
          </button>
          <button
            type="button"
            onClick={() => onModeChange('quick')}
            className={`rounded-md border-2 p-4 text-left transition-all ${
              importMode === 'quick'
                ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                : 'border-border bg-card hover:border-muted-foreground/30'
            }`}
          >
            <p className="text-lg font-semibold text-foreground mb-1"><Zap className="inline h-5 w-5 mr-1" />快速导入</p>
            <p className="text-xs text-muted-foreground">解析后直接导入，跳过预览，交易标记为"待审核"</p>
          </button>
        </div>
      </div>
    </div>
  )
}
