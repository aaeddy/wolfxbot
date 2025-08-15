const mineflayer = require('mineflayer')
const Vec3 = require('vec3')
const { async } = require('plugins/iterators')
const autoeat = require('mineflayer-auto-eat').plugin
const mcData = require('minecraft-data')('1.16.5')
const readline = require('readline')

function createBot() {
const bot = mineflayer.createBot({
    host: 'WolfxMC.org',
    port: 25565,
    username: 'killaurabot',
    auth: 'microsoft',
    version: '1.20'
  })
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  
  rl.on('line', (input) => {
    bot.chat(input)
  })

  bot.on('end', () => {
      console.log('连接中断，正在重连...')
      setTimeout(createBot, 5000)
    })
  
    bot.on('message', (message) => {
      const timestamp = new Date().toLocaleTimeString()
      console.log(`[${timestamp}] ${message.toAnsi()}`)
    })

bot.on('spawn', () => {
  bot.chat('/res tp best.mmo')
  setInterval(async () => {
    const swordItem = bot.inventory.items().find(item => item.name.includes('netherite_sword'))
    if (!swordItem) {
      console.log('No sword found in inventory.')
      return
    }

    const hoglins = Object.values(bot.entities)
      .filter(entity => entity.name === 'hoglin' && bot.entity.position.distanceTo(entity.position) <= 10)
      .sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position))
      .slice(0, 5)

    if (hoglins.length > 0) {
      console.log(`Found ${hoglins.length} hoglins. Attacking the closest ones.`)
      await bot.equip(swordItem, 'hand')
      for (const hoglin of hoglins) {
        await bot.lookAt(hoglin.position.offset(0, hoglin.height, 0))
        bot.attack(hoglin)
      }
    } else {
      console.log('No hoglins in range.')
    }
  }, 780)
})


    bot.loadPlugin(autoeat)
  
    bot.once('spawn', () => {
      bot.autoEat.options = {
        priority: 'foodPoints',
        startAt: 10,
        bannedFood: [],
        offhand: true
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

  return bot
}
const bot = createBot()