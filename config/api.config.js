/**
 * API 环境配置：全项目唯一的服务器地址来源。
 *
 * ENV 取值：
 *   mock       - 不启动后端，使用 utils/mock.js 的本地演示数据（默认，便于直接在开发者工具运行）
 *   dev        - 连接本地 Node.js 后端（开发者工具需勾选「不校验合法域名」）
 *   production - 连接线上 HTTPS 域名（需在微信公众平台配置 request 合法域名）
 *
 * 注意：页面代码中禁止出现服务器地址、业务数据和 NFC UID。
 */
const ENV = 'dev'

const BASE_URL = {
  mock: '',
  dev: 'http://127.0.0.1:3000/api',
  production: 'https://your-api-domain.com/api'
}

module.exports = {
  env: ENV,
  baseUrl: BASE_URL[ENV],
  useMock: ENV === 'mock',
  timeout: 10000,
  nfcEventPath: '/nfc/events'
}
