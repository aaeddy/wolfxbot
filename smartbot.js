/**
 * smartbot.js —— 搬砖机器人（重写版）
 *
 * 工作流程（连上服务器后循环执行）：
 *   1. /res tp best 回农场，等待传送完成
 *   2. 直接改写坐标瞬移到第一个点位 (-47001, 21271)
 *   3. 从 (-47002, 256, 21270) 开始翻箱子收皮革，直到背包塞满：
 *      - 同一个点位先拿底层箱子，拿不满就往上一层找，最多再向上 4 格
 *      - 这个点位找完还不满：往 x-1 挪一格换下一个点位（最远到 x = -47027）
 *      - 点位之间的 z 变化由 chestStepZ 控制（默认不变）
 *   4. 背包塞满（或点位全部找完）后：/warp shop，等待传送完成
 *   5. 瞬移到商店站位 (-6726, 65, -6383)，左键点一下 (-6727, 68, -6386) 的箱子
 *      （只点击、不打开），然后发 /qs amount all 卖货
 *   6. 回到第 1 步循环
 *
 * 说明：
 *   - 服务器消息全程用 message.toAnsi() 打印（保留 ANSI 颜色）
 *   - 瞬移沿用项目里的做法：直接改 bot.entity.position 的 x / z（需要时再改 y）
 */

const mineflayer = require('mineflayer')
// mineflayer-auto-eat v5：导出的是 loader（旧版的 .plugin 已经不存在）
const { loader: autoEatLoader } = require('mineflayer-auto-eat')
const readline = require('readline')
const { Vec3 } = require('vec3')

/* ============================================================
 * 配置（要改坐标/传送点都在这里改）
 * ============================================================ */

const CONFIG = {
  // ---- 连接 ----
  host: 'wolfx.jp',          // 原 wolfxmc.org 已连不上，改成 afkbot 现在用的地址
  username: 'smartbot',
  version: '1.20.1',
  auth: 'microsoft',
  reconnectDelayMs: 5000,

  // ---- 传送点 ----
  farmTp: '/res tp best',    // 农场
  shopTp: '/warp shop',      // 商店

  // ---- 收皮革 ----
  leather: 'leather',
  farmStart: { x: -47001, z: 21271 },             // 进农场后的第一个落脚点
  chestStart: { x: -47002, y: 256, z: 21270 },    // 第一个箱子
  chestEndX: -47031,                              // x 方向最远的箱子（含）
  chestStepX: -1,                                 // 每换一个点位 x 的步进
  chestStepZ: 0,                                  // 每换一个点位 z 的步进
  maxUp: 5,                                       // 每个点位最多再向上找 5 格（y、y+1 … y+5）
  openTimeoutMs: 5000,                            // 打开箱子的超时（够不到时会卡住，超时就跳过）

  // ---- 商店 ----
  shopStand: { x: -6726, y: 65, z: -6383 },       // 瞬移到的站位（会设置 y）
  shopChest: { x: -6727, y: 68, z: -6386 },       // 左键点击的箱子

  // ---- 节奏 ----
  teleportTimeoutMs: 20000,   // 等待传送完成的最长时间
  clickHoldMs: 60,            // 左键按住的时长（毫秒），只点击不挖掉
  loopDelayMs: 1500,          // 卖货后的等待
}

// 背包里要保留、不丢的物品（皮革要拿去卖，食物要留给自动进食）
const KEEP_ITEMS = [
  'leather',
  'leather_helmet',
  'elytra',
  'netherite_boots',
  'netherite_leggings',
  'netherite_helmet',
  'diamond_sword',
  'netherite_sword',
]

/* ============================================================
 * 运行状态与工具
 * ============================================================ */

let bot = null
let loopRunning = false

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const log = (...args) => console.log('[smartbot]', ...args)

