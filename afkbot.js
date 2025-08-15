const mineflayer = require('mineflayer')
const autoeat = require('mineflayer-auto-eat').plugin
var tpsPlugin = require('mineflayer-tps')(mineflayer)
const { async } = require('plugins/iterators')
const fs = require('fs')
const readline = require('readline')
const moment = require('moment')
const navigatePlugin = require('mineflayer-navigate')
const { pathfinder, Movements } = require('mineflayer-pathfinder')
const GoalNear = require('mineflayer-pathfinder').goals.GoalNear
const Vec3 = require('vec3')
const Let_it_move = require('./Let_it_move.js')
const _ = require('lodash')
const { setInterval } = require('timers')

function createBot() {
  const bot = mineflayer.createBot({
  host: 'wolfxmc.org',
  username: 'afkbot',
  // password: 'Sacramouche114514',
  // port: 25565,
  version: '1.20.1',
  auth: 'microsoft'
})

bot.on('end', () => {
  console.log('连接中断，正在重连...')
  setTimeout(createBot, 5000)
})

bot.on('message', (message) => {
  const timestamp = new Date().toLocaleTimeString()
  console.log(`[${timestamp}] ${message.toAnsi()}`)
})

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
  bot.chat('我来咯(＾－＾)V')
  bot.on('playerJoined', (player) => {
    if (blacklist.includes(player.username)) {
      return
    } else if (whitelist.includes(player.username)) {
      if (oplist.includes(player.username)) {
        if (player.username === 'Misaka_12479'){
          bot.chat(`${player.username} 上线咯，主人好\\(^o^)/~`)
        } else if (player.username === 'Love_u_Mengtong') {
          bot.chat(`${player.username} 上线咯，主人好\\(^o^)/~`)
        } else bot.chat(`尊贵的MVP玩家 ${player.username} 进入了服务器!`)
      } else bot.chat(`尊贵的VIP玩家 ${player.username} 进入了服务器!`)
    } else return
  })
  bot.on('playerLeft', (player) => {
    if (player.username === '__Accelerator__') return
    if (player.username === bot.username) {
     return
    } else if (player.username === 'Misaka_12479'){
      bot.chat(`${player.username} 下了`)
    } else if (player.username === 'Love_u_Mengtong'){
        bot.chat(`${player.username} 下了`)
      } else bot.chat(`${player.username}离开了游戏`)
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

bot.once('spawn', () => {
  setInterval(() => {
   bot.chat('向我付款30w(/pay M1ku_233 300000)即可获得VIP享特权！')
   bot.chat('今天搬搬砖，明天上榜一！res tp best 公益搬砖，享搬砖最大利润！')
 }, 6000000)

 setInterval(() => {
  bot.chat('输入 $签到 以获得奖励！--- Type $CheckIn to check in and get rewards!')
}, 60000000)

  setInterval(() => {
    bot.chat('/pm')
  }, 180000)
})

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
  if (msg.startsWith('余额：')){
    const bal = msg.replace('余额：', '')
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
    bot.chat(`当前服务器tps: ${bot.getTps()}`)
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

const oplist = ['Misaka_12479', 'CRe0lei', 'Love_u_Mengtong', 'skafdkjd', 'Arctic_RG', 'DickytheMicky', '__Accelerator__']

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
  if (username === 'Misaka_12479' || username === 'Love_u_Mengtong') {
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
  if (username === 'Misaka_12479' && message.startsWith('$go')) {
    const goToPlayer = message.replace('$goTo ', '')
    const target = bot.players[goToPlayer]
    if (!target) {
      bot.chat(`找不到目标玩家${goToPlayer}!`)
      return
    }
    bot.chat(`正在前往${goToPlayer}的位置.`)
    bot.creative.startFlying()
    move.relax_time(150)
    move.long_long(8)
    move.fly(new Vec3(target.entity.position.x, target.entity.position.y, target.entity.position.z))
  }
  if (username === 'Misaka_12479' && message.startsWith('$res tp')) {
    const residence = message.replace('$res tp ', '')
    bot.chat(`/res tp ${residence}`)
    await sleep(3000)
    bot.chat(`已到达 ${residence} 领地!`)
  }
  if (username === 'Misaka_12479' && message.startsWith('$tpa')) {
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

const onlinePlayersFile = 'onlinePlayers.txt'
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

const whitelistFile = 'whitelist.txt'
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

const blacklistFile = 'blacklist.txt'

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

const tabFilePath = './tab.json'

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

const signInFilePath = './check_in_data.json'

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
bot.on('error', console.log)

return bot
}

const bot = createBot()