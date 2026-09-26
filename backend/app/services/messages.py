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
}
# [VERIFY: 911 interpreter availability statement against an official Ottawa/Ontario page]

_cache: dict[tuple[str, str], str] = {}


class _Translation(BaseModel):
    text: str


async def message(key: str, language: str) -> str:
    table = MESSAGES[key]
    if language in table:
        return table[language]
    if (key, language) in _cache:
        return _cache[(key, language)]
    try:
        res = await gemini.get_gemini().generate_json(
            "translate_message",
            f"Translate into {language_name(language)}. Keep '911' as is. Plain words, grade 6 level.\n\n{table['en']}",
            _Translation,
            temperature=0,
        )
        _cache[(key, language)] = res.text
        return res.text
    except Exception:
        logger.warning("could not translate message %s to %s", key, language)
        return table["en"]
