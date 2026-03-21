const mineflayer = require('mineflayer')

const bot = mineflayer.createBot({
  host: 'bangdream.lazyalienserver.top',
  port: 25565,
  username: 'Mutsumi',
  version: '1.21.7',
  auth: 'offline'
})

bot.on('message', (message) => {
  console.log(message.toAnsi())
})

bot.on('spawn', async () => {
  bot.chat('/server survival')
  await new Promise(resolve => setTimeout(resolve, 5000));
  bot.setControlState('sneak', true)
  await new Promise(resolve => setTimeout(resolve, 100));
  bot.setControlState('sneak', false)
})