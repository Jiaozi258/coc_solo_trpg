# GamePage 重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 GamePage 从三栏布局重构为上下分区布局（地图 + 对话 + 选项），新增 LLM 地点提取管道。

**Architecture:** 后端新增 Location 模型 + LLM 地点提取服务 + API；前端新增 5 个组件（MapArea, CharacterPanel, DialogueBox, OptionGrid, TimelineModal）+ 1 个 store（mapStore），重写 GamePage，修改 Layout。

**Tech Stack:** React 18 + TypeScript + Tailwind CSS v4 + Zustand（前端），Python 3.12+ FastAPI + SQLAlchemy + ChromaDB（后端）

---

### Task 1: LLM Provider — 添加非流式 chat 方法

**Files:**
- Modify: `backend/app/services/llm_adapter.py`

Location extraction 需要一次性的 LLM 调用（非流式）。在 `LLMProvider` 抽象类中添加 `chat` 方法，并在三个 Provider 中实现。

- [ ] **Step 1: 在抽象类添加 `chat` 方法签名**

在 `LLMProvider` 类的 `stream_chat` 方法后添加：

```python
@abstractmethod
async def chat(
    self, system_prompt: str, messages: list[dict], model: str
) -> str:
    ...
```

- [ ] **Step 2: 实现 AnthropicProvider.chat**

在 `AnthropicProvider` 类的 `stream_chat` 方法后添加：

```python
async def chat(
    self, system_prompt: str, messages: list[dict], model: str
) -> str:
    formatted = []
    for m in messages:
        formatted.append({"role": m["role"], "content": m["content"]})
    response = await self.client.messages.create(
        model=model,
        max_tokens=4096,
        system=system_prompt,
        messages=formatted,
    )
    return response.content[0].text
```

- [ ] **Step 3: 实现 OpenAIProvider.chat**

在 `OpenAIProvider` 类的 `stream_chat` 方法后添加：

```python
async def chat(
    self, system_prompt: str, messages: list[dict], model: str
) -> str:
    formatted = [{"role": "system", "content": system_prompt}]
    for m in messages:
        formatted.append({"role": m["role"], "content": m["content"]})
    response = await self.client.chat.completions.create(
        model=model, messages=formatted, max_tokens=4096,
    )
    return response.choices[0].message.content or ""
```

- [ ] **Step 4: 实现 OllamaProvider.chat**

在 `OllamaProvider` 类的 `stream_chat` 方法后添加：

```python
async def chat(
    self, system_prompt: str, messages: list[dict], model: str
) -> str:
    formatted = [{"role": "system", "content": system_prompt}]
    for m in messages:
        formatted.append({"role": m["role"], "content": m["content"]})
    resp = await self.client.post(
        f"{self.base_url}/api/chat",
        json={"model": model, "messages": formatted, "stream": False},
    )
    data = resp.json()
    return data.get("message", {}).get("content", "")
```

- [ ] **Step 5: 验证**

```bash
cd backend && python -c "from app.services.llm_adapter import get_llm_provider; print('OK')"
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/llm_adapter.py
git commit -m "feat: add non-streaming chat method to LLM providers"
```

---

### Task 2: 创建 Location 模型

**Files:**
- Create: `backend/app/models/location.py`

- [ ] **Step 1: 创建模型文件**

```python
import uuid
from sqlalchemy import Column, String, Text, Boolean, Integer, ForeignKey
from sqlalchemy.dialects.sqlite import CHAR
from app.database import Base


class Location(Base):
    __tablename__ = "locations"

    id = Column(CHAR(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    module_id = Column(CHAR(36), ForeignKey("modules.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    parent_id = Column(CHAR(36), ForeignKey("locations.id"), nullable=True)
    description = Column(Text, default="")
    icon_type = Column(String(50), default="generic")
    has_quest = Column(Boolean, default=False)
    sort_order = Column(Integer, default=0)
```

- [ ] **Step 2: 在 database.py 中注册模型（确保被 import）**

检查 `backend/app/models/__init__.py` 是否存在，如果存在则添加 import；否则在 `main.py` lifespan 中 `Base.metadata.create_all` 前确保 Location 被 import。最简单的做法是在 `main.py` 中添加 `from app.models.location import Location`。

先检查 models 目录：

```bash
ls backend/app/models/
```

- [ ] **Step 3: 在 main.py 添加 Location import**

在 `backend/app/main.py` 中，与其他 model import 放在一起：

```python
from app.models.location import Location  # noqa: F401 — 确保 create_all 包含此表
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/location.py backend/app/main.py
git commit -m "feat: add Location model for module map locations"
```

---

### Task 3: 创建地点提取服务

**Files:**
- Create: `backend/app/services/location_extractor.py`

- [ ] **Step 1: 创建提取服务**

