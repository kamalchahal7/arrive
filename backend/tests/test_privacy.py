import pytest

from app.services.privacy import scrub


@pytest.mark.parametrize(
    "text, secret",
    [
        ("email me at amira.h@example.com please", "amira.h@example.com"),
        ("my number is (613) 555-0123", "555-0123"),
        ("call +1 613 555 0123", "555 0123"),
        ("I live at 123 Rideau Street near the mall", "123 Rideau Street"),
        ("postal code K1A 0B1", "K1A 0B1"),
        ("born 1987-03-14", "1987-03-14"),
        ("my SIN is 123 456 789", "123 456 789"),
        ("UCI 1234-5678", "1234-5678"),
        ("passport AB1234567", "AB1234567"),
        ("my name is Amira Haddad and I need help", "Amira Haddad"),
        ("je m'appelle Jean Dupont", "Jean Dupont"),
    ],
)
def test_scrub_removes_personal_details(text: str, secret: str) -> None:
    assert secret not in (scrub(text) or "")


def test_scrub_keeps_generic_text() -> None:
    text = "health card coverage for refugee children"
    assert scrub(text) == text
