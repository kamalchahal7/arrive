"""Fixed messages the backend itself says (not found, handoff, emergency) in the person's language.

en/fr/ar are written here (fr/ar need native review). Other languages are translated once by Gemini and cached.
"""

import logging

from pydantic import BaseModel

from app.services import gemini
from app.services.topics import language_name

logger = logging.getLogger("arrive.messages")

MESSAGES: dict[str, dict[str, str]] = {
    "not_found": {
        "en": "I could not find this in the official sources I use. A settlement worker can help you. It is free.",
        "fr": "Je n'ai pas trouvé cette information dans les sources officielles que j'utilise. Un intervenant en établissement peut vous aider. C'est gratuit.",
        "ar": "لم أجد هذه المعلومة في المصادر الرسمية التي أستخدمها. يمكن لموظف خدمات التوطين مساعدتك مجانًا.",
    },
    "case_specific": {
        "en": "This question is about your own immigration case. I can only share general official information. A settlement worker or a lawyer can look at your situation. Settlement help is free.",
        "fr": "Cette question concerne votre propre dossier d'immigration. Je peux seulement donner de l'information officielle générale. Un intervenant en établissement ou un avocat peut examiner votre situation. L'aide à l'établissement est gratuite.",
        "ar": "هذا السؤال يتعلق بملف الهجرة الخاص بك. أستطيع فقط تقديم معلومات رسمية عامة. يمكن لموظف خدمات التوطين أو محامٍ النظر في وضعك. خدمات التوطين مجانية.",
    },
    "emergency": {
        "en": "If you or someone else is in danger right now, call 911. It is free, and you can ask for an interpreter.",
        "fr": "Si vous ou une autre personne êtes en danger maintenant, appelez le 911. C'est gratuit et vous pouvez demander un interprète.",
        "ar": "إذا كنت أنت أو شخص آخر في خطر الآن، اتصل بالرقم 911. الاتصال مجاني ويمكنك طلب مترجم.",
    },
    "disclaimer": {
        "en": "This is information, not legal or tax advice.",
        "fr": "Ceci est de l'information, pas un avis juridique ou fiscal.",
        "ar": "هذه معلومات وليست استشارة قانونية أو ضريبية.",
    },
    "scam_likely_scam": {
        "en": "This looks like a scam.",
        "fr": "Ceci ressemble à une arnaque.",
        "ar": "يبدو أن هذا احتيال.",
    },
    "scam_likely_real": {
        "en": "This may be real, but check it using the official website or phone number.",
        "fr": "Ceci est peut-être réel, mais vérifiez avec le site Web ou le numéro de téléphone officiel.",
        "ar": "قد يكون هذا حقيقيًا، لكن تحقق منه عبر الموقع الرسمي أو رقم الهاتف الرسمي.",
    },
    "scam_unsure": {
        "en": "I can't tell for sure. Be careful and do not pay or share personal information yet.",
        "fr": "Je ne peux pas en être sûr. Soyez prudent et ne payez rien et ne donnez aucun renseignement personnel pour l'instant.",
        "ar": "لا أستطيع التأكد. كن حذرًا ولا تدفع أي مال ولا تشارك معلوماتك الشخصية الآن.",
    },
    "error": {
        "en": "Sorry, something went wrong. Please try again, or talk to a person.",
        "fr": "Désolé, un problème est survenu. Réessayez ou parlez à une personne.",
        "ar": "عذرًا، حدث خطأ. حاول مرة أخرى أو تحدث إلى شخص.",
    },
    "handoff_unavailable": {
        "en": "I can't send your contact details right now. Please use Talk to a person in the app, or visit a settlement agency.",
        "fr": "Je ne peux pas envoyer vos coordonnées pour le moment. Utilisez « Parler à une personne » dans l'application, ou allez dans un organisme d'aide à l'établissement.",
        "ar": "لا أستطيع إرسال بيانات التواصل الخاصة بك الآن. استخدم خيار «تحدث إلى شخص» في التطبيق، أو زر إحدى وكالات خدمات التوطين.",
    },
    # ---- Voice onboarding (docs/REDESIGN.md section 4) ----
    "onboarding_not_understood": {
        "en": "Sorry, I did not understand. You can try again, or tap your answer on the screen.",
        "fr": "Désolé, je n'ai pas compris. Vous pouvez réessayer, ou toucher votre réponse à l'écran.",
        "ar": "عذرًا، لم أفهم. يمكنك المحاولة مرة أخرى، أو لمس إجابتك على الشاشة.",
    },
    # ---- Household checklist (docs/REDESIGN.md section 5). {n} is a number filled in by the app. ----
    "person_you": {"en": "You", "fr": "Vous", "ar": "أنت"},
    "person_adult": {"en": "Adult {n}", "fr": "Adulte {n}", "ar": "البالغ {n}"},
    "person_senior": {"en": "Senior {n}", "fr": "Aîné {n}", "ar": "المسنّ {n}"},
    "person_child": {"en": "Child {n}", "fr": "Enfant {n}", "ar": "الطفل {n}"},
    "person_household": {"en": "Your family", "fr": "Votre famille", "ar": "عائلتك"},
    "group_adult": {
        "en": "An adult in your family with a disability",
        "fr": "Un adulte de votre famille ayant un handicap",
        "ar": "شخص بالغ في عائلتك لديه إعاقة",
    },
    "group_senior": {
        "en": "A senior in your family with a disability",
        "fr": "Un aîné de votre famille ayant un handicap",
        "ar": "شخص مسنّ في عائلتك لديه إعاقة",
    },
    "group_child": {
        "en": "A child in your family with a disability",
        "fr": "Un enfant de votre famille ayant un handicap",
        "ar": "طفل في عائلتك لديه إعاقة",
    },
    "phase_first_3_days": {"en": "First 3 days", "fr": "3 premiers jours", "ar": "الأيام الثلاثة الأولى"},
    "phase_first_2_weeks": {"en": "First 2 weeks", "fr": "2 premières semaines", "ar": "الأسبوعان الأولان"},
    "phase_first_month": {"en": "First month", "fr": "Premier mois", "ar": "الشهر الأول"},
    "phase_first_3_months": {"en": "First 3 months", "fr": "3 premiers mois", "ar": "الأشهر الثلاثة الأولى"},
    "phase_first_year": {"en": "First year", "fr": "Première année", "ar": "السنة الأولى"},
    "note_outside_ottawa": {
        "en": "Local offices for your city are not available yet.",
        "fr": "Les bureaux locaux de votre ville ne sont pas encore disponibles.",
        "ar": "مكاتب مدينتك المحلية غير متوفرة بعد.",
    },
    "note_outside_ontario": {
        "en": "For now, Arrive only shows federal steps for your province. Provincial steps are not available yet.",
        "fr": "Pour l'instant, Arrive montre seulement les étapes fédérales pour votre province. Les étapes provinciales ne sont pas encore disponibles.",
        "ar": "حاليًا، يعرض Arrive الخطوات الفيدرالية فقط لمقاطعتك. خطوات المقاطعة غير متوفرة بعد.",
    },
}
# [VERIFY: 911 interpreter availability statement against an official Ottawa/Ontario page]

