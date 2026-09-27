"""Voice onboarding (docs/REDESIGN.md section 4.2): understand one spoken or typed answer.

Audio -> ElevenLabs speech-to-text -> Gemini fills a response schema for that question and writes a short
confirmation in the person's language. Nothing here is stored: not the audio, not the transcript. Only the values
the person confirms are saved later, with the profile.
"""

import logging
from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, Field

from app import prompts
from app.services import gemini
from app.services.messages import messages
from app.services.topics import language_name

logger = logging.getLogger("arrive.onboarding")

QuestionKey = Literal[
    "first_name", "city", "province", "country_of_origin", "gender", "self_age", "household", "disability",
    "languages_spoken", "satisfaction",
]
MAX_TEXT = 300
MAX_COUNT = 20

# ISO 3166-1 alpha-2, plus XK (Kosovo, widely used although user-assigned).
COUNTRY_CODES = frozenset("""
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA
CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA
GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS
MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS
RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW
TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW XK
""".split())

# Languages the person can say they speak (keep in step with OTHER_LANGUAGES in frontend/src/config/languages.ts).
SpokenLanguage = Literal[
    "en", "fr", "ar", "prs", "ps", "ti", "fa", "ur", "ku", "tr", "so", "am", "om", "sw", "rw", "ln", "uk", "ru",
    "es", "uz", "tg", "hi", "pa", "bn", "ta", "my", "ne", "zh",
]


# ---------- what Gemini fills in, per question ----------

class _Answer(BaseModel):
    understood: bool
    declined: bool = False
    confirmation: str


class _FirstName(_Answer):
    first_name: str | None = Field(None, description="the name the person wants to be called, as said")


class _City(_Answer):
    lives_in_ottawa: bool | None = Field(None, description="true if the person lives in Ottawa (including its suburbs)")
    city_name: str | None = Field(None, description="the city name if it is not Ottawa")


class _Province(_Answer):
    in_ontario: bool | None = Field(None, description="true if the person's city is in the province of Ontario")


class _Country(_Answer):
    country_code: str | None = Field(None, description="ISO 3166-1 alpha-2 code of the country they came from")


class _Gender(_Answer):
    gender: Literal["woman", "man", "another", "prefer_not_to_say"] | None = None


class _SelfAge(_Answer):
    is_65_or_older: bool | None = None


class _Household(_Answer):
    # People who arrived WITH the person, not counting the person.
    other_adults_18_64: int | None = None
    other_seniors_65_plus: int | None = None
    children_0_5: int | None = None
    children_6_17: int | None = None
    children_age_unknown: int | None = Field(None, description="children whose age the person did not say")


class _Disability(_Answer):
    nobody: bool = Field(False, description="true if the person says nobody has a disability or long-term condition")
    adult: bool = Field(False, description="an adult aged 18 to 64 has one")
    senior: bool = Field(False, description="a senior aged 65 or older has one")
    child: bool = Field(False, description="a child under 18 has one")


class _Satisfaction(_Answer):
    score: int | None = Field(None, description="1 = very unhappy ... 5 = very happy")


class _Languages(_Answer):
    languages: list[SpokenLanguage] = Field(default_factory=list)


@dataclass(frozen=True)
class Question:
    meaning: str
    schema: type[_Answer]
    details: str = ""


QUESTIONS: dict[str, Question] = {
    "first_name": Question("What should I call you?", _FirstName, "Only a first name or nickname is needed."),
    "city": Question("Which city are you living in now?", _City),
    "province": Question("Is your city in Ontario, or in another province?", _Province),
    "country_of_origin": Question(
        "Which country are you coming from?", _Country,
        "If they name a country, give its ISO code. If they name a city or region, give the code only if the country "
        "is certain.",
    ),
    "gender": Question(
        "How do you describe your gender?", _Gender, "Use prefer_not_to_say if they do not want to say.",
    ),
    "self_age": Question("Are you 65 years old or older?", _SelfAge),
    "household": Question(
        "Who arrived in Canada with you? (Family members who came with you and live with you now.)", _Household,
        "Count only the OTHER people, never the person answering. Adults are 18 to 64, seniors 65 or older. "
        "Parents or grandparents count as seniors only if the person says they are 65 or older or calls them old or "
        "elderly; otherwise put them in other_adults_18_64. Spouses and siblings over 17 are adults. Children with an "
        "age go in children_0_5 or children_6_17; children without an age go in children_age_unknown. "
        "If they came alone, all counts are 0.",
    ),
    "disability": Question(
        "Does anyone in your family have a disability or a long-term health condition?", _Disability,
        "Mark each group that has someone with a disability or long-term condition. The person answering is also part "
        "of the family. Use declined if they prefer not to say.",
    ),
    "satisfaction": Question(
        "Did Arrive help you today? (1 = not at all, 5 = very much)", _Satisfaction,
        "Map the answer to a score from 1 to 5.",
    ),
    "languages_spoken": Question(
        "Which other languages do you speak, besides {language}?", _Languages,
        "Give language codes from the allowed list only. Do not include {language}.",
    ),
}


