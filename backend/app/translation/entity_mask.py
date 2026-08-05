import re

_URL_RE = r"https?://\S+|www\.\S+"
_EMAIL_RE = r"[\w.+-]+@[\w-]+\.[A-Za-z]{2,}"
_PHONE_RE = r"\+?\d[\d\-\.\s]{6,}\d"
_NAME_RE = r"[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)+"

_ENTITY_RE = re.compile(
    f"(?P<URL>{_URL_RE})|(?P<EMAIL>{_EMAIL_RE})|(?P<NUM>{_PHONE_RE})|(?P<NAME>{_NAME_RE})"
)
_PLACEHOLDER_RE = re.compile(r"\b(NAME|EMAIL|URL|NUM)\s*_\s*(\d+)\b")


def mask(text: str) -> tuple[str, dict[str, str]]:
    if not _ENTITY_RE.search(text):
        return text, {}

    counts = {"NAME": 0, "EMAIL": 0, "URL": 0, "NUM": 0}
    mapping: dict[str, str] = {}

    def repl(m: re.Match) -> str:
        kind = m.lastgroup
        placeholder = f"{kind}_{counts[kind]}"
        counts[kind] += 1
        mapping[placeholder] = m.group()
        return placeholder

    return _ENTITY_RE.sub(repl, text), mapping


def unmask(text: str, mapping: dict[str, str]) -> str:
    if not mapping:
        return text
    return _PLACEHOLDER_RE.sub(
        lambda m: mapping.get(f"{m.group(1)}_{m.group(2)}", m.group()), text
    )