_cache: dict[tuple[str, str], str] = {}


def _fill(text: str, values: dict[str, object]) -> str:
    for k, v in values.items():
        text = text.replace("{" + k + "}", str(v))
    return text


async def message(key: str, language: str, **values: object) -> str:
    return _fill((await messages([key], language))[key], values)


class _Batch(BaseModel):
    texts: list[str]


async def messages(keys: list[str], language: str) -> dict[str, str]:
    """Several fixed messages at once. Languages without a written version (e.g. Dari, Pashto, Tigrinya) are
    translated in ONE Gemini call and cached; on any failure the English text is used."""
    out: dict[str, str] = {}
    missing: list[str] = []
    for key in dict.fromkeys(keys):
        table = MESSAGES[key]
        if language in table:
            out[key] = table[language]
        elif (key, language) in _cache:
            out[key] = _cache[(key, language)]
        else:
            missing.append(key)
    if not missing:
        return out
    sources = [MESSAGES[k]["en"] for k in missing]
    try:
        res = await gemini.get_gemini().generate_json(
            "translate_message",
            f"Translate each text into {language_name(language)}. Return exactly {len(sources)} texts in the same "
            "order. Keep '911' and anything in {curly braces} exactly as is. Plain words, grade 6 level.\n\n"
            + "\n".join(f"{i + 1}. {t}" for i, t in enumerate(sources)),
            _Batch,
            temperature=0,
        )
        if len(res.texts) != len(sources):
            raise ValueError("count mismatch")
        for key, text in zip(missing, res.texts, strict=True):
            _cache[(key, language)] = text.strip()
            out[key] = text.strip()
    except Exception:
        logger.warning("could not translate %d messages to %s", len(missing), language)
        for key in missing:
            out[key] = MESSAGES[key]["en"]
    return out