```python
import json
from app.services.llm_adapter import get_llm_provider
from app.config import get_settings

LOCATION_EXTRACTION_PROMPT = """你是一个 RPG 游戏模组分析器。请从以下模组文本中提取所有地点，构建地点层级树。

## 要求
1. 识别所有有意义的场景地点（建筑、房间、区域、地标等）
2. 确定地点之间的层级关系（城市包含建筑，建筑包含房间）
3. 为每个地点判断类型: university, church, library, hospital, hotel, mansion, shop, police, office, forest, cave, ruins, generic
4. 判断每个地点是否包含关键任务线索(has_quest: true/false)
5. 按逻辑顺序排列 (sort_order)

## 输出格式
严格按照 JSON 格式输出，不要输出其他内容：
```json
[
  {
    "name": "地点名称",
    "description": "简短描述",
    "icon_type": "university",
    "has_quest": false,
    "sort_order": 0,
    "children": [
      {
        "name": "子地点名称",
        "description": "简短描述",
        "icon_type": "library",
        "has_quest": true,
        "sort_order": 0,
        "children": []
      }
    ]
  }
]
```

模组文本:
{module_text}
"""


class LocationExtractor:
    def __init__(self):
        self.llm = get_llm_provider()
        self.settings = get_settings()

    async def extract_locations(self, module_text: str) -> list[dict]:
        """从模组文本提取地点树。返回可递归存入数据库的 dict 列表。"""
        # 截断文本，避免超出 LLM 上下文
        text = module_text[:12000] if len(module_text) > 12000 else module_text

        prompt = LOCATION_EXTRACTION_PROMPT.format(module_text=text)
        response = await self.llm.chat(
            system_prompt="你是一个专业的 TRPG 模组分析助手。",
            messages=[{"role": "user", "content": prompt}],
            model=self.settings.llm_model,
        )

        # 解析 JSON 响应
        try:
            clean = response.strip()
            if "```json" in clean:
                clean = clean.split("```json")[1].split("```")[0].strip()
            elif "```" in clean:
                clean = clean.split("```")[1].split("```")[0].strip()
            return json.loads(clean)
        except (json.JSONDecodeError, IndexError):
            return []

    async def store_locations(
        self, db, module_id: str, locations: list[dict], parent_id: str | None = None
    ):
        """递归存入 Location 表。"""
        from app.models.location import Location

        for i, loc in enumerate(locations):
            children = loc.pop("children", [])
            record = Location(
                module_id=module_id,
                parent_id=parent_id,
                name=loc["name"],
                description=loc.get("description", ""),
                icon_type=loc.get("icon_type", "generic"),
                has_quest=loc.get("has_quest", False),
                sort_order=loc.get("sort_order", i),
            )
            db.add(record)
            db.flush()  # 获取 record.id 用于子地点

            if children:
                await self.store_locations(db, module_id, children, record.id)


location_extractor = LocationExtractor()
```

- [ ] **Step 2: 验证语法**

```bash
cd backend && python -c "from app.services.location_extractor import location_extractor; print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/location_extractor.py
git commit -m "feat: add LLM-powered location extraction service"
```

---

### Task 4: 创建地点 API + 集成到模组上传

**Files:**
- Create: `backend/app/api/locations.py`
- Modify: `backend/app/api/modules.py` (集成地点提取)
- Modify: `backend/app/main.py` (注册 router)

- [ ] **Step 1: 创建 locations API**

```python
from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.location import Location
from app.api.auth import get_current_user

router = APIRouter(prefix="/api/modules", tags=["locations"])


def _build_location_tree(locations: list[Location], parent_id: str | None = None) -> list[dict]:
    """递归构建地点树。"""
    children = [loc for loc in locations if loc.parent_id == parent_id]
    children.sort(key=lambda x: x.sort_order)
    result = []
    for child in children:
        result.append({
            "id": child.id,
            "name": child.name,
            "description": child.description,
            "icon_type": child.icon_type,
            "has_quest": child.has_quest,
            "sort_order": child.sort_order,
            "children": _build_location_tree(locations, child.id),
        })
    return result


