const mineflayer = require('mineflayer')
const Vec3 = require('vec3')

function createBot() {
  const bot = mineflayer.createBot({
    host: 'gg.gerhu.com',
    port: '16666',
    username: 'Sweet_catama',
    version: '1.18.2',
  })

function sleep(time){
  return new Promise((resolve) => setTimeout(resolve, time))
}

bot.once('spawn', async () => {
  await sleep(1000)
  bot.chat('/login zcjnigger')
  await sleep(1000)
})

bot.on('spawn', async () => {
  await sleep(2000)
  while(1){
    bot.chat('/home string2')
    await sleep(5000)
    bot.chat('/home shop')
    await sleep(5000)
    bot.dig(bot.blockAt(new Vec3(129, 111, 137)))
    await sleep(250)
    bot.stopDigging()
    bot.chat('/qs amount all')
    bot.chat('/bal AEddy')
    bot.chat('/pay AEddy 100000')
    await sleep(250)
  }
})

bot.on('end', () => {
  console.log('连接中断，正在重连...')
  setTimeout(createBot, 5000)
})

bot.on('message', (message) => {
  const timestamp = new Date().toLocaleTimeString()
  console.log(`[${timestamp}] ${message.toAnsi()}`)
})
}
const bot = createBot()