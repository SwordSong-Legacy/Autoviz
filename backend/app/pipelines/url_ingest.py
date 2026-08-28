"""Public URL ingestion helpers for tabular JSON data."""

from __future__ import annotations

import ipaddress
import json
import socket
from urllib.parse import urljoin, urlparse

import httpx


def _is_public_ip(ip_text: str) -> bool:
    """Return True only for globally routable IPs."""
    try:
        ip = ipaddress.ip_address(ip_text)
    except ValueError:
        return False
    return ip.is_global


def _validate_public_host(hostname: str) -> None:
    """Validate host is not localhost/private/link-local and resolves publicly."""
    host = (hostname or "").strip().lower()
    if not host:
        raise ValueError("URL host is missing.")
    if host in {"localhost", "127.0.0.1", "::1"} or host.endswith(".local"):
        raise ValueError("Localhost/internal URLs are not allowed.")

    # If host itself is an IP literal, validate directly.
    try:
        ipaddress.ip_address(host)
        if not _is_public_ip(host):
            raise ValueError("Private/internal IP URLs are not allowed.")
        return
    except ValueError:
        pass

    # Resolve DNS and ensure every resolved address is public.
    try:
        infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise ValueError("URL host cannot be resolved.") from exc

    if not infos:
        raise ValueError("URL host cannot be resolved.")

    for info in infos:
        ip_text = info[4][0]
        if not _is_public_ip(ip_text):
            raise ValueError("Private/internal IP URLs are not allowed.")


def _validate_public_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Only http/https URLs are supported.")
    if parsed.username or parsed.password:
        raise ValueError("URLs with embedded credentials are not supported.")
    _validate_public_host(parsed.hostname or "")


async def fetch_public_json_from_url(
    url: str,
    *,
    timeout_seconds: float,
    max_size_bytes: int,
    max_redirects: int,
) -> tuple[str, str]:
    """Fetch public URL content and return (filename, json_text).

    The function enforces SSRF guardrails and response size limit.
    """
    current_url = url.strip()
    if not current_url:
        raise ValueError("URL is required.")

    timeout = httpx.Timeout(timeout_seconds)
    async with httpx.AsyncClient(timeout=timeout) as client:
        redirect_count = 0
        while True:
            _validate_public_url(current_url)
            try:
                async with client.stream("GET", current_url, follow_redirects=False) as response:
                    # Manual redirect handling with per-hop host validation.
                    if response.status_code in {301, 302, 303, 307, 308}:
                        location = response.headers.get("location")
                        if not location:
                            raise ValueError("Redirect response missing Location header.")
                        if redirect_count >= max_redirects:
                            raise ValueError("Too many redirects.")
                        current_url = urljoin(current_url, location)
                        redirect_count += 1
                        continue

                    if response.status_code >= 400:
                        raise ValueError(f"URL returned HTTP {response.status_code}.")

                    chunks: list[bytes] = []
                    size = 0
                    async for chunk in response.aiter_bytes():
                        size += len(chunk)
                        if size > max_size_bytes:
                            raise ValueError("Fetched content exceeds size limit.")
                        chunks.append(chunk)

                    body = b"".join(chunks)
                    text = body.decode("utf-8", errors="replace")
                    content_type = (response.headers.get("content-type") or "").lower()
                    is_json_type = "application/json" in content_type or "text/json" in content_type
                    try:
                        json.loads(text)
                    except json.JSONDecodeError as exc:
                        if is_json_type:
                            raise ValueError("Response body is not valid JSON.") from exc
                        raise ValueError("URL does not provide JSON content.") from exc
            except httpx.RequestError as exc:
                raise ValueError(f"Failed to fetch URL: {exc}") from exc

            parsed = urlparse(current_url)
            base = parsed.path.rsplit("/", 1)[-1] or "source"
            if "." in base:
                base = base.rsplit(".", 1)[0]
            filename = f"{base or 'source'}.json"
            return filename, text
