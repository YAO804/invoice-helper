/**
 * mDNS 扫描状态机：发起搜索 → 收集候选 → 停止 → 结算地址。
 *
 * 核心约束：结算不能依赖 wx.onLocalServiceDiscoveryStop 回调。
 * 微信在「任务已被系统停掉 / stop 时没有活跃任务」等情况下可能不回调，
 * 一旦把 Promise 结算挂在该回调上就会永久 pending；上层 activeScan 缓存
 * 这个 pending Promise 后，用户再点搜索也毫无反应（表现为停不下来）。
 * 因此每次 stop 都额外挂一个兜底定时器，回调不来也能自行结算。
 */

const DEFAULT_SETTLE_MS = 1500
const DEFAULT_TIMEOUT_MS = 28000
const STOP_FALLBACK_MS = 300
const RETRY_ERROR = 'scan task already exist'

// 微信 mDNS 是全局单例，同一时间只能有一个搜索任务，模块级只保留一个活动运行
let activeRun = null

function createScanner(deps) {
  return {
    scan: function (options) {
      if (activeRun) return activeRun.promise
      const run = startRun(options, deps)
      activeRun = run
      return run.promise
    },
    cancel: function () {
      if (activeRun) activeRun.cancel()
    }
  }
}

function startRun(options, deps) {
  const settings = options || {}
  const ctx = {
    deps: deps,
    settleMs: settings.settleMs || DEFAULT_SETTLE_MS,
    timeoutMs: settings.timeoutMs || DEFAULT_TIMEOUT_MS,
    promise: null,
    cancel: null,
    found: [],
    settled: false,
    finalizing: false,
    retried: false,
    pendingStop: '',
    settleTimer: null,
    timeoutTimer: null,
    stopFallbackTimer: null,
    resolve: null,
    reject: null
  }

  ctx.promise = new Promise(function (resolve, reject) {
    ctx.resolve = resolve
    ctx.reject = reject
    ctx.cancel = function () { cancelRun(ctx) }
    attach(ctx)
    ctx.timeoutTimer = setTimeout(function () { requestStop(ctx, 'finalize') }, ctx.timeoutMs)
    startScan(ctx)
  })
  return ctx
}

function attach(ctx) {
  ctx.onFound = function (res) { onFound(ctx, res) }
  ctx.onStop = function () { onDiscoveryStop(ctx) }
  if (typeof wx.onLocalServiceFound === 'function') wx.onLocalServiceFound(ctx.onFound)
  if (typeof wx.onLocalServiceDiscoveryStop === 'function') wx.onLocalServiceDiscoveryStop(ctx.onStop)
}

function detach(ctx) {
  if (typeof wx.offLocalServiceFound === 'function') wx.offLocalServiceFound(ctx.onFound)
  if (typeof wx.offLocalServiceDiscoveryStop === 'function') wx.offLocalServiceDiscoveryStop(ctx.onStop)
}

function onFound(ctx, res) {
  if (ctx.settled) return
  const url = ctx.deps.toUrl(res)
  if (!url || ctx.found.indexOf(url) >= 0) return
  ctx.found.push(url)
  // 防抖：以最后一台被发现的时间为准，等 settleMs 再停，避免漏掉晚广播的电脑
  clearTimeout(ctx.settleTimer)
  ctx.settleTimer = setTimeout(function () { requestStop(ctx, 'finalize') }, ctx.settleMs)
}

function startScan(ctx) {
  wx.startLocalServiceDiscovery({
    serviceType: ctx.deps.serviceType,
    fail: function (err) {
      const msg = (err && err.errMsg) || '启动局域网搜索失败'
      if (msg.indexOf(RETRY_ERROR) >= 0 && !ctx.retried) {
        ctx.retried = true
        requestStop(ctx, 'retry')
        return
      }
      settle(ctx, '', msg)
    }
  })
}

function requestStop(ctx, reason) {
  if (ctx.settled || ctx.pendingStop) return
  ctx.pendingStop = reason
  clearTimeout(ctx.settleTimer)
  clearTimeout(ctx.stopFallbackTimer)
  // 兜底：即便 onStop 不回调，也会执行对应的结算/重试
  ctx.stopFallbackTimer = setTimeout(function () { runPendingStop(ctx) }, STOP_FALLBACK_MS)
  safeStop(ctx)
}

function safeStop(ctx) {
  try {
    wx.stopLocalServiceDiscovery()
  } catch (e) {
    runPendingStop(ctx)
  }
}

function runPendingStop(ctx) {
  if (ctx.settled) return
  const reason = ctx.pendingStop
  ctx.pendingStop = ''
  clearTimeout(ctx.stopFallbackTimer)
  if (reason === 'retry') startScan(ctx)
  else if (reason === 'finalize') finalize(ctx)
}

function onDiscoveryStop(ctx) {
  if (ctx.settled) return
  if (ctx.pendingStop) {
    runPendingStop(ctx)
    return
  }
  // 系统自行 stop（如 30 秒自动停）时没有主动 stop，兜底结算
  finalize(ctx)
}

function finalize(ctx) {
  if (ctx.settled || ctx.finalizing) return
  ctx.finalizing = true
  ctx.deps.resolveUrls(unique(ctx.found)).then(
    function (url) { settle(ctx, url, '') },
    function () { settle(ctx, '', '没有找到可连接的电脑') }
  )
}

function cancelRun(ctx) {
  if (ctx.settled) return
  safeStop(ctx)
  settle(ctx, '', '搜索已取消')
}

function settle(ctx, url, message) {
  if (ctx.settled) return
  ctx.settled = true
  clearTimeout(ctx.settleTimer)
  clearTimeout(ctx.timeoutTimer)
  clearTimeout(ctx.stopFallbackTimer)
  detach(ctx)
  if (activeRun === ctx) activeRun = null
  if (url) ctx.resolve(url)
  else ctx.reject(new Error(message))
}

function unique(list) {
  const result = []
  list.forEach(function (url) {
    if (result.indexOf(url) < 0) result.push(url)
  })
  return result
}

module.exports = {
  createScanner: createScanner
}
