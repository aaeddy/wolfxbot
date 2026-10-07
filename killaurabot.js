/**
 * killaurabot.js —— 两个账号同时在下界砍疣猪
 *
 * 每个账号的流程：
 *   1. 进服 → 发送 /res tp best.mmo
 *   2. 等传送完成后，用“直接改客户端坐标”的方式站到自己的位置
 *      （账号 1：-46993, 242, 21272；账号 2：-46993, 242, 21274）
 *   3. 每 780ms 找 10 格内最近的 5 只疣猪（hoglin），拿剑看过去砍
 *   4. 被服务器拉走会自己站回原位；断线后退出进程，由管理器自动重启（两个账号一起重来）
 *
 * 注意：
 *   - 终端里输入的内容会同时发给两个账号（管理器网页的输入框同理）
 *   - 账号名在下面 ACCOUNTS 里改；新账号第一次跑会要求完成一次微软登录验证
 */

const mineflayer = require('mineflayer')
const readline = require('readline')
// mineflayer-auto-eat v5：导出的是 loader（旧版的 .plugin 已经不存在）
const { loader: autoEatLoader } = require('mineflayer-auto-eat')

/* ============================================================
 * 配置
 * ============================================================ */

const ACCOUNTS = [
  { username: 'killaurabot',  spot: { x: -46993, y: 242, z: 21272 } },
  { username: 'killaurabot2', spot: { x: -46993, y: 242, z: 21274 } },
]

const CONFIG = {
  host: 'Wolfx.jp',
  port: 25565,
  version: '1.20',
  auth: 'microsoft',
  teleport: '/res tp best.mmo',
  attackCooldownMs: 640,     // 单个账号的攻击冷却（下界合金剑攻速 1.6 → 625ms，留点余量）
  // 两个账号交替出手：出手间隔 = attackCooldownMs / 2（代码里自动算，默认 320ms）
  attackRange: 4,            // 够得着的距离（生存模式 ~3 格，太远打了也没用还浪费冷却）
  sweepRange: 1.6,           // 判断“周围还有几只怪”用来挑最密集的目标（横扫范围约 1 格）
  statsLogMs: 30000,         // 每 30 秒汇报一次打怪次数
  teleportTimeoutMs: 15000,  // 等传送完成的最长时间
  // 断线后不再原地重连（见 restartProcess），而是退出进程让管理器重新启动
  restartDelayMs: 1000,      // 退出进程前的等待时间（毫秒），留给日志刷出去
}

/* ============================================================
 * 工具
 * ============================================================ */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const stamp = () => new Date().toLocaleTimeString()

function log(tag, ...args) {
  console.log(`${tag} [${stamp()}] ${args.join(' ')}`)
}

// 兜底：不因为单个异常把整个进程搞崩
process.on('unhandledRejection', (err) => console.error('未处理的异步错误（已忽略，进程继续运行）:', err))
process.on('uncaughtException', (err) => console.error('未捕获的错误（已忽略，进程继续运行）:', err))

/* ============================================================
 * 断线重启（不再原地重连）
 *   以前断线是 setTimeout(createBot) 在同一个进程里重连，但微软登录服务器不稳定时
 *   （例如 "Failed to obtain profile data for killaurabot, does the account own minecraft?"）
 *   原地重连每次都会是同一个错误，只有重新启动一个进程才能重新登录成功。
 *   所以现在只要有一个账号断线，整个进程就退出，由管理器重新启动（两个账号一起重来）。
 *   注意：直接 `node killaurabot.js` 单独运行不会被自动拉起，请用 `npm run web` 启动管理器。
 * ============================================================ */
const RESTART_DELAY_MS = CONFIG.restartDelayMs || 1000
let restarting = false

function restartProcess(reason) {
  if (restarting) return
  restarting = true
  console.log(`${stamp()} [killaurabot] 连接中断（${reason}），${RESTART_DELAY_MS / 1000} 秒后退出进程，由管理器重新启动（两个账号一起重来）...`)
  setTimeout(() => process.exit(1), RESTART_DELAY_MS)
}

// 等传送完成：位置移动超过 2 格就算传送成功
async function waitTeleport(bot, timeoutMs) {
  const before = bot.entity.position.clone()
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    await sleep(250)
    if (bot.entity.position.distanceTo(before) > 2) return true
  }
  return false
}

