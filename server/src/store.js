// server/src/store.js - 第一阶段内存数据源
// 正式上线请替换为数据库（MySQL / MongoDB 等），UID 绑定关系只保存在服务端。

const activity = {
  id: 'act_city_memory_2026',
  name: '城市记忆 · NFC 文化探索季',
  slogan: '触碰历史，点亮城市',
  period: '2026.09.01 - 2026.12.31',
  location: '古城文化街区',
  summary: '沿古城街巷探访六处文化点位，用 NFC 标签开启每段故事，集齐徽章解锁限定纪念。',
  description: '这是一场把城市装进口袋的探索之旅。每一处老建筑、每一段街巷都藏着属于自己的故事。用手机触碰 NFC 标签，或通过专用读卡器感应入场，即可开启图文、视频与语音讲述的城市记忆。',
  rules: [
    { title: '触碰标签', desc: '手机触碰点位 NFC 标签，或由专用读卡器感应后进入对应点位页面。' },
    { title: '浏览故事', desc: '查看点位图文介绍、视频短片与语音导览。' },
    { title: '完成打卡', desc: '点击「立即打卡」记录到访，自动解锁对应徽章。' },
    { title: '集齐徽章', desc: '完成全部点位打卡，解锁隐藏成就与电子纪念证书。' }
  ]
}

const spots = [
  { id: 'spot_city_gate', order: 1, name: '古城门遗址', subtitle: '城门开合间，六百年光阴', category: '历史建筑', badgeId: 'badge_gate', latitude: 30.248, longitude: 120.165, coverUrl: '', coverTone: 'teal', summary: '见证城市变迁的古城门，是第一站故事的起点。', description: '古城门始建于明代，曾是城市最重要的出入通道。', media: { images: [], video: '', audio: '', videoTitle: '城门六百年', audioTitle: '语音导览 · 古城门遗址' }, tags: ['起点', '必打卡'] },
  { id: 'spot_lake_view', order: 2, name: '湖畔观景台', subtitle: '一湖秋水，半城倒影', category: '自然人文', badgeId: 'badge_lake', latitude: 30.243, longitude: 120.149, coverUrl: '', coverTone: 'blue', summary: '城市与湖水交汇的最佳观景点。', description: '观景台正对湖心，晴天时能将远山与城市天际线尽收眼底。', media: { images: [], video: '', audio: '', videoTitle: '湖畔四季', audioTitle: '语音导览 · 湖畔观景台' }, tags: ['观景', '推荐'] },
  { id: 'spot_old_street', order: 3, name: '老街巷记忆馆', subtitle: '巷子里的烟火与手艺', category: '民俗文化', badgeId: 'badge_street', latitude: 30.251, longitude: 120.168, coverUrl: '', coverTone: 'amber', summary: '在老街巷里寻找消失的手艺和老字号的故事。', description: '记忆馆由一座老宅改造而成，陈列着旧时票证与手工艺工具。', media: { images: [], video: '', audio: '', videoTitle: '老街一日', audioTitle: '语音导览 · 老街巷记忆馆' }, tags: ['非遗', '亲子'] },
  { id: 'spot_stone_bridge', order: 4, name: '石桥夜月', subtitle: '桥上望月，桥下流水', category: '古迹建筑', badgeId: 'badge_bridge', latitude: 30.256, longitude: 120.152, coverUrl: '', coverTone: 'indigo', summary: '古石桥的经典取景地，夜晚月色尤其动人。', description: '这座单孔石桥已有数百年历史，桥面青石温润光亮。', media: { images: [], video: '', audio: '', videoTitle: '石桥光影', audioTitle: '语音导览 · 石桥夜月' }, tags: ['夜游', '摄影'] },
  { id: 'spot_city_museum', order: 5, name: '城市博物馆', subtitle: '把一座城的故事讲给你听', category: '博物馆', badgeId: 'badge_museum', latitude: 30.246, longitude: 120.158, coverUrl: '', coverTone: 'violet', summary: '系统了解城市历史与文物精华的核心场馆。', description: '博物馆馆藏文物三千余件，常设展以「城、水、人」三条主线展开。', media: { images: [], video: '', audio: '', videoTitle: '馆藏精选', audioTitle: '语音导览 · 城市博物馆' }, tags: ['室内', '知识'] },
  { id: 'spot_ancient_temple', order: 6, name: '古寺钟声', subtitle: '终点处的最后一记钟声', category: '宗教文化', badgeId: 'badge_temple', latitude: 30.259, longitude: 120.16, coverUrl: '', coverTone: 'green', summary: '探索路线的终点，集齐徽章的荣耀之地。', description: '古寺隐于街巷深处，院内古树与钟楼相伴多年。', media: { images: [], video: '', audio: '', videoTitle: '古寺晨钟', audioTitle: '语音导览 · 古寺钟声' }, tags: ['终点', '隐藏成就'] }
]

