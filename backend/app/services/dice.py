import random
import re
from typing import List


class DiceEngine:
    @staticmethod
    def roll(expression: str) -> dict:
        """Parse and execute a dice expression like '1d100', '2d6', '1d4+1d6+2'."""
        parts = re.findall(r"(\d+)d(\d+)", expression)
        individual: List[int] = []
        total = 0
        for count_str, faces_str in parts:
            count = int(count_str)
            faces = int(faces_str)
            for _ in range(count):
                val = random.randint(1, faces)
                individual.append(val)
                total += val
        # Apply flat modifiers: +N or -N
        for m in re.finditer(r"([+-]\d+)(?!d)", expression):
            total += int(m.group(1))
        return {"expression": expression, "individual": individual, "total": total}

    @staticmethod
    def check_d100(roll: int, skill: int) -> dict:
        """Evaluate a d100 roll against a skill value per COC 7e rules.

        Degrees of success:
          - Critical: roll is 1
          - Extreme: roll <= skill / 5
          - Hard:     roll <= skill / 2
          - Regular:  roll <= skill
          - Failure:  roll > skill
          - Fumble:   roll >= 96 if skill < 50, roll is 100 if skill >= 50
        """
        if roll == 1:
            return {"level": "critical", "success": True, "roll": roll, "skill": skill}

        is_fumble = (skill < 50 and roll >= 96) or (skill >= 50 and roll == 100)

        if roll <= skill // 5:
            return {"level": "extreme", "success": True, "roll": roll, "skill": skill}
        elif roll <= skill // 2:
            return {"level": "hard", "success": True, "roll": roll, "skill": skill}
        elif roll <= skill:
            return {"level": "regular", "success": True, "roll": roll, "skill": skill}
        elif is_fumble:
            return {"level": "fumble", "success": False, "roll": roll, "skill": skill}
        else:
            return {"level": "failure", "success": False, "roll": roll, "skill": skill}

    @staticmethod
    def opposed_check(actor_roll: int, actor_skill: int, opponent_roll: int, opponent_skill: int) -> dict:
        """COC 7e opposed roll: compare degrees of success."""
        actor = DiceEngine.check_d100(actor_roll, actor_skill)
        opponent = DiceEngine.check_d100(opponent_roll, opponent_skill)
        level_order = {"critical": 5, "extreme": 4, "hard": 3, "regular": 2, "failure": 1, "fumble": 0}

        actor_level = level_order[actor["level"]]
        opp_level = level_order[opponent["level"]]

        if actor_level > opp_level:
            winner = "actor"
        elif opp_level > actor_level:
            winner = "opponent"
        else:
            if actor["success"] and opponent["success"]:
                winner = "actor" if actor_roll > opponent_roll else "opponent"
            elif not actor["success"] and not opponent["success"]:
                winner = "actor" if actor_roll < opponent_roll else "opponent"
            else:
                winner = "actor" if actor["success"] else "opponent"

        return {"actor": actor, "opponent": opponent, "winner": winner}

    @staticmethod
    def roll_d100() -> int:
        """Roll a single d100 (1-100)."""
        return random.randint(1, 100)
