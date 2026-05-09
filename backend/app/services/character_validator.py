from typing import Dict, List

REQUIRED_ATTRS = ["STR", "CON", "SIZ", "DEX", "INT", "APP", "POW", "EDU"]
VALID_SKILLS = {
    "会计", "人类学", "估价", "考古学", "艺术", "魅惑", "攀爬", "计算机使用",
    "信用评级", "克苏鲁神话", "乔装", "闪避", "汽车驾驶", "电气维修", "电子学",
    "快速交谈", "格斗", "枪械", "急救", "历史", "恐吓", "跳跃", "母语",
    "法律", "图书馆使用", "聆听", "锁匠", "机械维修", "医学", "自然世界",
    "导航", "神秘学", "重型机械", "说服", "驾驶", "精神分析", "心理学",
    "骑术", "科学", "巧手", "侦查", "潜行", "生存", "游泳", "投掷", "追踪",
}
MIN_TOTAL = 120
ATTR_MIN = 0
ATTR_MAX = 99
SKILL_MAX = 99
LUCK_MIN = 0
LUCK_MAX = 99


class CharacterValidator:
    @staticmethod
    def validate_attributes(attrs: Dict[str, int], total_cap: int = 720) -> List[str]:
        errors = []

        missing = [a for a in REQUIRED_ATTRS if a not in attrs]
        if missing:
            errors.append(f"Missing attributes: {', '.join(missing)}")
            return errors

        for attr in REQUIRED_ATTRS:
            val = attrs[attr]
            if not isinstance(val, int) or val < ATTR_MIN or val > ATTR_MAX:
                errors.append(f"{attr} must be between {ATTR_MIN} and {ATTR_MAX}, got {val}")

        total = sum(attrs[a] for a in REQUIRED_ATTRS)
        if total > total_cap:
            errors.append(f"Attribute total {total} exceeds cap of {total_cap}")
        if total < MIN_TOTAL:
            errors.append(f"Attribute total {total} is below minimum of {MIN_TOTAL}")

        return errors

    @staticmethod
    def validate_luck(luck: int) -> List[str]:
        if not isinstance(luck, int) or luck < LUCK_MIN or luck > LUCK_MAX:
            return [f"LUCK must be between {LUCK_MIN} and {LUCK_MAX}, got {luck}"]
        return []

    @staticmethod
    def validate_skill(skill_name: str, value: int, min_val: int = 0, max_val: int = 99) -> List[str]:
        if not isinstance(value, int) or value < min_val or value > max_val:
            return [f"{skill_name} must be between {min_val} and {max_val}, got {value}"]
        return []

    @staticmethod
    def validate_skills(skills: Dict[str, int]) -> List[str]:
        errors = []
        for name, value in skills.items():
            if name not in VALID_SKILLS:
                errors.append(f"Unknown skill: {name}")
            elif not isinstance(value, int) or value < 0 or value > SKILL_MAX:
                errors.append(f"Skill {name} must be between 0 and {SKILL_MAX}, got {value}")
        return errors

    @staticmethod
    def calculate_derived_stats(attrs: Dict[str, int]) -> dict:
        con = attrs.get("CON", 0)
        siz = attrs.get("SIZ", 0)
        pow_ = attrs.get("POW", 0)
        dex = attrs.get("DEX", 0)
        str_ = attrs.get("STR", 0)

        hp_max = max(1, (con + siz) // 10)
        san_max = pow_
        mp_max = max(1, pow_ // 5)
        if str_ < siz and dex < siz:
            move = 7
        elif str_ >= siz and dex >= siz:
            move = 9
        else:
            move = 8
        build = 0 if str_ + siz <= 64 else (1 if str_ + siz <= 84 else 2)
        dodge_base = dex // 2

        return {
            "HP_current": hp_max,
            "HP_max": hp_max,
            "SAN_current": san_max,
            "SAN_max": san_max,
            "MP_current": mp_max,
            "MP_max": mp_max,
            "MOV": move,
            "BUILD": build,
            "DODGE": dodge_base,
        }

    @staticmethod
    def get_attr_modifier(attr_value: int) -> int:
        """Return modifier for attribute-based checks.
        Below 20 = severe penalty (-20), below 45 = penalty (-10)."""
        if attr_value < 20:
            return -20
        elif attr_value < 45:
            return -10
        return 0

    @staticmethod
    def apply_attr_penalty(skill_value: int, attrs: Dict[str, int], related_attrs: List[str]) -> int:
        """Apply attribute penalties to a skill check.
        Uses the most severe penalty among related attributes."""
        worst_penalty = 0
        for attr_name in related_attrs:
            attr_val = attrs.get(attr_name, 50)
            penalty = CharacterValidator.get_attr_modifier(attr_val)
            if penalty < worst_penalty:
                worst_penalty = penalty
        return max(1, skill_value + worst_penalty)
