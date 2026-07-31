"""Maps simple ISO 639-1 codes (used by Whisper + UserSettings.caption_language)
to FLORES-200 codes required by NLLB."""

ISO_TO_FLORES: dict[str, str] = {
    "en": "eng_Latn",
    "es": "spa_Latn",
    "fr": "fra_Latn",
    "de": "deu_Latn",
    "it": "ita_Latn",
    "pt": "por_Latn",
    "nl": "nld_Latn",
    "ru": "rus_Cyrl",
    "zh": "zho_Hans",
    "ja": "jpn_Jpan",
    "ko": "kor_Hang",
    "ar": "arb_Arab",
    "hi": "hin_Deva",
    "bn": "ben_Beng",
    "ur": "urd_Arab",
    "tr": "tur_Latn",
    "vi": "vie_Latn",
    "th": "tha_Thai",
    "pl": "pol_Latn",
    "uk": "ukr_Cyrl",
    "sv": "swe_Latn",
    "fi": "fin_Latn",
    "el": "ell_Grek",
    "he": "heb_Hebr",
    "id": "ind_Latn",
    "ms": "zsm_Latn",
    "fa": "pes_Arab",
    "sw": "swh_Latn",
    "ta": "tam_Taml",
    "te": "tel_Telu",
    "mr": "mar_Deva",
    "gu": "guj_Gujr",
    "pa": "pan_Guru",
}


def to_flores(iso_code: str) -> str | None:
    return ISO_TO_FLORES.get(iso_code.lower())
