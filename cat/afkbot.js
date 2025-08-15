const mineflayer = require('mineflayer')
const Vec3 = require('vec3')

function createBot() {
  const bot = mineflayer.createBot({
    host: 'gg.gerhu.com',
    port: '16666',
    username: 'AEddy',
    version: '1.18.2',
  })

function sleep(time){
  return new Promise((resolve) => setTimeout(resolve, time))
}

bot.once('spawn', async () => {
  bot.chat('/login 160052')
  await sleep(1000)
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