const mineflayer = require('mineflayer')
const autoeat = require('mineflayer-auto-eat').plugin
var tpsPlugin = require('mineflayer-tps')(mineflayer)
const fs = require('fs')
const path = require('path')
const readline = require('readline')
const moment = require('moment')
const navigatePlugin = require('mineflayer-navigate')
const { pathfinder, Movements } = require('mineflayer-pathfinder')
const GoalNear = require('mineflayer-pathfinder').goals.GoalNear
const Vec3 = require('vec3')
const Let_it_move = require('./Let_it_move.js')
const _ = require('lodash')
const { setInterval } = require('timers')

// 兜底：异步回调里抛出的错误只记录，不让整个机器人进程退出
process.on('unhandledRejection', (err) => {
  console.error('未处理的异步错误（已忽略，进程继续运行）:', err)
})

/* ============================================================
 * 断线重启（不再原地重连）
 *   以前掉线是 setTimeout(createBot) 在同一个进程里重连，但微软登录服务器不稳定时
 *   （例如 "Failed to obtain profile data for afkbot, does the account own minecraft?"）
 *   原地重连每次都会是同一个错误，只有重新启动一个进程才能重新登录成功。
 *   所以现在断线一律退出进程，交给管理器（manager.js / start.js）重新拉起。
 *   注意：直接 `node afkbot.js` 单独运行不会被自动拉起，请用 `npm run web` 启动管理器。
 * ============================================================ */
const RESTART_DELAY_MS = 1000   // 退出前留一点时间，让日志先刷出去
let restarting = false

function restartProcess(reason) {
  if (restarting) return
  restarting = true
  console.log(`连接中断（${reason}），${RESTART_DELAY_MS / 1000} 秒后退出进程，由管理器重新启动...`)
  setTimeout(() => process.exit(1), RESTART_DELAY_MS)
}

/* ============================================================
 * TPS 监控（代替原来的“跑 30 分钟、退服 3 分钟”）
 *   每 5 分钟发一次 /tps，从服务器报告里抓 min 值：
 *       min 20.00   med 20.00   max 20.00
 *   min 低于 7 说明服务器卡了，afkbot 主动下线 5 分钟，
 *   时间到了再退出进程，由管理器重新拉上线。
 * ============================================================ */
const TPS_CHECK_INTERVAL_MS = 5 * 60 * 1000   // 每 5 分钟查一次
const TPS_OFFLINE_MS = 5 * 60 * 1000          // TPS 过低时下线多久
const TPS_MIN_THRESHOLD = 7                   // min 低于这个值就下线
const TPS_REPLY_TIMEOUT_MS = 15 * 1000        // 等服务器报告的最长时间

let plannedOfflineUntil = 0   // 大于当前时间表示“正在主动下线”，这期间的断线不重启进程
let offlineTimer = null
let awaitingTps = false
let tpsReplyTimer = null

// 发一次 /tps（没进服就跳过，等下一个 5 分钟）
function requestTps(bot) {
  if (offlineTimer || Date.now() < plannedOfflineUntil) return
  if (!bot || !bot.entity) return
  awaitingTps = true
  bot.chat('/tps')
  clearTimeout(tpsReplyTimer)
  tpsReplyTimer = setTimeout(() => { awaitingTps = false }, TPS_REPLY_TIMEOUT_MS)
}

// 从聊天文本里抓 “min 20.00   med 20.00   max 20.00”
function parseTpsReport(text) {
  const plain = String(text).replace(/\u00a7[0-9a-fk-orx]/gi, '')
  const m = plain.match(
    /min[\s\u00a0\u200b]*([0-9]+(?:\.[0-9]+)?)[\s\u00a0\u200b]*med[\s\u00a0\u200b]*([0-9]+(?:\.[0-9]+)?)[\s\u00a0\u200b]*max[\s\u00a0\u200b]*([0-9]+(?:\.[0-9]+)?)/i
  )
  if (!m) return null
  return { min: Number(m[1]), med: Number(m[2]), max: Number(m[3]) }
}

