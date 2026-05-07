# GamePage 重构设计规格

**日期**: 2026-05-07
**状态**: 已确认

## 概述

将 GamePage 从三栏布局重构为上下分区布局：
- 顶部全宽地图区域（大地图/小地图切换，支持地点嵌套）
- 中部 NPC 对话/叙述区
- 底部 4 选项 2x2 网格
- 顶栏新增【人物】按钮，点击弹出侧边面板查看角色状态

## 布局结构

```
┌──────────────────────────────────────────────────┐
│  TopBar: 🐙 标题 | 首页 | 调查员 | [人物] | 用户 │
├──────────────────────────────────────────────────┤
│  MapArea: 全宽可折叠地图                           │
│  [大地图/小地图切换]  面包屑导航                     │
│  地点图标网格（悬浮显示名称，点击进入子地图）          │
├──────────────────────────────────────────────────┤
│  DialogueBox: NPC 叙述流式显示                      │
│  羊皮纸卡片样式                                    │
├──────────────────────────────────────────────────┤
│  OptionGrid: 4 选项 2x2 + 文字输入 + 骰子检定       │
└──────────────────────────────────────────────────┘

滑出面板: CharacterPanel（右侧，点击【人物】按钮触发）
弹窗: TimelineModal（历史回档）
```

## 组件规格

### 1. TopBar（修改 Layout.tsx）

- 在导航栏 "调查员" 链接右侧新增 `[人物]` 按钮
- 点击触发右侧滑出面板 `CharacterPanel`
- 仅 GamePage 路由显示此按钮（或始终显示，GamePage 外弹提示）

### 2. MapArea（新组件）

- **两种模式**：
  - 大地图：地点图标网格，悬浮显示名称 tooltip，点击进入子地图
  - 小地图：CSS Grid 网格布局，任务感叹号标记有 quest 的地点
- **地点嵌套**：点击地点向下钻取，顶部面包屑导航返回
- **可折叠**：右上角折叠按钮，折叠后只显示一条窄条，展开恢复
- **数据来源**：`GET /api/modules/{module_id}/locations` 返回地点树
- **状态**：当前层级、历史导航栈

### 3. CharacterPanel（新组件）

- 右侧滑出面板（fixed overlay，带半透明背景遮罩）
- 显示内容：
  - 角色名 / 职业
  - HP/SAN/MP 血条（带数值和百分比）
  - 属性列表 (STR/CON/SIZ/DEX/INT/APP/POW/EDU/LUCK)
  - 技能列表（仅显示有值的技能）
  - 背景故事摘要
  - 状态效果标签（如 "流血"、"疯狂"）
- 数据来源：当前 `character` state + `store.derivedStats`

### 4. DialogueBox

- 羊皮纸卡片样式，内边距充足
- 流式文本输出，光标闪烁动画
- 滚动到底部
- 等待状态：显示占位文本 "等待行动..."

### 5. OptionGrid

- 4 选项 2x2 网格布局
- 选项用 ①②③④ 编号
- 选项下方：文字输入框（可折叠）
- 骰子检定面板（当有 pendingDiceRequest 时显示在选项上方）

### 6. TimelineModal（保留，小幅调整样式）

- 与现有功能一致
- 弹窗居中，半透明黑底遮罩

## 数据流

```
MapArea ← GET /api/modules/{module_id}/locations ← Location 表
CharacterPanel ← character state (已存在于 GamePage) + gameStore.derivedStats
DialogueBox ← gameStore.narrative (SSE 流式)
OptionGrid → handleAction() → SSE → gameStore
           ← gameStore.options
```

## 后端新增

### Location 模型（`backend/app/models/location.py`）

```python
class Location(Base):
    __tablename__ = "locations"
    id = Column(CHAR(36), primary_key=True, default=uuid4)
    module_id = Column(CHAR(36), ForeignKey("modules.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    parent_id = Column(CHAR(36), ForeignKey("locations.id"), nullable=True)
    description = Column(Text, default="")
    icon_type = Column(String(50), default="generic")  # university/church/library/hospital/etc.
    has_quest = Column(Boolean, default=False)
    sort_order = Column(Integer, default=0)
```

### LLM 地点提取（`backend/app/services/location_extractor.py`）

- 模组上传时，在 `upload_module` 中追加调用
- 发送全文给 LLM，要求返回地点 JSON 树
- JSON 格式：`[{name, description, icon_type, children: [...]}]`
- 递归存入 Location 表

### API（`backend/app/api/locations.py`）

- `GET /api/modules/{module_id}/locations` — 返回模块的地点树（嵌套 JSON）

## 前端新增/修改文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/components/Layout.tsx` | 修改 | 导航栏新增【人物】按钮 |
| `src/pages/GamePage.tsx` | 重写 | 新布局：MapArea + DialogueBox + OptionGrid |
| `src/components/MapArea.tsx` | 新建 | 地图组件（大地图/小地图切换 + 地点嵌套） |
| `src/components/CharacterPanel.tsx` | 新建 | 右侧滑出角色状态面板 |
| `src/components/DialogueBox.tsx` | 新建 | NPC 对话/叙述显示 |
| `src/components/OptionGrid.tsx` | 新建 | 4 选项 2x2 + 文字输入 + 骰子 |
| `src/components/TimelineModal.tsx` | 新建 | 从 GamePage 抽取时间线弹窗 |
| `src/store/mapStore.ts` | 新建 | 地图状态管理（当前层级、导航栈、模式切换） |
| `src/api/client.ts` | 修改 | 新增 `getLocations(moduleId)` |
| `src/index.css` | 修改 | 新增地图、面板相关样式 |

## 样式规范

- 保持现有羊皮纸暗色调主题（parchment-950 底色，parchment-900 卡片，cthulhu-gold 强调色）
- 地图图标使用 emoji 或 CSS 绘制，悬浮放大 + 发光效果
- 地点嵌套过渡：简单的淡入淡出
- CharacterPanel 滑出：从右向左 slide，300ms ease
- 响应式：地图区域在移动端全宽堆叠

## 不在范围内

- 地图实际图片渲染（使用 CSS/emoji 图标代替）
- 地点之间的路径/连线可视化
- 多人调查员（companion）管理 UI
- 移动端完整适配（仅保证基本可用）
