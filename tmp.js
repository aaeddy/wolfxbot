const mineflayer = require('mineflayer')

const bot = mineflayer.createBot({
    host: 'localhost',
    username: 'tmpbot',
    port: 25565,
    version: '1.20.4',
    auth: 'offline'
})

const bot2 = mineflayer.createBot({
    host: 'localhost',
    username: 'tmpbot2',
    port: 25565,
    version: '1.20.4',
    auth: 'offline'
})

bot.on('spawn', async () => {
    bot.chat('/msg AEddyQWQ ok')
})

bot2.on('spawn', async () => {
    bot2.chat('/msg AEddyQWQ ok')
})

bot.on('error', (err) => {
  console.log('Bot 发生错误:', err);
});

bot2.on('error', (err) => {
  console.log('Bot2 发生错误:', err);
});

bot.on('kicked', (reason) => {
  console.log('Bot 被踢出服务器:', reason);
});

bot2.on('kicked', (reason) => {
  console.log('Bot2 被踢出服务器:', reason);
});

bot.on('end', () => {
  console.log('Bot 已断开连接');
});

bot2.on('end', () => {
  console.log('Bot2 已断开连接');
});