@router.get("/{module_id}/locations")
def get_locations(
    module_id: str,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    get_current_user(token, db)

    locations = db.query(Location).filter(Location.module_id == module_id).all()
    tree = _build_location_tree(locations)
    return {"module_id": module_id, "locations": tree}
```

- [ ] **Step 2: 在 main.py 注册 locations router**

在 `backend/app/main.py` 中，在现有 router include 后添加：

```python
from app.api.locations import router as locations_router
app.include_router(locations_router)
```

- [ ] **Step 3: 在 modules.py 的 upload_module 中集成地点提取**

在 `backend/app/api/modules.py` 的 `upload_module` 函数中，在 `db.refresh(module)` 之后、`return` 之前添加：

```python
    # Extract locations via LLM
    try:
        from app.services.location_extractor import location_extractor
        locations_data = await location_extractor.extract_locations(text)
        if locations_data:
            await location_extractor.store_locations(db, module.id, locations_data)
    except Exception:
        pass  # 地点提取失败不阻断上传
```

注意：该函数当前是 `async def`，添加的 await 调用需要也在 async 上下文中。检查现有 `upload_module` 签名确认是 `async def` —— 它是的，因为用了 `await file.read()`。

- [ ] **Step 4: 验证**

```bash
cd backend && python -c "
from app.main import app
routes = [r.path for r in app.routes if hasattr(r, 'path')]
print([r for r in routes if 'location' in r])
"
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/locations.py backend/app/api/modules.py backend/app/main.py
git commit -m "feat: add locations API endpoint and integrate extraction into module upload"
```

---

### Task 5: 前端 — 新增类型 + API + mapStore

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/store/mapStore.ts`

- [ ] **Step 1: 添加 Location 类型**

在 `frontend/src/types/index.ts` 末尾添加：

```typescript
export interface LocationNode {
  id: string
  name: string
  description: string
  icon_type: string
  has_quest: boolean
  sort_order: number
  children: LocationNode[]
}

export interface LocationTreeResponse {
  module_id: string
  locations: LocationNode[]
}
```

- [ ] **Step 2: 添加 getLocations API**

在 `frontend/src/api/client.ts` 中添加：

```typescript
export const getLocations = (moduleId: string) =>
  api.get(`/modules/${moduleId}/locations`)
```

- [ ] **Step 3: 创建 mapStore**

创建 `frontend/src/store/mapStore.ts`：

```typescript
import { create } from 'zustand'
import type { LocationNode } from '../types'

interface MapState {
  locations: LocationNode[]
  navStack: LocationNode[]
  currentLocations: LocationNode[]
  mapMode: 'world' | 'local'
  isCollapsed: boolean

  setLocations: (tree: LocationNode[]) => void
  navigateTo: (location: LocationNode) => void
  navigateBack: () => void
  toggleMapMode: () => void
  toggleCollapsed: () => void
}

function flattenRoot(tree: LocationNode[]): LocationNode[] {
  return tree
}

export const useMapStore = create<MapState>((set, get) => ({
  locations: [],
  navStack: [],
  currentLocations: [],
  mapMode: 'world',
  isCollapsed: false,

  setLocations: (tree) => {
    set({ locations: tree, currentLocations: tree, navStack: [] })
  },

  navigateTo: (location) => {
    const { navStack, currentLocations, mapMode } = get()
    set({
      navStack: [...navStack, ...currentLocations],
      currentLocations: location.children,
      mapMode: 'local',
    })
  },

  navigateBack: () => {
    const { navStack } = get()
    if (navStack.length === 0) return
    // 简化为返回上一级：恢复到根
    const prev = get().navStack
    // 用 locations 作为后备
    if (prev.length > 0) {
      set({
        navStack: [],
        currentLocations: get().locations,
        mapMode: 'world',
      })
    }
  },

  toggleMapMode: () => {
    set((s) => ({ mapMode: s.mapMode === 'world' ? 'local' : 'world' }))
  },

  toggleCollapsed: () => {
    set((s) => ({ isCollapsed: !s.isCollapsed }))
  },
}))
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/api/client.ts frontend/src/store/mapStore.ts
git commit -m "feat: add Location types, API client, and mapStore"
```

---

### Task 6: 创建 CharacterPanel 组件

**Files:**
- Create: `frontend/src/components/CharacterPanel.tsx`

- [ ] **Step 1: 创建组件**

```typescript
import type { Character, DerivedStats } from '../types'

const ATTR_NAMES = ['STR', 'CON', 'SIZ', 'DEX', 'INT', 'APP', 'POW', 'EDU', 'LUCK'] as const

interface Props {
  show: boolean
  onClose: () => void
  character: Character | null
  derivedStats: DerivedStats | null
}

export default function CharacterPanel({ show, onClose, character, derivedStats }: Props) {
  if (!show || !character) return null

  const stats = derivedStats ?? character.derived_stats

  const StatBar = ({ label, current, max, color }: {
    label: string; current: number; max: number; color: string
  }) => (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-parchment-300">{label}</span>
        <span className={color}>{current} / {max}</span>
      </div>
      <div className="h-2 bg-parchment-950 rounded-full overflow-hidden">
        <div
          className={`h-full ${color === 'text-cthulhu-blood' ? 'bg-cthulhu-blood' : color === 'text-blue-400' ? 'bg-blue-500' : 'bg-purple-500'} transition-all duration-500`}
          style={{ width: `${Math.min(100, (current / Math.max(max, 1)) * 100)}%` }}
        />
      </div>
    </div>
  )

  const activeSkills = character.skills
    ? Object.entries(character.skills).filter(([, v]) => v > 0)
    : []

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-80 bg-parchment-950 border-l border-parchment-700/30 z-50 overflow-y-auto
                      animate-[slideIn_300ms_ease]"
           style={{
             boxShadow: '-4px 0 24px rgba(0,0,0,0.5)',
           }}>
        <div className="p-5">
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="font-display text-xl text-cthulhu-gold">{character.name}</h2>
              <p className="text-sm text-parchment-400">{character.occupation || '无职业'}</p>
            </div>
            <button onClick={onClose} className="parchment-btn text-xs">✕</button>
          </div>

          {/* Status */}
          <div className="parchment-card mb-4">
            <h3 className="text-xs text-parchment-500 mb-2 uppercase tracking-wider">状态</h3>
            <StatBar label="HP" current={stats?.HP_current ?? 0} max={stats?.HP_max ?? 1} color="text-cthulhu-blood" />
            <StatBar label="SAN" current={stats?.SAN_current ?? 0} max={stats?.SAN_max ?? 1} color="text-blue-400" />
            <StatBar label="MP" current={stats?.MP_current ?? 0} max={stats?.MP_max ?? 1} color="text-purple-400" />
          </div>

          {/* Attributes */}
          <div className="parchment-card mb-4">
            <h3 className="text-xs text-parchment-500 mb-2 uppercase tracking-wider">属性</h3>
            <div className="grid grid-cols-3 gap-1 text-sm">
              {ATTR_NAMES.map(a => (
                <div key={a} className="flex justify-between px-1 py-0.5">
                  <span className="text-parchment-400">{a}</span>
                  <span className="text-parchment-200">{character.attributes[a] ?? '?'}</span>
                </div>
              ))}
            </div>
            {stats && (
              <div className="mt-2 pt-2 border-t border-parchment-700/20 grid grid-cols-3 gap-1 text-xs">
                <span className="text-parchment-500">MOV {stats.MOV}</span>
                <span className="text-parchment-500">BUILD {stats.BUILD}</span>
                <span className="text-parchment-500">DODGE {stats.DODGE}</span>
              </div>
            )}
          </div>

          {/* Skills */}
          {activeSkills.length > 0 && (
            <div className="parchment-card mb-4">
              <h3 className="text-xs text-parchment-500 mb-2 uppercase tracking-wider">技能</h3>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {activeSkills.map(([name, val]) => (
                  <div key={name} className="flex justify-between text-sm">
                    <span className="text-parchment-400">{name}</span>
                    <span className="text-parchment-200">{val}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Background */}
          {character.background && (
            <div className="parchment-card">
              <h3 className="text-xs text-parchment-500 mb-2 uppercase tracking-wider">背景</h3>
              <div className="space-y-1 text-xs text-parchment-400">
                {Object.entries(character.background).filter(([, v]) => v).map(([k, v]) => (
                  <p key={k}>{v as string}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: 在 index.css 添加 slideIn 动画**

在 `frontend/src/index.css` 末尾添加：

```css
@keyframes slideIn {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CharacterPanel.tsx frontend/src/index.css
git commit -m "feat: add CharacterPanel slide-out component"
```

---

### Task 7: 创建 MapArea 组件

**Files:**
- Create: `frontend/src/components/MapArea.tsx`

- [ ] **Step 1: 创建 MapArea 组件**

```typescript
import { useEffect, useState } from 'react'
import { useMapStore } from '../store/mapStore'
import { getLocations } from '../api/client'
import type { LocationNode } from '../types'

const ICON_MAP: Record<string, string> = {
  university: '🏛', church: '⛪', library: '📚', hospital: '🏥',
  hotel: '🏨', mansion: '🏰', shop: '🏪', police: '🏛',
  office: '🏢', forest: '🌲', cave: '🕳', ruins: '🏚',
  generic: '📍',
}

interface Props {
  moduleId: string | undefined
}

export default function MapArea({ moduleId }: Props) {
  const {
    currentLocations, navStack, mapMode, isCollapsed,
    navigateTo, navigateBack, toggleMapMode, toggleCollapsed, setLocations,
  } = useMapStore()
  const [loaded, setLoaded] = useState(false)

  // 加载地点数据
  useEffect(() => {
    if (!moduleId || loaded) return
    getLocations(moduleId).then(r => {
      setLocations(r.data.locations)
      setLoaded(true)
    }).catch(() => {})
  }, [moduleId, loaded, setLocations])

  const hasParent = navStack.length > 0

  return (
    <div className={`border-b border-parchment-700/30 bg-parchment-950/80 transition-all duration-300 ${
      isCollapsed ? 'h-10' : 'min-h-[180px]'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-parchment-700/20">
        <div className="flex items-center gap-3">
          <span className="font-display text-cthulhu-gold text-sm">📍 地图</span>
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-xs text-parchment-500">
            {hasParent && (
              <button onClick={navigateBack} className="hover:text-cthulhu-gold transition-colors">
                ← 返回上层
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleMapMode} className="parchment-btn text-xs">
            {mapMode === 'world' ? '🌍 大地图' : '🗺️ 小地图'}
          </button>
          <button onClick={toggleCollapsed} className="parchment-btn text-xs">
            {isCollapsed ? '▼' : '▲'}
          </button>
        </div>
      </div>

      {/* Map Content */}
      {!isCollapsed && (
        <div className="p-4">
          {currentLocations.length === 0 ? (
            <div className="text-center py-8 text-parchment-600 text-sm">
              暂无地点数据 — 上传模组后 AI 将自动提取地点信息
            </div>
          ) : mapMode === 'world' ? (
            /* 大地图：地点图标网格 */
            <div className="flex flex-wrap gap-4 justify-center">
              {currentLocations.map(loc => (
                <button
                  key={loc.id}
                  onClick={() => loc.children.length > 0 && navigateTo(loc)}
                  className="group flex flex-col items-center gap-1 p-3 rounded-lg
                             hover:bg-parchment-800/40 transition-all duration-200
                             hover:scale-110"
                  title={loc.description || loc.name}
                >
                  <span className="text-3xl transition-transform duration-200
                                   group-hover:scale-125 group-hover:drop-shadow-[0_0_8px_rgba(201,168,76,0.5)]">
                    {ICON_MAP[loc.icon_type] || ICON_MAP.generic}
                  </span>
                  <span className="text-xs text-parchment-300 group-hover:text-cthulhu-gold
                                   transition-colors">
                    {loc.name}
                  </span>
                  {loc.children.length > 0 && (
                    <span className="text-[10px] text-parchment-600">({loc.children.length} 处)</span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            /* 小地图：CSS Grid 网格 */
            <div className="grid grid-cols-5 gap-2 max-w-2xl mx-auto">
              {/* 占位空网格 */}
              {Array.from({ length: 25 }).map((_, i) => {
                const loc = currentLocations[i]
                return (
                  <div
                    key={i}
                    className={`aspect-square rounded border border-parchment-700/20
                                flex items-center justify-center text-lg
                                ${loc
                                  ? 'bg-parchment-900/60 cursor-pointer hover:border-cthulhu-gold/40'
                                  : 'bg-parchment-950/40'
                                } transition-colors`}
                    onClick={() => loc && loc.children.length > 0 && navigateTo(loc)}
                    title={loc?.name}
                  >
                    {loc ? (
                      <span className="relative">
                        {ICON_MAP[loc.icon_type] || ICON_MAP.generic}
                        {loc.has_quest && (
                          <span className="absolute -top-1 -right-1 text-xs
                                           text-cthulhu-blood animate-pulse">!</span>
                        )}
                      </span>
                    ) : null}
                  </div>
                )
              })}
              {/* 超出的地点以文本展示 */}
              {currentLocations.length > 25 && (
                <div className="col-span-5 text-center text-xs text-parchment-500 mt-2">
                  ...还有 {currentLocations.length - 25} 个地点
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/MapArea.tsx
git commit -m "feat: add MapArea component with world/local map toggle and location nesting"
```

---

### Task 8: 创建 DialogueBox + OptionGrid 组件

**Files:**
- Create: `frontend/src/components/DialogueBox.tsx`
- Create: `frontend/src/components/OptionGrid.tsx`

- [ ] **Step 1: 创建 DialogueBox**

```typescript
interface Props {
  narrative: string
  isStreaming: boolean
  error: string | null
}

export default function DialogueBox({ narrative, isStreaming, error }: Props) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      {!narrative && !isStreaming && (
        <div className="text-center text-parchment-500 mt-16">
          <p className="text-5xl mb-4">🐙</p>
          <p className="font-display text-lg text-cthulhu-gold">等待行动...</p>
          <p className="text-sm mt-2">选择一个选项或输入指令开始冒险</p>
        </div>
      )}

      {narrative && (
        <div className="parchment-card max-w-3xl mx-auto">
          <div className="text-parchment-200 leading-relaxed whitespace-pre-wrap font-body text-base">
            {narrative}
            {isStreaming && (
              <span className="animate-pulse text-cthulhu-gold font-bold">▌</span>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="parchment-card max-w-3xl mx-auto mt-4 border-cthulhu-blood/50">
          <p className="text-cthulhu-blood text-sm">错误: {error}</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 创建 OptionGrid**

```typescript
interface Props {
  options: string[]
  isStreaming: boolean
  showTextInput: boolean
  showDice: boolean
  pendingDiceRequest: any
  diceResult: any
  rolling: boolean
  textInput: string
  onOptionClick: (option: string) => void
  onDiceRoll: () => void
  onTextSubmit: (e: React.FormEvent) => void
  onTextInputChange: (value: string) => void
  onToggleTextInput: () => void
}

export default function OptionGrid({
  options, isStreaming, showTextInput, showDice, pendingDiceRequest,
  diceResult, rolling, textInput,
  onOptionClick, onDiceRoll, onTextSubmit, onTextInputChange, onToggleTextInput,
}: Props) {
  return (
    <div className="border-t border-parchment-700/30 p-4 bg-parchment-950/90">
      {/* Dice Overlay */}
      {showDice && pendingDiceRequest && (
        <div className="mb-4 parchment-card border-cthulhu-gold/50 text-center max-w-3xl mx-auto">
          <p className="text-cthulhu-gold font-display mb-2">🎲 检定!</p>
          <p className="text-sm text-parchment-300 mb-3">{pendingDiceRequest.explanation}</p>
          {pendingDiceRequest.type === 'skill_check' && (
            <p className="text-xs text-parchment-500 mb-2">
              技能: {pendingDiceRequest.skill} ({pendingDiceRequest.value}%) · 难度: {pendingDiceRequest.difficulty}
            </p>
          )}
          {rolling ? (
            <div className="text-4xl rolling inline-block">🎲</div>
          ) : (
            <button onClick={onDiceRoll} className="parchment-btn text-lg px-8 py-3">
              🎲 掷骰子!
            </button>
          )}
          {diceResult && (
            <div className="mt-3 text-lg font-display text-cthulhu-gold">
              结果: {diceResult.individual.join(' + ')} = {diceResult.total}
            </div>
          )}
        </div>
      )}

      {/* 4 Options */}
      {options.length > 0 && !isStreaming && (
        <div className="grid grid-cols-2 gap-3 max-w-3xl mx-auto mb-3">
          {options.map((opt, i) => (
            <button
              key={i}
              onClick={() => onOptionClick(opt)}
              className="parchment-card text-left hover:border-cthulhu-gold/50 transition-all
                         cursor-pointer text-sm hover:bg-parchment-800/40"
            >
              <span className="text-cthulhu-gold font-display mr-2 text-base">
                {'①②③④'[i]}
              </span>
              {opt}
            </button>
          ))}
        </div>
      )}

      {/* Text Input */}
      <div className="max-w-3xl mx-auto">
        <button
          onClick={onToggleTextInput}
          className="parchment-btn text-xs mb-2"
        >
          {showTextInput ? '📝 关闭输入' : '📝 自由输入'}
        </button>

        {showTextInput && (
          <form onSubmit={onTextSubmit}>
            <input
              type="text"
              value={textInput}
              onChange={e => onTextInputChange(e.target.value)}
              placeholder="输入你的行动..."
              className="parchment-input"
              disabled={isStreaming}
            />
          </form>
        )}
      </div>

      {isStreaming && (
        <div className="text-center text-parchment-500 text-sm animate-pulse mt-3">
          守秘人正在叙述...
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/DialogueBox.tsx frontend/src/components/OptionGrid.tsx
git commit -m "feat: add DialogueBox and OptionGrid components"
```

---

### Task 9: 修改 Layout.tsx (添加【人物】按钮)

**Files:**
- Modify: `frontend/src/components/Layout.tsx`

- [ ] **Step 1: 在 Layout 中新增 prop 支持**

将 Layout 改为接收 `onCharacterClick` prop，当 GamePage 传入时显示【人物】按钮：

```typescript
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

interface Props {
  children: React.ReactNode
  onCharacterClick?: () => void
}

export default function Layout({ children, onCharacterClick }: Props) {
  const { isLoggedIn, username, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-parchment-700/30 bg-parchment-950/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <span className="text-3xl">🐙</span>
            <div>
              <h1 className="text-lg font-display text-cthulhu-gold horror-text">
                克苏鲁的召唤
              </h1>
              <p className="text-xs text-parchment-500 -mt-1">单人跑团模拟器</p>
            </div>
          </Link>

          <nav className="flex items-center gap-4">
            <Link to="/" className="text-sm text-parchment-300 hover:text-cthulhu-gold transition-colors">
              首页
            </Link>
            {isLoggedIn ? (
              <>
                <Link to="/characters" className="text-sm text-parchment-300 hover:text-cthulhu-gold transition-colors">
                  调查员
                </Link>
                {onCharacterClick && (
                  <button
                    onClick={onCharacterClick}
                    className="text-sm text-parchment-300 hover:text-cthulhu-gold transition-colors font-display"
                  >
                    👤 人物
                  </button>
                )}
                <span className="text-sm text-parchment-400">{username}</span>
                <button onClick={handleLogout} className="parchment-btn text-xs">
                  登出
                </button>
              </>
            ) : (
              <Link to="/login" className="parchment-btn text-xs">
                登录
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {children}
      </main>

      <footer className="border-t border-parchment-700/20 py-3 text-center text-xs text-parchment-600">
        Call of Cthulhu is a registered trademark of Chaosium Inc. This is a fan-made simulator.
      </footer>
    </div>
  )
}
```

- [ ] **Step 2: 更新 App.tsx 中 Layout 的调用（暂不需要，GamePage 通过 Context 传递）**

Layout 的 `onCharacterClick` 需要从 GamePage 传入。最简单的方式是用一个轻量 Context：

创建 `frontend/src/store/layoutStore.ts`：

```typescript
import { create } from 'zustand'

interface LayoutState {
  onCharacterClick: (() => void) | null
  setCharacterClick: (fn: (() => void) | null) => void
}

export const useLayoutStore = create<LayoutState>((set) => ({
  onCharacterClick: null,
  setCharacterClick: (fn) => set({ onCharacterClick: fn }),
}))
```

然后在 Layout.tsx 中使用 `useLayoutStore` 而不是 prop。

- [ ] **Step 3: 更新 Layout 使用 layoutStore**

Layout.tsx 中导入并使用 `useLayoutStore`:

```typescript
import { useLayoutStore } from '../store/layoutStore'
// ...
const onCharacterClick = useLayoutStore((s) => s.onCharacterClick)
// 在导航栏中:
{onCharacterClick && (
  <button onClick={onCharacterClick} ...>👤 人物</button>
)}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Layout.tsx frontend/src/store/layoutStore.ts frontend/src/App.tsx
git commit -m "feat: add character button to top nav bar via layoutStore"
```

---

### Task 10: 重写 GamePage.tsx

**Files:**
- Modify: `frontend/src/pages/GamePage.tsx`

- [ ] **Step 1: 重写 GamePage**

用新组件替代旧的内联代码。保留所有业务逻辑（SSE、骰子、回档），仅改变渲染结构：

```typescript
import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useGameStore } from '../store/gameStore'
import { useSSE } from '../hooks/useSSE'
import { useDice } from '../hooks/useDice'
import { getSession } from '../api/client'
import { useLayoutStore } from '../store/layoutStore'
import type { Character } from '../types'

import MapArea from '../components/MapArea'
import CharacterPanel from '../components/CharacterPanel'
import DialogueBox from '../components/DialogueBox'
import OptionGrid from '../components/OptionGrid'
import TimelineModal from '../components/TimelineModal'

export default function GamePage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)!
  const { streamAction, abort } = useSSE()
  const { roll, rolling, result: diceResult, setResult } = useDice()
  const store = useGameStore()
  const setCharacterClick = useLayoutStore((s) => s.setCharacterClick)

  const [character, setCharacter] = useState<Character | null>(null)
  const [showPanel, setShowPanel] = useState(false)
  const [textInput, setTextInput] = useState('')
  const [showTextInput, setShowTextInput] = useState(false)
  const [showTimeline, setShowTimeline] = useState(false)
  const [pendingDiceRequest, setPendingDiceRequest] = useState<any>(null)

  // 注册【人物】按钮
  useEffect(() => {
    setCharacterClick(() => setShowPanel(true))
    return () => setCharacterClick(null)
  }, [setCharacterClick])

  // 加载 session + character
  useEffect(() => {
    if (!sessionId || !token) return
    getSession(sessionId).then(r => {
      if (r.data.character) {
        setCharacter(r.data.character)
        store.setDerivedStats(r.data.character.derived_stats)
      }
    }).catch(console.error)
  }, [sessionId, token])

  // Action handler
  const handleAction = useCallback(async (action: string, diceRes: any = null) => {
    if (!sessionId || !token) return
    store.setStreaming(true)
    store.setError(null)
    store.resetNarrative()
    store.setOptions([])

    streamAction(sessionId, action, token, diceRes, {
      onNarrative: (text) => store.appendNarrative(text),
      onOptions: (opts) => store.setOptions(opts),
      onDiceRequest: (req) => {
        store.setDiceRequest(req)
        setPendingDiceRequest(req)
      },
      onStatusUpdate: (update) => store.applyStatusUpdate(update),
      onDone: () => store.setStreaming(false),
      onError: (err) => {
        store.setError(err)
        store.setStreaming(false)
      },
    })
  }, [sessionId, token, streamAction, store])

  const handleDiceRoll = () => {
    if (!pendingDiceRequest) return
    const result = roll(pendingDiceRequest)
    const req = pendingDiceRequest
    setPendingDiceRequest(null)
    setTimeout(() => {
      store.setDiceResult(result)
      handleAction(`[掷骰结果: ${result.total}，骰值: ${result.individual.join(', ')}]`, result)
    }, 1500)
  }

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!textInput.trim()) return
    handleAction(textInput)
    setTextInput('')
  }

  return (
    <div className="flex flex-col flex-1">
      {/* Map Area — 顶部全宽 */}
      <MapArea moduleId={moduleId} />

      {/* Dialogue — 中部弹性区域 */}
      <DialogueBox
        narrative={store.narrative}
        isStreaming={store.isStreaming}
        error={store.error}
      />

      {/* Options — 底部 */}
      <OptionGrid
        options={store.options}
        isStreaming={store.isStreaming}
        showTextInput={showTextInput}
        showDice={store.showDice}
        pendingDiceRequest={pendingDiceRequest}
        diceResult={diceResult}
        rolling={rolling}
        textInput={textInput}
        onOptionClick={handleAction}
        onDiceRoll={handleDiceRoll}
        onTextSubmit={handleTextSubmit}
        onTextInputChange={setTextInput}
        onToggleTextInput={() => setShowTextInput(!showTextInput)}
      />

      {/* Character Panel */}
      <CharacterPanel
        show={showPanel}
        onClose={() => setShowPanel(false)}
        character={character}
        derivedStats={store.derivedStats}
      />

      {/* Timeline Modal */}
      <TimelineModal
        show={showTimeline}
        onClose={() => setShowTimeline(false)}
        sessionId={sessionId!}
      />
    </div>
  )
}
```

注意：GamePage 需要 session 的 module_id 传给 MapArea。`character` 是从 session API 获取的，但 session 本身也有 `module_id`。需要在加载 session 时同时获取 module_id。

修复：在 `getSession` 返回的数据中包含 `module_id`，保存到 state：

```typescript
const [moduleId, setModuleId] = useState<string>()

// In loadSession:
getSession(sessionId).then(r => {
  if (r.data.character) {
    setCharacter(r.data.character)
    store.setDerivedStats(r.data.character.derived_stats)
  }
  setModuleId(r.data.module_id)
}).catch(console.error)

// Pass to MapArea:
<MapArea moduleId={moduleId} />
```

- [ ] **Step 2: 确认后端 GET /api/sessions/{id} 返回 module_id**

检查 `backend/app/api/sessions.py:80-90`，确认返回的 dict 包含 `module_id`。当前代码：

```python
return {
    "id": session.id,
    "user_id": session.user_id,
    "module_id": session.module_id,
    ...
}
```

已包含 `module_id`。

- [ ] **Step 3: 创建 TimelineModal 组件**

从 GamePage 中提取时间线弹窗为独立组件 `frontend/src/components/TimelineModal.tsx`：

```typescript
import { useState, useEffect } from 'react'
import { getSnapshots, rollbackSession } from '../api/client'
import type { SessionSnapshot } from '../types'

interface Props {
  show: boolean
  onClose: () => void
  sessionId: string
}

export default function TimelineModal({ show, onClose, sessionId }: Props) {
  const [snapshots, setSnapshots] = useState<SessionSnapshot[]>([])

  useEffect(() => {
    if (!show) return
    getSnapshots(sessionId).then(r => setSnapshots(r.data)).catch(() => {})
  }, [show, sessionId])

  const handleRollback = async (snapshotId: string) => {
    try {
      await rollbackSession(sessionId, snapshotId)
      onClose()
      window.location.reload()
    } catch (err: any) {
      alert('回档失败: ' + err.message)
    }
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="parchment-card w-full max-w-lg max-h-[70vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-display text-cthulhu-gold">⏱️ 时间线 - 选择回档点</h3>
          <button onClick={onClose} className="parchment-btn text-xs">关闭</button>
        </div>
        <div className="space-y-3">
          {snapshots.map(snap => (
            <div key={snap.id} className="parchment-card border border-parchment-700/20 hover:border-cthulhu-gold/30 transition-colors">
              <div className="flex justify-between items-start mb-1">
                <span className="font-display text-cthulhu-gold text-sm">回合 {snap.turn_number}</span>
                <button onClick={() => handleRollback(snap.id)} className="parchment-btn text-xs">
                  回档到此
                </button>
              </div>
              <p className="text-xs text-parchment-400 mb-1">行动: {snap.player_action}</p>
              <p className="text-xs text-parchment-500 line-clamp-2">{snap.narrative_chunk}</p>
            </div>
          ))}
          {snapshots.length === 0 && (
            <p className="text-center text-parchment-500 text-sm">暂无存档记录</p>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 在 GamePage 中添加"历史回档"和"退出"按钮**

在 OptionGrid 组件下方或顶部添加：

```typescript
<div className="flex gap-2 max-w-3xl mx-auto mt-3">
  <button onClick={() => setShowTimeline(true)} className="parchment-btn text-xs">⏱️ 历史回档</button>
  <button onClick={() => navigate('/')} className="parchment-btn text-xs">退出</button>
</div>
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/GamePage.tsx frontend/src/components/TimelineModal.tsx
git commit -m "refactor: rewrite GamePage with new two-zone layout and extracted components"
```

---

### Task 11: 最终 review 和测试

- [ ] **Step 1: 启动后端验证无 import 错误**

```bash
cd backend && python -c "from app.main import app; print('Backend OK, routes:', len(app.routes))"
```

- [ ] **Step 2: 前端类型检查**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: 启动前端开发服务器测试**

```bash
cd frontend && npx vite --port 5173
```

打开浏览器，登录 → 创建角色 → 开始游戏 → 验证：
- [ ] 顶部导航栏显示【人物】按钮
- [ ] 点击【人物】弹出右侧角色面板
- [ ] 地图区域渲染（有数据时显示地点，无数据时显示提示）
- [ ] 大地图/小地图切换
- [ ] 对话区流式显示
- [ ] 4 选项 2x2 网格
- [ ] 骰子检定
- [ ] 时间线回档

---

### 文件变更总览

| 文件 | 操作 |
|------|------|
| `backend/app/services/llm_adapter.py` | 修改 — 添加 `chat()` 方法 |
| `backend/app/models/location.py` | 新建 — Location 模型 |
| `backend/app/services/location_extractor.py` | 新建 — LLM 地点提取 + 递归存储 |
| `backend/app/api/locations.py` | 新建 — 地点 API |
| `backend/app/api/modules.py` | 修改 — 集成地点提取到上传流程 |
| `backend/app/main.py` | 修改 — 注册 locations router + import Location |
| `frontend/src/types/index.ts` | 修改 — 添加 LocationNode 类型 |
| `frontend/src/api/client.ts` | 修改 — 添加 getLocations() |
| `frontend/src/store/mapStore.ts` | 新建 — 地图状态管理 |
| `frontend/src/store/layoutStore.ts` | 新建 — 顶栏按钮状态管理 |
| `frontend/src/components/MapArea.tsx` | 新建 — 地图组件 |
| `frontend/src/components/CharacterPanel.tsx` | 新建 — 角色面板 |
| `frontend/src/components/DialogueBox.tsx` | 新建 — 对话区 |
| `frontend/src/components/OptionGrid.tsx` | 新建 — 选项网格 |
| `frontend/src/components/TimelineModal.tsx` | 新建 — 时间线弹窗 |
| `frontend/src/components/Layout.tsx` | 修改 — 新增【人物】按钮 |
| `frontend/src/pages/GamePage.tsx` | 重写 — 使用新组件的新布局 |
| `frontend/src/index.css` | 修改 — 添加 slideIn 动画 |
