from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.location import Location
from app.models.module import Module
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
    user = get_current_user(token, db)

    locations = db.query(Location).join(Module).filter(Location.module_id == module_id, Module.user_id == user.id).all()
    tree = _build_location_tree(locations)
    return {"module_id": module_id, "locations": tree}
