const mineflayer = require('mineflayer');
const fs = require('fs').promises;
const { Schematic } = require('prismarine-schematic');
const { Vec3 } = require('vec3');
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');
const inventoryViewer = require('mineflayer-web-inventory');

let bot;

function createBot () {
  // Bot 配置
  bot = mineflayer.createBot({
    host: 'wolfx.jp',
    port: 25565,
    username: 'paintingbot',
    version: '1.20.4',
    auth: 'microsoft'
  });

  // 加载pathfinder插件
  bot.loadPlugin(pathfinder);

  // 初始化 Web Inventory
  inventoryViewer(bot);

  // 错误处理
  bot.on('error', (err) => {
    console.log('机器人发生错误:', err);
  });

  bot.on('kicked', (reason) => {
    console.log('机器人被踢出服务器:', reason);
  });

  // 断线重连
  bot.on('end', () => {
    console.log('机器人断线，5秒后尝试重连...');
    setTimeout(createBot, 5000);
  });

  // 机器人连接事件
  bot.on('spawn', async () => {
    console.log('机器人已连接到服务器');

    // 开启悬空状态
    bot.creative.startFlying()
    // 丢弃所有物品
    console.log('正在丢弃所有物品...');
    const items = bot.inventory.items();
    for (const item of items) {
      try {
        await bot.toss(item.type, null, item.count);
        console.log(`已丢弃 ${item.count}x ${item.name}`);
      } catch (err) {
        console.log(`丢弃 ${item.name} 失败: ${err.message}`);
      }
    }
    console.log('所有物品已丢弃');

    // 启动实时监控饥饿值
    monitorHunger();
    
    main();
  });

  // 添加更多调试信息
  bot.on('chat', (username, message) => {
    console.log(`${username}: ${message}`);
  });
}

// 建造平面起始坐标
const buildStartPos = new Vec3(37439, 195, 13887);

// 各颜色容器(木桶/箱子)的坐标信息
const materialChests = [
  { color: 'smooth_stone', pos: new Vec3(37520, 90, 13881), type: 'chest' },
  { color: 'white_carpet', pos: new Vec3(37541, 90, 13880), type: 'barrel' },
  { color: 'purple_carpet', pos: new Vec3(37540, 90, 13880), type: 'barrel' },
  { color: 'orange_carpet', pos: new Vec3(37539, 90, 13880), type: 'barrel' },
  { color: 'magenta_carpet', pos: new Vec3(37538, 90, 13880), type: 'barrel' },
  { color: 'light_gray_carpet', pos: new Vec3(37537, 90, 13880), type: 'barrel' },
  { color: 'cyan_carpet', pos: new Vec3(37536, 90, 13880), type: 'barrel' },
  { color: 'light_blue_carpet', pos: new Vec3(37535, 90, 13880), type: 'barrel' },
  { color: 'lime_carpet', pos: new Vec3(37534, 90, 13880), type: 'barrel' },
  { color: 'green_carpet', pos: new Vec3(37533, 90, 13880), type: 'barrel' },
  { color: 'red_carpet', pos: new Vec3(37532, 90, 13880), type: 'barrel' },
  { color: 'yellow_carpet', pos: new Vec3(37531, 90, 13880), type: 'barrel' },
  { color: 'brown_carpet', pos: new Vec3(37530, 90, 13880), type: 'barrel' },
  { color: 'blue_carpet', pos: new Vec3(37529, 90, 13880), type: 'barrel' },
  { color: 'pink_carpet', pos: new Vec3(37528, 90, 13880), type: 'barrel' },
  { color: 'black_carpet', pos: new Vec3(37527, 90, 13880), type: 'barrel' },
  { color: 'gray_carpet', pos: new Vec3(37526, 90, 13880), type: 'barrel' },
  { color: 'food', pos: new Vec3(37518, 90, 13881), type: 'chest', food: true }
];

