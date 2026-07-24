#!/usr/bin/env python3
"""Run redacted PandaAI and Bocha capability probes for MD-002."""

from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from pathlib import Path
from typing import Any

SCHEMA_VERSION = "provider-probe/v1"
BOCHA_ENDPOINT = "https://api.bocha.cn/v1/web-search"
PANDA_SDK_VERSION = "0.0.12"
DEFAULT_TIMEOUT_SECONDS = 20.0
MAX_BOCHA_COUNT = 50

SECRET_ENV_NAMES = ("PANDA_USERNAME", "PANDA_PASSWORD", "BOCHA_API_KEY")
TOKEN_PATTERNS = (
    re.compile(
        r"(?i)(authorization|bearer|token|password|api[_-]?key)\s*[:=]\s*[^\s,;]+"
    ),
    re.compile(r"\bsk-[A-Za-z0-9_-]{12,}\b"),
)

PANDA_CASES = (
    {
        "case_id": "stock_detail_a_share",
        "method": "get_stock_detail",
        "asset_type": "a_share",
        "symbol": "000001.SZ",
        "kwargs": {"symbol": "000001.SZ"},
    },
    {
        "case_id": "market_data_a_share",
        "method": "get_market_data",
        "asset_type": "a_share",
        "symbol": "000001.SZ",
        "kwargs": {
            "symbol": "000001.SZ",
            "start_date": "20260720",
            "end_date": "20260723",
            "type": "stock",
        },
    },
    {
        "case_id": "market_data_etf",
        "method": "get_market_data",
        "asset_type": "etf",
        "symbol": "510300.SH",
        "kwargs": {
            "symbol": "510300.SH",
            "start_date": "20260720",
            "end_date": "20260723",
            "type": "stock",
        },
    },
    {
        "case_id": "market_data_etf_historical_window",
        "method": "get_market_data",
        "asset_type": "etf",
        "symbol": "510300.SH",
        "kwargs": {
            "symbol": "510300.SH",
            "start_date": "20250102",
            "end_date": "20250103",
            "type": "stock",
        },
    },
    {
        "case_id": "market_data_off_exchange_fund",
        "method": "get_market_data",
        "asset_type": "off_exchange_fund",
        "symbol": "000001.OF",
        "kwargs": {
            "symbol": "000001.OF",
            "start_date": "20260720",
            "end_date": "20260723",
            "type": "stock",
        },
    },
    {
        "case_id": "fund_detail_etf",
        "method": "get_fund_detail",
        "asset_type": "etf",
        "symbol": "510300.SH",
        "kwargs": {"symbol": "510300.SH"},
    },
    {
        "case_id": "fund_detail_off_exchange_fund",
        "method": "get_fund_detail",
        "asset_type": "off_exchange_fund",
        "symbol": "000001.OF",
        "kwargs": {"symbol": "000001.OF"},
    },
    {
        "case_id": "fund_detail_no_data",
        "method": "get_fund_detail",
        "asset_type": "off_exchange_fund",
        "symbol": "999999.OF",
        "kwargs": {"symbol": "999999.OF"},
    },
    {
        "case_id": "fund_pro_sdk_export",
        "method": "get_fund_pro",
        "asset_type": "off_exchange_fund",
        "symbol": None,
        "kwargs": {},
    },
    {
        "case_id": "fund_nav_sdk_export",
        "method": "get_fund_nav",
        "asset_type": "off_exchange_fund",
        "symbol": "000001.OF",
        "kwargs": {"symbol": "000001.OF"},
    },
)

PRIMARY_SOURCE_HOSTS = {
    "sse.com.cn",
    "szse.cn",
    "csrc.gov.cn",
    "amac.org.cn",
    "csindex.com.cn",
    "huatai-pb.com",
    "efunds.com.cn",
}


def load_dotenv(path: Path) -> list[str]:
    """Load allowlisted probe secrets without overriding process variables."""
    loaded: list[str] = []
    if not path.is_file():
        return loaded
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        name = name.strip()
        if name not in SECRET_ENV_NAMES or name in os.environ:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        os.environ[name] = value
        loaded.append(name)
    return loaded


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds")


def elapsed_ms(started: float) -> int:
    return round((time.monotonic() - started) * 1000)


def secret_values(environ: dict[str, str] | None = None) -> list[str]:
    source = environ if environ is not None else os.environ
    return [source[name] for name in SECRET_ENV_NAMES if source.get(name)]


