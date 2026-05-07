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
        text = module_text[:12000] if len(module_text) > 12000 else module_text

        prompt = LOCATION_EXTRACTION_PROMPT.format(module_text=text)
        response = await self.llm.chat(
            system_prompt="你是一个专业的 TRPG 模组分析助手。",
            messages=[{"role": "user", "content": prompt}],
            model=self.settings.llm_model,
        )

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
            db.flush()

            if children:
                await self.store_locations(db, module_id, children, record.id)


location_extractor = LocationExtractor()