# ---------- result ----------

@dataclass
class Understood:
    question_key: str
    understood: bool
    declined: bool
    value: dict[str, Any]
    confirmation: str


def _clean_text(value: str | None, limit: int, *, sentence: bool = False) -> str | None:
    """Printable characters, single spaces, capped. Names and places also lose stray punctuation at the ends."""
    if not value:
        return None
    value = " ".join("".join(c for c in value if c.isprintable()).split())[:limit]
    value = value.strip() if sentence else value.strip(" .,;:!?؟،")
    return value or None


def _count(value: int | None) -> int:
    return max(0, min(MAX_COUNT, int(value or 0)))


def to_value(key: str, a: _Answer, ui_language: str) -> tuple[dict[str, Any], bool]:
    """Profile fields from Gemini's answer, validated. Returns (value, still_understood)."""
    if isinstance(a, _FirstName):
        name = _clean_text(a.first_name, 40)
        return ({"first_name": name}, name is not None)
    if isinstance(a, _City):
        if a.lives_in_ottawa:
            return ({"city": "ottawa", "city_name": None, "province": "ontario"}, True)
        name = _clean_text(a.city_name, 80)
        return ({"city": "other", "city_name": name}, a.lives_in_ottawa is False or name is not None)
    if isinstance(a, _Province):
        if a.in_ontario is None:
            return ({}, False)
        return ({"province": "ontario" if a.in_ontario else "other"}, True)
    if isinstance(a, _Country):
        code = (a.country_code or "").strip().upper()
        return ({"country_of_origin": code}, True) if code in COUNTRY_CODES else ({}, False)
    if isinstance(a, _Gender):
        return ({"gender": a.gender}, True) if a.gender else ({}, False)
    if isinstance(a, _SelfAge):
        if a.is_65_or_older is None:
            return ({}, False)
        return ({"self_age_group": "senior" if a.is_65_or_older else "adult"}, True)
    if isinstance(a, _Household):
        return ({
            "other_adults": _count(a.other_adults_18_64),
            "other_seniors": _count(a.other_seniors_65_plus),
            "children_0_5": _count(a.children_0_5),
            "children_6_17": _count(a.children_6_17),
            "children_age_unknown": _count(a.children_age_unknown),
        }, True)
    if isinstance(a, _Disability):
        if a.nobody and not (a.adult or a.senior or a.child):
            return ({"disability_adult": False, "disability_senior": False, "disability_child": False}, True)
        if not (a.adult or a.senior or a.child):
            return ({}, False)
        return ({"disability_adult": a.adult, "disability_senior": a.senior, "disability_child": a.child}, True)
    if isinstance(a, _Satisfaction):
        return ({"satisfaction": a.score}, True) if a.score and 1 <= a.score <= 5 else ({}, False)
    if isinstance(a, _Languages):
        langs = [code for code in dict.fromkeys(a.languages) if code != ui_language]
        return ({"other_languages": langs}, True)
    return ({}, False)


def _declined_value(key: str) -> dict[str, Any]:
    """What "I'd rather not say" means for each optional question (required ones just stay unanswered)."""
    return {
        "first_name": {"first_name": None},
        "country_of_origin": {"country_of_origin": None},
        "gender": {"gender": "prefer_not_to_say"},
        "disability": {"disability_adult": None, "disability_senior": None, "disability_child": None},
        "languages_spoken": {"other_languages": []},
    }.get(key, {})


async def understand(key: str, answer: str, language: str) -> Understood:
    q = QUESTIONS[key]
    lang_name = language_name(language)
    answer = _clean_text(answer, MAX_TEXT, sentence=True) or ""
    if not answer:
        return await _not_understood(key, language)
    res = await gemini.get_gemini().generate_json(
        "onboarding_answer",
        prompts.render(
            "onboarding_answer",
            question=q.meaning.replace("{language}", lang_name),
            details=q.details.replace("{language}", lang_name),
            language=lang_name,
            answer=answer,
        ),
        q.schema,
        temperature=0,
        timeout=20,
    )
    if res.declined:
        value = _declined_value(key)
        if value:
            return Understood(key, True, True, value, _clean_text(res.confirmation, 300, sentence=True) or "")
        return await _not_understood(key, language)
    value, ok = to_value(key, res, language)
    if not (res.understood and ok):
        return await _not_understood(key, language)
    return Understood(key, True, False, value, _clean_text(res.confirmation, 300, sentence=True) or "")


async def _not_understood(key: str, language: str) -> Understood:
    words = await messages(["onboarding_not_understood"], language)
    return Understood(key, False, False, {}, words["onboarding_not_understood"])
