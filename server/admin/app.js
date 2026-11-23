(function () {
  'use strict'

  var TOKEN_KEY = 'nfc_tour_admin_token'
  var EXPIRES_KEY = 'nfc_tour_admin_expires'
  var API_BASE = '/api/admin'

  var ACTIVITY_STATUS = [['active', '进行中'], ['draft', '草稿'], ['archived', '已归档']]
  var POINT_STATUS = [['active', '启用'], ['inactive', '停用'], ['archived', '已归档']]
  var USER_STATUS = [['active', '正常'], ['disabled', '已禁用']]
  var DEVICE_STATUS = [['active', '在线'], ['disabled', '停用']]

  var ROUTES = [
    { id: 'overview', title: '总览', subtitle: '关键指标与最近动态', mark: '总' },
    { id: 'activities', title: '活动管理', subtitle: '创建、编辑与归档活动', mark: '活' },
    { id: 'points', title: '点位管理', subtitle: '维护打卡点位与排序', mark: '点' },
    { id: 'uids', title: 'UID 管理', subtitle: '新增、绑定、改绑与解绑 NFC UID', mark: '码' },
    { id: 'users', title: '用户查询', subtitle: '只读查看游客与微信用户', mark: '用' },
    { id: 'checkins', title: '打卡记录', subtitle: '按条件筛选打卡数据', mark: '打' },
    { id: 'devices', title: '设备与事件', subtitle: '只读查看设备与 RUK 上报事件', mark: '设' },
    { id: 'logs', title: '操作日志', subtitle: '审计所有后台写操作', mark: '日', super: true },
    { id: 'admins', title: '管理员', subtitle: '创建管理员与调整状态', mark: '管', super: true }
  ]

  var state = {
    admin: null,
    route: 'overview',
    deviceTab: 'devices',
    listState: {}
  }

  function $(selector, root) {
    return (root || document).querySelector(selector)
  }

  function escapeHtml(value) {
    var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return map[ch]
    })
  }

  function fmtTime(value) {
    if (!value) return '-'
    var num = Number(value)
    if (!Number.isFinite(num)) return '-'
    var date = new Date(num)
    return date.toLocaleString('zh-CN', { hour12: false })
  }

  function roleText(role) {
    return role === 'super_admin' ? '超级管理员' : role === 'operator' ? '运营' : role || '未知'
  }

  function canManage() {
    return !!state.admin && ['super_admin', 'operator'].indexOf(state.admin.role) >= 0
  }

  function canSuper() {
    return !!state.admin && state.admin.role === 'super_admin'
  }

  function statusBadge(value, textMap) {
    var text = textMap && textMap[value] ? textMap[value] : (value || '-')
    return '<span class="badge badge-' + escapeHtml(value) + '">' + escapeHtml(text) + '</span>'
  }

  function optionsHtml(pairs, current, includeEmpty, allLabel) {
    var html = includeEmpty ? '<option value="">' + escapeHtml(allLabel || '全部') + '</option>' : ''
    pairs.forEach(function (pair) {
      var value = Array.isArray(pair) ? pair[0] : pair
      var label = Array.isArray(pair) ? pair[1] : pair
      var selected = String(current === undefined ? '' : current) === String(value) ? ' selected' : ''
      html += '<option value="' + escapeHtml(value) + '"' + selected + '>' + escapeHtml(label) + '</option>'
    })
    return html
  }

  /* ---------- 会话与请求 ---------- */

  function getToken() {
    try { return sessionStorage.getItem(TOKEN_KEY) || '' } catch (err) { return '' }
  }

  function setSession(data) {
    state.admin = data.admin || state.admin
    try {
      sessionStorage.setItem(TOKEN_KEY, data.token)
      sessionStorage.setItem(EXPIRES_KEY, String(data.expiresAt || Date.now() + 8 * 60 * 60 * 1000))
    } catch (err) {
      toast('浏览器阻止了本地会话存储，登录态可能无法保持', 'error')
    }
  }

  function clearSession() {
    state.admin = null
    try {
      sessionStorage.removeItem(TOKEN_KEY)
      sessionStorage.removeItem(EXPIRES_KEY)
    } catch (err) {
      // ignore
    }
  }

  async function api(path, options) {
    var opts = options || {}
    var method = opts.method || 'GET'
    var query = opts.query || {}
    var params = new URLSearchParams()
    Object.keys(query).forEach(function (key) {
      var value = query[key]
      if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
    })
    var url = API_BASE + path + (params.toString() ? '?' + params.toString() : '')
    var headers = {}
    var token = getToken()
    if (token) headers.Authorization = 'Bearer ' + token
    var body
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(opts.body)
    }

    var res
    try {
      res = await fetch(url, { method: method, headers: headers, body: body })
    } catch (err) {
      throw new Error('无法连接服务器，请确认后端服务已启动')
    }

    var json
    try {
      json = await res.json()
    } catch (err) {
      throw new Error('服务器返回格式异常')
    }

    if (res.status === 401) {
      clearSession()
      showLogin(json.message || '登录已过期，请重新登录')
      throw new Error(json.message || '登录已过期')
    }
    if (!res.ok || json.code !== 0) {
      throw new Error(json.message || '请求失败')
    }
    return json.data
  }

  async function ensureSession() {
    if (!getToken()) return false
    var expiresAt = 0
    try { expiresAt = Number(sessionStorage.getItem(EXPIRES_KEY) || 0) } catch (err) { expiresAt = 0 }
    if (Date.now() >= expiresAt - 60 * 1000) {
      try {
        var refreshed = await api('/auth/refresh', { method: 'POST' })
        setSession(refreshed)
        return true
      } catch (err) {
        clearSession()
        return false
      }
    }
    if (!state.admin) {
      try {
        state.admin = await api('/auth/me')
        return true
      } catch (err) {
        return false
      }
    }
    return true
  }

  /* ---------- 布局、弹窗与提示 ---------- */

  function showLogin(message) {
    $('#app-view').hidden = true
    $('#login-view').hidden = false
    var error = $('#login-error')
    if (message) {
      error.textContent = message
      error.hidden = false
    } else {
      error.textContent = ''
      error.hidden = true
    }
  }

  function showApp() {
    $('#login-view').hidden = true
    $('#app-view').hidden = false
  }

  function toast(message, type) {
    var root = $('#toast-root')
    var item = document.createElement('div')
    item.className = 'toast ' + (type || 'success')
    item.textContent = message
    root.appendChild(item)
    setTimeout(function () {
      if (item.parentNode) item.parentNode.removeChild(item)
    }, 3200)
  }

  function openModal(config) {
    var root = $('#modal-root')
    root.innerHTML =
      '<div class="modal-mask">' +
        '<div class="modal" style="max-width:' + (config.width || 620) + 'px">' +
          '<div class="modal-head"><h3>' + escapeHtml(config.title || '') + '</h3>' +
            '<button class="modal-close" type="button" data-close-modal aria-label="关闭">&times;</button></div>' +
          '<div class="modal-body">' + (config.content || '') + '</div>' +
          '<div class="modal-foot">' + (config.footer || '<button class="btn ghost" type="button" data-modal-cancel>关闭</button>') + '</div>' +
        '</div>' +
      '</div>'
    var mask = $('.modal-mask', root)
    $('[data-close-modal]', root).onclick = closeModal
    mask.addEventListener('click', function (event) {
      if (event.target === mask) closeModal()
    })
    var cancel = $('[data-modal-cancel]', root)
    if (cancel) cancel.onclick = closeModal
  }

  function closeModal() {
    $('#modal-root').innerHTML = ''
  }

  function confirmDialog(config) {
    return new Promise(function (resolve) {
      openModal({
        title: config.title || '请确认',
        width: 440,
        content: '<p>' + escapeHtml(config.message || '') + '</p>',
        footer:
          '<button class="btn ghost" type="button" data-modal-cancel>取消</button>' +
          '<button class="btn ' + (config.danger ? 'danger' : 'primary') + '" type="button" data-modal-confirm>' +
            escapeHtml(config.confirmText || '确认') + '</button>'
      })
      $('[data-modal-cancel]').onclick = function () { closeModal(); resolve(false) }
      $('[data-modal-confirm]').onclick = function () { closeModal(); resolve(true) }
    })
  }

  function openJsonModal(title, value) {
    openModal({
      title: title,
      width: 760,
      content: '<pre class="json">' + escapeHtml(JSON.stringify(value || {}, null, 2)) + '</pre>'
    })
  }

  /* ---------- 通用列表 ---------- */

  function getListState(key, defaults) {
    if (!state.listState[key]) {
      state.listState[key] = { page: 1, pageSize: 20, filters: Object.assign({}, defaults || {}) }
    }
    return state.listState[key]
  }

  function filterFieldHtml(field, value) {
    var current = value === undefined || value === null ? '' : String(value)
    if (field.type === 'select') {
      var pairs = (field.options || []).map(function (option) {
        if (Array.isArray(option)) return option
        return [option, option]
      })
      return '<label class="field"><span>' + escapeHtml(field.label) + '</span>' +
        '<select name="' + escapeHtml(field.key) + '">' +
          optionsHtml(pairs, current, true, field.allLabel) +
        '</select></label>'
    }
    var inputType = field.type === 'date' ? 'date' : 'text'
    return '<label class="field"><span>' + escapeHtml(field.label) + '</span>' +
      '<input type="' + inputType + '" name="' + escapeHtml(field.key) + '" value="' + escapeHtml(current) +
      '" placeholder="' + escapeHtml(field.placeholder || '') + '"></label>'
  }

  function buildQuery(st, filters) {
    var query = {}
    filters.forEach(function (field) {
      var raw = st.filters[field.key]
      if (raw === undefined || raw === null || String(raw).trim() === '') return
      var value = String(raw).trim()
      if (typeof field.map === 'function') {
        value = field.map(value)
        if (!Number.isFinite(value)) return
      }
      query[field.key] = value
    })
    query.page = st.page
    query.pageSize = st.pageSize
    return query
  }

  function paginationHtml(st, total) {
    var pages = Math.max(1, Math.ceil(total / st.pageSize))
    var sizes = [10, 20, 50, 100].map(function (size) {
      return '<option value="' + size + '"' + (st.pageSize === size ? ' selected' : '') + '>' + size + ' 条/页</option>'
    }).join('')
    return '<div class="pagination">' +
      '<span>共 ' + total + ' 条</span>' +
      '<button class="btn small" type="button" data-page="' + (st.page - 1) + '"' + (st.page <= 1 ? ' disabled' : '') + '>上一页</button>' +
      '<span>' + st.page + ' / ' + pages + '</span>' +
      '<button class="btn small" type="button" data-page="' + (st.page + 1) + '"' + (st.page >= pages ? ' disabled' : '') + '>下一页</button>' +
      '<select data-page-size>' + sizes + '</select>' +
    '</div>'
  }

  function tableHtml(columns, rows, st, hidePagination) {
    if (!rows || !rows.length) return '<div class="empty">暂无数据</div>'
    var head = columns.map(function (column) {
      return '<th>' + escapeHtml(column.title) + '</th>'
    }).join('')
    var body = rows.map(function (row, index) {
      return '<tr>' + columns.map(function (column) {
        var content = column.render ? column.render(row, index) : escapeHtml(row[column.key])
        return '<td' + (column.wrap ? ' class="cell-wrap"' : '') + '>' + content + '</td>'
      }).join('') + '</tr>'
    }).join('')
    return '<div class="table-scroll"><table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>' +
      (hidePagination || !st ? '' : paginationHtml(st, st.total || 0))
  }

  async function renderListPage(config) {
    var root = $(config.container || '#content')
    var st = getListState(config.key, config.defaultFilters)
    var filters = config.filters || []
    st.total = 0
    st.rows = []

    root.innerHTML =
      '<section class="panel">' +
        '<div class="panel-head"><div><h2>' + escapeHtml(config.title || '') + '</h2>' +
          '<p class="muted">' + escapeHtml(config.description || '所有数据均来自后端接口') + '</p></div>' +
          '<div class="panel-actions">' + (config.toolbar || '') + '</div></div>' +
        '<form class="filter-bar" id="filter-form">' +
          filters.map(function (field) { return filterFieldHtml(field, st.filters[field.key]) }).join('') +
          '<button class="btn primary" type="submit">查询</button>' +
          '<button class="btn ghost" type="button" data-reset-filter>重置</button>' +
        '</form>' +
        '<div class="table-area"><div class="loading">加载中...</div></div>' +
      '</section>'

    var area = $('.table-area', root)
    var form = $('#filter-form', root)

    async function loadRows() {
      area.innerHTML = '<div class="loading">加载中...</div>'
      try {
        var data = await api(config.endpoint, { query: buildQuery(st, filters) })
        var payload = config.transform ? config.transform(data) : data
        st.rows = payload.list || []
        st.total = Number(payload.total || 0)
        area.innerHTML = tableHtml(config.columns, st.rows, st, config.hidePagination)
      } catch (err) {
        st.rows = []
        st.total = 0
        area.innerHTML = '<div class="empty error">' + escapeHtml(err.message) + '</div>'
      }
    }

    form.onsubmit = function (event) {
      event.preventDefault()
      var values = {}
      Array.prototype.forEach.call(form.elements, function (input) {
        if (!input.name) return
        values[input.name] = input.value
      })
      st.filters = values
      st.page = 1
      loadRows()
    }
    $('[data-reset-filter]', root).onclick = function () {
      form.reset()
      st.filters = {}
      st.page = 1
      loadRows()
    }

    root.onclick = async function (event) {
      var pageButton = event.target.closest('[data-page]')
      if (pageButton && !pageButton.disabled) {
        st.page = Number(pageButton.getAttribute('data-page')) || 1
        await loadRows()
        return
      }
      var sizeSelect = event.target.closest('[data-page-size]')
      if (sizeSelect) return
      var tool = event.target.closest('[data-tool]')
      if (tool && config.onTool) {
        await config.onTool(tool.getAttribute('data-tool'), loadRows, st)
        return
      }
      var action = event.target.closest('[data-act]')
      if (action && config.onAction) {
        await config.onAction(action.getAttribute('data-act'), { id: action.getAttribute('data-id') }, loadRows, st)
      }
    }

    var sizeControl = $('[data-page-size]', root)
    if (sizeControl) {
      sizeControl.onchange = function (event) {
        st.pageSize = Number(event.target.value) || 20
        st.page = 1
        loadRows()
      }
    }

    await loadRows()
    return st
  }

  /* ---------- 总览 ---------- */

  async function renderOverview() {
    var root = $('#content')
    root.innerHTML =
      '<div class="stat-grid" id="stat-grid">' +
        '<div class="stat-card"><div class="stat-label">加载中</div><div class="stat-value">-</div></div>' +
      '</div>' +
      '<div class="overview-grid">' +
        '<section class="panel" id="recent-checkins"><div class="panel-head"><h2>最近打卡</h2></div><div class="loading">加载中...</div></section>' +
        '<section class="panel" id="recent-events"><div class="panel-head"><h2>最近设备事件</h2></div><div class="loading">加载中...</div></section>' +
      '</div>'

    var results = await Promise.all([
      api('/activities', { query: { page: 1, pageSize: 1 } }),
      api('/points', { query: { page: 1, pageSize: 1 } }),
      api('/users', { query: { page: 1, pageSize: 1 } }),
      api('/checkins', { query: { page: 1, pageSize: 1 } }),
      api('/devices', { query: { page: 1, pageSize: 1 } }),
      api('/nfc-tags', { query: { page: 1, pageSize: 1 } }),
      api('/checkins', { query: { page: 1, pageSize: 5 } }),
      api('/device-events', { query: { page: 1, pageSize: 5 } })
    ])

    var stats = [
      { label: '活动', value: results[0].total, hint: '活动总数' },
      { label: '点位', value: results[1].total, hint: '打卡点位总数' },
      { label: '用户', value: results[2].total, hint: '游客与微信用户' },
      { label: '打卡', value: results[3].total, hint: '打卡记录总数' },
      { label: '设备', value: results[4].total, hint: '已登记设备' },
      { label: 'UID', value: results[5].total, hint: 'NFC UID 总数' }
    ]
    $('#stat-grid', root).innerHTML = stats.map(function (item) {
      return '<div class="stat-card"><div class="stat-label">' + escapeHtml(item.label) + '</div>' +
        '<div class="stat-value">' + escapeHtml(item.value) + '</div>' +
        '<div class="stat-hint">' + escapeHtml(item.hint) + '</div></div>'
    }).join('')

    $('#recent-checkins', root).innerHTML =
      '<div class="panel-head"><h2>最近打卡</h2></div>' +
      tableHtml([
        { title: '点位', render: function (r) { return escapeHtml(r.pointName || r.pointId || '-') } },
        { title: '访客', render: function (r) { return '<code>' + escapeHtml(r.visitorId) + '</code>' } },
        { title: 'UID', render: function (r) { return escapeHtml(r.uid || '-') } },
        { title: '时间', render: function (r) { return fmtTime(r.time) } },
        { title: '有效', render: function (r) { return r.isValid ? statusBadge('valid', { valid: '有效' }) : statusBadge('invalid', { invalid: '无效' }) } }
      ], results[6].list, null, true)

    $('#recent-events', root).innerHTML =
      '<div class="panel-head"><h2>最近设备事件</h2></div>' +
      tableHtml([
        { title: '设备', render: function (r) { return escapeHtml(r.deviceId) } },
        { title: 'UID', render: function (r) { return escapeHtml(r.uid || '-') } },
        { title: '类型', render: function (r) { return escapeHtml(r.eventType) } },
        { title: '解析', render: function (r) { return r.resolved ? statusBadge('active', { active: '已解析' }) : statusBadge('unbound', { unbound: '未解析' }) } },
        { title: '时间', render: function (r) { return fmtTime(r.createdAt) } }
      ], results[7].list, null, true)
  }

  /* ---------- 活动管理 ---------- */

  function openActivityModal(row, reload) {
    var editing = !!row
    var value = function (key) { return escapeHtml(row && row[key] !== undefined && row[key] !== null ? row[key] : '') }
    var rules = escapeHtml(JSON.stringify((row && row.rules) || [], null, 2))

    openModal({
      title: editing ? '编辑活动' : '新建活动',
      content:
        '<form id="activity-form" class="form-grid">' +
          '<label class="field full"><span>活动名称 *</span><input name="name" value="' + value('name') + '" required></label>' +
          '<label class="field"><span>宣传语</span><input name="slogan" value="' + value('slogan') + '"></label>' +
          '<label class="field"><span>活动周期</span><input name="period" value="' + value('period') + '" placeholder="如 2026.01 - 2026.06"></label>' +
          '<label class="field full"><span>地点</span><input name="location" value="' + value('location') + '"></label>' +
          '<label class="field full"><span>简介</span><textarea name="summary" rows="2">' + value('summary') + '</textarea></label>' +
          '<label class="field full"><span>详细说明</span><textarea name="description" rows="3">' + value('description') + '</textarea></label>' +
          '<label class="field full"><span>活动规则（JSON 数组： [{"title":"规则","desc":"说明"}]）</span><textarea name="rules" rows="4">' + rules + '</textarea></label>' +
          '<label class="field"><span>状态</span><select name="status">' + optionsHtml(ACTIVITY_STATUS, row ? row.status : 'active') + '</select></label>' +
        '</form>',
      footer:
        '<button class="btn ghost" type="button" data-modal-cancel>取消</button>' +
        '<button class="btn primary" type="button" data-modal-confirm>保存</button>'
    })

    $('[data-modal-confirm]').onclick = async function () {
      var form = $('#activity-form')
      var values = {}
      Array.prototype.forEach.call(form.elements, function (input) {
        if (input.name) values[input.name] = input.value
      })
      var name = String(values.name || '').trim()
      if (!name) { toast('活动名称不能为空', 'error'); return }
      var rulesValue
      try {
        rulesValue = JSON.parse(values.rules || '[]')
        if (!Array.isArray(rulesValue)) throw new Error('not array')
      } catch (err) {
        toast('活动规则必须是 JSON 数组', 'error')
        return
      }
      var body = {
        name: name,
        slogan: values.slogan || '',
        period: values.period || '',
        location: values.location || '',
        summary: values.summary || '',
        description: values.description || '',
        rules: rulesValue,
        status: values.status
      }
      try {
        await api(editing ? '/activities/' + encodeURIComponent(row.id) : '/activities', {
          method: editing ? 'PUT' : 'POST',
          body: body
        })
        closeModal()
        toast(editing ? '活动已更新' : '活动已创建')
        await reload()
      } catch (err) {
        toast(err.message, 'error')
      }
    }
  }

  async function renderActivities() {
    var editable = canManage()
    var st = await renderListPage({
      key: 'activities',
      title: '活动管理',
      description: '活动数据同时供小程序展示与打卡使用',
      endpoint: '/activities',
      filters: [
        { key: 'keyword', label: '活动名称', placeholder: '输入关键词' },
        { key: 'status', label: '状态', type: 'select', options: ACTIVITY_STATUS }
      ],
      toolbar: editable ? '<button class="btn primary" type="button" data-tool="create">新建活动</button>' : '',
      columns: [
        { title: '活动', render: function (r) { return '<strong>' + escapeHtml(r.name) + '</strong><div class="muted">' + escapeHtml(r.slogan || '') + '</div>' } },
        { title: '周期', render: function (r) { return escapeHtml(r.period || '-') } },
        { title: '地点', render: function (r) { return escapeHtml(r.location || '-') } },
        { title: '状态', render: function (r) { return statusBadge(r.status, { active: '进行中', draft: '草稿', archived: '已归档' }) } },
        { title: '更新时间', render: function (r) { return fmtTime(r.updatedAt) } },
        {
          title: '操作',
          render: function (r) {
            if (!editable) return '<span class="muted">只读</span>'
            return '<div class="cell-actions">' +
              '<button class="btn link" type="button" data-act="edit" data-id="' + escapeHtml(r.id) + '">编辑</button>' +
              (r.status !== 'archived'
                ? '<button class="btn link danger" type="button" data-act="archive" data-id="' + escapeHtml(r.id) + '">归档</button>'
                : '') +
            '</div>'
          }
        }
      ],
      onTool: async function (tool, reload) {
        if (tool === 'create') openActivityModal(null, reload)
      },
      onAction: async function (act, ids, reload, list) {
        var row = list.rows.find(function (item) { return item.id === ids.id })
        if (!row) return
        if (act === 'edit') {
          openActivityModal(row, reload)
          return
        }
        if (act === 'archive') {
          var ok = await confirmDialog({
            title: '归档活动',
            message: '归档后该活动不再参与小程序展示与 UID 绑定，确定继续？',
            confirmText: '确认归档',
            danger: true
          })
          if (!ok) return
          try {
            await api('/activities/' + encodeURIComponent(row.id) + '/archive', { method: 'POST' })
            toast('活动已归档')
            await reload()
          } catch (err) { toast(err.message, 'error') }
        }
      }
    })
    return st
  }

  /* ---------- 点位管理 ---------- */

  function openPointModal(row, activities, reload) {
    var editing = !!row
    var value = function (key) { return escapeHtml(row && row[key] !== undefined && row[key] !== null ? row[key] : '') }
    var media = escapeHtml(JSON.stringify((row && row.media) || {}, null, 2))
    var tags = escapeHtml(((row && row.tags) || []).join(', '))
    var activityOptions = optionsHtml(activities.map(function (item) {
      return [item.id, item.name]
    }), row ? row.activityId : (activities[0] && activities[0].id))

    openModal({
      title: editing ? '编辑点位' : '新建点位',
      width: 720,
      content:
        '<form id="point-form" class="form-grid">' +
          '<label class="field full"><span>所属活动 *</span><select name="activityId">' + activityOptions + '</select></label>' +
          '<label class="field full"><span>点位名称 *</span><input name="name" value="' + value('name') + '" required></label>' +
          '<label class="field"><span>副标题</span><input name="subtitle" value="' + value('subtitle') + '"></label>' +
          '<label class="field"><span>分类</span><input name="category" value="' + value('category') + '"></label>' +
          '<label class="field"><span>徽章 ID</span><input name="badgeId" value="' + value('badgeId') + '"></label>' +
          '<label class="field"><span>排序值</span><input name="sortOrder" type="number" min="0" value="' + value('sortOrder') + '"></label>' +
          '<label class="field"><span>纬度</span><input name="latitude" type="number" step="any" value="' + value('latitude') + '"></label>' +
          '<label class="field"><span>经度</span><input name="longitude" type="number" step="any" value="' + value('longitude') + '"></label>' +
          '<label class="field"><span>封面色调</span><input name="coverTone" value="' + value('coverTone') + '"></label>' +
          '<label class="field"><span>封面地址</span><input name="coverUrl" value="' + value('coverUrl') + '"></label>' +
          '<label class="field full"><span>摘要</span><textarea name="summary" rows="2">' + value('summary') + '</textarea></label>' +
          '<label class="field full"><span>详细介绍</span><textarea name="description" rows="3">' + value('description') + '</textarea></label>' +
          '<label class="field"><span>标签（逗号分隔）</span><input name="tags" value="' + tags + '"></label>' +
          '<label class="field"><span>状态</span><select name="status">' + optionsHtml(POINT_STATUS, row ? row.status : 'active') + '</select></label>' +
          '<label class="field full"><span>媒体配置（JSON 对象）</span><textarea name="media" rows="3">' + media + '</textarea></label>' +
        '</form>',
      footer:
        '<button class="btn ghost" type="button" data-modal-cancel>取消</button>' +
        '<button class="btn primary" type="button" data-modal-confirm>保存</button>'
    })

    $('[data-modal-confirm]').onclick = async function () {
      var form = $('#point-form')
      var values = {}
      Array.prototype.forEach.call(form.elements, function (input) {
        if (input.name) values[input.name] = input.value
      })
      var name = String(values.name || '').trim()
      if (!name) { toast('点位名称不能为空', 'error'); return }
      if (!values.activityId) { toast('请先创建活动', 'error'); return }
      var mediaValue
      try {
        mediaValue = JSON.parse(values.media || '{}')
        if (!mediaValue || typeof mediaValue !== 'object' || Array.isArray(mediaValue)) throw new Error('not object')
      } catch (err) {
        toast('媒体配置必须是 JSON 对象', 'error')
        return
      }
      var sortOrder = Number(values.sortOrder || 0)
      var latitude = Number(values.latitude || 0)
      var longitude = Number(values.longitude || 0)
      if (!Number.isInteger(sortOrder) || sortOrder < 0) { toast('排序值必须是非负整数', 'error'); return }
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) { toast('经纬度必须是数字', 'error'); return }
      var body = {
        activityId: values.activityId,
        name: name,
        subtitle: values.subtitle || '',
        category: values.category || '',
        badgeId: values.badgeId || '',
        sortOrder: sortOrder,
        latitude: latitude,
        longitude: longitude,
        coverTone: values.coverTone || 'teal',
        coverUrl: values.coverUrl || '',
        summary: values.summary || '',
        description: values.description || '',
        tags: String(values.tags || '').split(',').map(function (tag) { return tag.trim() }).filter(Boolean),
        media: mediaValue,
        status: values.status
      }
      try {
        await api(editing ? '/points/' + encodeURIComponent(row.id) : '/points', {
          method: editing ? 'PUT' : 'POST',
          body: body
        })
        closeModal()
        toast(editing ? '点位已更新' : '点位已创建')
        await reload()
      } catch (err) {
        toast(err.message, 'error')
      }
    }
  }

  function openSortModal(row, reload) {
    openModal({
      title: '调整点位排序',
      width: 380,
      content:
        '<form id="sort-form" class="form-grid">' +
          '<label class="field full"><span>' + escapeHtml(row.name) + ' 的排序值</span>' +
            '<input name="sortOrder" type="number" min="0" value="' + escapeHtml(row.sortOrder) + '"></label>' +
        '</form>',
      footer:
        '<button class="btn ghost" type="button" data-modal-cancel>取消</button>' +
        '<button class="btn primary" type="button" data-modal-confirm>保存</button>'
    })
    $('[data-modal-confirm]').onclick = async function () {
      var raw = $('#sort-form').elements.sortOrder.value
      var sortOrder = Number(raw)
      if (!Number.isInteger(sortOrder) || sortOrder < 0) { toast('排序值必须是非负整数', 'error'); return }
      try {
        await api('/points/' + encodeURIComponent(row.id) + '/sort', { method: 'POST', body: { sortOrder: sortOrder } })
        closeModal()
        toast('排序已更新')
        await reload()
      } catch (err) { toast(err.message, 'error') }
    }
  }

  async function renderPoints() {
    var editable = canManage()
    var activityResult = await api('/activities', { query: { page: 1, pageSize: 100 } })
    var activities = activityResult.list || []
    var activityMap = {}
    activities.forEach(function (item) { activityMap[item.id] = item.name })

    var st = await renderListPage({
      key: 'points',
      title: '点位管理',
      description: '点位排序影响小程序展示顺序',
      endpoint: '/points',
      filters: [
        { key: 'activityId', label: '所属活动', type: 'select', options: activities.map(function (a) { return [a.id, a.name] }) },
        { key: 'keyword', label: '点位名称', placeholder: '输入关键词' },
        { key: 'status', label: '状态', type: 'select', options: POINT_STATUS }
      ],
      toolbar: editable ? '<button class="btn primary" type="button" data-tool="create">新建点位</button>' : '',
      columns: [
        { title: '排序', render: function (r) { return escapeHtml(r.sortOrder) } },
        { title: '点位', render: function (r) { return '<strong>' + escapeHtml(r.name) + '</strong><div class="muted">' + escapeHtml(r.subtitle || '') + '</div>' } },
        { title: '活动', render: function (r) { return escapeHtml(activityMap[r.activityId] || r.activityId || '-') } },
        { title: '分类', render: function (r) { return escapeHtml(r.category || '-') } },
        { title: '状态', render: function (r) { return statusBadge(r.status, { active: '启用', inactive: '停用', archived: '已归档' }) } },
        {
          title: '操作',
          render: function (r) {
            if (!editable) return '<span class="muted">只读</span>'
            return '<div class="cell-actions">' +
              '<button class="btn link" type="button" data-act="edit" data-id="' + escapeHtml(r.id) + '">编辑</button>' +
              '<button class="btn link" type="button" data-act="sort" data-id="' + escapeHtml(r.id) + '">排序</button>' +
              '<button class="btn link" type="button" data-act="toggle" data-id="' + escapeHtml(r.id) + '">' +
                (r.status === 'active' ? '停用' : '启用') + '</button>' +
            '</div>'
          }
        }
      ],
      onTool: async function (tool, reload) {
        if (tool === 'create') {
          if (!activities.length) { toast('请先创建一个活动', 'error'); return }
          openPointModal(null, activities, reload)
        }
      },
      onAction: async function (act, ids, reload, list) {
        var row = list.rows.find(function (item) { return item.id === ids.id })
        if (!row) return
        if (act === 'edit') { openPointModal(row, activities, reload); return }
        if (act === 'sort') { openSortModal(row, reload); return }
        if (act === 'toggle') {
          var enabling = row.status !== 'active'
          if (!enabling) {
            var ok = await confirmDialog({
              title: '停用点位',
              message: '停用后该点位不再接受新打卡，确定继续？',
              confirmText: '确认停用',
              danger: true
            })
            if (!ok) return
          }
          try {
            await api('/points/' + encodeURIComponent(row.id) + (enabling ? '/enable' : '/disable'), { method: 'POST' })
            toast(enabling ? '点位已启用' : '点位已停用')
            await reload()
          } catch (err) { toast(err.message, 'error') }
        }
      }
    })
    return st
  }

  /* ---------- UID 管理 ---------- */

  function openUidCreateModal(reload) {
    openModal({
      title: '新增 NFC UID',
      width: 420,
      content:
        '<form id="uid-form" class="form-grid">' +
          '<label class="field full"><span>UID *</span><input name="uid" placeholder="请输入 NFC 卡 UID" required></label>' +
        '</form>',
      footer:
        '<button class="btn ghost" type="button" data-modal-cancel>取消</button>' +
        '<button class="btn primary" type="button" data-modal-confirm>新增</button>'
    })
    $('[data-modal-confirm]').onclick = async function () {
      var uid = $('#uid-form').elements.uid.value.trim()
      if (!uid) { toast('UID 不能为空', 'error'); return }
      try {
        await api('/nfc-tags', { method: 'POST', body: { uid: uid } })
        closeModal()
        toast('UID 已新增')
        await reload()
      } catch (err) { toast(err.message, 'error') }
    }
  }

  function openBindModal(row, activities, points, mode, reload) {
    var boundActivity = row.activityId || (activities[0] && activities[0].id) || ''
    var activityOptions = optionsHtml(activities.map(function (a) { return [a.id, a.name] }), boundActivity)
    openModal({
      title: (mode === 'rebind' ? '改绑' : '绑定') + ' UID · ' + row.uid,
      width: 520,
      content:
        '<form id="bind-form" class="form-grid">' +
          '<label class="field full"><span>活动 *</span><select name="activityId" id="bind-activity">' + activityOptions + '</select></label>' +
          '<label class="field full"><span>点位 *</span><select name="pointId" id="bind-point"></select></label>' +
        '</form>',
      footer:
        '<button class="btn ghost" type="button" data-modal-cancel>取消</button>' +
        '<button class="btn primary" type="button" data-modal-confirm>' + (mode === 'rebind' ? '确认改绑' : '确认绑定') + '</button>'
    })

    var activitySelect = $('#bind-activity')
    var pointSelect = $('#bind-point')
    function updatePoints() {
      var activityId = activitySelect.value
      var list = points.filter(function (point) { return point.activityId === activityId && point.status === 'active' })
      pointSelect.innerHTML = optionsHtml(list.map(function (point) {
        return [point.id, point.name + '（排序 ' + point.sortOrder + '）']
      }), row.pointId)
      if (!list.length) pointSelect.innerHTML = '<option value="">该活动暂无启用点位</option>'
    }
    activitySelect.onchange = updatePoints
    updatePoints()

    $('[data-modal-confirm]').onclick = async function () {
      var activityId = activitySelect.value
      var pointId = pointSelect.value
      if (!activityId || !pointId) { toast('请选择活动与点位', 'error'); return }
      try {
        await api(
          '/nfc-tags/' + encodeURIComponent(row.uid) + (mode === 'rebind' ? '/point' : '/bind'),
          { method: mode === 'rebind' ? 'PUT' : 'POST', body: { activityId: activityId, pointId: pointId } }
        )
        closeModal()
        toast(mode === 'rebind' ? 'UID 已改绑' : 'UID 已绑定')
        await reload()
      } catch (err) { toast(err.message, 'error') }
    }
  }

  async function renderUids() {
    var editable = canManage()
    var results = await Promise.all([
      api('/activities', { query: { page: 1, pageSize: 100 } }),
      api('/points', { query: { page: 1, pageSize: 100 } })
    ])
    var activities = results[0].list || []
    var points = results[1].list || []

    var st = await renderListPage({
      key: 'uids',
      title: 'UID 管理',
      description: '绑定规则复用后端既有业务逻辑，后台不重复实现',
      endpoint: '/nfc-tags',
      filters: [
        { key: 'uid', label: 'UID', placeholder: '输入 UID 关键词' },
        { key: 'activityId', label: '活动', type: 'select', options: activities.map(function (a) { return [a.id, a.name] }) },
        { key: 'pointId', label: '点位', type: 'select', options: points.map(function (p) { return [p.id, p.name] }) }
      ],
      toolbar: editable ? '<button class="btn primary" type="button" data-tool="create">新增 UID</button>' : '',
      columns: [
        { title: 'UID', render: function (r) { return '<code>' + escapeHtml(r.uid) + '</code>' + (r.rawUid && r.rawUid !== r.uid ? '<div class="muted">' + escapeHtml(r.rawUid) + '</div>' : '') } },
        { title: '绑定活动', render: function (r) { return escapeHtml(r.activityName || r.activityId || '-') } },
        { title: '绑定点位', render: function (r) { return escapeHtml(r.pointName || r.pointId || '-') } },
        { title: '状态', render: function (r) { return statusBadge(r.status, { active: '已绑定', unbound: '未绑定' }) } },
        { title: '绑定时间', render: function (r) { return fmtTime(r.boundAt) } },
        {
          title: '操作',
          render: function (r) {
            if (!editable) return '<span class="muted">只读</span>'
            var key = escapeHtml(r.uid)
            if (r.status !== 'active') {
              return '<div class="cell-actions"><button class="btn link" type="button" data-act="bind" data-id="' + key + '">绑定</button></div>'
            }
            return '<div class="cell-actions">' +
              '<button class="btn link" type="button" data-act="rebind" data-id="' + key + '">改绑</button>' +
              '<button class="btn link danger" type="button" data-act="unbind" data-id="' + key + '">解绑</button>' +
            '</div>'
          }
        }
      ],
      onTool: async function (tool, reload) {
        if (tool === 'create') openUidCreateModal(reload)
      },
      onAction: async function (act, ids, reload, list) {
        var row = list.rows.find(function (item) { return item.uid === ids.id })
        if (!row) return
        if (act === 'bind' || act === 'rebind') {
          openBindModal(row, activities, points, act, reload)
          return
        }
        if (act === 'unbind') {
          var ok = await confirmDialog({
            title: '解绑 UID',
            message: '解绑后该 UID 将不能继续打卡，确定继续？',
            confirmText: '确认解绑',
            danger: true
          })
          if (!ok) return
          try {
            await api('/nfc-tags/' + encodeURIComponent(row.uid) + '/unbind', { method: 'POST' })
            toast('UID 已解绑')
            await reload()
          } catch (err) { toast(err.message, 'error') }
        }
      }
    })
    return st
  }

  /* ---------- 用户、打卡与设备查询 ---------- */

  async function renderUsers() {
    var st = await renderListPage({
      key: 'users',
      title: '用户查询',
      description: '只读查询；运营角色看到的 openid 已脱敏',
      endpoint: '/users',
      filters: [
        { key: 'visitorId', label: '访客 ID', placeholder: '模糊匹配' },
        { key: 'openid', label: 'OpenID', placeholder: '模糊匹配' },
        { key: 'type', label: '用户类型', type: 'select', options: [['wechat', '微信用户'], ['guest', '游客']] },
        { key: 'status', label: '状态', type: 'select', options: USER_STATUS }
      ],
      columns: [
        { title: '访客 ID', render: function (r) { return '<code>' + escapeHtml(r.visitorId) + '</code>' } },
        { title: '类型', render: function (r) { return r.userType === 'wechat' ? '微信用户' : '游客' } },
        { title: 'OpenID', render: function (r) { return escapeHtml(r.openid || '-') } },
        { title: '昵称', render: function (r) { return escapeHtml(r.nickname || '-') } },
        { title: '状态', render: function (r) { return statusBadge(r.status, { active: '正常', disabled: '已禁用' }) } },
        { title: '有效打卡', render: function (r) { return escapeHtml(r.checkinCount) } },
        { title: '合并至', render: function (r) { return escapeHtml(r.mergedInto || '-') } },
        { title: '最近登录', render: function (r) { return fmtTime(r.lastLoginAt) } },
        { title: '操作', render: function (r) { return '<button class="btn link" type="button" data-act="detail" data-id="' + escapeHtml(r.visitorId) + '">详情</button>' } }
      ],
      onAction: async function (act, ids) {
        if (act !== 'detail') return
        try {
          var detail = await api('/users/' + encodeURIComponent(ids.id))
          var checkinRows = (detail.checkins || []).map(function (item) {
            return {
              pointName: item.pointName || item.spotId,
              time: fmtTime(item.time),
              isValid: item.isValid
            }
          })
          openModal({
            title: '用户详情 · ' + detail.visitorId,
            width: 720,
            content:
              '<div class="form-grid">' +
                '<div class="field"><span>用户类型</span><div>' + escapeHtml(detail.userType === 'wechat' ? '微信用户' : '游客') + '</div></div>' +
                '<div class="field"><span>OpenID</span><div>' + escapeHtml(detail.openid || '-') + '</div></div>' +
                '<div class="field"><span>昵称</span><div>' + escapeHtml(detail.nickname || '-') + '</div></div>' +
                '<div class="field"><span>状态</span><div>' + escapeHtml(detail.status) + '</div></div>' +
              '</div>' +
              '<h4 style="margin:20px 0 8px">打卡记录</h4>' +
              tableHtml([
                { title: '点位', render: function (r) { return escapeHtml(r.pointName) } },
                { title: '时间', render: function (r) { return escapeHtml(r.time) } },
                { title: '有效', render: function (r) { return r.isValid ? '是' : '否' } }
              ], checkinRows, null, true)
          })
        } catch (err) { toast(err.message, 'error') }
      }
    })
    return st
  }

  async function renderCheckins() {
    var st = await renderListPage({
      key: 'checkins',
      title: '打卡记录',
      description: '支持访客、活动、点位、有效性与时间范围筛选',
      endpoint: '/checkins',
      filters: [
        { key: 'visitorId', label: '访客 ID', placeholder: '精确匹配' },
        { key: 'activityId', label: '活动 ID', placeholder: '精确匹配' },
        { key: 'pointId', label: '点位 ID', placeholder: '精确匹配' },
        { key: 'valid', label: '有效性', type: 'select', options: [['valid', '有效'], ['invalid', '无效']] },
        { key: 'from', label: '开始日期', type: 'date', map: function (v) { return new Date(v).getTime() } },
        { key: 'to', label: '结束日期', type: 'date', map: function (v) { return new Date(v + 'T23:59:59').getTime() } }
      ],
      columns: [
        { title: '记录 ID', render: function (r) { return '<code>' + escapeHtml(r.id) + '</code>' } },
        { title: '访客 ID', render: function (r) { return escapeHtml(r.visitorId) } },
        { title: '点位', render: function (r) { return escapeHtml(r.pointName || r.pointId || '-') } },
        { title: '活动', render: function (r) { return escapeHtml(r.activityName || r.activityId || '-') } },
        { title: 'UID', render: function (r) { return escapeHtml(r.uid || '-') } },
        { title: '打卡时间', render: function (r) { return fmtTime(r.time) } },
        { title: '有效性', render: function (r) { return r.isValid ? statusBadge('valid', { valid: '有效' }) : statusBadge('invalid', { invalid: '无效' }) } },
        { title: '入库时间', render: function (r) { return fmtTime(r.createdAt) } }
      ]
    })
    return st
  }

  async function renderDevices() {
    var tab = state.deviceTab || 'devices'
    $('#content').innerHTML =
      '<div class="tabs">' +
        '<button class="tab' + (tab === 'devices' ? ' active' : '') + '" type="button" data-device-tab="devices">设备列表</button>' +
        '<button class="tab' + (tab === 'events' ? ' active' : '') + '" type="button" data-device-tab="events">设备事件</button>' +
      '</div><div id="device-content"></div>'

    $('#content').onclick = function (event) {
      var button = event.target.closest('[data-device-tab]')
      if (!button) return
      state.deviceTab = button.getAttribute('data-device-tab')
      renderDevices()
    }

    if (tab === 'devices') {
      await renderListPage({
        container: '#device-content',
        key: 'devices',
        title: '设备列表',
        description: 'RUK 上报设备只读视图',
        endpoint: '/devices',
        filters: [
          { key: 'deviceId', label: '设备 ID', placeholder: '模糊匹配' },
          { key: 'status', label: '状态', type: 'select', options: DEVICE_STATUS }
        ],
        columns: [
          { title: '设备 ID', render: function (r) { return '<code>' + escapeHtml(r.deviceId) + '</code>' } },
          { title: '名称', render: function (r) { return escapeHtml(r.name || '-') } },
          { title: '型号', render: function (r) { return escapeHtml(r.model || '-') } },
          { title: '状态', render: function (r) { return statusBadge(r.status, { active: '在线', disabled: '停用' }) } },
          { title: '事件数', render: function (r) { return escapeHtml(r.eventCount) } },
          { title: '最后上报', render: function (r) { return fmtTime(r.lastSeenAt) } }
        ]
      })
    } else {
      await renderListPage({
        container: '#device-content',
        key: 'device-events',
        title: '设备事件',
        description: 'RUK /api/nfc/events 上报记录只读视图',
        endpoint: '/device-events',
        filters: [
          { key: 'uid', label: 'UID', placeholder: '精确匹配' },
          { key: 'deviceId', label: '设备 ID', placeholder: '精确匹配' },
          { key: 'resolved', label: '解析状态', type: 'select', options: [['1', '已解析'], ['0', '未解析']] },
          { key: 'from', label: '开始日期', type: 'date', map: function (v) { return new Date(v).getTime() } },
          { key: 'to', label: '结束日期', type: 'date', map: function (v) { return new Date(v + 'T23:59:59').getTime() } }
        ],
        columns: [
          { title: '事件 ID', render: function (r) { return '<code>' + escapeHtml(r.id) + '</code>' } },
          { title: '设备', render: function (r) { return escapeHtml(r.deviceId) } },
          { title: 'UID', render: function (r) { return escapeHtml(r.uid) } },
          { title: '类型', render: function (r) { return escapeHtml(r.eventType) } },
          { title: '活动', render: function (r) { return escapeHtml(r.activityId || '-') } },
          { title: '点位', render: function (r) { return escapeHtml(r.pointId || '-') } },
          { title: '解析', render: function (r) { return r.resolved ? statusBadge('active', { active: '已解析' }) : statusBadge('unbound', { unbound: '未解析' }) } },
          { title: '时间', render: function (r) { return fmtTime(r.createdAt) } }
        ]
      })
    }
  }

  /* ---------- 审计日志与管理员账号 ---------- */

  async function renderLogs() {
    var st = await renderListPage({
      key: 'logs',
      title: '操作日志',
      description: '所有后台写操作在同一事务内记录，敏感字段已脱敏',
      endpoint: '/operation-logs',
      filters: [
        { key: 'action', label: '操作', placeholder: '如 activity.create' },
        { key: 'resourceType', label: '资源类型', placeholder: '如 activity' },
        { key: 'resourceId', label: '资源 ID', placeholder: '精确匹配' },
        { key: 'result', label: '结果', type: 'select', options: [['success', '成功'], ['failed', '失败']] },
        { key: 'adminId', label: '管理员 ID', placeholder: '数字' },
        { key: 'from', label: '开始日期', type: 'date', map: function (v) { return new Date(v).getTime() } },
        { key: 'to', label: '结束日期', type: 'date', map: function (v) { return new Date(v + 'T23:59:59').getTime() } }
      ],
      columns: [
        { title: '时间', render: function (r) { return fmtTime(r.createdAt) } },
        { title: '管理员', render: function (r) { return escapeHtml(r.adminUsername || ('#' + r.adminId)) } },
        { title: '操作', render: function (r) { return '<code>' + escapeHtml(r.action) + '</code>' } },
        { title: '资源', render: function (r) { return escapeHtml(r.resourceType + ' / ' + (r.resourceId || '-')) } },
        { title: '结果', render: function (r) { return statusBadge(r.result, { success: '成功', failed: '失败' }) } },
        { title: 'IP', render: function (r) { return escapeHtml(r.ip || '-') } },
        { title: '详情', render: function (r) { return '<button class="btn link" type="button" data-act="detail" data-id="' + escapeHtml(r.id) + '">查看</button>' } }
      ],
      onAction: async function (act, ids, reload, list) {
        if (act !== 'detail') return
        var row = list.rows.find(function (item) { return String(item.id) === String(ids.id) })
        if (!row) return
        openJsonModal('审计详情 · ' + row.action, {
          admin: row.adminUsername,
          action: row.action,
          resourceType: row.resourceType,
          resourceId: row.resourceId,
          result: row.result,
          ip: row.ip,
          userAgent: row.userAgent,
          createdAt: fmtTime(row.createdAt),
          before: row.before,
          after: row.after
        })
      }
    })
    return st
  }

  function openAdminCreateModal(reload) {
    openModal({
      title: '新建管理员',
      width: 520,
      content:
        '<form id="admin-form" class="form-grid">' +
          '<label class="field"><span>用户名 *</span><input name="username" placeholder="3-32 位字母、数字、下划线或连字符" required></label>' +
          '<label class="field"><span>显示名称</span><input name="displayName" placeholder="选填"></label>' +
          '<label class="field full"><span>密码 *</span><input name="password" type="password" minlength="12" placeholder="至少 12 位" required></label>' +
          '<label class="field full"><span>角色</span><select name="role">' + optionsHtml([['operator', '运营'], ['super_admin', '超级管理员']], 'operator') + '</select></label>' +
        '</form>',
      footer:
        '<button class="btn ghost" type="button" data-modal-cancel>取消</button>' +
        '<button class="btn primary" type="button" data-modal-confirm>创建</button>'
    })
    $('[data-modal-confirm]').onclick = async function () {
      var form = $('#admin-form')
      var values = {}
      Array.prototype.forEach.call(form.elements, function (input) {
        if (input.name) values[input.name] = input.value
      })
      if (!values.password || values.password.length < 12) { toast('密码至少 12 位', 'error'); return }
      try {
        await api('/admins', { method: 'POST', body: values })
        closeModal()
        toast('管理员已创建')
        await reload()
      } catch (err) { toast(err.message, 'error') }
    }
  }

  async function renderAdmins() {
    var st = await renderListPage({
      key: 'admins',
      title: '管理员',
      description: '仅超级管理员可访问；禁用会立即吊销该管理员全部会话',
      endpoint: '/admins',
      filters: [],
      hidePagination: true,
      transform: function (data) {
        var list = Array.isArray(data) ? data : []
        return { list: list, total: list.length, page: 1, pageSize: Math.max(1, list.length) }
      },
      toolbar: '<button class="btn primary" type="button" data-tool="create">新建管理员</button>',
      columns: [
        { title: 'ID', render: function (r) { return escapeHtml(r.id) } },
        { title: '用户名', render: function (r) { return '<strong>' + escapeHtml(r.username) + '</strong>' } },
        { title: '显示名称', render: function (r) { return escapeHtml(r.displayName || '-') } },
        { title: '角色', render: function (r) { return '<span class="role role-' + escapeHtml(r.role) + '">' + escapeHtml(roleText(r.role)) + '</span>' } },
        { title: '状态', render: function (r) { return statusBadge(r.status, { active: '正常', disabled: '已禁用' }) } },
        { title: '最近登录', render: function (r) { return fmtTime(r.lastLoginAt) } },
        {
          title: '操作',
          render: function (r) {
            var self = r.id === state.admin.id
            if (self) return '<span class="muted">当前账号</span>'
            return '<button class="btn link' + (r.status === 'active' ? ' danger' : '') + '" type="button" data-act="toggle" data-id="' +
              escapeHtml(r.id) + '">' + (r.status === 'active' ? '禁用' : '启用') + '</button>'
          }
        }
      ],
      onTool: async function (tool, reload) {
        if (tool === 'create') openAdminCreateModal(reload)
      },
      onAction: async function (act, ids, reload, list) {
        if (act !== 'toggle') return
        var row = list.rows.find(function (item) { return String(item.id) === String(ids.id) })
        if (!row) return
        var enabling = row.status !== 'active'
        if (!enabling) {
          var ok = await confirmDialog({
            title: '禁用管理员',
            message: '禁用后该管理员的所有会话立即失效，确定继续？',
            confirmText: '确认禁用',
            danger: true
          })
          if (!ok) return
        }
        try {
          await api('/admins/' + encodeURIComponent(row.id) + '/status', {
            method: 'PATCH',
            body: { status: enabling ? 'active' : 'disabled' }
          })
          toast(enabling ? '管理员已启用' : '管理员已禁用')
          await reload()
        } catch (err) { toast(err.message, 'error') }
      }
    })
    return st
  }

  /* ---------- 路由启动 ---------- */

  function renderNav() {
    var items = ROUTES.filter(function (route) { return !route.super || canSuper() })
    $('#nav').innerHTML = items.map(function (route) {
      return '<a class="nav-item' + (state.route === route.id ? ' active' : '') + '" href="#/' + route.id + '">' +
        '<span class="nav-mark">' + escapeHtml(route.mark) + '</span><span>' + escapeHtml(route.title) + '</span></a>'
    }).join('')
  }

  function renderAdminBadge() {
    $('#admin-badge').innerHTML =
      '<span class="role role-' + escapeHtml(state.admin.role) + '">' + escapeHtml(roleText(state.admin.role)) + '</span>' +
      '<span>' + escapeHtml(state.admin.displayName || state.admin.username) + '</span>'
  }

  async function renderPage(id) {
    try {
      if (id === 'overview') await renderOverview()
      else if (id === 'activities') await renderActivities()
      else if (id === 'points') await renderPoints()
      else if (id === 'uids') await renderUids()
      else if (id === 'users') await renderUsers()
      else if (id === 'checkins') await renderCheckins()
      else if (id === 'devices') await renderDevices()
      else if (id === 'logs') await renderLogs()
      else if (id === 'admins') await renderAdmins()
      else await renderOverview()
    } catch (err) {
      $('#content').innerHTML = '<div class="empty error">' + escapeHtml(err.message) + '</div>'
    }
  }

  var rendering = false

  async function render() {
    if (rendering) return
    rendering = true
    try {
      var valid = await ensureSession()
      if (!valid) { showLogin(); return }
      showApp()
      var route = location.hash.replace(/^#\/?/, '') || 'overview'
      var definition = ROUTES.find(function (item) { return item.id === route })
      if (!definition) definition = ROUTES[0]
      if (definition.super && !canSuper()) {
        history.replaceState(null, '', location.pathname + '#/overview')
        definition = ROUTES[0]
      }
      state.route = definition.id
      $('#page-title').textContent = definition.title
      $('#page-subtitle').textContent = definition.subtitle
      renderNav()
      renderAdminBadge()
      await renderPage(definition.id)
    } finally {
      rendering = false
    }
  }

  $('#login-form').addEventListener('submit', async function (event) {
    event.preventDefault()
    var error = $('#login-error')
    error.hidden = true
    var username = $('#login-username').value.trim()
    var password = $('#login-password').value
    if (!username || !password) {
      error.textContent = '请输入用户名与密码'
      error.hidden = false
      return
    }
    var button = $('#login-form button[type="submit"]')
    button.disabled = true
    try {
      var data = await api('/auth/login', { method: 'POST', body: { username: username, password: password } })
      setSession(data)
      $('#login-password').value = ''
      showApp()
      history.replaceState(null, '', location.pathname + '#/overview')
      await render()
    } catch (err) {
      error.textContent = err.message
      error.hidden = false
    } finally {
      button.disabled = false
    }
  })

  $('#logout-btn').addEventListener('click', async function () {
    try { await api('/auth/logout', { method: 'POST' }) } catch (err) { /* ignore */ }
    clearSession()
    closeModal()
    history.replaceState(null, '', location.pathname)
    showLogin()
  })

  $('#refresh-btn').addEventListener('click', function () { render() })
  window.addEventListener('hashchange', function () { render() })

  render()
})()
