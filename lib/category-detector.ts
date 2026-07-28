// 关键词→数据库分类名映射（与 seed 中定义的分类对应）
export function detectCategoryName(merchant: string, description: string): string | null {
  const text = (merchant + description).toLowerCase()

  if (text.includes('停车') || text.includes('通行宝') || text.includes('顺易通')) return '停车'
  if (text.includes('公交') || text.includes('地铁') || text.includes('公共交通')) return '公共交通'
  if (text.includes('滴滴') || text.includes('惠迪') || text.includes('打车')) return '打车'
  if (text.includes('燃气') || text.includes('电费') || text.includes('水电')) return '水电'
  if (text.includes('手机充值') || text.includes('中国电信')) return '通讯'
  if (text.includes('美团') || text.includes('三快') || text.includes('饿了么')) return '外卖'
  if (text.includes('百胜') || text.includes('酸菜鱼') || text.includes('稻香') || text.includes('餐饮') || text.includes('月和')) return '聚餐'
  if (text.includes('智能零售') || text.includes('零食') || text.includes('奶茶') || text.includes('咖啡')) return '零食饮料'
  if (text.includes('京东') || text.includes('淘宝') || text.includes('旗舰店') || text.includes('苏泊尔')) return '购物'
  if (text.includes('深度求索') || text.includes('游戏') || text.includes('nintendo')) return '娱乐'
  if (text.includes('加油') || text.includes('充电') || text.includes('国网')) return '加油'
  if (text.includes('物业') || text.includes('房租')) return '物业'
  if (text.includes('豪车汇') || text.includes('汽车')) return '停车'
  if (text.includes('三快') || text.includes('外卖')) return '外卖'
  if (text.includes('朝启')) return '其他'
  if (text.includes('如海') || text.includes('商户')) return '三餐'
  if (text.includes('宝龙')) return '购物'
  if (text.includes('岐支')) return '三餐'
  if (text.includes('卓驿')) return '零食饮料'

  return null
}
