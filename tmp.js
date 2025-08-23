const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');

const bot = mineflayer.createBot({
    host: 'wolfx.jp',
    username: 'paintingbot',
    port: 25565,
    version: '1.20.4',
    auth: 'microsoft'
})

bot.loadPlugin(pathfinder);

bot.on('spawn', async () => {
    bot.chat('/msg AEddyQWQ ok')
    bot.creative.startFlying()
    bot.chat('/res tp hpdth.dth')
    await new Promise(resolve => setTimeout(resolve, 5000)); // 等待5000毫秒
    bot.entity.position.z += 10
    bot.entity.position.x += 10
    await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1000毫秒
})

bot.on('error', (err) => {
  console.log('Bot 发生错误:', err);
});

bot.on('kicked', (reason) => {
  console.log('Bot 被踢出服务器:', reason);
});

bot.on('end', () => {
  console.log('Bot 已断开连接');
});