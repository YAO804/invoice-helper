/**
 * 小程序鉴权回归测试：PIN 存储、登录码解析、登录确认接口、改 PIN。
 * 扫码动作本身在 discover.test.js / settings.test.js 里覆盖。
 *
 *   node test/miniprogram/auth.test.js
 */

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

const storage = {}
let requests = []

global.wx = {
  getStorageSync(k) { return storage[k] },
  setStorageSync(k, v) { storage[k] = v },
  request(options) {
    requests.push(options)
    const path = options.url
    if (path.indexOf('/api/auth/confirm') >= 0) {
      const body = options.data || {}
      if (body.pin === 'wrong') return options.success({ statusCode: 401, data: {} })
      return options.success({ statusCode: 200, data: { ok: true } })
    }
    if (path.indexOf('/api/auth/pin') >= 0) {
      const body = options.data || {}
      if (body.old_pin !== '123456') return options.success({ statusCode: 401, data: {} })
      return options.success({ statusCode: 200, data: { ok: true } })
    }
    options.success({ statusCode: 200, data: { ok: true } })
  }
}

const auth = require('../../miniprogram/utils/auth')

async function main() {
  console.log('--- PIN 存储 ---')
  check('初始无 PIN', auth.hasPIN(), false)
  auth.setPIN('123456')
  check('设置后可读', auth.getPIN(), '123456')
  check('hasPIN', auth.hasPIN(), true)
  check('authHeader 带 X-PIN', auth.authHeader()['X-PIN'], '123456')
  check('authHeader 带 content-type', auth.authHeader()['content-type'], 'application/json')

  console.log('\n--- 登录码解析 ---')
  const good = 'invoice-helper://login?base=http%3A%2F%2F192.168.1.20%3A8765&c=abc123'
  check('解析成功', auth.parseLoginCode(good), { base: 'http://192.168.1.20:8765', code: 'abc123' })
  check('去掉 base 尾斜杠', auth.parseLoginCode('invoice-helper://login?base=http%3A%2F%2Fa%3A1%2F&c=x').base, 'http://a:1')
  check('非本应用 scheme', auth.parseLoginCode('invoice-helper://connect?base=http%3A%2F%2Fa%3A1'), null)
  check('缺挑战码', auth.parseLoginCode('invoice-helper://login?base=http%3A%2F%2Fa%3A1'), null)
  check('空串', auth.parseLoginCode(''), null)
  check('普通网址', auth.parseLoginCode('http://a:1'), null)

  console.log('\n--- 登录确认接口 ---')
  const base = 'http://192.168.1.20:8765'
  await auth.confirmLogin(base, 'abc123')
  const confirm = requests[requests.length - 1]
  check('确认接口路径', confirm.url, base + '/api/auth/confirm')
  check('确认带 PIN', confirm.data.pin, '123456')
  check('确认带挑战码', confirm.data.code, 'abc123')
  check('确认带 X-PIN 头', confirm.header['X-PIN'], '123456')

  auth.setPIN('wrong')
  try {
    await auth.confirmLogin(base, 'abc123')
    check('PIN 错应拒绝', false, true)
  } catch (e) { check('PIN 错应拒绝', e.message, 'HTTP 401') }
  auth.setPIN('123456')

  console.log('\n--- 改 PIN ---')
  const baseURL = 'http://192.168.1.20:8765'
  try {
    await auth.changePIN('wrong', '999999', baseURL)
    check('旧 PIN 错误应拒绝', false, true)
  } catch (e) { check('旧 PIN 错误应拒绝', true, true) }
  check('拒绝后本地 PIN 未变', auth.getPIN(), '123456')

  await auth.changePIN('123456', '999999', baseURL)
  check('改 PIN 后本地同步', auth.getPIN(), '999999')
  const change = requests[requests.length - 1]
  check('改 PIN 路径', change.url.indexOf('/api/auth/pin') >= 0, true)
  check('改 PIN 带旧值', change.data.old_pin, '123456')
  check('改 PIN 带新值', change.data.new_pin, '999999')

  console.log('\n完成：' + (failCount ? 'FAIL ' + failCount : '全部通过'))
  process.exit(failCount ? 1 : 0)
}

main().catch(function (e) {
  console.error(e)
  process.exit(1)
})
