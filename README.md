# 本 README 文件仅为 painting.js 的说明文档

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

## 免责声明

本项目部分代码由 AI 工具生成，仅供参考和学习。作者不对其完全准确性和潜在版权问题负责，使用者请自行判断和审查。
