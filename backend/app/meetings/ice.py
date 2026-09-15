import base64
import hashlib
import hmac
import time

from app.config import settings

# Kept as the last-resort relay when no TURN is configured so behaviour for
# networks that already work (direct/STUN) is unchanged.
_LEGACY_TURN = [
    {"urls": "turn:openrelay.metered.ca:80", "username": "openrelayproject", "credential": "openrelayproject"},
    {"urls": "turn:openrelay.metered.ca:443", "username": "openrelayproject", "credential": "openrelayproject"},
    {"urls": "turn:openrelay.metered.ca:443?transport=tcp", "username": "openrelayproject", "credential": "openrelayproject"},
]


def _time_limited_turn_credentials(user_id: str) -> tuple[str, str]:
    expiry = int(time.time()) + settings.turn_credential_ttl_seconds
    username = f"{expiry}:{user_id}"
    digest = hmac.new(settings.turn_secret.encode(), username.encode(), hashlib.sha1).digest()
    return username, base64.b64encode(digest).decode()


def build_ice_servers(user_id: str) -> list[dict]:
    servers: list[dict] = [{"urls": url} for url in settings.stun_urls]

    if settings.turn_urls:
        if settings.turn_secret:
            username, credential = _time_limited_turn_credentials(user_id)
        else:
            username, credential = settings.turn_username or "", settings.turn_credential or ""
        servers.append({"urls": list(settings.turn_urls), "username": username, "credential": credential})

    servers.extend(_LEGACY_TURN)
    return servers
