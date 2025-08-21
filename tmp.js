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
    // await bot.pathfinder.setGoal(new GoalNear(37441, 193, 13887))
    bot.chat('/sethome')
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