// utils/mock.js - 第一阶段本地演示数据（仅数据层使用，不写入任何页面）
// 正式环境由 Node.js 后端返回，媒体资源 URL 由后端/阿里云 OSS 提供。

const activity = {
  id: 'act_city_memory_2026',
  name: '城市记忆 · NFC 文化探索季',
  slogan: '触碰历史，点亮城市',
  period: '2026.09.01 - 2026.12.31',
  location: '古城文化街区',
  summary: '沿古城街巷探访六处文化点位，用 NFC 标签开启每段故事，集齐徽章解锁限定纪念。',
  description: '这是一场把城市装进口袋的探索之旅。每一处老建筑、每一段街巷都藏着属于自己的故事。只需用手机轻轻触碰点位上的 NFC 标签，或通过专用读卡器感应入场，即可开启图文、视频与语音讲述的城市记忆。完成到访打卡，点亮对应徽章，终点还有隐藏成就等待发现。',
  rules: [
    { title: '触碰标签', desc: '手机触碰点位 NFC 标签，或由专用读卡器感应后自动进入对应点位页面。' },
    { title: '浏览故事', desc: '查看点位图文介绍、视频短片与语音导览，了解背后的城市记忆。' },
    { title: '完成打卡', desc: '点击「立即打卡」记录到访，系统自动解锁该点位徽章。' },
    { title: '集齐徽章', desc: '完成全部点位打卡，解锁隐藏成就与电子纪念证书。' }
  ]
}

const spots = [
  {
    id: 'spot_city_gate',
    order: 1,
    name: '古城门遗址',
    subtitle: '城门开合间，六百年光阴',
    category: '历史建筑',
    badgeId: 'badge_gate',
    latitude: 30.248,
    longitude: 120.165,
    coverUrl: '',
    coverTone: 'teal',
    summary: '见证城市变迁的古城门，是第一站故事的起点。',
    description: '古城门始建于明代，曾是城市最重要的出入通道。城门内外的石板路被岁月磨得发亮，墙砖上仍可辨认出旧时商队往来的印记。在这里，你可以看到城市从集市到街区的完整脉络。',
    media: { images: [], video: '', audio: '', videoTitle: '城门六百年', audioTitle: '语音导览 · 古城门遗址' },
    tags: ['起点', '必打卡']
  },
  {
    id: 'spot_lake_view',
    order: 2,
    name: '湖畔观景台',
    subtitle: '一湖秋水，半城倒影',
    category: '自然人文',
    badgeId: 'badge_lake',
    latitude: 30.243,
    longitude: 120.149,
    coverUrl: '',
    coverTone: 'blue',
    summary: '城市与湖水交汇的最佳观景点，适合放慢脚步。',
    description: '观景台正对湖心，晴天时能将远山与城市天际线尽收眼底。古人在这里留下不少题咏，如今成为市民散步与游客拍照的热门去处。语音导览会讲述"湖与城"共生千年的故事。',
    media: { images: [], video: '', audio: '', videoTitle: '湖畔四季', audioTitle: '语音导览 · 湖畔观景台' },
    tags: ['观景', '推荐']
  },
  {
    id: 'spot_old_street',
    order: 3,
    name: '老街巷记忆馆',
    subtitle: '巷子里的烟火与手艺',
    category: '民俗文化',
    badgeId: 'badge_street',
    latitude: 30.251,
    longitude: 120.168,
    coverUrl: '',
    coverTone: 'amber',
    summary: '在老街巷里寻找消失的手艺和老字号的故事。',
    description: '记忆馆由一座老宅改造而成，陈列着旧时票证、手工艺工具和街坊留下的老照片。每周还有非遗手作体验，游客可以用 NFC 标签打卡后领取专属电子印章。',
    media: { images: [], video: '', audio: '', videoTitle: '老街一日', audioTitle: '语音导览 · 老街巷记忆馆' },
    tags: ['非遗', '亲子']
  },
  {
    id: 'spot_stone_bridge',
    order: 4,
    name: '石桥夜月',
    subtitle: '桥上望月，桥下流水',
    category: '古迹建筑',
    badgeId: 'badge_bridge',
    latitude: 30.256,
    longitude: 120.152,
    coverUrl: '',
    coverTone: 'indigo',
    summary: '古石桥的经典取景地，夜晚月色尤其动人。',
    description: '这座单孔石桥已有数百年历史，桥面的青石被行人踩出温润的光泽。每逢中秋，桥下水面上会出现"双月同辉"的景象。视频短片记录了石桥从清晨到夜晚的光影变化。',
    media: { images: [], video: '', audio: '', videoTitle: '石桥光影', audioTitle: '语音导览 · 石桥夜月' },
    tags: ['夜游', '摄影']
  },
  {
    id: 'spot_city_museum',
    order: 5,
    name: '城市博物馆',
    subtitle: '把一座城的故事讲给你听',
    category: '博物馆',
    badgeId: 'badge_museum',
    latitude: 30.246,
    longitude: 120.158,
    coverUrl: '',
    coverTone: 'violet',
    summary: '系统了解城市历史与文物精华的核心场馆。',
    description: '博物馆馆藏文物三千余件，常设展以「城、水、人」三条主线展开。互动展厅提供数字复原体验，游客通过 NFC 打卡后可解锁专属讲解词与扩展资料。',
    media: { images: [], video: '', audio: '', videoTitle: '馆藏精选', audioTitle: '语音导览 · 城市博物馆' },
    tags: ['室内', '知识']
  },
  {
    id: 'spot_ancient_temple',
    order: 6,
    name: '古寺钟声',
    subtitle: '终点处的最后一记钟声',
    category: '宗教文化',
    badgeId: 'badge_temple',
    latitude: 30.259,
    longitude: 120.16,
    coverUrl: '',
    coverTone: 'green',
    summary: '探索路线的终点，集齐徽章的荣耀之地。',
    description: '古寺隐于街巷深处，院内的古树与钟楼相伴多年。完成前五处打卡后抵达这里，即可集齐全部六枚徽章，解锁隐藏成就与电子纪念证书。',
    media: { images: [], video: '', audio: '', videoTitle: '古寺晨钟', audioTitle: '语音导览 · 古寺钟声' },
    tags: ['终点', '隐藏成就']
  }
]