// 加载投影文件
async function loadSchematic(filePath) {
  try {
    console.log(`尝试加载投影文件: ${filePath}`);
    const data = await fs.readFile(filePath);
    console.log(`文件大小: ${data.length} 字节`);

    // 使用正确的API读取schematic文件
    const schematic = await Schematic.read(data);

    // 检查schematic对象的属性
    console.log('Schematic object:', schematic);

    // 尝试获取尺寸信息的不同方法
    const width = schematic.width || schematic.size?.x || 0;
    const height = schematic.height || schematic.size?.y || 0;
    const length = schematic.length || schematic.size?.z || 0;

    console.log(`投影文件加载成功:`);
    console.log(`  宽度: ${width}`);
    console.log(`  高度: ${height}`);
    console.log(`  长度: ${length}`);

    return {
      schematic,
      width,
      height,
      length
    };
  } catch (err) {
    console.error('加载投影文件失败:', err);
    throw err;
  }
}

// 输出投影文件中的方块信息到txt文件（按区域划分）
async function outputBlockInfoByRegion(schematicData, outputPath) {
  console.log('开始分析投影文件中的方块信息并按区域划分...');
  let blockInfo = '';

  const { schematic, width, height, length } = schematicData;

  // 定义区域大小
  const regionSize = 32;
  const regionsX = Math.ceil(width / regionSize);
  const regionsZ = Math.ceil(length / regionSize);

  // 先处理前128个方块
  let initialBlockCount = 0;
  blockInfo += '=== 前128个方块 ===\n';

  outerLoop: for (let y = 0; y < height; y++) {
    for (let z = 0; z < length; z++) {
      for (let x = 0; x < width; x++) {
        if (initialBlockCount >= 128) {
          break outerLoop;
        }

        const pos = new Vec3(x, y, z);
        const block = schematic.getBlock(pos);

        if (block && block.name !== 'air') {
          blockInfo += `坐标: (${x}, ${y}, ${z}), 方块类型: ${block.name}\n`;
          initialBlockCount++;
        }
      }
    }
  }

  blockInfo += `\n前128个方块处理完成，实际处理了 ${initialBlockCount} 个非空气方块\n\n`;

  // 处理剩余的128x128区域，分为16个32x32的子区域
  blockInfo += '=== 16个32x32子区域信息 ===\n';

  // 遍历每个32x32区域
  for (let rz = 0; rz < regionsZ; rz++) {
    for (let rx = 0; rx < regionsX; rx++) {
      const startX = rx * regionSize;
      const startZ = rz * regionSize + 1;  // Z轴从1开始
      const endX = Math.min(startX + regionSize, width);
      const endZ = Math.min(startZ + regionSize, length + 1);  // 调整结束位置

      // 确保区域在有效范围内
      if (startZ < length) {
        // 计算该区域所需的材料数量
        const materialCount = {};

        // 遍历区域内的每个方块
        for (let y = 0; y < height; y++) {
          for (let z = startZ; z < endZ && z <= length - 1; z++) {  // 确保z不超过length-1
            for (let x = startX; x < endX; x++) {
              // 确保不超出投影文件的实际范围
              if (z <= length - 1) {  // 确保z不超过length-1
                const pos = new Vec3(x, y, z);
                const block = schematic.getBlock(pos);

                if (block && block.name !== 'air') {
                  // 统计材料数量
                  if (materialCount[block.name]) {
                    materialCount[block.name]++;
                  } else {
                    materialCount[block.name] = 1;
                  }
                }
              }
            }
          }
        }

        blockInfo += `\n区域 [${rx},${rz}]: X(${startX}-${endX - 1}), Z(${startZ}-${Math.min(endZ - 1, length - 1)})\n`;
        blockInfo += '所需材料:\n';

        // 输出材料数量
        for (const [blockName, count] of Object.entries(materialCount)) {
          blockInfo += `  ${blockName}: ${count} 个\n`;
        }

        // 遍历区域内的每个方块
        for (let y = 0; y < height; y++) {
          for (let z = startZ; z < endZ && z <= length - 1; z++) {  // 确保z不超过length-1
            for (let x = startX; x < endX; x++) {
              // 确保不超出投影文件的实际范围
              if (z <= length - 1) {  // 确保z不超过length-1
                const pos = new Vec3(x, y, z);
                const block = schematic.getBlock(pos);

                if (block && block.name !== 'air') {
                  blockInfo += `坐标: (${x}, ${y}, ${z}), 方块类型: ${block.name}\n`;
                }
              }
            }
          }
        }
      }
    }
  }

  // 写入文件
  await fs.writeFile(outputPath, blockInfo);
  console.log(`区域方块信息已输出到 ${outputPath}`);
}

