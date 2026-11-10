"""Rolling story summary. Sage cannot write text, so the summary model does this."""

from app.clients.openrouter import OpenRouterClient
from app.models import Message
from app.prompt.budget import estimate_tokens

SUMMARY_TRIGGER_RATIO = 0.4  # summarize when unsummarized history > 40% of context
KEEP_RECENT_MESSAGES = 8

SUMMARY_SYSTEM = (
    "You maintain the running summary of an interactive story. Write in the past tense, "
    "third person, as compact factual prose. Keep names, places, objects, promises, "
    "secrets (and who knows them) and unresolved threads. Drop style and dialogue."
)


def needs_summary(history: list[Message], context_size: int) -> bool:
    if len(history) <= KEEP_RECENT_MESSAGES:
        return False
    tokens = sum(estimate_tokens(m.content) for m in history)
    return tokens > context_size * SUMMARY_TRIGGER_RATIO


def messages_to_fold(history: list[Message]) -> list[Message]:
    """The older half of the history, never the last KEEP_RECENT_MESSAGES."""
    foldable = history[:-KEEP_RECENT_MESSAGES]
    half = max(len(history) // 2, 1)
    return foldable[:half]


async def update_summary(
    client: OpenRouterClient,
    model: str,
    current_summary: str,
    to_fold: list[Message],
    persona_name: str,
) -> str:
    transcript = "\n\n".join(
        f"{persona_name if m.role == 'user' else 'Narrator'}: {m.content}" for m in to_fold
    )
    prompt = (
        f"Current summary:\n{current_summary or '(none yet)'}\n\n"
        f"New events to add:\n{transcript}\n\n"
        "Return the updated summary only."
    )
    text = await client.complete(
        model,
        [{"role": "system", "content": SUMMARY_SYSTEM}, {"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=900,
    )
    return text.strip() or current_summary
