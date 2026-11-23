// server/src/admin-helpers.js - 管理后台参数校验、分页与数据序列化
function badRequest(message, code = 'INVALID_PARAMS') {
  const error = new Error(message)
  error.status = 400
  error.code = code
  return error
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value)
  } catch (err) {
    return fallback
  }
}

function parsePagination(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1)
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize, 10) || 20))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

function activityDto(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    slogan: row.slogan,
    period: row.period,
    location: row.location,
    summary: row.summary,
    description: row.description,
    rules: parseJson(row.rules_json, []),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function pointDto(row) {
  if (!row) return null
  return {
    id: row.id,
    activityId: row.activity_id,
    sortOrder: row.sort_order,
    name: row.name,
    subtitle: row.subtitle,
    category: row.category,
    badgeId: row.badge_id,
    latitude: row.latitude,
    longitude: row.longitude,
    coverUrl: row.cover_url,
    coverTone: row.cover_tone,
    summary: row.summary,
    description: row.description,
    media: parseJson(row.media_json, {}),
    tags: parseJson(row.tags_json, []),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function textField(body, key, fallback = '') {
  if (body[key] === undefined) return fallback
  if (typeof body[key] !== 'string') throw badRequest(`${key} 必须是字符串`)
  return body[key].trim()
}

function validateActivityInput(body = {}, partial = false) {
  const values = {}
  if (!partial || body.name !== undefined) {
    const name = textField(body, 'name')
    if (!name) throw badRequest('活动名称不能为空')
    values.name = name
  }
  ;['slogan', 'period', 'location', 'summary', 'description'].forEach((key) => {
    if (body[key] !== undefined) values[key] = textField(body, key)
  })
  if (body.rules !== undefined) {
    if (!Array.isArray(body.rules)) throw badRequest('活动规则必须是数组')
    values.rules_json = JSON.stringify(body.rules.map((rule) => ({
      title: String((rule && rule.title) || '').slice(0, 100),
      desc: String((rule && rule.desc) || '').slice(0, 500)
    })))
  }
  if (body.status !== undefined) {
    if (!['active', 'draft', 'archived'].includes(body.status)) throw badRequest('活动状态非法')
    values.status = body.status
  }
  return values
}

function validatePointInput(body = {}, partial = false) {
  const values = {}
  if (!partial || body.name !== undefined) {
    const name = textField(body, 'name')
    if (!name) throw badRequest('点位名称不能为空')
    values.name = name
  }
  if (!partial || body.activityId !== undefined) {
    if (typeof body.activityId !== 'string' || !body.activityId.trim()) throw badRequest('activityId 不能为空')
    values.activity_id = body.activityId.trim()
  }
  const textColumns = {
    subtitle: 'subtitle', category: 'category', badgeId: 'badge_id', coverUrl: 'cover_url',
    coverTone: 'cover_tone', summary: 'summary', description: 'description'
  }
  Object.entries(textColumns).forEach(([key, column]) => {
    if (body[key] !== undefined) values[column] = textField(body, key)
  })
  ;['latitude', 'longitude'].forEach((key) => {
    if (body[key] !== undefined) {
      const value = Number(body[key])
      if (!Number.isFinite(value)) throw badRequest(`${key} 必须是数字`)
      values[key] = value
    }
  })
  if (body.sortOrder !== undefined) {
    const value = Number(body.sortOrder)
    if (!Number.isInteger(value) || value < 0) throw badRequest('sortOrder 必须是非负整数')
    values.sort_order = value
  }
  if (body.media !== undefined) {
    if (!body.media || typeof body.media !== 'object' || Array.isArray(body.media)) throw badRequest('media 必须是对象')
    values.media_json = JSON.stringify(body.media)
  }
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) throw badRequest('tags 必须是数组')
    values.tags_json = JSON.stringify(body.tags.map((tag) => String(tag).slice(0, 50)))
  }
  if (body.status !== undefined) {
    if (!['active', 'inactive', 'archived'].includes(body.status)) throw badRequest('点位状态非法')
    values.status = body.status
  }
  return values
}

function buildUpdate(values, columnMap = {}) {
  const keys = Object.keys(values)
  if (!keys.length) throw badRequest('没有可更新的字段')
  const sets = keys.map((key) => `${columnMap[key] || key} = ?`).join(', ')
  return { sets, params: keys.map((key) => values[key]) }
}

module.exports = {
  badRequest,
  parsePagination,
  activityDto,
  pointDto,
  validateActivityInput,
  validatePointInput,
  buildUpdate
}
