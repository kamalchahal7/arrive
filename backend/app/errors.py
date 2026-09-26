"""Friendly, translatable error codes. The frontend maps each code to a message in the user's language."""


class AppError(Exception):
    def __init__(self, code: str, status_code: int = 400) -> None:
        super().__init__(code)
        self.code = code
        self.status_code = status_code
