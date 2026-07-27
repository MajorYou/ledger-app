import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

const prisma = new PrismaClient()

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex')
}

async function main() {
  console.log('Seeding database...')

  // 创建默认家庭主用户
  const host = await prisma.user.upsert({
    where: { email: 'admin@ledger.local' },
    update: {},
    create: {
      name: '家庭管理员',
      email: 'admin@ledger.local',
      passwordHash: sha256('123456'),
      isFamilyHost: true,
    },
  })
  console.log('Created host user:', host.email)

  // 创建默认账本
  const defaultLedger = await prisma.ledger.create({
    data: {
      name: '日常账本',
      type: 'daily',
      color: '#3b82f6',
    },
  })

  const travelParent = await prisma.ledger.create({
    data: {
      name: '旅行',
      type: 'travel',
      color: '#f59e0b',
    },
  })

  await prisma.ledger.create({
    data: {
      name: '2025 日本行',
      type: 'travel',
      color: '#ef4444',
      parentId: travelParent.id,
    },
  })

  console.log('Created default ledgers')

  // 创建默认分类（支出）
  const expenseCategories = [
    { name: '餐饮', icon: '🍽️', color: '#ef4444', children: [
      { name: '三餐', icon: '🍚', color: '#f87171' },
      { name: '外卖', icon: '🥡', color: '#fb923c' },
      { name: '聚餐', icon: '🍻', color: '#fbbf24' },
      { name: '零食饮料', icon: '🧋', color: '#facc15' },
    ]},
    { name: '交通', icon: '🚗', color: '#f59e0b', children: [
      { name: '公共交通', icon: '🚇', color: '#fbbf24' },
      { name: '打车', icon: '🚕', color: '#f59e0b' },
      { name: '加油', icon: '⛽', color: '#d97706' },
      { name: '停车', icon: '🅿️', color: '#b45309' },
    ]},
    { name: '购物', icon: '🛒', color: '#10b981', children: [
      { name: '日用品', icon: '🧴', color: '#34d399' },
      { name: '服饰', icon: '👔', color: '#6ee7b7' },
      { name: '数码', icon: '📱', color: '#a7f3d0' },
    ]},
    { name: '住房', icon: '🏠', color: '#6366f1', children: [
      { name: '房租', icon: '🏢', color: '#818cf8' },
      { name: '水电', icon: '💡', color: '#a5b4fc' },
      { name: '物业', icon: '🏗️', color: '#c7d2fe' },
    ]},
    { name: '娱乐', icon: '🎮', color: '#8b5cf6', children: [
      { name: '电影', icon: '🎬', color: '#a78bfa' },
      { name: '游戏', icon: '🎮', color: '#c4b5fd' },
      { name: '旅游', icon: '✈️', color: '#ddd6fe' },
    ]},
    { name: '医疗', icon: '🏥', color: '#ec4899' },
    { name: '教育', icon: '📚', color: '#06b6d4' },
    { name: '通讯', icon: '📞', color: '#0ea5e9' },
    { name: '其他', icon: '📦', color: '#6b7280' },
  ]

  for (const cat of expenseCategories) {
    const { children, ...parentData } = cat
    const parent = await prisma.category.create({
      data: { ...parentData, type: 'expense' },
    })
    if (children) {
      for (const child of children) {
        await prisma.category.create({
          data: { ...child, type: 'expense', parentId: parent.id },
        })
      }
    }
  }

  // 创建默认分类（收入）
  const incomeCategories = [
    { name: '工资', icon: '💰', color: '#22c55e' },
    { name: '奖金', icon: '🎁', color: '#16a34a' },
    { name: '投资收益', icon: '📈', color: '#15803d' },
    { name: '兼职', icon: '💼', color: '#4ade80' },
    { name: '其他收入', icon: '💵', color: '#86efac' },
  ]

  for (const cat of incomeCategories) {
    await prisma.category.create({
      data: { ...cat, type: 'income' },
    })
  }

  console.log('Created default categories')

  // 创建默认账户
  await prisma.account.create({
    data: {
      userId: host.id,
      name: '现金',
      type: 'general',
      currency: 'CNY',
    },
  })
  await prisma.account.create({
    data: {
      userId: host.id,
      name: '支付宝',
      type: 'ewallet',
      currency: 'CNY',
    },
  })
  await prisma.account.create({
    data: {
      userId: host.id,
      name: '微信支付',
      type: 'ewallet',
      currency: 'CNY',
    },
  })

  console.log('Created default accounts')

  console.log('Seed completed!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
