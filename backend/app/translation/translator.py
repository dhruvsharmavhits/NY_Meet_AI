import threading
import time

import ctranslate2
import transformers

from app.config import settings
from app.translation.entity_mask import mask, unmask
from app.translation.language_codes import to_flores

_translator: ctranslate2.Translator | None = None
_tokenizer: transformers.PreTrainedTokenizerBase | None = None
_init_lock = threading.Lock()
_encode_lock = threading.Lock()


def _get_translator() -> ctranslate2.Translator:
    global _translator
    if _translator is None:
        with _init_lock:
            if _translator is None:
                _translator = ctranslate2.Translator(settings.nllb_model_dir, device="cpu", inter_threads=4)
    return _translator


def _get_tokenizer() -> transformers.PreTrainedTokenizerBase:
    global _tokenizer
    if _tokenizer is None:
        with _init_lock:
            if _tokenizer is None:
                try:
                    _tokenizer = transformers.AutoTokenizer.from_pretrained(
                        settings.nllb_model_dir, fix_mistral_regex=True
                    )
                except TypeError:
                    _tokenizer = transformers.AutoTokenizer.from_pretrained(settings.nllb_model_dir)
    return _tokenizer


def warmup() -> None:
    translate("hello", "en", "hi")


def translate(text: str, src_iso: str, tgt_iso: str) -> str | None:
    """Translate text between two ISO 639-1 codes. Returns None if either
    language isn't supported by the NLLB mapping, or unchanged text if
    src == tgt."""
    if not text.strip():
        return text

    if src_iso.lower() == tgt_iso.lower():
        return text

    src_flores = to_flores(src_iso)
    tgt_flores = to_flores(tgt_iso)
    if src_flores is None or tgt_flores is None:
        return None

    masked_text, entities = mask(text)

    tokenizer = _get_tokenizer()
    t0 = time.perf_counter()
    with _encode_lock:
        tokenizer.src_lang = src_flores
        tokens = tokenizer.convert_ids_to_tokens(tokenizer.encode(masked_text))
    t1 = time.perf_counter()

    results = _get_translator().translate_batch([tokens], target_prefix=[[tgt_flores]])
    t2 = time.perf_counter()

    out_tokens = results[0].hypotheses[0][1:]
    decoded = tokenizer.decode(tokenizer.convert_tokens_to_ids(out_tokens))
    decoded = unmask(decoded, entities)
    t3 = time.perf_counter()

    print(
        f"[Translate] tokenize={(t1 - t0) * 1000:.1f}ms infer={(t2 - t1) * 1000:.1f}ms decode={(t3 - t2) * 1000:.1f}ms"
    )
    return decoded