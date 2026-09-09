"""
Minimal Census International Trade API client used by the source test and
later by acquisition. Responsibilities:

- Load CENSUS_API_KEY from the environment, else from
  ~/.config/us-trade-partners/env (KEY=VALUE lines). Stop with setup
  instructions if the key is absent.
- Issue GET requests with a 60 second timeout, at most 3 bounded retries
  with backoff on 5xx and timeouts (never on 4xx), a polite ~0.5s delay
  between requests, and redirects disabled (a 302 to missing_key.html is a
  failure, not something to follow).
- Save two files per request under raw/<subdir>/: <name>.request.json
  (url without key, params without key, fetched_at UTC ISO timestamp, http
  status, elapsed seconds) and <name>.response.json (raw body verbatim; or
  <name>.response.txt if the body is not JSON). Keys are sorted in every
  saved JSON file.

The API key itself is never written to disk, logged, or returned in any
structure other than the live request's query string.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

CONFIG_ENV_PATH = Path.home() / ".config" / "us-trade-partners" / "env"
REQUEST_TIMEOUT_SECONDS = 60
MAX_ATTEMPTS = 3
RETRY_BACKOFF_SECONDS = 2.0
POLITE_DELAY_SECONDS = 0.5


def load_api_key() -> str:
    """Load CENSUS_API_KEY from the environment, else from the config file.

    Stops the process with setup instructions if the key cannot be found.
    Never prints or logs the key value.
    """
    key = os.environ.get("CENSUS_API_KEY")
    if key:
        return key.strip()

    if CONFIG_ENV_PATH.exists():
        for line in CONFIG_ENV_PATH.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("CENSUS_API_KEY="):
                value = line.split("=", 1)[1].strip()
                if value:
                    return value

    print(
        "CENSUS_API_KEY is not set.\n"
        "Setup steps:\n"
        "  1. Get a Census API key: https://api.census.gov/data/key_signup.html\n"
        "  2. Set it for this shell: export CENSUS_API_KEY=your_key_here\n"
        "     or write it to ~/.config/us-trade-partners/env as:\n"
        "       CENSUS_API_KEY=your_key_here\n"
        "     (chmod 600 that file; keep it outside the repo)\n",
        file=sys.stderr,
    )
    sys.exit(1)


@dataclass
class FetchResult:
    name: str
    url: str
    params_no_key: dict[str, Any]
    status: int | None
    elapsed_seconds: float
    fetched_at: str
    body_text: str | None
    is_json: bool
    error: str | None
    request_path: Path
    response_path: Path


def _sorted_json_dumps(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False)


def sha256_of_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


class CensusClient:
    def __init__(self, api_key: str, out_dir: Path):
        self.api_key = api_key
        self.out_dir = out_dir
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self._last_request_time: float | None = None

    def _polite_wait(self) -> None:
        if self._last_request_time is not None:
            elapsed = time.monotonic() - self._last_request_time
            remaining = POLITE_DELAY_SECONDS - elapsed
            if remaining > 0:
                time.sleep(remaining)

    def fetch(self, name: str, url: str, params: dict[str, Any],
              timeout_seconds: float = REQUEST_TIMEOUT_SECONDS) -> FetchResult:
        """Fetch url with params (api key added, never saved), save
        request/response evidence to out_dir, and return a FetchResult.

        Retries up to MAX_ATTEMPTS on 5xx status codes and on timeout /
        connection errors, with linear backoff. Never retries on 4xx.
        Redirects are disabled; a 3xx response is recorded as a failure,
        not followed (the API is known to 302 to a missing_key page when
        the key is absent or invalid).

        timeout_seconds overrides REQUEST_TIMEOUT_SECONDS for this call only
        (used for large multi-chapter HS2 batch requests, which can
        legitimately take longer than 60s to generate on the server side;
        every other caller keeps the default 60s).
        """
        params_with_key = dict(params)
        params_with_key["key"] = self.api_key
        params_no_key = dict(params)

        status: int | None = None
        elapsed_seconds = 0.0
        body_text: str | None = None
        is_json = False
        error: str | None = None
        fetched_at = datetime.now(timezone.utc).isoformat()

        attempt = 0
        while attempt < MAX_ATTEMPTS:
            attempt += 1
            self._polite_wait()
            start = time.monotonic()
            try:
                resp = requests.get(
                    url,
                    params=params_with_key,
                    timeout=timeout_seconds,
                    allow_redirects=False,
                )
                elapsed_seconds = time.monotonic() - start
                self._last_request_time = time.monotonic()
                fetched_at = datetime.now(timezone.utc).isoformat()
                status = resp.status_code

                if status in (301, 302, 303, 307, 308):
                    location = resp.headers.get("Location", "")
                    error = f"redirect not followed: status={status} location={location}"
                    body_text = resp.text
                    break

                body_text = resp.text
                try:
                    json.loads(body_text)
                    is_json = True
                except (json.JSONDecodeError, ValueError):
                    is_json = False

                if 500 <= status < 600:
                    error = f"server error status={status}"
                    if attempt < MAX_ATTEMPTS:
                        time.sleep(RETRY_BACKOFF_SECONDS * attempt)
                        continue
                    break

                error = None
                break

            except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as exc:
                elapsed_seconds = time.monotonic() - start
                self._last_request_time = time.monotonic()
                fetched_at = datetime.now(timezone.utc).isoformat()
                error = f"{type(exc).__name__}: {exc}"
                if attempt < MAX_ATTEMPTS:
                    time.sleep(RETRY_BACKOFF_SECONDS * attempt)
                    continue
                break

        request_record = {
            "elapsed_seconds": round(elapsed_seconds, 3),
            "fetched_at": fetched_at,
            "http_status": status,
            "name": name,
            "params": params_no_key,
            "url": url,
        }
        if error:
            request_record["error"] = error

        request_path = self.out_dir / f"{name}.request.json"
        request_path.parent.mkdir(parents=True, exist_ok=True)
        request_path.write_text(_sorted_json_dumps(request_record) + "\n")

        if is_json:
            response_path = self.out_dir / f"{name}.response.json"
            try:
                parsed = json.loads(body_text)
                response_path.write_text(_sorted_json_dumps(parsed) + "\n")
            except (json.JSONDecodeError, ValueError):
                response_path.write_text(body_text or "")
        else:
            response_path = self.out_dir / f"{name}.response.txt"
            response_path.write_text(body_text or "")

        return FetchResult(
            name=name,
            url=url,
            params_no_key=params_no_key,
            status=status,
            elapsed_seconds=elapsed_seconds,
            fetched_at=fetched_at,
            body_text=body_text,
            is_json=is_json,
            error=error,
            request_path=request_path,
            response_path=response_path,
        )
