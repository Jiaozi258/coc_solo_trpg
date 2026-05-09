# 克苏鲁的召唤·单人文字跑团模拟器

> Call of Cthulhu Solo TRPG Simulator

一个基于大语言模型的单人桌面角色扮演游戏（TRPG）辅助工具，以《克苏鲁的召唤》（Call of Cthulhu）第7版规则为基础，让玩家通过自然语言与 AI 驱动的守秘人（Keeper）进行文字跑团。该项目是运用claude code开发的vibe—coding学习项目。


---

## 目录

- [功能概览](#功能概览)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [详细说明](#详细说明)
  - [对话模块](#对话模块)
  - [角色卡系统](#角色卡系统)
  - [世界书系统](#世界书系统)
  - [用户自设](#用户自设)
  - [跑团游戏](#跑团游戏)
  - [图片生成](#图片生成)
  - [设置页面](#设置页面)
- [常见问题](#常见问题)
- [开发计划](#开发计划)
- [贡献指南](#贡献指南)
- [免责声明](#免责声明)
- [许可证](#许可证)

---

## 功能概览

### 已实现

- **AI 角色对话** — 支持加载角色卡（Character Card），通过流式 SSE 与 AI 角色进行沉浸式文字角色扮演
- **多 LLM 支持** — 可在设置中切换 Anthropic Claude、OpenAI GPT、DeepSeek 或本地 Ollama 模型
- **SillyTavern PNG 导入** — 支持导入 SillyTavern 格式的 PNG 角色卡，自动提取人设、开场白、对话示例等
- **角色卡管理** — 手动创建或 PNG 导入角色卡，包含性格、背景、人际关系、对话示例、立绘
- **世界书（Lorebook）** — 关键词触发的世界设定系统，AI 自动检索相关条目插入上下文
- **用户自设（Persona）** — 创建和管理多个用户角色设定，AI 可感知你的角色外貌和背景
- **COC 7e 角色创建** — 基于克苏鲁的召唤第7版规则的角色生成器，包含属性掷骰、技能点数分配、职业选择等
- **骰子检定** — 技能检定、伤害掷骰、难度等级判定（常规/困难/极难）
- **PDF 模组解析** — 上传 PDF 模组文件，自动分块并建立向量索引（ChromaDB），供 RAG 检索
- **游戏会话** — 创建跑团会话，绑定角色和模组，支持游戏内存档与读档

## 技术栈

| 层 | 技术 |
|---|------|
| **后端框架** | [FastAPI](https://fastapi.tiangolo.com/) (Python 3.11+) |
| **数据库** | SQLite + [SQLAlchemy](https://www.sqlalchemy.org/) 2.0 ORM |
| **向量数据库** | [ChromaDB](https://www.trychroma.com/) (用于 PDF 模组的 RAG 检索) |
| **LLM 适配** | 统一接口适配 Anthropic / OpenAI / DeepSeek / Ollama |
| **认证** | JWT (python-jose) + bcrypt 密码哈希 |
| **前端框架** | [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| **构建工具** | [Vite 6](https://vitejs.dev/) |
| **CSS** | [Tailwind CSS v4](https://tailwindcss.com/) |
| **状态管理** | [Zustand](https://zustand.docs.pmnd.rs/) |
| **路由** | [React Router v6](https://reactrouter.com/) |
| **3D 渲染** | [Three.js](https://threejs.org/) + [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) |
| **HTTP 客户端** | [Axios](https://axios-http.com/) |

---

## 项目结构

```
├── Start.bat                  # Windows 一键启动脚本
├── backend/                   # Python FastAPI 后端
│   ├── requirements.txt       # Python 依赖
│   ├── .env.example           # 环境变量模板
│   ├── user_settings.json     # 用户设置（运行时生成）
│   └── app/
│       ├── main.py            # FastAPI 入口 + 数据库迁移
│       ├── config.py          # 应用配置
│       ├── database.py        # SQLAlchemy 引擎与会话
│       ├── api/               # API 路由层
│       │   ├── auth.py        # 注册 / 登录 / JWT
│       │   ├── cards.py       # 角色卡 CRUD + PNG 导入 + AI 对话
│       │   ├── characters.py  # COC 调查员角色 CRUD
│       │   ├── sessions.py    # 游戏会话管理
│       │   ├── modules.py     # PDF 模组上传与管理
│       │   ├── locations.py   # 场景地点树
│       │   ├── lorebooks.py   # 世界书 CRUD
│       │   ├── personas.py    # 用户自设 CRUD
│       │   ├── saves.py       # 游戏存档
│       │   └── settings.py    # 用户设置 + 图片生成
│       ├── models/            # SQLAlchemy 数据模型
│       ├── schemas/           # Pydantic 请求/响应模型
│       ├── services/          # 业务逻辑层
│       │   ├── llm_adapter.py           # LLM 提供商统一接口
│       │   ├── rag_service.py           # ChromaDB 向量检索
│       │   ├── character_validator.py   # COC 7e 规则校验
│       │   ├── dice.py                  # 骰子逻辑
│       │   ├── game_loop.py             # 游戏主循环
│       │   ├── location_extractor.py    # 地点提取
│       │   └── pdf_parser.py            # PDF 解析
│       └── utils/
│           └── sse.py         # SSE 流式响应工具
└── frontend/                  # React + TypeScript 前端
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── App.tsx            # 路由配置
        ├── index.css          # 全局样式 + Tailwind
        ├── api/
        │   └── client.ts      # Axios API 客户端
        ├── components/        # 通用组件
        │   ├── Layout.tsx
        │   ├── CharacterPanel.tsx
        │   ├── DialogueBox.tsx
        │   ├── MapArea.tsx
        │   ├── OptionGrid.tsx
        │   ├── QuestSidebar.tsx
        │   ├── ResourceBar.tsx
        │   ├── AshSelect.tsx
        │   ├── ConfirmDialog.tsx
        │   └── Toast.tsx
        ├── hooks/             # 自定义 Hooks
        │   ├── useChatSSE.ts  # SSE 流式聊天
        │   ├── useDice.ts
        │   └── useSSE.ts
        ├── pages/             # 页面组件
        │   ├── HomePage.tsx
        │   ├── GamePage.tsx
        │   ├── CharacterPage.tsx
        │   ├── CardManagePage.tsx
        │   ├── ChatPage.tsx         # AI 角色对话页
        │   ├── LorebookPage.tsx
        │   ├── LorebookEditPage.tsx
        │   └── SettingsPage.tsx
        ├── store/             # Zustand 状态
        │   ├── authStore.ts
        │   └── gameStore.ts
        └── types/
            └── index.ts       # TypeScript 类型定义
```

---

## 快速开始

### 环境要求

- **Python** 3.10+
- **Node.js** 18+

### 方式一：一键启动（推荐）

1. 克隆仓库
   ```bash
   git clone https://github.com/JiaoZi258/coc_solo_trpg.git
   cd coc_solo_trpg
   ```

2. 双击 `Start.bat`

脚本会自动完成：创建 Python 虚拟环境 → 安装后端依赖 → 安装前端依赖 → 启动后端 (port 8770) → 启动前端 (port 5173) → 打开浏览器。首次启动可能需要几分钟下载依赖，请耐心等待。

### 方式二：手动启动

#### 1. 后端

```bash
cd backend

# 创建虚拟环境
python -m venv venv
venv\Scripts\activate   # Windows
# source venv/bin/activate  # macOS / Linux

# 安装依赖
pip install -r requirements.txt

# 复制环境变量模板并编辑（可选）
copy .env.example .env

# 启动后端
uvicorn app.main:app --host 0.0.0.0 --port 8770 --reload
```

后端启动后可访问 http://localhost:8770/docs 查看 API 文档。

#### 2. 前端

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端启动后可访问 http://localhost:5173 使用应用。

### 首次使用

1. 打开浏览器访问 http://localhost:5173
2. 注册一个账号（数据存储在本地 SQLite 数据库）
3. 进入「设置」页面配置 LLM：
   - 选择 AI 模式（云端 / 本地 Ollama）
   - 填入 API Key（如使用 Anthropic / OpenAI / DeepSeek）
   - 选择模型并点击「开始检测」验证连接
   - 点击「保存设置」
4. 回到首页，开始使用

---

## 详细说明

### 对话模块

对话模块是本项目的核心功能之一。玩家可以创建或导入角色卡，然后与 AI 驱动的角色进行沉浸式文字对话。

**主要特性：**
- SSE 流式输出，逐字显示 AI 回复
- 支持 4 档回复长度（短 199-299 字 / 中 399-599 字 / 较长 699-899 字 / 长 999+ 字）
- 实时过滤指令标签，确保 AI 不会在输出中混入控制指令
- 自动存档（每 5 轮对话自动保存一次）
- Token 用量统计显示
- 对话消息的复制和生成图片功能


### 角色卡系统

支持两种创建方式：

1. **手动创建** — 填写角色名称、性格、背景、人际关系、对话示例，上传立绘
2. **PNG 导入** — 支持 SillyTavern / Character Card V2/V3 格式的 PNG 角色卡导入，自动解析 JSON 元数据

系统提示词会将角色设定、对话风格、开场白等注入到 LLM 上下文中，确保 AI 的回复符合角色设定。

### 世界书系统

世界书（Lorebook）是一种可被 AI 自动检索的世界设定数据库：

- **条目管理** — 每条目包含关键词、内容、触发模式、搜索范围、优先级等
- **触发模式** — 支持关键词触发（keyword）、始终触发（always）、手动触发（manual）
- **插入位置** — 可配置条目插入到角色设定之前、之后、或对话之前
- 对话开始前可选择启用的世界书，AI 会根据对话内容自动检索匹配的条目

### 用户自设

玩家可以创建多个自设角色（用户设定），包含姓名、外貌、背景等信息。在对话模块中选中自设后，AI 会感知你的角色设定并据此调整对话风格。

### 跑团游戏

基于 COC 7e 规则的跑团功能：

- **角色创建** — 属性掷骰（3d6 × 5 / 2d6+6 × 5）、职业选择与技能分配、衍生属性计算
- **PDF 模组** — 上传 PDF 规则书或模组，自动分块存入 ChromaDB 向量数据库
- **游戏会话** — 创建会话，绑定角色和模组，AI 守秘人基于模组内容引导跑团
- **骰子检定** — 支持技能检定（常规/困难/极难）和伤害掷骰，含大成功/大失败判定

### 图片生成

对话中可将 AI 回复转为图片：

- 鼠标悬停在任何 AI 角色消息上，点击「生成图片」按钮
- 支持 DALL-E 和 GPT-4o 图片生成
- 需要在设置中单独配置 OpenAI API Key（可与对话 LLM 的 Key 不同）

### 设置页面

所有 LLM 配置集中在图形化设置页面中管理：

- AI 模式选择（Ollama 本地 / 云端 API）
- 云端提供商选择（Anthropic / OpenAI）
- API Key、Base URL、模型名称配置
- 图片生成 API Key
- LLM 连接测试按钮
- 回复长度选择
- Token 用量显示开关

---

## 常见问题

### Q: 后端启动报错 `ImportError` 或 `ModuleNotFoundError`

确保已激活虚拟环境并安装了所有依赖：
```bash
cd backend
venv\Scripts\activate
pip install -r requirements.txt
```

### Q: 前端显示 `ECONNREFUSED` 错误

这表示后端未启动或端口不匹配。检查后端是否在 8770 端口运行（`Start.bat` 使用 8770；手动启动默认使用 8000，需在 `vite.config.ts` 中修改代理目标）。

### Q: AI 回复不遵守角色卡设定

系统提示词已将角色设定放在高优先级位置，但效果受模型能力影响。建议：
- 使用更强的模型（如 Claude Sonnet 4.6 或 GPT-4o）
- 在角色卡的「对话示例」中提供足够丰富的范本
- 适当增加回复长度（较长或长），给 AI 更多发挥空间

### Q: DeepSeek 作为 OpenAI 兼容提供商如何使用

在设置中：
1. 选择「云端 API」
2. 提供商选择「OpenAI」
3. Base URL 填入 `https://api.deepseek.com`
4. API Key 填入 DeepSeek 的 API Key
5. 模型名称填入 `deepseek-chat`（或你使用的具体模型）

### Q: 数据库文件在哪里，如何备份

数据库文件为 `backend/coc_trpg.db`（SQLite）。用户设置存储在 `backend/user_settings.json`。备份这两个文件即可保存所有数据。

---


## 贡献指南

这是一个个人业余项目，代码质量和组织方式都有很大提升空间。如果你有兴趣贡献，我深表感谢：

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建一个 Pull Request


---

## 免责声明

- 本项目是出于对《克苏鲁的召唤》TRPG 的喜爱而开发的非官方辅助工具，与 Chaosium Inc. 无关
- 《Call of Cthulhu》是 Chaosium Inc. 的注册商标
- 本项目不包含任何 COC 规则书的版权内容；PDF 模组解析功能仅用于用户已合法拥有的文件
- AI 生成的内容可能存在不准确、不适当或冒犯性的输出，请使用者自行判断
- 使用在线 LLM API 可能产生费用，请留意各服务提供商的定价政策

---

## 许可证

本项目采用 [MIT License](LICENSE) 开源。

---

*如果您读到了这里，感谢您对这个粗糙的个人项目的关注。如果它能在某个夜晚为您带来一段有趣的克苏鲁跑团体验，那将是我最大的荣幸。愿旧日支配者不会在您的梦里出现。*