// 检查并获取食物
async function checkAndFetchFood() {
  console.log('检查并获取食物...');

  // 查找食物容器
  const foodChestInfo = materialChests.find(chest => chest.food);
  if (!foodChestInfo) {
    console.log('未找到食物容器');
    return;
  }

  // 移动到食物容器附近
  const distance = bot.entity.position.distanceTo(foodChestInfo.pos);
  if (distance > 3) {  // 如果距离大于3格则移动到容器附近
    console.log(`玩家距离食物${foodChestInfo.type}过远 (${distance.toFixed(2)} 格)，移动到食物${foodChestInfo.type}附近: ${foodChestInfo.type} at (${foodChestInfo.pos.x}, ${foodChestInfo.pos.y}, ${foodChestInfo.pos.z})`);

    // 使用pathfinder移动到容器附近
    const goal = new GoalNear(foodChestInfo.pos.x, foodChestInfo.pos.y, foodChestInfo.pos.z, 2); // 移动到距离容器2格范围内

    // 使用Promise来处理pathfinder的移动
    await new Promise((resolve, reject) => {
      // 设置10秒超时
      const timeout = setTimeout(() => {
        bot.pathfinder.stop();
        console.log('移动超时');
        reject(new Error('移动超时'));
      }, 10000);

      // 监听移动完成事件
      bot.once('goal_reached', () => {
        clearTimeout(timeout);
        console.log('已成功移动到食物容器附近');
        resolve();
      });

      // 监听移动失败事件
      bot.once('path_update', (results) => {
        if (results.status === 'noPath') {
          clearTimeout(timeout);
          console.log('无法找到路径到食物容器');
          reject(new Error('无法找到路径到食物容器'));
        }
      });

      // 开始移动
      bot.pathfinder.setGoal(goal);
    }).catch(err => {
      console.log(`移动失败: ${err.message}`);
      return; // 移动失败则跳过
    });
  }

  // 打开食物容器并获取食物
  console.log(`从食物 ${foodChestInfo.type}中获取 cooked_cod`);

  // 查找容器方块
  const chestBlock = bot.blockAt(foodChestInfo.pos);
  if (!chestBlock) {
    console.log(`找不到食物${foodChestInfo.type}方块 at (${foodChestInfo.pos.x}, ${foodChestInfo.pos.y}, ${foodChestInfo.pos.z})`);
    return;
  }

  // 打开容器
  try {
    const chest = await bot.openContainer(chestBlock);

    // 查找食物
    const items = chest.containerItems().filter(item => item.name === 'cooked_cod');
    if (items.length === 0) {
      console.log(`${foodChestInfo.type}中没有找到 cooked_cod`);
      chest.close();
      return;
    }

    // 计算容器中该食物的总数量
    const totalCount = items.reduce((sum, item) => sum + item.count, 0);

    // 计算背包中已有的食物数量
    const inventoryItems = bot.inventory.items().filter(item => item.name === 'cooked_cod');
    const inventoryCount = inventoryItems.reduce((sum, item) => sum + item.count, 0);

    // 计算需要拿取或丢弃的食物数量，保持总数为64
    const targetTotalCount = 64;
    if (inventoryCount < targetTotalCount) {
      // 需要拿取食物
      const neededCount = targetTotalCount - inventoryCount;
      const availableCount = Math.min(totalCount, neededCount);
      
      // 从容器中拿取食物，处理超过64个的情况
      let remainingCount = availableCount;
      while (remainingCount > 0) {
        // 查找还有食物的槽位
        const item = chest.containerItems().find(item => item.name === 'cooked_cod' && item.count > 0);
        if (!item) {
          console.log(`无法找到足够的 cooked_cod，剩余需要 ${remainingCount} 个`);
          break;
        }

        // 计算本次拿取的数量（最多64个）
        const takeCount = Math.min(remainingCount, item.count, 64);

        // 从容器中拿取食物
        await chest.withdraw(item.type, null, takeCount);
        console.log(`成功从食物${foodChestInfo.type}中拿取 ${takeCount} 个 cooked_cod`);

        // 更新剩余需要拿取的数量
        remainingCount -= takeCount;
      }
    } else if (inventoryCount > targetTotalCount) {
      // 需要丢弃多余的食物
      const excessCount = inventoryCount - targetTotalCount;
      console.log(`背包中食物过多，需要丢弃 ${excessCount} 个 cooked_cod`);
      
      let remainingCount = excessCount;
      for (const item of inventoryItems) {
        if (remainingCount <= 0) break;
        
        const discardCount = Math.min(remainingCount, item.count);
        await bot.toss(item.type, null, discardCount);
        console.log(`已丢弃 ${discardCount} 个 cooked_cod`);
        remainingCount -= discardCount;
      }
    }

    // 关闭容器
    chest.close();

    // 等待一段时间确保食物获取完成
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (err) {
    console.log(`打开食物容器或拿取食物失败: ${err.message}`);
  }
}

// 自动进食直到饥饿值满
async function autoEat() {
  console.log('开始自动进食...');

  while (bot.food < 20) {
    // 查找背包中的食物
    const foodItem = bot.inventory.items().find(item => item.name === 'cooked_cod');
    if (!foodItem) {
      console.log('背包中没有食物');
      break;
    }

    try {
      // 装备食物
      await bot.equip(foodItem, 'hand');

      // 激活物品（进食）
      await bot.activateItem();

      console.log(`进食中... 当前饥饿值: ${bot.food}`);

      // 等待一段时间让进食生效
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      console.log(`进食失败: ${err.message}`);
      break;
    }
  }

  console.log(`自动进食完成，当前饥饿值: ${bot.food}`);
}

// 实时监控饥饿值并在需要时自动进食
async function monitorHunger() {
  console.log('开始实时监控饥饿值...');
  while (true) {
    // 检查当前饥饿值，如果低于15则自动进食
    if (bot.food < 15) {
      console.log(`当前饥饿值为 ${bot.food}，需要进食`);
      await autoEat();
    }
    
    // 每5秒检查一次
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

// 从容器(木桶/箱子)中获取材料
async function getMaterialsFromChests(materialCount) {
  console.log('正在从容器(木桶/箱子)中获取建造所需材料...');

  // 传送到hpdth位置
  await new Promise(resolve => setTimeout(resolve, 3000));
  console.log('传送到hpdth位置...');
  let tpCommand1 = `/res tp hpdth`;
  console.log(`执行命令: ${tpCommand1}`);
  bot.chat(tpCommand1);

  // 等待传送完成
  console.log('等待5秒以确保传送完成...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 检查并获取食物
  await checkAndFetchFood();

  // 遍历所有需要的材料
  for (const [blockName, count] of Object.entries(materialCount)) {
    // 查找对应的容器
    let chestInfo = materialChests.find(chest => chest.color === blockName);

    // 如果没有找到精确匹配的容器，尝试查找去掉"_carpet"后缀的匹配
    if (!chestInfo && blockName.endsWith('_carpet')) {
      const baseColor = blockName.slice(0, -7); // 去掉"_carpet"后缀
      chestInfo = materialChests.find(chest => chest.color === baseColor);
    }

    if (chestInfo) {
      // 移动到容器附近
      const distance = bot.entity.position.distanceTo(chestInfo.pos);
      if (distance > 3) {  // 如果距离大于3格则移动到容器附近
        console.log(`玩家距离${chestInfo.type}过远 (${distance.toFixed(2)} 格)，移动到${chestInfo.type}附近: ${chestInfo.color} ${chestInfo.type} at (${chestInfo.pos.x}, ${chestInfo.pos.y}, ${chestInfo.pos.z})`);

        // 使用pathfinder移动到容器附近
        const goal = new GoalNear(chestInfo.pos.x, chestInfo.pos.y, chestInfo.pos.z, 2); // 移动到距离容器2格范围内

        // 使用Promise来处理pathfinder的移动
        await new Promise((resolve, reject) => {
          // 设置10秒超时
          const timeout = setTimeout(() => {
            bot.pathfinder.stop();
            console.log('移动超时');
            reject(new Error('移动超时'));
          }, 10000);

          // 监听移动完成事件
          bot.once('goal_reached', () => {
            clearTimeout(timeout);
            console.log('已成功移动到容器附近');
            resolve();
          });

          // 监听移动失败事件
          bot.once('path_update', (results) => {
            if (results.status === 'noPath') {
              clearTimeout(timeout);
              console.log('无法找到路径到容器');
              reject(new Error('无法找到路径到容器'));
            }
          });

          // 开始移动
          bot.pathfinder.setGoal(goal);
        }).catch(err => {
          console.log(`移动失败: ${err.message}`);
          return; // 移动失败则跳过这个容器
        });
      }

      // 打开容器并获取材料
      console.log(`从 ${chestInfo.color} ${chestInfo.type}中获取 ${count} 个 ${blockName}`);

      // 查找容器方块
      const chestBlock = bot.blockAt(chestInfo.pos);
      if (!chestBlock) {
        console.log(`找不到${chestInfo.type}方块 at (${chestInfo.pos.x}, ${chestInfo.pos.y}, ${chestInfo.pos.z})`);
        continue;
      }

      // 打开容器
      try {
        const chest = await bot.openContainer(chestBlock);

        // 查找需要的物品
        const items = chest.containerItems().filter(item => item.name === blockName);
        if (items.length === 0) {
          console.log(`${chestInfo.type}中没有找到 ${blockName}`);
          chest.close();
          continue;
        }

        // 计算容器中该物品的总数量
        const totalCount = items.reduce((sum, item) => sum + item.count, 0);

        // 检查数量是否足够
        if (totalCount < count) {
          console.log(`${chestInfo.type}中 ${blockName} 数量不足，需要 ${count} 个，但只有 ${totalCount} 个`);
          chest.close();
          continue;
        }

        // 从容器中拿取物品，处理超过64个的情况
        let remainingCount = count;
        while (remainingCount > 0) {
          // 查找还有物品的槽位
          const item = chest.containerItems().find(item => item.name === blockName && item.count > 0);
          if (!item) {
            console.log(`无法找到足够的 ${blockName}，剩余需要 ${remainingCount} 个`);
            break;
          }

          // 计算本次拿取的数量（最多64个）
          const takeCount = Math.min(remainingCount, item.count, 64);

          // 从容器中拿取物品
          await chest.withdraw(item.type, null, takeCount);
          console.log(`成功从${chestInfo.type}中拿取 ${takeCount} 个 ${blockName}`);

          // 更新剩余需要拿取的数量
          remainingCount -= takeCount;
        }

        // 关闭容器
        chest.close();
      } catch (err) {
        console.log(`打开容器或拿取物品失败: ${err.message}`);
      }

      // 添加延迟以避免操作过快
      await new Promise(resolve => setTimeout(resolve, 500));
    } else {
      console.log(`未找到 ${blockName} 对应的容器`);
    }
  }

  // 获取材料完成后传送回搭建平台
  console.log('获取材料完成，传送到搭建平台...');
  // 传送到搭建平台
  await new Promise(resolve => setTimeout(resolve, 3000));
  console.log('传送到搭建平台...');
  let tpCommand2 = `/res tp hpdth.dth`;
  console.log(`执行命令: ${tpCommand2}`);
  bot.chat(tpCommand2);

  // 等待传送完成
  console.log('等待5秒以确保传送完成...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 等待一段时间确保材料获取完成
  console.log('等待5秒以确保材料获取完成...');
  await new Promise(resolve => setTimeout(resolve, 5000));
}

// 建造投影（按区域划分建造）
async function buildWithSetblockByRegion(schematicData, startPos) {
  console.log('开始按区域建造投影...');

  const { schematic, width, height, length } = schematicData;

  // 传送到搭建平台
  await new Promise(resolve => setTimeout(resolve, 3000));
  console.log('传送到hpdth位置...');
  let tpCommand = `/res tp hpdth`;
  console.log(`执行命令: ${tpCommand}`);
  bot.chat(tpCommand);

  // 等待传送完成
  console.log('等待5秒以确保传送完成...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 检查并获取食物
  await checkAndFetchFood();

  // 先建造前128个方块
  console.log('开始建造前128个方块...');
  let initialBlockCount = 0;

  // 计算前128个方块所需的材料数量
  const initialMaterialCount = {};

  outerLoopMaterial: for (let y = 0; y < height; y++) {
    for (let z = 0; z < length; z++) {
      for (let x = 0; x < width; x++) {
        if (initialBlockCount >= 128) {
          break outerLoopMaterial;
        }

        const pos = new Vec3(x, y, z);
        const block = schematic.getBlock(pos);

        if (block && block.name !== 'air') {
          // 统计材料数量
          if (initialMaterialCount[block.name]) {
            initialMaterialCount[block.name]++;
          } else {
            initialMaterialCount[block.name] = 1;
          }
          initialBlockCount++;
        }
      }
    }
  }

  // 从容器(木桶/箱子)中获取前128个方块所需的全部材料
  await getMaterialsFromChests(initialMaterialCount);

  // 重置计数器
  initialBlockCount = 0;

  outerLoop: for (let y = 0; y < height; y++) {
    for (let z = 0; z < length; z++) {
      for (let x = 0; x < width; x++) {
        if (initialBlockCount >= 128) {
          break outerLoop;
        }

        const pos = new Vec3(x, y, z);
        const block = schematic.getBlock(pos);

        if (block && block.name !== 'air') {
          // 计算实际世界坐标
          const worldPos = new Vec3(
            startPos.x + x,
            startPos.y + y,
            startPos.z + z
          );

          // 检查bot是否在方块附近，如果不在则直接移动到方块附近
          const distance = bot.entity.position.distanceTo(worldPos);
          if (distance > 3) {  // 假设3个方块为有效距离
            console.log(`玩家距离方块过远 (${distance.toFixed(2)} 格)，直接移动到方块附近: ${block.name} at (${worldPos.x}, ${worldPos.y}, ${worldPos.z})`);

            // 计算需要移动的距离
            let dx = (worldPos.x - bot.entity.position.x) + 0.5;
            let dy = worldPos.y - bot.entity.position.y;
            let dz = (worldPos.z - bot.entity.position.z) + 0.5;

            console.error(dx, dy, dz)

            // 限制x和z轴单次移动最大32格
            while (Math.abs(dx) > 32 || Math.abs(dz) > 32) {
              // 计算本次移动的距离
              const moveDx = Math.abs(dx) > 32 ? (dx > 0 ? 32 : -32) : dx;
              const moveDz = Math.abs(dz) > 32 ? (dz > 0 ? 32 : -32) : dz;
              
              // 执行移动
              bot.entity.position.x += moveDx;
              bot.entity.position.z += moveDz;
              
              // 更新剩余距离
              dx -= moveDx;
              dz -= moveDz;
              
              // 添加短暂延迟
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // 移动剩余距离
            bot.entity.position.x += dx;
            bot.entity.position.y += dy;
            bot.entity.position.z += dz;
            
            console.log('已成功移动到方块附近');
          }
      
        // 检查目标位置是否已存在方块
        const existingBlock = bot.blockAt(worldPos);
        if (existingBlock && existingBlock.name !== 'air') {
          console.log(`目标位置已存在方块: ${existingBlock.name} at (${worldPos.x}, ${worldPos.y}, ${worldPos.z})，跳过放置`);
          initialBlockCount++; // 即使跳过放置也要增加计数器
          continue; // 跳过当前方块的放置操作
        }
      
        // 使用正常的放置方块方式
        console.log(`放置方块: ${block.name} at (${worldPos.x}, ${worldPos.y}, ${worldPos.z})`);
          // 获取要放置方块位置下方的方块作为参考方块
          const referenceBlock = bot.blockAt(worldPos.offset(0, -1, 0));

          // 检查bot是否站在要放置方块的位置上
          const botPos = bot.entity.position;
          if (Math.floor(botPos.x) === worldPos.x && Math.floor(botPos.y) === worldPos.y && Math.floor(botPos.z) === worldPos.z) {
            console.log('Bot站在要放置方块的位置上，需要执行 vclip 动作');
            // 开启悬空状态
            bot.creative.startFlying()
            // .vclip 1.5
            bot.entity.position.y += 1.5
            // 在悬空状态下放置其脚下方块
            console.log('在悬空状态下放置方块');
          }

          if (referenceBlock) {
            try {
              // 确保手中有正确的方块
              const blockItem = bot.inventory.items().find(item => item.name === block.name);
              if (blockItem) {
                await bot.equip(blockItem, 'hand');
                // 放置方块，使用(0, 1, 0)作为方向向量表示在参考方块上方放置
                await bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
              } else {
                console.log(`背包中没有找到方块: ${block.name}`);
              }
            } catch (err) {
              console.log(`放置方块失败: ${err.message}`);
            }
          } else {
            console.log(`无法找到参考方块 at (${worldPos.x}, ${worldPos.y - 1}, ${worldPos.z})`);
          }
          // 停止悬空状态
          // bot.creative.stopFlying()
          initialBlockCount++;
        }
      }
    }
  }

  console.log(`前128个方块建造完成，实际建造了 ${initialBlockCount} 个方块`);

  // 等待一段时间确保前128个方块建造完成
  console.log('等待5秒以确保前128个方块建造完成...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 定义区域大小
  const regionSize = 32;
  const regionsX = Math.ceil(width / regionSize);
  const regionsZ = Math.ceil(length / regionSize);

  // 按区域依次建造剩余部分
  for (let rz = 0; rz < regionsZ; rz++) {
    for (let rx = 0; rx < regionsX; rx++) {
      const startX = rx * regionSize;
      const startZ = rz * regionSize + 1;  // Z轴从1开始
      const endX = Math.min(startX + regionSize, width);
      const endZ = Math.min(startZ + regionSize, length + 1);  // 调整结束位置

      // 确保区域在有效范围内
      if (startZ < length) {
        // 计算该区域所需的材料数量
        const materialCount = {};

        // 遍历区域内的每个方块
        for (let y = 0; y < height; y++) {
          for (let z = startZ; z < endZ && z <= length - 1; z++) {  // 确保z不超过length-1
            for (let x = startX; x < endX; x++) {
              // 确保不超出投影文件的实际范围
              if (z <= length - 1) {  // 确保z不超过length-1
                const pos = new Vec3(x, y, z);
                const block = schematic.getBlock(pos);

                if (block && block.name !== 'air') {
                  // 统计材料数量
                  if (materialCount[block.name]) {
                    materialCount[block.name]++;
                  } else {
                    materialCount[block.name] = 1;
                  }
                }
              }
            }
          }
        }

        console.log(`开始建造区域 [${rx},${rz}]: X(${startX}-${endX - 1}), Z(${startZ}-${Math.min(endZ - 1, length - 1)})`);

        // 从容器(木桶/箱子)中获取区域所需的全部材料
        await getMaterialsFromChests(materialCount);

        // 遍历区域内的每个方块
        for (let y = 0; y < height; y++) {
          for (let z = startZ; z < endZ && z <= length - 1; z++) {  // 确保z不超过length-1
            for (let x = startX; x < endX; x++) {
              // 确保不超出投影文件的实际范围
              if (z <= length - 1) {  // 确保z不超过length-1
                const pos = new Vec3(x, y, z);
                const block = schematic.getBlock(pos);

                if (block && block.name !== 'air') {
                  // 计算实际世界坐标
                  const worldPos = new Vec3(
                    startPos.x + x,
                    startPos.y + y,
                    startPos.z + z
                  );

                  // 检查bot是否在方块附近，如果不在则直接移动到方块附近
                  const distance = bot.entity.position.distanceTo(worldPos);
                  if (distance > 3) {  // 假设3个方块为有效距离
                    console.log(`玩家距离方块过远 (${distance.toFixed(2)} 格)，直接移动到方块附近: ${block.name} at (${worldPos.x}, ${worldPos.y}, ${worldPos.z})`);

                    // 计算需要移动的距离
                    let dx = (worldPos.x - bot.entity.position.x) + 0.5;
                    let dy = worldPos.y - bot.entity.position.y;
                    let dz = (worldPos.z - bot.entity.position.z) + 0.5;

                    console.error(dx, dy, dz)

                    // 限制x和z轴单次移动最大32格
                    while (Math.abs(dx) > 32 || Math.abs(dz) > 32) {
                      // 计算本次移动的距离
                      const moveDx = Math.abs(dx) > 32 ? (dx > 0 ? 32 : -32) : dx;
                      const moveDz = Math.abs(dz) > 32 ? (dz > 0 ? 32 : -32) : dz;
                      
                      // 执行移动
                      bot.entity.position.x += moveDx;
                      bot.entity.position.z += moveDz;
                      
                      // 更新剩余距离
                      dx -= moveDx;
                      dz -= moveDz;
                      
                      // 添加短暂延迟
                      await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    
                    // 移动剩余距离
                    bot.entity.position.x += dx;
                    bot.entity.position.z += dz;
                    
                    console.log('已成功移动到方块附近');
                  }

                  // 检查目标位置是否已存在方块
                  const existingBlock = bot.blockAt(worldPos);
                  if (existingBlock && existingBlock.name !== 'air') {
                    console.log(`目标位置已存在方块: ${existingBlock.name} at (${worldPos.x}, ${worldPos.y}, ${worldPos.z})，跳过放置`);
                    initialBlockCount++; // 即使跳过放置也要增加计数器
                    continue; // 跳过当前方块的放置操作
                  }

                  // 使用正常的放置方块方式
                  console.log(`放置方块: ${block.name} at (${worldPos.x}, ${worldPos.y}, ${worldPos.z})`);
                  // 获取要放置方块位置下方的方块作为参考方块
                  const referenceBlock = bot.blockAt(worldPos.offset(0, -1, 0));

                  // 检查bot是否站在要放置方块的位置上
                  const botPos = bot.entity.position;
                  if (Math.floor(botPos.x) === worldPos.x && Math.floor(botPos.y) === worldPos.y - 1 && Math.floor(botPos.z) === worldPos.z) {
                    console.log('Bot站在要放置方块的位置上，需要执行 vclip 操作');
                    // 开启悬空状态
                    bot.creative.startFlying()
                    // .vclip 1.5
                    bot.entity.position.y += 1.5
                    // 在悬空状态下放置其脚下方块
                    console.log('在悬空状态下放置方块');
                  }

                  if (referenceBlock) {
                    try {
                      // 确保手中有正确的方块
                      const blockItem = bot.inventory.items().find(item => item.name === block.name);
                      if (blockItem) {
                        await bot.equip(blockItem, 'hand');
                        // 放置方块，使用(0, 1, 0)作为方向向量表示在参考方块上方放置
                        await bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
                        
                        // 检查方块是否放置成功，如果没有则尝试重新放置
                        let placedBlock = bot.blockAt(worldPos);
                        let attempts = 0;
                        const maxAttempts = 3; // 最多尝试3次
                        
                        while ((!placedBlock || placedBlock.name === 'air') && attempts < maxAttempts) {
                          attempts++;
                          console.log(`方块放置失败，尝试重新放置 (${attempts}/${maxAttempts}): ${block.name} at (${worldPos.x}, ${worldPos.y}, ${worldPos.z})`);
                          await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒后重试
                          await bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
                          placedBlock = bot.blockAt(worldPos);
                        }
                        
                        if (placedBlock && placedBlock.name !== 'air') {
                          console.log(`方块放置成功: ${placedBlock.name} at (${worldPos.x}, ${worldPos.y}, ${worldPos.z})`);
                        } else {
                          console.log(`方块放置失败，已达到最大尝试次数: ${block.name} at (${worldPos.x}, ${worldPos.y}, ${worldPos.z})`);
                        }
                      } else {
                        console.log(`背包中没有找到方块: ${block.name}`);
                      }
                    } catch (err) {
                      console.log(`放置方块失败: ${err.message}`);
                    }
                  } else {
                    console.log(`无法找到参考方块 at (${worldPos.x}, ${worldPos.y - 1}, ${worldPos.z})`);
                  }
                  // 停止悬空状态
                  // bot.creative.stopFlying()
                }
              }
            }
          }
        }
      }

      console.log(`区域 [${rx},${rz}] 建造完成`);

      // 丢弃所有非食物物品
      console.log('丢弃所有非食物物品...');
      const items = bot.inventory.items();
      for (const item of items) {
        // 保留食物物品（cooked_cod）
        if (item.name !== 'cooked_cod') {
          try {
            await bot.toss(item.type, null, item.count);
            console.log(`已丢弃 ${item.count}x ${item.name}`);
          } catch (err) {
            console.log(`丢弃 ${item.name} 失败: ${err.message}`);
          }
        }
      }
      console.log('非食物物品已丢弃');

      // 等待一段时间确保该区域建造完成
      console.log(`等待5秒以确保区域 [${rx},${rz}] 建造完成...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// 主函数
async function main() {
  try {
    console.log('开始执行主函数...');
    // 加载投影文件
    const schematicData = await loadSchematic('./projection.schem');

    // 输出方块信息到txt文件（按区域划分）
    await outputBlockInfoByRegion(schematicData, './block_info_output.txt');

    // 等待机器人连接到服务器
    console.log('等待5秒以确保机器人完全连接到服务器...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 按区域建造投影
    await buildWithSetblockByRegion(schematicData, buildStartPos);

    // 退出机器人
    console.log('任务完成，退出机器人');
    bot.quit();
  } catch (err) {
    console.error('执行过程中发生错误:', err);
    bot.quit();
  }
}

// 启动机器人
createBot();