#!/usr/bin/env python3
"""Isolated PandaAI batch worker. Reads one JSON request and writes one JSON result."""

from __future__ import annotations

import inspect
import json
import os
import sys
from pathlib import Path
from typing import Any


def emit(value: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(value, ensure_ascii=False, separators=(",", ":")))
    sys.stdout.write("\n")
    sys.stdout.flush()


def method(panda_data: Any, names: tuple[str, ...]) -> tuple[str, Any] | None:
    for name in names:
        candidate = getattr(panda_data, name, None)
        if callable(candidate):
            return name, candidate
    return None


def supported_kwargs(target: Any, values: dict[str, Any]) -> dict[str, Any]:
    try:
        signature = inspect.signature(target)
    except (TypeError, ValueError):
        return values
    if any(item.kind == inspect.Parameter.VAR_KEYWORD for item in signature.parameters.values()):
        return values
    return {key: value for key, value in values.items() if key in signature.parameters}


def scalar(value: Any) -> Any:
    if value is None:
        return None
    try:
        if value != value:  # NaN
            return None
    except Exception:
        pass
    if hasattr(value, "item"):
        try:
            value = value.item()
        except Exception:
            pass
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def row_date(row: Any) -> str | None:
    for key in ("date", "trade_date", "trade_day", "nav_date", "end_date"):
        if key not in row or row[key] is None:
            continue
        digits = "".join(char for char in str(row[key]) if char.isdigit())
        if len(digits) >= 8:
            return f"{digits[:4]}-{digits[4:6]}-{digits[6:8]}"
    return None


def row_value(row: Any) -> tuple[str | None, Any]:
    for key in ("close", "unit_nav", "nav", "adj_nav", "acc_nav", "price"):
        if key in row:
            return key, scalar(row[key])
    return None, None


def normalize_frame(frame: Any) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for _, source in frame.iterrows():
        date = row_date(source)
        metric, value = row_value(source)
        if date and metric and isinstance(value, (int, float)):
            rows.append({"date": date, "metric": metric, "value": value})
    rows.sort(key=lambda item: item["date"])
    return rows


def call_market(panda_data: Any, request: dict[str, Any]) -> dict[str, Any]:
    asset_class = request["assetClass"]
    if asset_class == "fund":
        selected = method(panda_data, ("pd_get_fund_nav", "get_fund_nav"))
        values = {
            "symbol": request["symbol"],
            "start_date": request["startDate"].replace("-", ""),
            "end_date": request["endDate"].replace("-", ""),
        }
    else:
        selected = method(panda_data, ("pd_get_market_data", "get_market_data"))
        values = {
            "symbol": request["symbol"],
            "start_date": request["startDate"].replace("-", ""),
            "end_date": request["endDate"].replace("-", ""),
            "type": "stock",
        }
    if selected is None:
        return {
            "lineId": request["lineId"],
            "assetClass": asset_class,
            "symbol": request["symbol"],
            "status": "unsupported",
            "method": None,
            "rows": [],
            "errorCode": "sdk_method_missing",
        }
    name, target = selected
    try:
        frame = target(**supported_kwargs(target, values))
        rows = normalize_frame(frame)
        return {
            "lineId": request["lineId"],
            "assetClass": asset_class,
            "symbol": request["symbol"],
            "status": "available" if rows else "empty",
            "method": name,
            "rows": rows,
        }
    except Exception as error:  # Provider exception types are not stable.
        return {
            "lineId": request["lineId"],
            "assetClass": asset_class,
            "symbol": request["symbol"],
            "status": "failed",
            "method": name,
            "rows": [],
            "errorCode": type(error).__name__,
        }


def main() -> int:
    try:
        request = json.loads(sys.stdin.read())
        requests = request.get("requests")
        if not isinstance(requests, list) or not requests:
            emit({"status": "invalid_request", "results": []})
            return 2

        import panda_data  # type: ignore[import-not-found]
        from panda_data import auth_manager  # type: ignore[import-not-found]

        auth_dir = Path(os.environ["PANDA_AUTH_DIR"])
        auth_dir.mkdir(parents=True, exist_ok=True)
        auth_manager._user_json_dir = str(auth_dir)
        auth_manager.clear_auth()
        panda_data.init_token(
            username=os.environ["PANDA_USERNAME"],
            password=os.environ["PANDA_PASSWORD"],
        )
        results = [call_market(panda_data, item) for item in requests]
        emit({"status": "completed", "results": results})
        return 0
    except Exception as error:  # Do not expose provider messages or credentials.
        emit({"status": "failed", "errorCode": type(error).__name__, "results": []})
        return 1
    finally:
        try:
            from panda_data import auth_manager  # type: ignore[import-not-found]

            auth_manager.clear_auth()
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
