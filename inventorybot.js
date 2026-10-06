/**
 * inventorybot.js —— 查看机器人当前背包内容
 *
 * 用法：
 *   node inventorybot.js              // 用 CONFIG.username 里的默认账号
 *   node inventorybot.js afkbot       // 用命令行指定的账号登录
 *
 * 功能：
 *   - 进服后打印一次背包全部内容（主背包 36 格 + 装备 + 副手）
 *   - 背包发生变化时自动重新打印（1 秒防抖，内容没变不重复打印）
 *   - 终端里输入 inv / i / 背包 可以手动刷新打印；输入其它内容会当作聊天发出去
 *   - 掉线后 5 秒自动重连
 *   - 服务器消息用 ANSI 彩色打印
 */

const mineflayer = require('mineflayer')
const readline = require('readline')

// ============================================================
// 配置
// ============================================================
const CONFIG = {
  host: 'wolfx.jp',
  version: '1.20.1',
  auth: 'microsoft',
  username: process.argv[2] || 'afkbot',   // 命令行第一个参数可以指定账号
  reconnectDelayMs: 5000,
}

// ============================================================
// 状态
// ============================================================
let bot = null
let lastSignature = ''
let printTimer = null

const log = (...args) => console.log('[inventorybot]', ...args)

// 背包内容签名：用来判断内容有没有变化（槽位+物品+数量）
function inventorySignature(myBot) {
  const parts = myBot.inventory.items().map((item) => `${item.slot}:${item.name}:${item.count}`)
  const armor = myBot.inventory.slots.slice(5, 9).map((item) => (item ? `${item.name}:${item.count}` : '-'))
  const offhand = myBot.inventory.slots[45]
  parts.push('armor:' + armor.join(','))
  parts.push('offhand:' + (offhand ? `${offhand.name}:${offhand.count}` : '-'))
  return parts.join('|')
}

// 打印背包内容；force = true 时即使内容没变也打印
function printInventory(myBot, force = false) {
  if (!myBot || !myBot.inventory) return

  const signature = inventorySignature(myBot)
  if (!force && signature === lastSignature) return
  lastSignature = signature

  const items = myBot.inventory.items()
  const totalCount = items.reduce((sum, item) => sum + item.count, 0)

  console.log('')
  console.log(`========== 背包内容（${myBot.username || CONFIG.username}）==========`)

  if (!items.length) {
    console.log('  (主背包是空的)')
  } else {
    for (const item of items) {
      console.log(
        `  槽位 ${String(item.slot).padStart(2)} | ${item.name.padEnd(24)} x${String(item.count).padEnd(4)} | ${item.displayName || ''}`
      )
    }
  }

  // 装备（槽位 5~8）和副手（槽位 45）
  const armor = myBot.inventory.slots.slice(5, 9).filter(Boolean)
  const offhand = myBot.inventory.slots[45]
  if (armor.length || offhand) {
    console.log('  --- 装备 / 副手 ---')
    for (const item of armor) console.log(`  ${item.name.padEnd(24)} x${item.count}`)
    if (offhand) console.log(`  副手: ${offhand.name.padEnd(18)} x${offhand.count}`)
  }

  // 按物品名汇总
  const aggregate = new Map()
  for (const item of items) {
    aggregate.set(item.name, (aggregate.get(item.name) || 0) + item.count)
  }
  if (aggregate.size) {
    const summary = [...aggregate.entries()].map(([name, count]) => `${name} x${count}`).join(', ')
    console.log(`  汇总: ${summary}`)
  }

  console.log(`  共 ${items.length} 组 / ${totalCount} 个物品，空槽位 ${myBot.inventory.emptySlotCount()} / 36`)
  console.log('==================================================')
}

// 背包变化后延迟打印，避免连续变化时疯狂刷屏
function schedulePrint(myBot) {
  if (printTimer) return
  printTimer = setTimeout(() => {
    printTimer = null
    printInventory(myBot)
  }, 1000)
}

// ============================================================
// 连接
// ============================================================
function createBot() {
  bot = mineflayer.createBot({
    host: CONFIG.host,
    username: CONFIG.username,
    version: CONFIG.version,
    auth: CONFIG.auth,
  })

  bot.setMaxListeners(128)

  // 服务器消息：ANSI 彩色打印
  bot.on('message', (message) => {
    const timestamp = new Date().toLocaleTimeString()
    console.log(`[${timestamp}] ${message.toAnsi()}`)
  })

  bot.once('spawn', () => {
    log(`已进入服务器（${CONFIG.host}），账号 ${bot.username || CONFIG.username}`)
    printInventory(bot, true)

    // 注意：mineflayer 的库存插件是在 createBot 之后异步注入的，
    // 所以 bot.inventory 要等到 spawn 之后才存在，监听也放在这里注册
    bot.inventory.on('updateSlot', () => schedulePrint(bot))
  })

  bot.on('kicked', (reason) => log('被踢出:', reason))
  bot.on('error', (err) => log('机器人错误:', err.message))

  bot.on('end', () => {
    log(`连接中断，${CONFIG.reconnectDelayMs / 1000} 秒后重连...`)
    setTimeout(createBot, CONFIG.reconnectDelayMs)
  })

  return bot
}

// ============================================================
// 终端交互
// ============================================================
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
rl.on('line', (input) => {
  const command = input.trim().toLowerCase()
  if (['inv', 'i', '背包', 'inventory'].includes(command)) {
    printInventory(bot, true)
    return
  }
  if (bot && bot.chat) bot.chat(input)
})

createBot()
