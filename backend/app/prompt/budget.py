"""Token estimate. A rough chars/4 count is enough for budgeting; it is not billing."""

MESSAGE_OVERHEAD_TOKENS = 4


def estimate_tokens(text: str) -> int:
    return (len(text) + 3) // 4 if text else 0


def estimate_messages(messages: list[dict[str, str]]) -> int:
    return sum(estimate_tokens(m["content"]) + MESSAGE_OVERHEAD_TOKENS for m in messages)