const badges = [
  { id: 'badge_gate', spotId: 'spot_city_gate', name: '启程之印', symbol: '城', tone: 'teal', desc: '抵达古城门遗址，探索正式开始。' },
  { id: 'badge_lake', spotId: 'spot_lake_view', name: '湖畔之光', symbol: '水', tone: 'blue', desc: '在湖畔观景台记录下第一抹水色。' },
  { id: 'badge_street', spotId: 'spot_old_street', name: '烟火之巷', symbol: '巷', tone: 'amber', desc: '走进老街巷记忆馆，遇见旧时手艺。' },
  { id: 'badge_bridge', spotId: 'spot_stone_bridge', name: '桥月之约', symbol: '桥', tone: 'indigo', desc: '在石桥夜月留下到此一游的印记。' },
  { id: 'badge_museum', spotId: 'spot_city_museum', name: '文明之鉴', symbol: '文', tone: 'violet', desc: '完成城市博物馆的打卡挑战。' },
  { id: 'badge_temple', spotId: 'spot_ancient_temple', name: '圆满之钟', symbol: '韵', tone: 'green', desc: '抵达古寺钟声，集齐全部徽章。' }
]

// 演示用 UID 绑定关系：正式环境由后端查询数据库，小程序端不保存任何 UID 映射。
const uidBindings = {
  DEMO_UID_0001: 'spot_city_gate',
  DEMO_UID_0002: 'spot_lake_view',
  DEMO_UID_0003: 'spot_old_street',
  DEMO_UID_0004: 'spot_stone_bridge',
  DEMO_UID_0005: 'spot_city_museum',
  DEMO_UID_0006: 'spot_ancient_temple'
}

function resolveUid(uid) {
  const spotId = uidBindings[uid]
  if (!spotId) return null
  const spot = spots.find((item) => item.id === spotId)
  return spot ? { activityId: activity.id, spotId: spot.id, spot } : null
}

module.exports = { activity, spots, badges, uidBindings, resolveUid }