const badges = [
  { id: 'badge_gate', spotId: 'spot_city_gate', name: '启程之印', symbol: '城', tone: 'teal', desc: '抵达古城门遗址，探索正式开始。' },
  { id: 'badge_lake', spotId: 'spot_lake_view', name: '湖畔之光', symbol: '水', tone: 'blue', desc: '在湖畔观景台记录下第一抹水色。' },
  { id: 'badge_street', spotId: 'spot_old_street', name: '烟火之巷', symbol: '巷', tone: 'amber', desc: '走进老街巷记忆馆，遇见旧时手艺。' },
  { id: 'badge_bridge', spotId: 'spot_stone_bridge', name: '桥月之约', symbol: '桥', tone: 'indigo', desc: '在石桥夜月留下到此一游的印记。' },
  { id: 'badge_museum', spotId: 'spot_city_museum', name: '文明之鉴', symbol: '文', tone: 'violet', desc: '完成城市博物馆的打卡挑战。' },
  { id: 'badge_temple', spotId: 'spot_ancient_temple', name: '圆满之钟', symbol: '韵', tone: 'green', desc: '抵达古寺钟声，集齐全部徽章。' }
]

// 演示 UID 绑定关系；正式环境从数据库读取，绝不下发到小程序。
const uidBindings = {
  DEMO_UID_0001: 'spot_city_gate',
  DEMO_UID_0002: 'spot_lake_view',
  DEMO_UID_0003: 'spot_old_street',
  DEMO_UID_0004: 'spot_stone_bridge',
  DEMO_UID_0005: 'spot_city_museum',
  DEMO_UID_0006: 'spot_ancient_temple'
}

const checkinStore = new Map()

function getVisitorId(req) {
  return (req.headers['x-visitor-id'] || 'anonymous').toString()
}

function getCheckins(visitorId) {
  return checkinStore.get(visitorId) || []
}

function addCheckin(visitorId, record) {
  const list = getCheckins(visitorId)
  if (!list.some((item) => item.spotId === record.spotId)) {
    list.unshift(record)
    checkinStore.set(visitorId, list)
  }
  return getCheckins(visitorId)
}

function statsFor(visitorId) {
  const checkins = getCheckins(visitorId)
  const unlocked = badges.filter((badge) => checkins.some((item) => item.spotId === badge.spotId)).length
  return {
    checked: checkins.length,
    total: spots.length,
    badges: unlocked,
    badgeTotal: badges.length,
    progress: spots.length ? Math.round((checkins.length / spots.length) * 100) : 0
  }
}

function decorateSpots(visitorId) {
  const checkins = getCheckins(visitorId)
  return spots.map((spot) => ({
    ...spot,
    checked: checkins.some((item) => item.spotId === spot.id)
  }))
}

function resolveUid(uid) {
  const spotId = uidBindings[uid]
  const spot = spotId ? spots.find((item) => item.id === spotId) : null
  return spot ? { activityId: activity.id, spotId: spot.id, spot } : null
}

module.exports = {
  activity, spots, badges,
  getVisitorId, getCheckins, addCheckin, statsFor, decorateSpots, resolveUid
}
