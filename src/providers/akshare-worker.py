#!/usr/bin/env python3
"""Fetch bounded daily market data through AKShare and emit JSON only."""
from __future__ import annotations

import json
import sys
from typing import Any


def emit(value: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(value, ensure_ascii=False, separators=(",", ":")))
    sys.stdout.write("\n")
    sys.stdout.flush()


def symbol_code(value: str) -> str:
    raw = value.strip().upper().split(".", 1)[0]
    digits = "".join(char for char in raw if char.isdigit())
    return digits if len(digits) == 6 else ""


def normalize_date(value: Any) -> str | None:
    digits = "".join(char for char in str(value) if char.isdigit())
    if len(digits) < 8:
        return None
    return f"{digits[:4]}-{digits[4:6]}-{digits[6:8]}"


def normalize_rows(frame: Any, cutoff: str, *, date_keys: tuple[str, ...] = ("日期", "date"), value_keys: tuple[str, ...] = ("收盘", "close")) -> list[dict[str, Any]]:
    if frame is None or not hasattr(frame, "iterrows"):
        return []
    rows: list[dict[str, Any]] = []
    for _, source in frame.iterrows():
        raw_date = next((source.get(key) for key in date_keys if source.get(key) is not None), "")
        raw_value = next((source.get(key) for key in value_keys if source.get(key) is not None), None)
        date = normalize_date(raw_date)
        if raw_value is None:
            continue
        try:
            number = float(raw_value)
        except (TypeError, ValueError):
            continue
        if date and date <= cutoff and number > 0:
            rows.append({"date": date, "close": number})
    unique = {row["date"]: row for row in rows}
    return [unique[date] for date in sorted(unique)[-260:]]


def exchange_symbol(code: str) -> str:
    return ("sh" if code[0] in {"5", "6", "9"} else "sz") + code


def fetch(request: dict[str, Any], ak: Any) -> dict[str, Any]:
    code = symbol_code(request.get("symbol", ""))
    asset_class = request.get("assetClass")
    result = {
        "lineId": request.get("lineId", ""),
        "assetClass": asset_class,
        "symbol": request.get("symbol", ""),
        "status": "failed",
        "method": None,
        "rows": [],
    }
    if not code or asset_class not in {"fund", "a_share", "etf"}:
        result["status"] = "unsupported"
        result["errorCode"] = "unsupported_symbol_or_asset"
        return result
    start_date = str(request.get("startDate", "")).replace("-", "")
    end_date = str(request.get("endDate", "")).replace("-", "")
    cutoff = str(request.get("endDate", ""))
    try:
        if asset_class == "fund":
            method = "fund_open_fund_info_em"
            frame = ak.fund_open_fund_info_em(
                symbol=code,
                indicator="单位净值走势",
                period="成立来",
            )
            rows = normalize_rows(
                frame,
                cutoff,
                date_keys=("净值日期", "日期", "date"),
                value_keys=("单位净值", "unit_nav", "nav"),
            )
        elif asset_class == "etf":
            method = "fund_etf_hist_sina"
            frame = ak.fund_etf_hist_sina(symbol=exchange_symbol(code))
            rows = normalize_rows(frame, cutoff)
        else:
            method = "stock_zh_a_daily"
            frame = ak.stock_zh_a_daily(
                symbol=exchange_symbol(code),
                start_date=start_date,
                end_date=end_date,
                adjust="qfq",
            )
            rows = normalize_rows(frame, cutoff)
        result["method"] = method
        result["rows"] = rows
        result["status"] = "available" if rows else "empty"
        return result
    except Exception as error:
        result["errorCode"] = type(error).__name__
        return result


def clean_text(value: Any, limit: int) -> str:
    text = " ".join(str(value or "").split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def normalize_news(frame: Any, provider: str, *, summary_key: str) -> list[dict[str, str]]:
    if frame is None or not hasattr(frame, "iterrows"):
        return []
    rows: list[dict[str, str]] = []
    for _, source in frame.iterrows():
        title = clean_text(source.get("标题"), 180)
        summary = clean_text(source.get(summary_key), 420)
        published_at = clean_text(source.get("发布时间"), 40)
        url = clean_text(source.get("链接"), 500)
        if title and summary and published_at and url.startswith("https://"):
            rows.append({
                "provider": provider,
                "title": title,
                "summary": summary,
                "publishedAt": published_at,
                "url": url,
            })
    return rows[:200]


def fetch_daily_news(ak: Any) -> dict[str, Any]:
    results: list[dict[str, str]] = []
    failures: list[str] = []
    for provider, method, summary_key in (
        ("eastmoney", "stock_info_global_em", "摘要"),
        ("10jqka", "stock_info_global_ths", "内容"),
    ):
        try:
            results.extend(normalize_news(getattr(ak, method)(), provider, summary_key=summary_key))
        except Exception as error:
            failures.append(f"{method}:{type(error).__name__}")
    return {"status": "completed", "results": results, "failures": failures}


def main() -> int:
    try:
        payload = json.loads(sys.stdin.read())
        import importlib
        ak = importlib.import_module("akshare")
        if payload.get("operation") == "daily_news":
            emit(fetch_daily_news(ak))
            return 0
        requests = payload.get("requests")
        if not isinstance(requests, list) or not requests or len(requests) > 100:
            emit({"status": "invalid_request", "results": []})
            return 2
        emit({"status": "completed", "results": [fetch(item, ak) for item in requests]})
        return 0
    except Exception as error:
        emit({"status": "failed", "errorCode": type(error).__name__, "results": []})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
