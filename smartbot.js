const mineflayer = require('mineflayer')
const pathfinder = require('mineflayer-pathfinder')
const inventoryViewer = require('mineflayer-web-inventory')
const Vec3 = require('vec3')
const { async } = require('plugins/iterators')
const autoeat = require('mineflayer-auto-eat').plugin
const Let_it_move = require('./Let_it_move.js')
const _ = require('lodash')
const { broadcastArgs } = require('@tensorflow/tfjs')
const fs = require('fs')
const readline = require('readline')

function createBot() {
  const bot = mineflayer.createBot({
  host: 'wolfxmc.org',           
  username: 'killaurabot',
 //password: '',
 // port: 25565,       
  version: '1.20.1',           
  auth: 'microsoft'            
})

bot.setMaxListeners(128)

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

rl.on('line', (input) => {
  bot.chat(input)
})

bot.once('spawn', () => {
  bot.creative.startFlying()
})

bot.on('end', () => {
  console.log('连接中断，正在重连...')
  setTimeout(createBot, 5000)
})

bot.once('spawn', () => {
  bot.creative.startFlying()
  for (const key in bot.entity.metadata) {
    if (key.startsWith('generic.knockback_resistance')) {
      bot.entity.metadata[key].value = 1.0
      break
    }
  }
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

function isPlayerOnlined(player) {
  return onlinePlayers.includes(player)
}

loadOnlinePlayers()

bot.on('spawn', async () => {
  await loadOnlinePlayers()
  if (!isPlayerOnlined('Miku_233')) {
    // bot.creative.startFlying()
    bot.chat('/res tp best.pick')
  }
})

bot.once('spawn', async() => {
  await loadOnlinePlayers()
  setInterval(() => {
    loadOnlinePlayers()
    if (isPlayerOnlined('Miku_233')) {
      bot.stopDigging()
      bot.chat('/res tp best.pick.afk')
      sleep(1000).then(() => {
        console.log('检测到屑腐竹在线，搬砖已停止！')
      })
    }
  }, 30000)

  bot.on('playerLeft', (player) => {
    if (player.username === 'Miku_233') {
      // bot.creative.startFlying()
      bot.chat('/res tp best.pick')
      sleep(1000).then(() => {
        console.log('腐竹已下线！搬砖，启动！！！')
      })
    }
  })
})


function dropUnsafeItems() {
  const items = bot.inventory.items()
  const safeItems = ['leather', 'elytra', 'netherite_boots', 'netherite_leggings', 'netherite_helmet', 'diamond_sword', 'netherite_sword'];
  items.forEach(item => {
    if (!safeItems.includes(item.name) && !safeItems.includes(item.type)) {
      bot.tossStack(item)
    }
  })
}

setInterval(dropUnsafeItems, 100)

bot.on('message', async (jsonMsg) => {
  if (jsonMsg == '开始向 best 传送, 在 3 秒内不要移动.'){
    await sleep(25000)
    await bot.clearControlStates()
    bot.chat('/home')
    // buy()
  }
  // if (jsonMsg == '开始向 114514 传送, 在 3 秒内不要移动.'){
  if (jsonMsg == '传送将在3 秒内开始，请不要移动。'){
    await bot.clearControlStates()
    await sleep(5000)
    sell()
  }
  if (jsonMsg == '传送被取消!' || jsonMsg == '待处理的传送请求已取消')
  process.exit()
})

function sleep(time){
  return new Promise((resolve) => setTimeout(resolve, time));
}

async function sell(){
  bot.dig(bot.blockAt(new Vec3(-6727, 68, -6386)))
  await sleep(500)
  bot.chat('/qs amount all')
  bot.chat('/bal')
  bot.chat('/res tp best.pick')
  bot.chat('/pay M1ku_233 10000')
  bot.chat('/bal M1ku_233')
}

const whitelist = ['Misaka_12479']

bot.on('chat', (username, message) => {
  if (username === bot.username) return
  if (!whitelist.includes(username)) return
    if (message === '$tpaccept'){
    bot.chat('/tpaccept')
    bot.chat('已接受传送请求')
  }})

bot.loadPlugin(autoeat)

bot.once('spawn', () => {
  bot.autoEat.options = {
    priority: 'foodPoints',
    startAt: 16,
    bannedFood: []
  }
})

bot.on('autoeat_started', () => {
  console.log('开始自动进食')
})

bot.on('autoeat_stopped', () => {
  console.log('自动进食停止')
})


bot.on('health', () => {
  if (bot.food === 20) bot.autoEat.disable()
  else bot.autoEat.enable()
})

bot.on('message', (message) => {
  const timestamp = new Date().toLocaleTimeString()
  console.log(`[${timestamp}] ${message.toAnsi()}`)
})

bot.on('kicked', console.log)
bot.on('error', console.log)

inventoryViewer(bot)

return bot
}

const bot = createBot()