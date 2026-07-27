# Ledger App

个人/家庭记账 PWA 应用，基于 Next.js + SQLite + DeepSeek AI。

## 核心功能

- **AI 智能分类** — 输入交易后自动建议分类，结合已有分类语义匹配
- **多账本体系** — 支持层级账本，一笔交易可归属多个账本
- **自然语言批量调整** — 用自然语言描述批量操作，LLM 解析后执行
- **家庭共享** — 邀请码加入，全员数据透明互看
- **招行流水导入** — CSV/PDF 账单解析（需样本后适配）
- **多方去重** — 交叉匹配多账户账单，自动检测重复交易

## 技术栈

| 层次 | 技术 |
|------|------|
| 框架 | Next.js 14+ (App Router) |
| 语言 | TypeScript |
| UI | TailwindCSS + shadcn/ui |
| 数据库 | SQLite (Prisma ORM) |
| AI | DeepSeek API (OpenAI 兼容) |

## 开发

`ash
npm install
npm run dev
`

打开 [http://localhost:3000](http://localhost:3000) 查看。