// 给可能一直挂着的异步操作加超时（比如够不到箱子时 openContainer 不会返回）
function withTimeout(promise, ms, what) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} 超时（${ms}ms）`)), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

// 判断方块是不是能打开的容器
function isContainerBlock(block) {
  if (!block) return false
  return block.name === 'chest'
    || block.name === 'trapped_chest'
    || block.name === 'barrel'
    || block.name === 'ender_chest'
    || block.name.endsWith('shulker_box')
}

// 背包是否已经装不下更多皮革
function isInventoryFull(myBot) {
  if (!myBot.inventory) return false
  if (myBot.inventory.emptySlotCount() > 0) return false
  return !myBot.inventory.items().some(
    (item) => item.name === CONFIG.leather && item.count < item.stackSize
  )
}

// 等待传送完成：位置移动超过 2 格后，再等它稳定下来
async function teleportAndWait(myBot, command) {
  const before = myBot.entity.position.clone()
  log(`传送: ${command}`)
  myBot.chat(command)

  const start = Date.now()
  let teleported = false
  let last = before.clone()

  while (Date.now() - start < CONFIG.teleportTimeoutMs) {
    await sleep(250)
    if (myBot !== bot || !myBot.entity) return false
    const now = myBot.entity.position
    if (!teleported && now.distanceTo(before) > 2) teleported = true
    if (teleported) {
      if (now.distanceTo(last) < 0.2) {
        await sleep(500)
        return true
      }
      last = now.clone()
    }
  }

  log(`等待传送超时: ${command}`)
  return false
}

// 直接改写客户端坐标瞬移：只设 x / z，传了 y 就一起设
async function moveTo(myBot, x, z, y = null) {
  const pos = myBot.entity.position
  const far = Math.abs(x - pos.x) > 30 || Math.abs(z - pos.z) > 30

  pos.x = x + 0.5
  if (far) await sleep(500)
  pos.z = z + 0.5
  if (y !== null && Math.abs(pos.y - y) > 0.01) pos.y = y
  await sleep(300)
}

// 从指定箱子收皮革，返回实际收了几个
async function lootLeatherFrom(myBot, chestPos) {
  const block = myBot.blockAt(chestPos)
  if (!isContainerBlock(block)) return 0

  let container = null
  let taken = 0
  try {
    container = await withTimeout(myBot.openContainer(block), CONFIG.openTimeoutMs, '打开箱子')
    while (!isInventoryFull(myBot)) {
      const item = container.containerItems().find(
        (slot) => slot.name === CONFIG.leather && slot.count > 0
      )
      if (!item) break
      const count = Math.min(item.count, 64)
      try {
        await container.withdraw(item.type, null, count)
      } catch (err) {
        break
      }
      taken += count
    }
  } catch (err) {
    log(`打开箱子 (${chestPos.x},${chestPos.y},${chestPos.z}) 失败: ${err.message}`)
  } finally {
    if (container) container.close()
  }

  await sleep(200)
  return taken
}

// 左键点一下方块：开始挖掘(status 0) 后立刻取消(status 1)，不会真的把方块挖掉
async function leftClickBlock(myBot, pos) {
  const block = myBot.blockAt(pos)
  if (!block) {
    log(`找不到要点击的方块 (${pos.x},${pos.y},${pos.z})`)
    return false
  }
  await myBot.lookAt(block.position.offset(0.5, 0.5, 0.5))
  myBot._client.write('block_dig', { status: 0, location: block.position, face: 1 })
  myBot.swingArm()
  await sleep(CONFIG.clickHoldMs)
  myBot._client.write('block_dig', { status: 1, location: block.position, face: 0 })
  log(`已左键点击 (${pos.x},${pos.y},${pos.z})`)
  return true
}

// 丢杂物：保留皮革、食物和装备（每秒一次，避免频繁发包）
function isFoodItem(myBot, item) {
  return !!(myBot.registry && myBot.registry.foodsByName && myBot.registry.foodsByName[item.name])
}

async function dropJunk(myBot) {
  if (!myBot.inventory) return
  for (const item of myBot.inventory.items()) {
    if (KEEP_ITEMS.includes(item.name)) continue
    if (isFoodItem(myBot, item)) continue
    try {
      await myBot.tossStack(item)
    } catch (err) {
      // 丢失败就下次再丢
    }
  }
}

/* ============================================================
 * 主流程
 * ============================================================ */

// 一轮：农场收皮革 -> 商店卖 -> 结束（外层循环会再回农场）
async function runCycle(myBot) {
  // 1. 回农场
  await teleportAndWait(myBot, CONFIG.farmTp)
  if (myBot !== bot) return

  // 2. 走到第一个点位
  await moveTo(myBot, CONFIG.farmStart.x, CONFIG.farmStart.z)

  // 3. 蛇形横向收皮革：
  //    第 1 层从起点扫到最远点，第 2 层从最远点扫回起点，第 3 层再扫过去……
  //    这样每层扫完就停在下一层的起点上，不用每次都跑回同一头。
  const stepAbs = Math.abs(CONFIG.chestStepX) || 1
  const rowCount = Math.floor(Math.abs(CONFIG.chestStart.x - CONFIG.chestEndX) / stepAbs) + 1

  for (let up = 0; up <= CONFIG.maxUp && myBot === bot; up++) {
    const chestY = CONFIG.chestStart.y + up
    const forward = up % 2 === 0                      // 偶数层正着扫，奇数层倒着扫
    const stepX = forward ? CONFIG.chestStepX : -CONFIG.chestStepX
    const stepZ = forward ? CONFIG.chestStepZ : -CONFIG.chestStepZ

    let chestX = forward ? CONFIG.chestStart.x : CONFIG.chestEndX
    let chestZ = CONFIG.chestStart.z + (forward ? 0 : stepZ * (rowCount - 1))
    const toX = forward ? CONFIG.chestEndX : CONFIG.chestStart.x

    log(`开始扫第 ${chestY} 层（${forward ? '正向' : '反向'}）：x ${chestX} → ${toX}`)
    await moveTo(myBot, chestX + 1, chestZ + 1)

    for (let i = 0; i < rowCount && myBot === bot; i++) {
      if (isInventoryFull(myBot)) break
      const taken = await lootLeatherFrom(myBot, new Vec3(chestX, chestY, chestZ))
      if (taken > 0) log(`从 (${chestX},${chestY},${chestZ}) 取了 ${taken} 个皮革`)
      if (isInventoryFull(myBot)) break

      // 同一层横向走到下一个点位（下一层方向会反过来）
      chestX += stepX
      chestZ += stepZ
      await moveTo(myBot, chestX + 1, chestZ + 1)
    }

    if (isInventoryFull(myBot)) break
  }

  if (myBot !== bot) return
  if (isInventoryFull(myBot)) {
    log('背包已塞满，去商店卖货')
  } else {
    log('所有点位都找完了，背包仍未满，直接去商店把已有的卖掉')
  }

  // 4. 去商店
  await teleportAndWait(myBot, CONFIG.shopTp)
  if (myBot !== bot) return

  // 5. 瞬移到商店站位，左键点箱子，然后卖货
  await moveTo(myBot, CONFIG.shopStand.x, CONFIG.shopStand.z, CONFIG.shopStand.y)
  await leftClickBlock(myBot, new Vec3(CONFIG.shopChest.x, CONFIG.shopChest.y, CONFIG.shopChest.z))
  await sleep(500)
  myBot.chat('/qs amount all')
  log('已发送 /qs amount all')
  await sleep(CONFIG.loopDelayMs)
}

// 工作循环：绑定在某个 bot 实例上，重连后旧循环会自动退出
async function workLoop(myBot) {
  while (myBot === bot) {
    try {
      await runCycle(myBot)
    } catch (err) {
      log('这一轮出错:', err.message)
      await sleep(3000)
    }
  }
}

function startWork(myBot) {
  if (loopRunning) return
  loopRunning = true
  log('开始搬砖循环')
  workLoop(myBot)
    .catch((err) => log('工作循环结束:', err.message))
    .finally(() => {
      loopRunning = false
      if (myBot === bot) log('工作循环已退出')
    })
}

/* ============================================================
 * 连接与事件
 * ============================================================ */

// mineflayer-auto-eat v5：插件加载后会创建 bot.autoEat（EatUtil 实例）
function setupAutoEat(myBot) {
  if (!myBot.autoEat) {
    log('自动进食插件未加载，跳过')
    return
  }
  // v5 的配置挂在 autoEat.opts 上（旧版的 autoEat.options / enable() 已经不存在）
  myBot.autoEat.opts.minHunger = 16   // 饥饿值低于 16 就自动吃（默认 15）
  myBot.autoEat.opts.offhand = false
  myBot.autoEat.opts.bannedFood = []  // 不额外禁食
  myBot.autoEat.on('eatStart', (opts) => log(`开始进食: ${opts.food ? opts.food.name : '?'}`))
  myBot.autoEat.on('eatFinish', () => log('进食完成'))
  myBot.autoEat.on('eatFail', (err) => log('进食失败:', err.message))
  myBot.autoEat.enableAuto()
  log('自动进食已开启')
}

function createBot() {
  bot = mineflayer.createBot({
    host: CONFIG.host,
    username: CONFIG.username,
    version: CONFIG.version,
    auth: CONFIG.auth,
  })

  bot.setMaxListeners(128)

  // 服务器消息：全程 ANSI 颜色打印
  bot.on('message', (message) => {
    const timestamp = new Date().toLocaleTimeString()
    console.log(`[${timestamp}] ${message.toAnsi()}`)
  })

  bot.loadPlugin(autoEatLoader)

  bot.once('spawn', () => {
    setupAutoEat(bot)
    log(`已进入服务器（${CONFIG.host}），开始执行搬砖流程`)
    startWork(bot)
  })

  bot.on('kicked', (reason) => log('被踢出:', reason))
  bot.on('error', (err) => log('机器人错误:', err.message))

  bot.on('end', () => {
    loopRunning = false
    log(`连接中断，${CONFIG.reconnectDelayMs / 1000} 秒后重连...`)
    setTimeout(createBot, CONFIG.reconnectDelayMs)
  })

  return bot
}

// 终端输入直接发到游戏聊天（只创建一次，重连不会重复）
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
rl.on('line', (input) => {
  if (bot && bot.chat) bot.chat(input)
})

// 丢杂物定时器也只创建一次（操作当前 bot）
setInterval(() => {
  if (bot && bot.inventory) dropJunk(bot).catch(() => {})
}, 1000)

createBot()