function handleTpsReport(bot, tps) {
  awaitingTps = false
  clearTimeout(tpsReplyTimer)
  console.log(`[TPS] 服务器 TPS: min ${tps.min} / med ${tps.med} / max ${tps.max}`)
  if (tps.min < TPS_MIN_THRESHOLD) goOfflineForLowTps(bot, tps.min)
}

// TPS 太低：主动下线 5 分钟，然后再上线
function goOfflineForLowTps(bot, tpsMin) {
  if (offlineTimer) return
  console.log(`[TPS] min ${tpsMin} 低于 ${TPS_MIN_THRESHOLD}，主动下线 ${TPS_OFFLINE_MS / 60000} 分钟...`)
  plannedOfflineUntil = Date.now() + TPS_OFFLINE_MS
  offlineTimer = setTimeout(() => {
    offlineTimer = null
    plannedOfflineUntil = 0
    console.log('[TPS] 下线结束，退出进程让管理器重新上线...')
    process.exit(1)      // 管理器会重新拉起一个全新的 afkbot
  }, TPS_OFFLINE_MS)
  try {
    bot.quit('tps low')
  } catch (err) {
    console.error('[TPS] 下线失败:', err.message)
  }
}

/* ============================================================
 * 定时发言（时间戳写进文件，afkbot 被管理器重启也不会漏发）
 *   原来的 setInterval 一重启就清零，所以 60 分钟 / 1000 分钟的广告永远发不出来。
 *   现在改成：每次启动读文件，算“距离上次发送过了多久”，
 *   到点就补发一次（只补一次，不会因为离线太久刷屏），然后把新时间写回文件。
 * ============================================================ */
// 数据文件都用 __dirname 定位：不管从哪个目录启动，读写都落在项目文件夹里
const TIMER_STATE_FILE = path.join(__dirname, 'afk_timers.json')

const CHAT_TIMERS = [
  {
    key: 'ads',
    everyMs: 60 * 60 * 1000,           // 每 60 分钟
    name: '两条广告',
    send: (bot) => {
      bot.chat('向我付款30w(/pay TenkyuCh1mata 300000)即可获得VIP享特权！')
      bot.chat('今天买买币，明天上榜一！出游戏币1:150w，加Q：2186594020，享最大利润！')
    },
  },
  {
    key: 'checkin',
    everyMs: 1000 * 60 * 1000,         // 每 1000 分钟
    name: '签到提示',
    send: (bot) => {
      bot.chat('输入 $签到 以获得奖励！--- Type $CheckIn to check in and get rewards!')
    },
  },
  {
    key: 'pm',
    everyMs: 3 * 60 * 1000,            // 每 3 分钟
    name: '/pm',
    send: (bot) => bot.chat('/pm'),
  },
]

let currentBot = null
let chatTimerState = {}

function loadChatTimerState() {
  try {
    return JSON.parse(fs.readFileSync(TIMER_STATE_FILE, 'utf8'))
  } catch (err) {
    return {}
  }
}

function saveChatTimerState() {
  try {
    fs.writeFileSync(TIMER_STATE_FILE, JSON.stringify(chatTimerState), 'utf8')
  } catch (err) {
    console.error('定时发言状态保存失败:', err.message)
  }
}

// 能不能发言：进服并且底层聊天通道可用（没进服时 bot._client.chat 不存在）
function canChat(bot) {
  return !!bot && !!bot.entity && !!bot._client && typeof bot._client.chat === 'function'
}