// 直接改写客户端坐标瞬移（项目里一直用的做法）
async function moveTo(bot, spot) {
  const pos = bot.entity.position
  pos.x = spot.x + 0.5
  pos.y = spot.y
  pos.z = spot.z + 0.5
  await sleep(300)
}

// 挑“周围怪最多”的一只作为目标：攻击它时，横扫之刃能一次刮到旁边一圈
function pickBestTarget(bot, hoglins) {
  let best = hoglins[0]
  let bestNeighbors = -1
  let bestDist = Infinity
  for (const hoglin of hoglins) {
    const neighbors = hoglins.filter((other) => other !== hoglin
      && other.position.distanceTo(hoglin.position) <= CONFIG.sweepRange).length
    const dist = bot.entity.position.distanceTo(hoglin.position)
    if (neighbors > bestNeighbors || (neighbors === bestNeighbors && dist < bestDist)) {
      best = hoglin
      bestNeighbors = neighbors
      bestDist = dist
    }
  }
  return best
}

// mineflayer-auto-eat v5：插件加载后会创建 bot.autoEat
function setupAutoEat(bot, tag) {
  if (!bot.autoEat) return
  bot.autoEat.opts.minHunger = 10
  bot.autoEat.opts.bannedFood = []
  bot.autoEat.on('eatStart', (opts) => log(tag, `开始进食: ${opts.food ? opts.food.name : '?'}`))
  bot.autoEat.enableAuto()
}

/* ============================================================
 * 打怪：两个账号交替出手
 *   单账号冷却 640ms，交替后每 320ms 就有一次攻击（总输出翻倍），
 *   而且每个账号的两次出手之间仍然是完整的 640ms，不会掉伤害。
 * ============================================================ */

const SLOT_MS = Math.max(50, Math.round(CONFIG.attackCooldownMs / 2))   // 出手间隔 ≈ 320ms

let slotIndex = 0
let schedulerBusy = false

// 让某个账号出手；打不了就返回 false，调度器会让另一个账号顶上
async function tryAttack(entry) {
  const { bot, state, tag } = entry
  if (!state.inGame || !bot.entity) return false

  // 正在进食就先不挥剑：换物品会打断进食，等这轮吃完，
  // 下一个 320ms 名额再出手（这个名额会自动让给另一个账号）
  if (bot.autoEat && bot.autoEat.isEating) return false

  if (Date.now() - entry.lastAttackAt < CONFIG.attackCooldownMs) return false   // 自己冷却还没好

  const sword = bot.inventory.items().find((item) => item.name.includes('netherite_sword'))
  if (!sword) {
    if (!entry.warnedNoSword) {
      log(tag, '背包里没有下界合金剑，先站着等')
      entry.warnedNoSword = true
    }
    return false
  }
  entry.warnedNoSword = false

  const hoglins = Object.values(bot.entities)
    .filter((entity) => entity.name === 'hoglin'
      && bot.entity.position.distanceTo(entity.position) <= CONFIG.attackRange)
  if (!hoglins.length) return false

  // 挑“周围怪最多”的那只：横扫之刃能一次刮到旁边一圈
  const target = pickBestTarget(bot, hoglins)

  // 横扫之刃触发条件：不冲刺、不跳跃、站在地面、攻击冷却满
  bot.setControlState('sprint', false)
  bot.setControlState('jump', false)

  if (!bot.heldItem || bot.heldItem.name !== sword.name) {
    await bot.equip(sword, 'hand')            // 手上已经是剑就不换
  }
  await bot.lookAt(target.position.offset(0, target.height * 0.85, 0), true)   // true = 立刻转头
  bot.attack(target)

  entry.lastAttackAt = Date.now()
  entry.attacks += 1
  if (Date.now() - entry.statsAt >= CONFIG.statsLogMs) {
    log(tag, `最近 ${Math.round((Date.now() - entry.statsAt) / 1000)} 秒攻击 ${entry.attacks} 次（本次目标周围还有 ${hoglins.length - 1} 只）`)
    entry.attacks = 0
    entry.statsAt = Date.now()
  }
  return true
}

