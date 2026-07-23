from __future__ import annotations


def _detect_browser(user_agent: str) -> str | None:
    ua = user_agent.lower()
    if "edg/" in ua:
        return "Edge"
    if "chrome/" in ua and "edg/" not in ua:
        return "Chrome"
    if "firefox/" in ua:
        return "Firefox"
    if "safari/" in ua and "chrome/" not in ua:
        return "Safari"
    return None


def _detect_platform(user_agent: str) -> str | None:
    ua = user_agent.lower()
    if "iphone" in ua:
        return "iPhone"
    if "ipad" in ua:
        return "iPad"
    if "android" in ua:
        return "Android"
    if "mac os x" in ua or "macintosh" in ua:
        return "macOS"
    if "windows" in ua:
        return "Windows"
    if "linux" in ua:
        return "Linux"
    return None


def detect_browser_family(user_agent: str | None) -> str | None:
    raw = (user_agent or "").strip()
    return _detect_browser(raw) if raw else None


def detect_device_family(user_agent: str | None) -> str | None:
    raw = (user_agent or "").strip()
    return _detect_platform(raw) if raw else None


def build_device_label(user_agent: str | None) -> str:
    raw = (user_agent or "").strip()
    if not raw:
        return "Unknown device"
    browser = _detect_browser(raw)
    platform = _detect_platform(raw)
    if browser and platform:
        return f"{browser} on {platform}"
    if browser:
        return browser
    if platform:
        return platform
    return "Unknown device"
