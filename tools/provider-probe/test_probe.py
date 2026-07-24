import json
import os
import sys
import tempfile
import types
import unittest
from unittest import mock

import probe


class ProviderProbeTests(unittest.TestCase):
    def test_redact_removes_explicit_and_pattern_secrets(self):
        secret = "private-value-123"
        value = {"message": f"password={secret}", "key": "sk-abcdefghijklmnop"}

        redacted = probe.redact(value, [secret])

        self.assertNotIn(secret, str(redacted))
        self.assertNotIn("sk-abcdefghijklmnop", str(redacted))

    def test_count_above_limit_is_rejected_before_transport(self):
        transport = mock.Mock()

        with self.assertRaisesRegex(ValueError, "between 1 and 50"):
            probe.validate_bocha_request("public query", "noLimit", True, 51)

        transport.assert_not_called()

    def test_malformed_bocha_response_is_typed(self):
        result = probe.summarize_bocha_response(200, {"code": 200, "data": []})

        self.assertEqual("malformed", result["status"])
        self.assertEqual("data_not_object", result["reason"])

    def test_empty_bocha_response_is_typed(self):
        result = probe.summarize_bocha_response(
            200,
            {"code": 200, "data": {"queryContext": {}, "webPages": {"value": []}}},
        )

        self.assertEqual("empty", result["status"])
        self.assertEqual(0, result["web_page_count"])

    def test_bocha_auth_failure_is_typed_without_returning_message(self):
        result = probe.summarize_bocha_response(
            401,
            {"code": 401, "message": "Bearer secret-value was rejected"},
        )

        self.assertEqual("auth_failed", result["status"])
        self.assertNotIn("message", result)

    def test_unregistered_panda_data_user_is_no_permission(self):
        self.assertEqual(
            "no_permission",
            probe.classify_error("[错误码 200006 : 用户未注册]"),
        )

    def test_bare_chinese_phone_is_rejected_before_panda_calls(self):
        with (
            mock.patch.dict(
                os.environ,
                {"PANDA_USERNAME": "13900000000", "PANDA_PASSWORD": "test-only"},
                clear=True,
            ),
            mock.patch.object(probe, "run_panda_case") as run_case,
        ):
            result = probe.run_panda(1, False)

        self.assertEqual("invalid_credentials_format", result["status"])
        run_case.assert_not_called()

    def test_missing_credentials_do_not_attempt_provider_calls(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            panda = probe.run_panda(1, False)
            bocha = probe.run_bocha(1, 3, False)

        self.assertEqual("missing_credentials", panda["status"])
        self.assertEqual("missing_credentials", bocha["status"])

    def test_dotenv_loads_only_allowlisted_missing_values(self):
        with tempfile.TemporaryDirectory() as directory:
            dotenv = __import__("pathlib").Path(directory) / ".env"
            dotenv.write_text(
                "PANDA_USERNAME=from-file\n"
                "PANDA_PASSWORD='file-password'\n"
                "UNRELATED_VALUE=must-not-load\n",
                encoding="utf-8",
            )
            with mock.patch.dict(
                os.environ, {"PANDA_USERNAME": "from-process"}, clear=True
            ):
                loaded = probe.load_dotenv(dotenv)

                self.assertEqual("from-process", os.environ["PANDA_USERNAME"])
                self.assertEqual("file-password", os.environ["PANDA_PASSWORD"])
                self.assertNotIn("UNRELATED_VALUE", os.environ)
                self.assertEqual(["PANDA_PASSWORD"], loaded)

    def test_primary_source_allowlist_rejects_lookalike_hosts(self):
        self.assertTrue(probe.is_primary_source_host("sse.com.cn"))
        self.assertTrue(probe.is_primary_source_host("query.sse.com.cn"))
        self.assertFalse(probe.is_primary_source_host("sse.com.cn.example.org"))

    def test_run_bocha_case_never_emits_api_key(self):
        api_key = "sk-super-secret-value"

        def transport(_api_key, _payload, _timeout):
            return 500, {"code": 500, "message": f"api_key={api_key}"}

        result = probe.run_bocha_case(
            api_key,
            {"query": "public", "freshness": "noLimit", "summary": True, "count": 3},
            1,
            transport,
        )

        self.assertNotIn(api_key, str(result))

    def test_panda_child_reports_missing_sdk_export(self):
        fake_package = types.ModuleType("panda_data")
        fake_auth = types.ModuleType("panda_data.auth_manager")
        fake_auth.clear_auth = mock.Mock()
        fake_package.auth_manager = fake_auth
        case = {
            "case_id": "fund_nav_sdk_export",
            "method": "get_fund_nav",
            "asset_type": "off_exchange_fund",
            "symbol": "000001.OF",
            "kwargs": {},
        }

        with (
            tempfile.TemporaryDirectory() as auth_dir,
            mock.patch.dict(
                sys.modules,
                {"panda_data": fake_package, "panda_data.auth_manager": fake_auth},
            ),
            mock.patch.dict(
                os.environ,
                {"PANDA_PROBE_AUTH_DIR": auth_dir},
                clear=False,
            ),
            mock.patch("sys.stdout", new_callable=__import__("io").StringIO) as stdout,
        ):
            exit_code = probe.panda_child(case)

        result = json.loads(stdout.getvalue())
        self.assertEqual(0, exit_code)
        self.assertEqual("not_applicable", result["status"])
        self.assertFalse(result["sdk_export_present"])


if __name__ == "__main__":
    unittest.main()
