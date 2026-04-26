"""Backend matching package."""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path


# region agent log
def _debug_log(hypothesis_id: str, message: str, data: dict) -> None:
    try:
        payload = {
            "sessionId": "b89e1e",
            "runId": "pre-fix",
            "hypothesisId": hypothesis_id,
            "location": "backend_matching/__init__.py",
            "message": message,
            "data": data,
            "timestamp": int(time.time() * 1000),
        }
        with Path("/Users/lukashohenloechter/Desktop/bitte_ein_bit/.cursor/debug-b89e1e.log").open(
            "a", encoding="utf-8"
        ) as handle:
            handle.write(json.dumps(payload) + "\n")
    except Exception:
        pass


_debug_log(
    "H1",
    "backend_matching package imported",
    {
        "__file__": __file__,
        "cwd": str(Path.cwd()),
        "sys_path_head": sys.path[:5],
    },
)
# endregion
