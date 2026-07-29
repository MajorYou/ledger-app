// 关键词→数据库分类名映射（与 seed 中定义的分类对应）
export function detectCategoryName(merchant: string, description: string): string | null {
  const text = (merchant + description).toLowerCase()

  // 停车：仅通过关键词匹配，不使用"停车"子串（避免误匹配）
  if (text.includes('顺易通') || text.includes('停车')) return '停车'
  if (text.includes('公交') || text.includes('地铁') || text.includes('公共交通')) return '公共交通'
  // 打车：仅匹配滴滴出行相关
  if (text.includes('滴滴出行') || text.includes('滴滴') || text.includes('打车')) return '打车'
  // 水电：模糊匹配（燃气费、电费、水费）
  if (text.includes('燃气') || text.includes('电费') || text.includes('水费') || text.includes('水电')) return '水电'
  if (text.includes('手机充值') || text.includes('中国电信') || text.includes('中国移动') || text.includes('中国联通')) return '通讯'
  if (text.includes('美团') || text.includes('美团外卖') || text.includes('美团平台') || text.includes('美团买菜') || text.includes('美团优选') || text.includes('三快') || text.includes('饿了么') || text.includes('饿了么平台') || text.includes('饿了么星选') || text.includes('百度') || text.includes('京东到家') || text.includes('京东外卖') || text.includes('淘宝闪购') || text.includes('淘宝买菜') || text.includes('多点') || text.includes('朴朴') || text.includes('小象超市') || text.includes('叮咚') || text.includes('盒马') || text.includes('永辉生活')) return '外卖'
  if (text.includes('百胜') || text.includes('肯德基') || text.includes('麦当劳') || text.includes('汉堡王') || text.includes('必胜客') || text.includes('海底捞') || text.includes('老乡鸡') || text.includes('小菜园') || text.includes('外婆家') || text.includes('绿茶') || text.includes('绿茶餐厅') || text.includes('西贝') || text.includes('费大厨') || text.includes('探鱼') || text.includes('太二') || text.includes('木屋烧烤') || text.includes('烤匠') || text.includes('奈雪') || text.includes('喜茶') || text.includes('酸菜鱼') || text.includes('稻香') || text.includes('餐饮') || text.includes('月和')) return '聚餐'
  if (text.includes('智能零售') || text.includes('美宜佳') || text.includes('全家') || text.includes('711') || text.includes('便利蜂') || text.includes('罗森') || text.includes('钱大妈') || text.includes('叮咚买菜') || text.includes('谊品') || text.includes('谊品生鲜') || text.includes('生鲜传奇') || text.includes('食行生鲜') || text.includes('每日优鲜') || text.includes('苏宁小店') || text.includes('锅圈') || text.includes('盒马') || text.includes('星巴克') || text.includes('瑞幸') || text.includes('零食') || text.includes('奶茶') || text.includes('咖啡')) return '零食饮料'
  // 购物：模糊匹配（京东商城、淘宝、天猫、拼多多、各类旗舰店）
  if (text.includes('京东') || text.includes('淘宝') || text.includes('天猫') || text.includes('拼多多') || text.includes('沃尔玛') || text.includes('盒马') || text.includes('天虹') || text.includes('华润') || text.includes('山姆') || text.includes('永辉') || text.includes('大润发') || text.includes('永旺') || text.includes('物美') || text.includes('联华') || text.includes('华联') || text.includes('中百') || text.includes('武商') || text.includes('人人乐') || text.includes('步步高') || text.includes('中商') || text.includes('银泰') || text.includes('旗舰店') || text.includes('苏泊尔')) return '购物'
  if (text.includes('深度求索') || text.includes('万达') || text.includes('影院') || text.includes('电影') || text.includes('游戏') || text.includes('nintendo')) return '娱乐'
  if (text.includes('加油') || text.includes('充电') || text.includes('国网') || text.includes('南方电网') || text.includes('中国石化') || text.includes('中国石油')) return '加油'
  if (text.includes('物业') || text.includes('房租')) return '物业'
  // 住宿：模糊匹配（酒店、宾馆、民宿、旅馆）
  if (text.includes('7天') || text.includes('如家') || text.includes('全季') || text.includes('酒店') || text.includes('宾馆') || text.includes('民宿') || text.includes('旅馆')) return '住宿'
  // 豪车汇洗车：精确匹配，避免"惠迪"等误判
  if (text.includes('豪车汇') || text.includes('汽车')) return '停车'
  if (text.includes('三快') || text.includes('外卖')) return '外卖'
  if (text.includes('朝启')) return '其他'
  if (text.includes('如海') || text.includes('商户')) return '三餐'
  if (text.includes('宝龙')) return '购物'
  if (text.includes('岐支')) return '三餐'
  if (text.includes('卓驿')) return '零食饮料'

  return null
}
