import threading           # <-- ADD

import ctranslate2
import transformers

from app.config import settings
from app.translation.language_codes import to_flores

_translator: ctranslate2.Translator | None = None
_tokenizer: transformers.PreTrainedTokenizerBase | None = None
_translate_lock = threading.Lock()   # <-- ADD — serializes access to the shared tokenizer state


def _get_translator() -> ctranslate2.Translator:
    global _translator
    if _translator is None:
        _translator = ctranslate2.Translator(settings.nllb_model_dir, device="cpu")
    return _translator


def _get_tokenizer() -> transformers.PreTrainedTokenizerBase:
    global _tokenizer
    if _tokenizer is None:
        _tokenizer = transformers.AutoTokenizer.from_pretrained(settings.nllb_model_dir)
    return _tokenizer


def translate(text: str, src_iso: str, tgt_iso: str) -> str | None:
    """Translate text between two ISO 639-1 codes. Returns None if either
    language isn't supported by the NLLB mapping, or unchanged text if
    src == tgt."""
    print(text, "\n", src_iso, tgt_iso)
    if not text.strip():
        return text

    if src_iso.lower() == tgt_iso.lower():
        return text

    src_flores = to_flores(src_iso)
    tgt_flores = to_flores(tgt_iso)
    if src_flores is None or tgt_flores is None:
        return None

    with _translate_lock:   # <-- ADD — only one thread may touch the shared tokenizer at a time
        tokenizer = _get_tokenizer()
        tokenizer.src_lang = src_flores
        tokens = tokenizer.convert_ids_to_tokens(tokenizer.encode(text))

        results = _get_translator().translate_batch([tokens], target_prefix=[[tgt_flores]])
        out_tokens = results[0].hypotheses[0][1:]
        return tokenizer.decode(tokenizer.convert_tokens_to_ids(out_tokens))