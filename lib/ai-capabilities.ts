/**
 * AI 助手能力集中定义
 * 包含页面元数据（path、name、描述、aiAction）和详细能力说明。
 */

// ─── 页面元数据 ───────────────────────────────────────────────────────────────

export interface PageMetadata {
  /** 路由路径，如 '/accounts' */
  path: string
  /** 页面名称，如 '账户管理' */
  name: string
  /** 功能描述，用自然语言告诉 AI 这个页面做什么 */
  description: string
  /** direct=AI 可直接操作（解析为操作指令），guide=只能引导用户前往 */
  aiAction: 'direct' | 'guide'
}

export const allPageMetadata: PageMetadata[] = [
  { path: '/',              name: '首页',     description: '应用首页，展示总览信息和快速入口',                                       aiAction: 'guide'  },
  { path: '/transactions',  name: '交易管理', description: '查看、搜索、筛选所有交易记录，支持按日期、分类、账户、账本等维度筛选',   aiAction: 'direct' },
  { path: '/accounts',      name: '账户管理', description: '管理支付账户（银行卡、支付宝、微信等），新增、编辑、删除账户',           aiAction: 'guide'  },
  { path: '/categories',    name: '分类管理', description: '管理交易分类，新增、编辑、删除收支分类，支持层级结构',                   aiAction: 'direct' },
  { path: '/ledgers',       name: '账本管理', description: '管理账本（如日常账本、旅行账本等），新增、编辑、删除账本',               aiAction: 'direct' },
  { path: '/reports',       name: '报表统计', description: '查看图表、月度/年度汇总等可视化报表，分析收支趋势',                     aiAction: 'guide'  },
  { path: '/dedup',         name: '去重',     description: '检测重复交易记录，支持合并或丢弃重复项',                                 aiAction: 'guide'  },
  { path: '/import',        name: '导入',     description: '从 CSV、XLSX、PDF 文件导入支付宝、微信、招商银行等账单',               aiAction: 'guide'  },
  { path: '/batch-adjust',  name: '批量调整', description: '通过自然语言批量新增、修改、删除交易，AI 解析指令后执行',               aiAction: 'direct' },
  { path: '/settings',      name: '系统设置', description: '修改应用配置，包括 AI 参数、分类模式、自定义指令等',                     aiAction: 'guide'  },
]

/** 允许 AI 助手重定向的路径白名单（从 allPageMetadata 自动提取） */
export const ALLOWED_REDIRECT_PATHS = allPageMetadata.map(m => m.path)

// ─── AI 详细能力说明 ───────────────────────────────────────────────────────────

export const AI_CAPABILITIES = `## AI 助手能力说明

### 一、交易查询
- 用户可以用自然语言查询交易记录，如"上周餐饮花了多少"、"找一下湖州相关的交易"
- 支持的筛选条件：关键词（商户/描述）、分类、账本、账户、日期范围、金额范围、交易类型（支出/收入/转账）
- 查询结果以交易卡片列表展示，包含商户、金额、分类、时间等信息
- 目前不支持聚合统计（如"每月餐饮平均花费"），只能返回匹配的交易列表

### 二、交易新增
- 用户可以用自然语言新增交易，如"今天午饭麦当劳花了35"、"工资入账15000"
- AI 自动解析出：商户、金额、分类、时间、交易类型
- 支持批量新增（一句话创建多笔交易）

### 三、交易修改
- 修改分类：如"把美团上超过50块的都改成聚餐"
- 移动账本：如"把上周所有餐饮支出挪到日本旅行账本"
- 修改交易类型：支出/收入/转账互改
- 修改商户名：批量修改商户名称
- 复制交易：如"把95块的门票复制一笔"

### 四、交易删除
- 用户可以用自然语言删除交易，如"删除所有停车记录"
- 支持按条件批量删除

### 五、分类管理
- AI 可以帮用户新增、编辑、删除交易分类
- 分类有名称、类型（支出/收入）、图标、颜色
- 支持两级层级（父分类 + 子分类）

### 六、账本管理
- AI 可以帮用户新增、编辑、删除账本
- 账本有名称、类型（日常/旅行/项目/年度）、颜色
- 支持两级层级（父账本 + 子账本）

### 七、暂不支持的操作
以下操作 AI 暂时无法直接执行，应引导用户到对应页面手动操作：
- 账户管理 → 引导到"账户管理"页面
- 报表查看 → 引导到"报表统计"页面
- 去重处理 → 引导到"去重"页面
- 导入账单 → 引导到"导入"页面
- 系统设置 → 引导到"设置"页面`