function checkChatTimers() {
  const bot = currentBot
  if (!canChat(bot)) return

  const now = Date.now()
  let changed = false
  for (const timer of CHAT_TIMERS) {
    const last = chatTimerState[timer.key]
    if (typeof last !== 'number') {
      chatTimerState[timer.key] = now
      changed = true
      continue
    }
    if (now - last < timer.everyMs) continue

    try {
      timer.send(bot)
      chatTimerState[timer.key] = now
      changed = true
      console.log(`[定时] 已发送${timer.name}（距离上次 ${Math.round((now - last) / 60000)} 分钟）`)
    } catch (err) {
      console.error(`[定时] 发送${timer.name}失败: ${err.message}`)
    }
  }
  if (changed) saveChatTimerState()
}

// 初始化：文件里没有记录的定时器，以当前时间为起点（也就是 60 分钟后才会第一次发广告）
chatTimerState = loadChatTimerState()
for (const timer of CHAT_TIMERS) {
  if (typeof chatTimerState[timer.key] !== 'number') chatTimerState[timer.key] = Date.now()
}
saveChatTimerState()

// 每 15 秒检查一次（只在模块加载时建一次，重连不会重复叠加）
setInterval(checkChatTimers, 15000)

function createBot() {
  const bot = mineflayer.createBot({
  host: 'wolfx.jp',
  username: 'afkbot',
  // password: 'Sacramouche114514',
  // port: 25565,
  version: '1.20.1',
  auth: 'microsoft'
})

bot.on('end', () => {
  // 因为 TPS 低而主动下线：这期间不重启进程，等下线时间到了再退出进程重新上线
  if (Date.now() < plannedOfflineUntil) return
  restartProcess('连接已断开')
})

bot.on('message', (message) => {
  const timestamp = new Date().toLocaleTimeString()
  console.log(`[${timestamp}] ${message.toAnsi()}`)

  // /tps 的服务器报告：抓 min / med / max
  if (awaitingTps) {
    const tps = parseTpsReport(message.toString())
    if (tps) handleTpsReport(bot, tps)
  }
})

// 每 5 分钟查一次服务器 TPS
setInterval(() => requestTps(bot), TPS_CHECK_INTERVAL_MS)

bot.once('spawn', () => {
  for (const key in bot.entity.metadata) {
    if (key.startsWith('generic.knockback_resistance')) {
      bot.entity.metadata[key].value = 1.0
      break
    }
  }
})

bot.once('spawn', async () => {
  bot.chat('/res tp dyyz')
  await sleep(1500)
  bot.on('playerJoined', (player) => {
    if (blacklist.includes(player.username)) {
      return
    } else if (whitelist.includes(player.username)) {
      if (oplist.includes(player.username)) {
        if (player.username === 'Rikka_12479'){
          bot.chat(`${player.username} 上线咯，主人好\\(^o^)/~`)
        } else if (player.username === 'AEddyQWQ') {
          bot.chat(`${player.username} 上线咯，主人好\\(^o^)/~`)
        } else bot.chat(`尊贵的MVP玩家 ${player.username} 进入了服务器!`)
      } else bot.chat(`尊贵的VIP玩家 ${player.username} 进入了服务器!`)
    } else return
  })

  currentBot = bot
  bot.on('playerLeft', (player) => {
    if (player.username === '__Accelerator__') return
    if (player.username === bot.username) return
    if (player.username === 'Rikka_12479') {
      bot.chat(`${player.username} 下了`)
    } else if (player.username === 'AEddyQWQ') {
      bot.chat(`${player.username} 下了`)
    }
    // 其它普通玩家离开时不再播报
  })
})


bot.once('spawn', () => {
  removeAllOnlinePlayers()
  removeAllTabData()
})

bot.on('playerJoined', async (player) => {
  const newOnlinePlayer = player.username
  await sleep(500)
  addToOnlinePlayers(newOnlinePlayer)
})

bot.on('playerLeft', (player) => {
  const newLeftPlayer = player.username
  removePlayerFromOnlinePlayers(newLeftPlayer)
})

// 定时发言已改为“文件记录 + 到点补发”，见上面 CHAT_TIMERS
// （这样被管理器重启也不会漏发 60 分钟 / 1000 分钟的广告）

 const railgun = [
  '未来さえ置き去りにして',
  '限界など知らない 意味無い',
  'この能力が光散らす',
  'その先に遥かな想いを',
  '歩いてきた この道を',
  '振り返ることしか',
  '出来ないなら',
  '今ここで全てを壊せる',
  '暗闇に堕ちる街並み',
  '人はどこまで',
  '立ち向かえるの',
  '加速するその痛みから',
  '誰かをきっと守れるよ',
  'Looking',
  'The blitz loop this planet to search way',
  'Only my RAILGUN can shoot it 今すぐ',
  '身体中を 光の速さで',
  '駆け巡った 確かな予感',
  '掴め 望むものなら残さず',
  '輝ける自分らしさで',
  '信じてるよ',
  'あの日の誓いを',
  'この瞳に光る涙',
  'それさえも強さになるから',
 ]

 const lyrics = [
  '只因你太美 baby',
  '只因你太美 baby',
  '只因你实在是太美 baby',
  '只因你太美 baby',
  '迎面走来的你让我如此蠢蠢欲动',
  '这种感觉我从未有',
  'Cause I got a crush on you who you',
  '你是我的我是你的谁',
  '再多一眼看一眼就会爆炸',
  '再近一点靠近点快被融化',
  '想要把你占为己有 baby bae',
  '不管走到哪里',
  '都会想起的人是你 you you',
  '我应该拿你怎样',
  'Uh 所有人都在看着你',
  '我的心总是不安',
  'Oh 我现在已病入膏肓',
  'Eh oh',
  '难道真的因你而疯狂吗',
  '我本来不是这种人',
  '因你变成奇怪的人',
  '第一次呀变成这样的我',
  '不管我怎么去否认',
  '只因你太美 baby',
  '只因你太美 baby',
  '只因你实在是太美 baby',
  '只因你太美 baby',
  'Oh eh oh',
  '现在确认地告诉我',
  'Oh eh oh',
  '你到底属于谁',
  'Oh eh oh',
  '现在确认地告诉我',
  'Oh eh oh',
  '你到底属于谁',
  '就是现在告诉我',
  '跟着那节奏 缓缓 make wave',
  '甜蜜的奶油 it&apos;s your birthday cake',
  '男人们的 game call me 你恋人',
  '别被欺骗愉快的 I wanna play',
  '我的脑海每分每秒为你一人沉醉',
  '最迷人让我神魂颠倒是你身上香水',
  'Oh right baby I&apos;m fall in love with you',
  '我的一切你都拿走',
  '只要有你就已足够',
  '我到底应该怎样',
  'Uh 我心里一直很不安',
  '其他男人们的视线',
  'Oh 全都只看着你的脸',
  'Eh oh',
  '难道真的因你而疯狂吗',
  '我本来不是这种人',
  '因你变成奇怪的人',
  '第一次呀变成这样的我',
  '不管我怎么去否认',
  '只因你太美 baby',
  '只因你太美 baby',
  '只因你实在是太美 baby',
  '只因你太美 baby',
  '我愿意把我的全部都给你',
  '我每天在梦里都梦见你',
  '还有我闭着眼睛也能看到你',
  '现在开始我只准你看我',
  'I don&apos;t wanna wake up in dream',
  '我只想看你这是真心话',
  '只因你太美 baby',
  '只因你太美 baby',
  '只因你实在是太美 baby',
  '只因你太美 baby',
  'Oh eh oh',
  '现在确认的告诉我',
  'Oh eh oh',
  '你到底属于谁',
  'Oh eh oh',
  '现在确认的告诉我',
  'Oh eh oh',
  '你到底属于谁就是现在告诉我',
]

let currentLine = 0

function singSong() {
  if (currentLine >= lyrics.length) return
  bot.chat(lyrics[currentLine])
  currentLine ++

  setTimeout(singSong, 2500)
}

let railgunLine = 0

function singRailgun() {
  if (railgunLine >= railgun.length) return

  bot.chat(railgun[railgunLine])
  railgunLine ++

  setTimeout(singRailgun, 2500)
}

function sleep(time){
  return new Promise((resolve) => setTimeout(resolve, time))
}

bot.on('message', async (jsonMsg) => {
  const msg = jsonMsg.toString()
  if (msg.startsWith('从')) {
    const str = msg
    const matchResult = str.match(/从(.+?)收到了\$300,000。/)
    const newWP1 = matchResult
    if (newWP1 && newWP1.length > 1) {
      const newWP = newWP1[1]
      if (isPlayerWhitelisted(newWP)){
        bot.chat(`/msg ${newWP} 您已在vip名单列表中`)
        bot.chat(`/pay ${newWP} 300000`)
      } else {
        addToWhitelist(newWP)
        bot.chat(`${newWP}付款了30w并已被添加到vip名单！`)
      }
    }
  }
  if (msg.startsWith('Balance: ')){
    const bal = msg.replace('Balance: ', '')
    await sleep(100)
    bot.chat(`当前我的余额: ${bal}`)
  }
})

bot.loadPlugin(tpsPlugin)

bot.on('chat', async (username, message) => {
    if (!whitelist.includes(username)) return
    if (username === bot.username) return
    if (message === '$只因你太美')
    singSong()
    if (message === '$only my railgun')
    singRailgun()
    if (message === '$tps')
    bot.chat(`Bot 所在区域 TPS: ${bot.getTps()}`)
})

bot.on('chat', async(username, message) => {
  if (!whitelist.includes(username)) return
  if (username === bot.username) return
  const pingMsg = message.toString()
  if (message.startsWith('$ping')) {
    const pingUsername = pingMsg.replace('$ping ', '')
    if (!isPlayerOnlined(pingUsername)) {
      bot.chat(`/msg ${username} 此玩家可能不在线，如果在线，请重连。`)
    }else {
      const ping = bot.players[pingUsername].ping
      bot.chat(`当前 ${pingUsername} 的延迟是 ${ping}ms.`)
    }
  }
})

const oplist = ['Misaka_12479', 'CRe0lei', 'Love_u_Mengtong', 'skafdkjd', 'Arctic_RG', 'DickytheMicky', '__Accelerator__', 'AEddyQWQ', 'Rikka_12479', 'Satoru_12479']

bot.on('chat', async (username, message) => {
  if (!oplist.includes(username)) return
  if (username === bot.username) return
  if (message === '$bal')
  bot.chat('/bal')
  if (message === '$重连'){
    bot.chat('正在重连')
    await sleep(100)
    bot.quit()
  }
  if (message.startsWith('$viplist add ')) {
    const newPlayer = message.replace('$viplist add ', '')
  if (isPlayerWhitelisted(newPlayer)) {
    bot.chat(`${newPlayer} 已经在vip名单中了！`)
  } else {
    addToWhitelist(newPlayer);
    bot.chat(`${newPlayer} 已被添加到vip名单！`)
  }
  }
  if (message.startsWith('$viplist remove ')) {
    const oldplayer = message.replace('$viplist remove ', '')
    if (isPlayerWhitelisted(oldplayer)) {
      removePlayerFromWhitelist(oldplayer)
    } else bot.chat(`${oldplayer}不在vip名单列表！`)
  }
  if (message.startsWith('$blacklist remove ')) {
    const blacklistoldplayer = message.replace('$blacklist remove ', '')
    if (isPlayerBlacklisted(blacklistoldplayer)) {
      removeFromBlacklist(blacklistoldplayer)
    } else bot.chat('玩家不在黑名单列表！')
  }
  if (message.startsWith('$blacklist add ')) {
    const blacklistnewplayer = message.replace('$blacklist add ', '')
    if (isPlayerBlacklisted(blacklistnewplayer)) {
      bot.chat('玩家已在黑名单列表！')
    } else addToBlacklist(blacklistnewplayer)
  }
  if(message === '$refreshOnlinePlayers') {
    bot.chat('在线玩家列表已刷新！')
  }
  if (username === 'Rikka_12479' || username === 'AEddyQWQ') {
    if (message === '$100w') {
      bot.chat(`/pay ${username} 1000000`)
      bot.chat(`成功转账给 ${username} 1,000,000!`)
    }
    if (message.startsWith('$tpaccept')) {
      const tpacceptPlayer = message.replace('$tpaccept ', '')
      bot.chat(`/tpaccept ${tpacceptPlayer}`)
      bot.chat(`已接受 ${tpacceptPlayer} 的传送请求!`)
    }
  }
  if (message === '$removeAllOnlinePlayers') {
    removeAllOnlinePlayers()
  }
  if (message.startsWith('$res tp')) {
    const residence = message.replace('$res tp ', '')
    bot.chat(`/res tp ${residence}`)
    await sleep(3000)
    bot.chat(`已到达 ${residence} 领地!`)
  }
  if (message.startsWith('$removeTabData')) {
    const removePlayerInTabData = message.replace('$removeTabData ', '')
    removeTabData(removePlayerInTabData)
  }
})

bot.loadPlugin(pathfinder)
const move = Let_it_move(bot)

bot.on('chat', async(username, message) => {
  if (username === 'Rikka_12479' && message.startsWith('$go')) {
    // 同时支持 $goTo <名字> 和 $go <名字>
    const goToPlayer = message.replace(/^\$go(?:To)?\s+/, '').trim()
    const playerInfo = bot.players[goToPlayer]
    const targetEntity = playerInfo && playerInfo.entity
    if (!targetEntity) {
      bot.chat(`找不到目标玩家${goToPlayer}（不在线或不在视野内）!`)
      return
    }
    try {
      bot.chat(`正在前往${goToPlayer}的位置.`)
      bot.creative.startFlying()
      move.relax_time(150)
      move.long_long(8)
      move.fly(new Vec3(targetEntity.position.x, targetEntity.position.y, targetEntity.position.z))
    } catch (err) {
      bot.chat(`前往${goToPlayer}失败: ${err.message}`)
      console.error('$go 执行失败:', err)
    }
  }
  if (username === 'Rikka_12479' && message.startsWith('$res tp')) {
    const residence = message.replace('$res tp ', '')
    bot.chat(`/res tp ${residence}`)
    await sleep(3000)
    bot.chat(`已到达 ${residence} 领地!`)
  }
  if (username === 'Rikka_12479' && message.startsWith('$tpa')) {
    const tpaPlayer = message.replace('$tpa ', '')
    bot.chat(`/tpa ${tpaPlayer}`)
    bot.chat('已发送tp请求!')
  }
})

bot.on('spawn', () => {
  setInterval(() => {
    const playerEntity = bot.nearestEntity((entity) => entity.type === 'player')
    if (playerEntity) {
      bot.lookAt(playerEntity.position)
    }
  }, 100)
})

const onlinePlayersFile = path.join(__dirname, 'onlinePlayers.txt')
let onlinePlayers = []

function loadOnlinePlayers() {
  try {
    const data = fs.readFileSync(onlinePlayersFile, 'utf8')
    onlinePlayers = data.split('\n').map(player => player.trim())
  } catch (err) {
    console.error('无法读取在线玩家名单文件:', err)
  }
}

function updateOnlinePlayersFile() {
  try {
    fs.writeFileSync(onlinePlayersFile, onlinePlayers.join('\n'), 'utf8')
    console.log('在线玩家名单已更新！')
  } catch (err) {
    console.error('无法更新在线玩家名单文件:', err)
  }
}

function saveOnlinePlayers() {
  try {
    const data = onlinePlayers.join('\n');
    fs.writeFileSync(onlinePlayersFile, data, 'utf8')
    console.log('在线玩家名单已保存到文件:', onlinePlayersFile)
  } catch (err) {
    console.error('无法保存在线玩家名单文件:', err)
  }
}

function addToOnlinePlayers(player) {
  if (onlinePlayers.includes(player)) {
    console.log(`${player} 已经在在线玩家名单中了！`)
  } else {
    onlinePlayers.push(player)
    console.log(`${player} 已被添加到在线玩家名单！`)
    saveOnlinePlayers()
  }
}

function isPlayerOnlined(player) {
  return onlinePlayers.includes(player)
}

loadOnlinePlayers()

function removePlayerFromOnlinePlayers(player) {
  const index = onlinePlayers.indexOf(player)
  if (index !== -1) {
    onlinePlayers.splice(index, 1)
    console.log(`玩家 ${player} 已被移除在线玩家名单！`)
    updateOnlinePlayersFile()
  } else {
    console.log(`玩家 ${player} 不存在于在线玩家名单中！`)
  }
}

function removeAllOnlinePlayers() {
  onlinePlayers.splice(onlinePlayers.forEach)
  updateOnlinePlayersFile()
  console.log('已清除在线玩家列表！')
}

const whitelistFile = path.join(__dirname, 'whitelist.txt')
let whitelist = []

function loadWhitelist() {
  try {
    const data = fs.readFileSync(whitelistFile, 'utf8')
    whitelist = data.split('\n').map(player => player.trim())
  } catch (err) {
    console.error('无法读取vip名单文件:', err)
  }
}

function updateWhitelistFile() {
  try {
    fs.writeFileSync(whitelistFile, whitelist.join('\n'), 'utf8')
    console.log('vip名单已更新！')
  } catch (err) {
    console.error('无法更新vip名单文件:', err)
  }
}

function saveWhitelist() {
  try {
    const data = whitelist.join('\n');
    fs.writeFileSync(whitelistFile, data, 'utf8')
    console.log('vip名单已保存到文件:', whitelistFile)
  } catch (err) {
    console.error('无法保存vip名单文件:', err)
  }
}

function addToWhitelist(player) {
  if (whitelist.includes(player)) {
    console.log(`${player} 已经在vip名单中了！`)
  } else {
    whitelist.push(player)
    console.log(`${player} 已被添加到vip名单！`)
    saveWhitelist()
  }
}

function isPlayerWhitelisted(player) {
  return whitelist.includes(player)
}

loadWhitelist()

function removePlayerFromWhitelist(player) {
  const index = whitelist.indexOf(player)
  if (index !== -1) {
    whitelist.splice(index, 1)
    bot.chat(`玩家 ${player} 已被移除vip名单！`)
    updateWhitelistFile()
  } else {
    bot.chat(`玩家 ${player} 不存在于vip名单中！`)
  }
}

const blacklistFile = path.join(__dirname, 'blacklist.txt')

let blacklist = []

function loadBlacklist() {
  try {
    const data = fs.readFileSync(blacklistFile, 'utf8')
    blacklist = data.split('\n').map(player => player.trim())
  } catch (err) {
    console.error('无法读取黑名单文件:', err)
  }
}

function isPlayerBlacklisted(player) {
  return blacklist.includes(player)
}

function addToBlacklist(player) {
  if (blacklist.includes(player)) {
    bot.chat(`${player} 已经在黑名单中了！`)
  } else {
    blacklist.push(player);
    bot.chat(`${player} 已被添加到黑名单！`)
    saveBlacklist()
  }
}

function removeFromBlacklist(player) {
  const index = blacklist.indexOf(player)
  if (index !== -1) {
    blacklist.splice(index, 1)
    bot.chat(`玩家 ${player} 已被从黑名单中移除！`)
    saveBlacklist()
  } else {
    bot.chat(`玩家 ${player} 不存在于黑名单中！`)
  }
}

function saveBlacklist() {
  try {
    const data = blacklist.join('\n');
    fs.writeFileSync(blacklistFile, data, 'utf8')
    console.log('黑名单已保存到文件:', blacklistFile)
  } catch (err) {
    console.error('无法保存黑名单文件:', err)
  }
}

loadBlacklist()

bot.on('chat', (username, message) => {
    if (username === bot.username) return
    if (blacklist.includes(username)) return
    if (message.includes('如何搬砖'))
    bot.chat(`/msg ${username} 先传送到搬砖领地，购买一背包的砖(皮革、烤马铃薯等)，然后/warp shop 找到对应的商店出售全部的砖，即可完成一趟搬砖。`)
})

const tabFilePath = path.join(__dirname, 'tab.json')

let tabData = {}
try {
  tabData = JSON.parse(fs.readFileSync(tabFilePath, 'utf8'))
} catch (error) {
  console.error('Failed to read tab data:', error)
}

bot.once('spawn', () => {
  setInterval(async () => {
    removeAllTabData()
    await sleep(1000)
    onlinePlayers.forEach((pingPlayer) => {
      const playerPing = bot.players[pingPlayer]?.ping
      tabData[pingPlayer] = playerPing
    })
    saveTabData()
  }, 10000)
})

function saveTabData() {
  const tabJson = JSON.stringify(tabData);
  fs.writeFile(tabFilePath, tabJson, 'utf8', (error) => {
    if (error) {
      console.error('Failed to save tab data:', error)
    }
  })
}

function removeTabData(player) {
  const index = tabData.indexOf(player)
  if (index !== -1) {
    tabData.splice(index, 1)
    console.log(`玩家 ${player} 已被从tab列表移除！`)
  } else {
    console.log(`玩家 ${player} 不存在于tab列表中！`)
  }
}

function removeAllTabData() {
  tabData = {}
}

const signInFilePath = path.join(__dirname, 'check_in_data.json')

let signInData = {}
try {
  signInData = JSON.parse(fs.readFileSync(signInFilePath, 'utf8'))
} catch (error) {
  console.error('Failed to read check-in data:', error)
}

bot.on('chat', (username, message) => {
  const today = moment().format('YYYY-MM-DD')
  let lastSignInDate = signInData[username]
  let reward = 1000
  if (message === '$签nm到') {
    if (lastSignInDate === today) {
      bot.chat(`${username},你今天已经签到过了.`)
    } else {
      if (whitelist.includes(username)) {
       reward = reward + 1000
      }
      signInData[username] = today
      lastSignInDate = today
      saveSignInData()
      bot.chat(`${username} 签到成功，获得了$${reward}`)
      bot.chat(`/pay ${username} ${reward}`)
    }
  }
  if (message === '$CheckIn') {
    if (lastSignInDate === today) {
      bot.chat(`${username},you have already checked in today.`)
    } else {
      if (whitelist.includes(username)) {
       reward = reward + 1000
      }
      signInData[username] = today
      lastSignInDate = today
      saveSignInData()
      bot.chat(`${username} checked in successfully,and you got $${reward} as a reward.`)
      bot.chat(`/pay ${username} ${reward}`)
    }
  }
})

function saveSignInData() {
  const signInJson = JSON.stringify(signInData);
  fs.writeFile(signInFilePath, signInJson, 'utf8', (error) => {
    if (error) {
      console.error('Failed to save check-in data:', error)
    } else {
      console.log('Check-in data saved successfully.')
    }
  })
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

rl.on('line', (input) => {
  bot.chat(input)
})



bot.on('kicked', console.log)
bot.on('error', (err) => {
  console.log(err)
  // 微软登录失败：原地重连没有用，直接退出进程重新登录
  if (/Failed to obtain profile|does the account own minecraft|InvalidCredentials/i.test(err.message || '')) {
    restartProcess('微软登录失败')
  }
})

return bot
}

const bot = createBot()
