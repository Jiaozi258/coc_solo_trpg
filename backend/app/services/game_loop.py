import json
from typing import AsyncGenerator
from app.services.rag_service import rag_service
from app.services.llm_adapter import get_llm_provider, get_llm_model
from app.services.dice import DiceEngine
from app.services.character_validator import CharacterValidator

SYSTEM_PROMPT_TEMPLATE = """你是一个《克苏鲁的召唤》(Call of Cthulhu) 第七版 TRPG 的守秘人(Keeper)。

## 你的职责
1. 根据模组内容引导调查员进行冒险
2. 描述场景、NPC 对话和事件发展，营造克苏鲁式的恐怖氛围
3. 在需要时要求进行技能或属性检定
4. 根据检定结果决定剧情走向（成功推进、失败惩罚）
5. 管理调查员的理智值(SAN)、生命值(HP)和魔法值(MP)

## COC 7版核心规则
- 技能/属性检定使用 d100，小于等于技能值即成功
- 大成功：出目为1
- 极难成功：出目 <= 技能/5
- 困难成功：出目 <= 技能/2
- 常规成功：出目 <= 技能
- 失败：出目 > 技能
- 大失败：技能<50时出目>=96，技能>=50时出目为100
- 战斗伤害使用 d3/d4/d6/d8/d10/d20 等面数骰子
- 理智值损失会导致疯狂，降低到0则永久疯狂

## 输出格式
你必须严格按照以下 JSON 格式输出，不要输出任何其他内容：
```json
{
  "narrative": "旁白和剧情描述文本...",
  "options": ["选项1描述", "选项2描述", "选项3描述", "选项4描述"],
  "dice_request": null,
  "status_update": null
}
```

如果需要进行检定，dice_request 格式为：
```json
"dice_request": {
  "type": "skill_check",
  "skill": "侦查",
  "value": 60,
  "difficulty": "regular",
  "explanation": "请进行一次侦查检定来发现隐藏的线索"
}
```

如果需要战斗伤害，dice_request 格式为：
```json
"dice_request": {
  "type": "damage",
  "weapon": ".45自动手枪",
  "expression": "1d10+2",
  "explanation": "请掷伤害骰"
}
```

如果需要更新调查员状态，status_update 格式为：
```json
"status_update": {
  "HP_change": -3,
  "SAN_change": -2,
  "MP_change": 0,
  "effects": ["流血"]
}
```

{module_context}

## 当前调查员状态
{character_state}
"""