// 共用调度器：每 320ms 一个出手名额，轮流分给两个账号
function startAttackScheduler() {
  setInterval(async () => {
    if (schedulerBusy) return
    const entries = [...bots.values()]
    if (!entries.length) return

    schedulerBusy = true
    try {
      for (let k = 0; k < entries.length; k++) {
        const entry = entries[(slotIndex + k) % entries.length]
        const ok = await tryAttack(entry).catch((err) => {
          log(entry.tag, '打怪出错:', err.message)
          return false
        })
        if (ok) {
          slotIndex = (slotIndex + k + 1) % entries.length   // 下一刀轮到另一个账号
          return
        }
      }
    } finally {
      schedulerBusy = false
    }
  }, SLOT_MS)
}

// 站位保持：被服务器拉走 / 掉下去就站回自己的位置（跟攻击分开，别占用出手时机）
function startPositionKeeper(entry) {
  const { bot, account, state } = entry
  const timer = setInterval(() => {
    if (!state.inGame || !bot.entity) return
    const pos = bot.entity.position
    const drifted = Math.abs(pos.x - (account.spot.x + 0.5)) > 1
      || Math.abs(pos.y - account.spot.y) > 1
      || Math.abs(pos.z - (account.spot.z + 0.5)) > 1
    if (drifted) moveTo(bot, account.spot).catch(() => {})
  }, 2000)
  bot.once('end', () => clearInterval(timer))
}

/* ============================================================
 * 一个账号一个 bot
 * ============================================================ */

const bots = new Map()   // username -> { bot, state }

function createBot(account) {
  const tag = `[${account.username}]`
  const state = { inGame: false }

  const bot = mineflayer.createBot({
    host: CONFIG.host,
    port: CONFIG.port,
    username: account.username,
    version: CONFIG.version,
    auth: CONFIG.auth,
  })

  const entry = {
    bot,
    account,
    tag,
    state,
    lastAttackAt: 0,      // 这个账号上次出手时间（用来错开冷却）
    attacks: 0,
    statsAt: Date.now(),
    warnedNoSword: false,
  }
  bots.set(account.username, entry)

  bot.setMaxListeners(128)
  bot.loadPlugin(autoEatLoader)

  // 服务器消息：带账号前缀 + ANSI 颜色
  bot.on('message', (message) => {
    console.log(`${tag} [${stamp()}] ${message.toAnsi()}`)
  })

  bot.on('kicked', (reason) => log(tag, '被踢出:', reason))
  bot.on('error', (err) => {
    log(tag, '错误:', err.message)
    // 微软登录失败：原地重连没有用，直接退出进程重新登录
    if (/Failed to obtain profile|does the account own minecraft|InvalidCredentials/i.test(err.message || '')) {
      restartProcess('微软登录失败')
    }
  })

  bot.on('end', () => {
    state.inGame = false
    restartProcess('连接已断开')
  })

  bot.once('spawn', async () => {
    state.inGame = true
    setupAutoEat(bot, tag)

    log(tag, `已进入服务器，传送: ${CONFIG.teleport}`)
    bot.chat(CONFIG.teleport)

    const teleported = await waitTeleport(bot, CONFIG.teleportTimeoutMs)
    if (!teleported) log(tag, '等待传送有点久，仍然继续走位')

    await moveTo(bot, account.spot)
    log(tag, `已站到 (${account.spot.x}, ${account.spot.y}, ${account.spot.z})，开始砍怪`)

    startPositionKeeper(entry)
  })

  return bot
}

/* ============================================================
 * 终端输入：同时发给两个账号
 * ============================================================ */

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
rl.on('line', (input) => {
  let sent = 0
  for (const [username, entry] of bots) {
    if (!entry.state.inGame) {
      console.log(`[${username}] 还没进入服务器，跳过这条消息`)
      continue
    }
    try {
      entry.bot.chat(input)
      sent += 1
    } catch (err) {
      console.log(`[${username}] 发送失败: ${err.message}`)
    }
  }
  if (!sent) console.log('[提示] 当前没有已进服的账号，消息没有发出')
})

/* ============================================================
 * 启动
 * ============================================================ */

for (const account of ACCOUNTS) createBot(account)

// 两个账号共用一个出手调度器：A、B、A、B……交替，总输出翻倍
startAttackScheduler()
