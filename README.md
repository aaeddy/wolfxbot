# 本 README 文件仅为 painting.js 和 test_projection.js 的说明文档

# Painting Bot

一个使用 Mineflayer 自动在 Minecraft 中建造地图画的机器人，支持根据投影文件进行建造。

## 功能

- 根据投影文件自动计算所需材料
- 自动从箱子获取材料
- 按照投影文件内容进行建造
- 支持 128x128 平面的分区块建造

## 安装

1. 确保已安装 Node.js (推荐 v16 或更高版本)
2. 安装依赖:
   ```bash
   npm install
   ```

## 使用方法

1. 将您的投影文件命名为 `projection.schem` 并放置在项目根目录
2. 修改 `painting.js` 中的以下配置:
   - 服务器地址和端口
   - 材料箱坐标
   - 建造平面起始坐标
3. 启动机器人:
   ```bash
   npm start
   ```

## 配置说明

- `materialChests`: 材料箱坐标列表，每个箱子对应一种颜色的地毯
- `buildStartX`, `buildStartY`, `buildStartZ`: 建造平面的起始坐标

## 注意事项

- 机器人需要有访问材料箱和建造区域的权限
- 投影文件必须是 `.schem` 格式
- 地图画的大小必须是 128x128 像素

## 如何生成 .schem 文件

1. 使用 WorldEdit 插件：
   - 在游戏中使用 //pos1 和 //pos2 命令选择区域
   - 使用 //copy 命令复制选区
   - 使用 //schematic save <文件名> 命令保存为 .schem 文件

2. 使用 MCEdit 工具：
   - 打开 MCEdit 并加载您的世界
   - 选择要导出的区域
   - 点击 "导出选区" 并选择 .schem 格式

3. 使用其他第三方工具：
   - 例如 Litematica (适用于 1.12.2 及更高版本)
   - Schematica (适用于 1.7.10 - 1.12.2)
   - 使用 [Lite2Edit](https://github.com/GoldenDelicios/Lite2Edit/) 将 .litematic 投影文件转换为 .schem 投影文件

## 配置说明

你需要修改以下几个地方：

1. **服务器地址和端口**：
   在文件开头的Bot配置部分，修改`host`和`port`参数：
   ```javascript
   const bot = mineflayer.createBot({
     host: 'localhost',  // 改为新的服务器地址
     port: 25565,       // 改为新的服务器端口
     username: 'testbot',
     version: '1.20.4',
     auth: 'offline'
   });
   ```

2. **建造起始坐标**：
   修改`buildStartPos`变量的值，这是你想要开始建造的位置：
   ```javascript
   const buildStartPos = new Vec3(8, 33, 25);  // 改为新的起始坐标
   ```

3. **容器坐标**：
   修改`materialChests`数组中的各个容器坐标，这些是存放材料的容器位置：
   ```javascript
   const materialChests = [
     { color: 'smooth_stone', pos: new Vec3(93, -60, 21) },  // 改为新的坐标
     { color: 'white_carpet', pos: new Vec3(109, -60, 18) },  // 改为新的坐标
     // ... 其他颜色的容器坐标也需要修改
   ];
   ```

4. **传送点名称**：
   在代码中有几处使用了`/tp`命令传送到特定的传送点，你需要修改这些传送点名称以匹配服务器上的设置：
   ```javascript
   let tpCommand1 = `/tp @s tmpbot2`;  // 改为新的传送点名称
   // ...
   let tpCommand2 = `/tp @s tmpbot`;   // 改为新的传送点名称
   // ...
   let tpCommand = `/tp @s tmpbot`;    // 改为新的传送点名称
   ```

请根据服务器的具体情况修改以上参数。

## 免责声明

本项目部分代码由 AI 工具生成，仅供参考和学习。作者不对其完全准确性和潜在版权问题负责，使用者请自行判断和审查。