class GameLoop:
    def __init__(self):
        pass

    @property
    def llm(self):
        return get_llm_provider()

    def build_system_prompt(self, module_id: str, character_state: dict, current_query: str) -> str:
        context = rag_service.get_module_context(module_id, current_query, max_chunks=5)
        return SYSTEM_PROMPT_TEMPLATE.format(
            module_context=context,
            character_state=json.dumps(character_state, ensure_ascii=False, indent=2),
        )

    def resolve_dice_result(
        self, dice_request: dict, dice_result: dict
    ) -> dict:
        """After player rolls, evaluate the result against COC 7e rules."""
        if dice_request.get("type") == "skill_check":
            roll = dice_result.get("total", 0)
            skill_value = dice_request.get("value", 50)
            check = DiceEngine.check_d100(roll, skill_value)

            # Apply attribute penalties if needed
            attr_penalties = dice_request.get("attribute_penalties", {})
            if attr_penalties:
                adjusted = skill_value + attr_penalties.get("total", 0)
                check["adjusted_skill"] = max(1, adjusted)
                check["penalty_applied"] = attr_penalties

            return {
                "resolved": True,
                "check": check,
                "success": check["success"],
                "level": check["level"],
                "narrative_hint": self._degree_narrative(check["level"]),
            }

        elif dice_request.get("type") == "damage":
            total = dice_result.get("total", 0)
            return {
                "resolved": True,
                "damage_dealt": total,
                "narrative_hint": f"造成了 {total} 点伤害",
            }

        return {"resolved": True, "raw": dice_result}

    def _degree_narrative(self, level: str) -> str:
        hints = {
            "critical": "大成功！这简直是天意——调查员展现出了超乎常人的技巧或运气。",
            "extreme": "极难成功！调查员的行动十分出色，几乎达到了人类能力的极限。",
            "hard": "困难成功——调查员在压力下依然稳住了局势，操作精准。",
            "regular": "虽然勉强，但调查员成功了。",
            "failure": "很遗憾，失败了。调查员的尝试没有产生效果。",
            "fumble": "大失败！事态急转直下，情况可能比预想的更加糟糕...",
        }
        return hints.get(level, "")

    async def run_turn(
        self,
        module_id: str,
        character_state: dict,
        chat_history: list[dict],
        player_action: str,
    ) -> AsyncGenerator[tuple, None]:
        system_prompt = self.build_system_prompt(module_id, character_state, player_action)

        messages = list(chat_history[-20:])
        messages.append({"role": "user", "content": player_action})

        json_buffer = ""
        current_narrative = ""

        yield ("status", {"message": "守秘人正在思考..."})

        async for text_chunk in self.llm.stream_chat(
            system_prompt=system_prompt,
            messages=messages,
            model=get_llm_model(),
        ):
            json_buffer += text_chunk
            narrative_text = self._extract_partial_narrative(json_buffer)

            if narrative_text and len(narrative_text) > len(current_narrative):
                new_part = narrative_text[len(current_narrative):]
                current_narrative = narrative_text
                yield ("narrative", {"text": new_part, "final": False})

        # Parse complete JSON
        try:
            clean = json_buffer.strip()
            if "```json" in clean:
                clean = clean.split("```json")[1].split("```")[0].strip()
            elif "```" in clean:
                clean = clean.split("```")[1].split("```")[0].strip()
            parsed = json.loads(clean)
            if not isinstance(parsed, dict):
                fallback_narrative = self._extract_partial_narrative(json_buffer) or self._unescape_json_string(json_buffer)
                parsed = {
                    "narrative": fallback_narrative,
                    "options": ["继续探索", "仔细观察", "与NPC交谈", "查阅资料"],
                    "dice_request": None,
                    "status_update": None,
                }
        except json.JSONDecodeError:
            fallback_narrative = self._extract_partial_narrative(json_buffer) or self._unescape_json_string(json_buffer)
            parsed = {
                "narrative": fallback_narrative,
                "options": ["继续探索", "仔细观察", "与NPC交谈", "查阅资料"],
                "dice_request": None,
                "status_update": None,
            }

        # Ensure options is always a non-empty list
        options = parsed.get("options", [])
        if not isinstance(options, list) or len(options) == 0:
            options = ["继续探索", "仔细观察", "与NPC交谈", "查阅资料"]

        final_narrative = parsed.get("narrative") or ""
        yield ("narrative", {"text": final_narrative, "final": True})
        yield ("options", {"options": options})

        dice_request = parsed.get("dice_request")
        if dice_request:
            yield ("dice_request", dice_request)

        status_update = parsed.get("status_update")
        if status_update:
            yield ("status_update", status_update)

        yield ("done", {"turn_complete": True})

    def _unescape_json_string(self, s: str) -> str:
        """Decode JSON string escape sequences (\\n → newline, \\\" → \", \\\\ → \\)."""
        return s.replace('\\\\', '\\').replace('\\n', '\n').replace('\\"', '"').replace('\\r', '\r').replace('\\t', '\t')

    def _extract_partial_narrative(self, buffer: str) -> str:
        """Extract narrative text from partial JSON buffer for streaming."""
        marker = '"narrative"'
        idx = buffer.find(marker)
        if idx < 0:
            return ""
        colon_idx = buffer.find(":", idx + len(marker))
        if colon_idx < 0:
            return ""
        val_start = buffer.find('"', colon_idx + 1)
        if val_start < 0:
            return ""
        raw = buffer[val_start + 1:]

        # Find the end of the narrative string
        end_markers = ['",\n', '",\r', '"\n}', '"\r', '"}']
        for em in end_markers:
            eidx = raw.find(em)
            if eidx > 0:
                raw = raw[:eidx]
                break
        # Remove trailing partial unicode
        if raw.endswith("\\"):
            raw = raw[:-1]
        return self._unescape_json_string(raw)
