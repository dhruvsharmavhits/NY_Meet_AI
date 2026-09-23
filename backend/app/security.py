import hashlib
import hmac
import secrets


def hash_secret(secret: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", secret.encode(), salt.encode(), 200_000).hex()
    return f"{salt}${digest}"


def verify_secret(secret: str, secret_hash: str) -> bool:
    try:
        salt, digest = secret_hash.split("$", 1)
    except ValueError:
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", secret.encode(), salt.encode(), 200_000).hex()
    return hmac.compare_digest(candidate, digest)