def redact_text(value: Any, secrets: list[str] | None = None) -> str:
    text = str(value)
    for secret in secrets if secrets is not None else secret_values():
        if secret:
            text = text.replace(secret, "[REDACTED]")
    for pattern in TOKEN_PATTERNS:
        text = pattern.sub("[REDACTED]", text)
    return text[:1000]


def redact(value: Any, secrets: list[str] | None = None) -> Any:
    if isinstance(value, dict):
        return {str(key): redact(item, secrets) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [redact(item, secrets) for item in value]
    if isinstance(value, str):
        return redact_text(value, secrets)
    return value


def classify_error(error: BaseException | str, status_code: int | None = None) -> str:
    message = str(error).lower()
    if any(term in message for term in ("用户未注册", "data user not registered")):
        return "no_permission"
    if status_code in (401, 403) or any(
        term in message for term in ("unauthorized", "forbidden", "鉴权", "登录失败")
    ):
        return "auth_failed"
    if status_code == 429 or any(
        term in message for term in ("rate limit", "too many requests", "限流")
    ):
        return "rate_limited"
    if isinstance(error, TimeoutError) or any(
        term in message for term in ("timed out", "timeout", "超时")
    ):
        return "timed_out"
    if any(
        term in message for term in ("permission", "no permission", "未购买", "无权限")
    ):
        return "no_permission"
    return "failed"


def dataframe_summary(frame: Any) -> dict[str, Any]:
    columns = [str(column) for column in frame.columns]
    dtypes = {str(column): str(dtype) for column, dtype in frame.dtypes.items()}
    null_counts = {
        str(column): int(count) for column, count in frame.isna().sum().items()
    }
    temporal_fields: dict[str, dict[str, str]] = {}

    for column in columns:
        lowered = column.lower()
        if not any(marker in lowered for marker in ("date", "time", "trade_day")):
            continue
        values = frame[column].dropna().astype(str)
        if not values.empty:
            temporal_fields[column] = {
                "min": str(values.min()),
                "max": str(values.max()),
            }

    unit_evidence = {
        column: "not_declared_by_dataframe"
        for column, dtype in dtypes.items()
        if dtype.lower().startswith(("int", "float", "decimal"))
    }
    return {
        "row_count": len(frame.index),
        "columns": columns,
        "column_dtypes": dtypes,
        "null_counts": null_counts,
        "temporal_fields": temporal_fields,
        "market_observation_time": temporal_fields.get("date"),
        "unit_evidence": unit_evidence,
    }


def panda_child(case: dict[str, Any]) -> int:
    started = time.monotonic()
    result: dict[str, Any] = {
        "provider": "pandaai",
        "method": case["method"],
        "case_id": case["case_id"],
        "asset_type": case["asset_type"],
        "symbol": case.get("symbol"),
        "sdk_version": PANDA_SDK_VERSION,
        "requested_at": utc_now(),
    }
    auth_dir = Path(os.environ["PANDA_PROBE_AUTH_DIR"])
    auth_dir.mkdir(parents=True, exist_ok=True)
    captured_stdout = io.StringIO()
    captured_stderr = io.StringIO()

    try:
        with (
            contextlib.redirect_stdout(captured_stdout),
            contextlib.redirect_stderr(captured_stderr),
        ):
            import panda_data
            from panda_data import auth_manager

            if not hasattr(panda_data, case["method"]):
                result.update(
                    status="not_applicable",
                    reason="sdk_export_missing",
                    sdk_export_present=False,
                )
            else:
                auth_manager._user_json_dir = str(auth_dir)
                auth_manager.clear_auth()
                panda_data.init_token(
                    username=os.environ["PANDA_USERNAME"],
                    password=os.environ["PANDA_PASSWORD"],
                )
                method = getattr(panda_data, case["method"])
                frame = method(**case["kwargs"])
                if frame.empty:
                    result.update(
                        status="empty",
                        reason="provider_returned_zero_rows",
                        sdk_export_present=True,
                        response=dataframe_summary(frame),
                    )
                else:
                    result.update(
                        status="available",
                        sdk_export_present=True,
                        response=dataframe_summary(frame),
                    )
    except Exception as error:  # noqa: BLE001 - provider SDK errors are not stable public types.
        result.update(
            status=classify_error(error),
            reason=type(error).__name__,
            error=redact_text(error),
        )
    finally:
        try:
            from panda_data import auth_manager

            auth_manager.clear_auth()
        except Exception as cleanup_error:  # noqa: BLE001 - cleanup must be reported, not mask the probe.
            result["credential_cleanup_error"] = redact_text(cleanup_error)

    return _emit_child_result(result, started, auth_dir)


def _emit_child_result(result: dict[str, Any], started: float, auth_dir: Path) -> int:
    result["acquired_at"] = utc_now()
    result["duration_ms"] = elapsed_ms(started)
    result["credential_residue"] = (
        any(auth_dir.iterdir()) if auth_dir.exists() else False
    )
    print(json.dumps(redact(result), ensure_ascii=False, sort_keys=True))
    return 0


def run_panda_case(
    case: dict[str, Any],
    timeout_seconds: float,
    environ: dict[str, str] | None = None,
) -> dict[str, Any]:
    child_env = dict(os.environ if environ is None else environ)
    started = time.monotonic()
    requested_at = utc_now()
    auth_dir = Path(tempfile.mkdtemp(prefix="finlens-panda-probe-"))
    child_env["PANDA_PROBE_AUTH_DIR"] = str(auth_dir)
    command = [
        sys.executable,
        str(Path(__file__).resolve()),
        "--_panda-child",
        json.dumps(case),
    ]

    try:
        completed = subprocess.run(
            command,
            env=child_env,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
        for line in reversed(completed.stdout.splitlines()):
            try:
                result = json.loads(line)
            except json.JSONDecodeError:
                continue
            result["child_exit_code"] = completed.returncode
            return redact(result, secret_values(child_env))
        return {
            "provider": "pandaai",
            "method": case["method"],
            "case_id": case["case_id"],
            "asset_type": case["asset_type"],
            "symbol": case.get("symbol"),
            "status": "failed",
            "reason": "child_returned_no_json",
            "child_exit_code": completed.returncode,
            "duration_ms": elapsed_ms(started),
            "requested_at": requested_at,
            "finished_at": utc_now(),
            "credential_residue": any(auth_dir.iterdir()),
        }
    except subprocess.TimeoutExpired:
        return {
            "provider": "pandaai",
            "method": case["method"],
            "case_id": case["case_id"],
            "asset_type": case["asset_type"],
            "symbol": case.get("symbol"),
            "status": "timed_out",
            "reason": "local_hard_timeout",
            "duration_ms": elapsed_ms(started),
            "requested_at": requested_at,
            "finished_at": utc_now(),
            "credential_residue": any(auth_dir.iterdir()),
        }
    finally:
        shutil.rmtree(auth_dir, ignore_errors=True)


def run_panda(timeout_seconds: float, negative_tests: bool) -> dict[str, Any]:
    started = time.monotonic()
    if not os.environ.get("PANDA_USERNAME") or not os.environ.get("PANDA_PASSWORD"):
        return {
            "provider": "pandaai",
            "status": "missing_credentials",
            "required_environment": ["PANDA_USERNAME", "PANDA_PASSWORD"],
            "duration_ms": elapsed_ms(started),
            "cases": [],
        }
    username = os.environ["PANDA_USERNAME"]
    if re.fullmatch(r"1\d{10}", username):
        return {
            "provider": "pandaai",
            "status": "invalid_credentials_format",
            "reason": "PANDA_USERNAME requires the country code prefix",
            "duration_ms": elapsed_ms(started),
            "cases": [],
        }

    cases = [run_panda_case(case, timeout_seconds) for case in PANDA_CASES]
    if negative_tests:
        timeout_case = dict(PANDA_CASES[0])
        timeout_case["case_id"] = "stock_detail_local_timeout_guard"
        cases.append(run_panda_case(timeout_case, 0.001))

    return {
        "provider": "pandaai",
        "status": "completed",
        "sdk_version": PANDA_SDK_VERSION,
        "python_version": sys.version.split()[0],
        "duration_ms": elapsed_ms(started),
        "cases": cases,
    }


def validate_bocha_request(
    query: str, freshness: str, summary: bool, count: int
) -> dict[str, Any]:
    if not query.strip():
        raise ValueError("query must not be empty")
    if count < 1 or count > MAX_BOCHA_COUNT:
        raise ValueError(f"count must be between 1 and {MAX_BOCHA_COUNT}")
    return {"query": query, "freshness": freshness, "summary": summary, "count": count}


def bocha_http_request(
    api_key: str, payload: dict[str, Any], timeout_seconds: float
) -> tuple[int, Any]:
    request = urllib.request.Request(
        BOCHA_ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            body = response.read().decode("utf-8", errors="replace")
            return response.status, json.loads(body)
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        try:
            parsed: Any = json.loads(body)
        except json.JSONDecodeError:
            parsed = {"error": "non_json_http_error"}
        return error.code, parsed


def summarize_bocha_response(status_code: int, body: Any) -> dict[str, Any]:
    if not isinstance(body, dict):
        return {
            "status": "malformed",
            "reason": "response_not_object",
            "http_status": status_code,
        }

    business_code = body.get("code")
    if status_code in (401, 403) or business_code in (401, 403, "401", "403"):
        return {
            "status": "auth_failed",
            "http_status": status_code,
            "business_code": business_code,
        }
    if status_code == 429 or business_code in (429, "429"):
        return {
            "status": "rate_limited",
            "http_status": status_code,
            "business_code": business_code,
        }
    if status_code != 200 or business_code not in (200, "200"):
        return {
            "status": "failed",
            "http_status": status_code,
            "business_code": business_code,
            "message": redact_text(body.get("message", "provider_error")),
        }

    data = body.get("data")
    if not isinstance(data, dict):
        return {
            "status": "malformed",
            "reason": "data_not_object",
            "http_status": status_code,
            "business_code": business_code,
        }

    web_pages = data.get("webPages")
    if not isinstance(web_pages, dict) or not isinstance(web_pages.get("value"), list):
        return {
            "status": "malformed",
            "reason": "web_pages_not_list",
            "http_status": status_code,
            "business_code": business_code,
        }

    candidates = []
    for item in web_pages["value"]:
        if not isinstance(item, dict):
            continue
        candidates.append(
            {
                "name": redact_text(item.get("name", "")),
                "url": redact_text(item.get("url", "")),
                "site_name": redact_text(item.get("siteName", "")),
                "published_time": redact_text(item.get("datePublished", "")),
            }
        )

    return {
        "status": "available" if candidates else "empty",
        "http_status": status_code,
        "business_code": business_code,
        "response_type": body.get("type"),
        "query_context_fields": sorted((data.get("queryContext") or {}).keys()),
        "web_page_count": len(candidates),
        "candidates": candidates,
    }


def _normalized_host(url: str) -> str:
    host = (urllib.parse.urlparse(url).hostname or "").lower()
    return host.removeprefix("www.")


def is_primary_source_host(host: str) -> bool:
    return any(
        host == allowed or host.endswith(f".{allowed}")
        for allowed in PRIMARY_SOURCE_HOSTS
    )


def verify_primary_source(
    candidates: list[dict[str, Any]], timeout_seconds: float
) -> dict[str, Any]:
    for candidate in candidates:
        url = str(candidate.get("url", ""))
        host = _normalized_host(url)
        if not url.startswith("https://") or not is_primary_source_host(host):
            continue
        request = urllib.request.Request(
            url, headers={"User-Agent": "FinLens-MD-002-Probe/1.0"}
        )
        started = time.monotonic()
        try:
            with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                return {
                    "status": "verified",
                    "host": host,
                    "http_status": response.status,
                    "url": url,
                    "duration_ms": elapsed_ms(started),
                }
        except Exception as error:  # noqa: BLE001 - remote URL failures vary by handler and platform.
            return {
                "status": classify_error(error, getattr(error, "code", None)),
                "host": host,
                "url": url,
                "reason": type(error).__name__,
                "duration_ms": elapsed_ms(started),
            }
    return {"status": "not_found", "reason": "no_allowlisted_primary_source_candidate"}


def run_bocha_case(
    api_key: str,
    payload: dict[str, Any],
    timeout_seconds: float,
    transport: Callable[
        [str, dict[str, Any], float], tuple[int, Any]
    ] = bocha_http_request,
) -> dict[str, Any]:
    started = time.monotonic()
    requested_at = utc_now()
    try:
        status_code, body = transport(api_key, payload, timeout_seconds)
        result = summarize_bocha_response(status_code, body)
    except Exception as error:  # noqa: BLE001 - transport failures are normalized at this boundary.
        result = {
            "status": classify_error(error),
            "reason": type(error).__name__,
            "error": redact_text(error),
        }
    result.update(
        provider="bocha",
        endpoint="POST /v1/web-search",
        request={
            "query_class": "public_etf_primary_source_discovery",
            "freshness": payload["freshness"],
            "summary": payload["summary"],
            "count": payload["count"],
        },
        requested_at=requested_at,
        acquired_at=utc_now(),
        duration_ms=elapsed_ms(started),
    )
    return redact(result)


def run_bocha(
    timeout_seconds: float, count: int, negative_tests: bool
) -> dict[str, Any]:
    started = time.monotonic()
    api_key = os.environ.get("BOCHA_API_KEY")
    if not api_key:
        return {
            "provider": "bocha",
            "status": "missing_credentials",
            "required_environment": ["BOCHA_API_KEY"],
            "duration_ms": elapsed_ms(started),
            "cases": [],
        }

    query = "site:sse.com.cn 510300 ETF 公告"
    payload = validate_bocha_request(query, "noLimit", True, count)
    normal = run_bocha_case(api_key, payload, timeout_seconds)
    normal["case_id"] = "web_search_primary_source"
    if normal.get("status") == "available":
        normal["primary_source_verification"] = verify_primary_source(
            normal.get("candidates", []), timeout_seconds
        )

    cases = [normal]
    try:
        validate_bocha_request(query, "noLimit", True, MAX_BOCHA_COUNT + 1)
    except ValueError as error:
        cases.append(
            {
                "provider": "bocha",
                "case_id": "count_above_local_limit",
                "status": "rejected_locally",
                "reason": str(error),
                "network_attempted": False,
            }
        )

    if negative_tests:
        empty_payload = validate_bocha_request(
            "finlens-md-002-no-result-7f3e2f8d9b1c4a6e",
            "noLimit",
            False,
            1,
        )
        empty_result = run_bocha_case(api_key, empty_payload, timeout_seconds)
        empty_result["case_id"] = "no_match_query"
        empty_result["request"]["query_class"] = "synthetic_no_match_query"
        cases.append(empty_result)

        invalid_auth = run_bocha_case(
            "intentionally-invalid-probe-key", payload, timeout_seconds
        )
        invalid_auth["case_id"] = "invalid_auth"
        invalid_auth.pop("candidates", None)
        cases.append(invalid_auth)

        timeout_result = run_bocha_case(api_key, payload, 0.001)
        timeout_result["case_id"] = "local_timeout_guard"
        timeout_result.pop("candidates", None)
        cases.append(timeout_result)

    return {
        "provider": "bocha",
        "status": "completed",
        "duration_ms": elapsed_ms(started),
        "cases": cases,
    }


def build_report(
    provider: str, timeout_seconds: float, bocha_count: int, negative_tests: bool
) -> dict[str, Any]:
    started = time.monotonic()
    started_at = utc_now()
    providers = []
    if provider in ("all", "pandaai"):
        providers.append(run_panda(timeout_seconds, negative_tests))
    if provider in ("all", "bocha"):
        providers.append(run_bocha(timeout_seconds, bocha_count, negative_tests))
    return redact(
        {
            "schema_version": SCHEMA_VERSION,
            "started_at": started_at,
            "duration_ms": elapsed_ms(started),
            "redaction": {
                "credentials_in_output": False,
                "raw_provider_payloads_in_output": False,
                "private_portfolio_data_used": False,
            },
            "providers": providers,
        }
    )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--provider", choices=("all", "pandaai", "bocha"), default="all"
    )
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument("--bocha-count", type=int, default=3)
    parser.add_argument("--negative-tests", action="store_true")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--_panda-child", help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    if args.timeout <= 0:
        parser.error("--timeout must be greater than zero")
    if not 1 <= args.bocha_count <= MAX_BOCHA_COUNT:
        parser.error(f"--bocha-count must be between 1 and {MAX_BOCHA_COUNT}")
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args._panda_child:
        return panda_child(json.loads(args._panda_child))

    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    report = build_report(
        args.provider, args.timeout, args.bocha_count, args.negative_tests
    )
    output = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output + "\n", encoding="utf-8")
    print(output)

    statuses = [provider["status"] for provider in report["providers"]]
    return 2 if any(status == "missing_credentials" for status in statuses) else 0


if __name__ == "__main__":
    raise SystemExit(main())
