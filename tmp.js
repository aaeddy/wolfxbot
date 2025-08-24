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
    let dx = 98.96692830848042
    let dz = 1.102110211021102
    // let dx = 64
    // let dz = 64
    // 限制x和z轴单次移动最大32格
    while (Math.abs(dx) > 32 || Math.abs(dz) > 32) {
      // 计算本次移动的距离
      const moveDx = Math.abs(dx) > 32 ? (dx > 0 ? 32 : -32) : dx;
      const moveDz = Math.abs(dz) > 32 ? (dz > 0 ? 32 : -32) : dz;
      
      // 执行移动
      bot.entity.position.x += moveDx;
      await new Promise(resolve => setTimeout(resolve, 10)); // 等待10毫秒
      bot.entity.position.z += moveDz;
      
      // 更新剩余距离
      dx -= moveDx;
      dz -= moveDz;
    }
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