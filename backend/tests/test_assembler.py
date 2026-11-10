import random
import re

from app.models import Character, GlobalRule, LoreEntry, MemoryItem, Message, Persona, PromptPreset, Scenario
from app.prompt.assembler import AssemblyInput, AuthorsNote, assemble
from app.prompt.blocks import default_block_order
from app.prompt.macros import expand
from app.sage.labels import Label, LabelSet
from app.seed import DEFAULT_HARNESS_LEGEND, DEFAULT_MAIN_PROMPT, DEFAULT_POST_HISTORY

MIRA, KADE = 1, 2


def base_input(**overrides):
    labels = LabelSet()
    labels.put(Label(key="scene.location", value="Docks", probability=0.93))
    labels.put(Label(key="scene.mood", value="tense", certainty="carried"))
    labels.put(Label(key="scene.present", value=[MIRA]))
    inp = AssemblyInput(
        preset=PromptPreset(main_prompt=DEFAULT_MAIN_PROMPT, harness_legend=DEFAULT_HARNESS_LEGEND, post_history=DEFAULT_POST_HISTORY, block_order=default_block_order(), context_size=32000, max_tokens=800),
        rules=[GlobalRule(title="Total immersion", text="Feel the heat.", order=0), GlobalRule(title="Off rule", text="hidden", enabled=False, order=1)],
        scenario=Scenario(title="Neon Harbor", world="A port city.", scenario_rules="No guns."),
        characters=[
            Character(id=MIRA, scenario_id=1, name="Mira", description="A smuggler. Trusts no one.", example_dialogues="Mira: Quiet."),
            Character(id=KADE, scenario_id=1, name="Kade", description="A guard. Talks a lot."),
        ],
        persona=Persona(name="Ash", description="A courier."),
        labels=labels,
        lore=[
            LoreEntry(id=1, title="Guild Law", content="Duels settle disputes.", position="before_char", order=50),
            LoreEntry(id=2, title="Secret", content="Mira owes a debt.", known_by=[MIRA], order=80),
            LoreEntry(id=3, title="Bell", content="The bell rings.", position="at_depth", depth=0, order=1),
        ],
        memory=[
            MemoryItem(id=1, session_id=1, content="Ash arrived by ferry."),
            MemoryItem(id=2, session_id=1, content="Mira hid the key.", known_by=[MIRA]),
            MemoryItem(id=3, session_id=1, content="Kade took a bribe.", known_by=[KADE]),
        ],
        summary="Earlier, Ash met Mira.",
        history=[
            Message(session_id=1, turn_index=0, role="assistant", content="Rain falls."),
            Message(session_id=1, turn_index=1, role="user", content="I look around."),
            Message(session_id=1, turn_index=1, role="assistant", content="Neon flickers."),
            Message(session_id=1, turn_index=2, role="user", content="I approach Mira."),
        ],
        guidance=["Pacing: keep momentum."],
        authors_note=AuthorsNote(text="Keep it noir.", depth=2, frequency=1),
        turn=2,
        rng=random.Random(0),
    )
    for key, value in overrides.items():
        setattr(inp, key, value)
    return inp


def system_text(out):
    """System message without the harness legend (the legend names every tag)."""
    text = out.messages[0]["content"]
    if "</harness_legend>" in text:
        before, after = text.split("<harness_legend>", 1)
        text = before + "<harness_legend>" + after.split("</harness_legend>", 1)[1]
    return text


def test_block_order_and_tags():
    out = assemble(base_input())
    text = system_text(out)
    tags = ["<main_prompt>", "<harness_legend>", "<global_rules>", "<scenario_rules>", '<lore position="before_char">', '<persona name="Ash">', '<character name="Mira">', '<character_absent name="Kade">', '<scenario title="Neon Harbor">', '<lore position="after_char">', "<memory>", "<story_so_far>", '<examples character="Mira">']
    positions = [text.index(t) for t in tags]
    assert positions == sorted(positions)
    assert out.messages[-1]["role"] == "system" and out.messages[-1]["content"].startswith("<post_history>")
    assert "{{user}}" not in text and "Ash" in text


def test_global_rules_always_present_and_disabled_rules_hidden():
    order = [dict(b, enabled=False) for b in default_block_order()]
    inp = base_input()
    inp.preset.block_order = order
    out = assemble(inp)
    text = system_text(out)
    assert "<global_rules>" in text and "Total immersion" in text
    assert "hidden" not in text
    assert "<persona" not in text  # optional block turned off


def test_in_chat_injection_depths():
    out = assemble(base_input())
    roles = [(m["role"], m["content"][:14]) for m in out.messages]
    contents = [m["content"] for m in out.messages]
    last_user = contents.index("I approach Mira.")
    # scene note at depth 1 -> directly before the last message
    assert contents[last_user - 1].startswith("<scene ")
    # depth-0 lore after the last message, before post_history
    assert contents[last_user + 1].startswith('<entry title="Bell"')
    # Author's Note at depth 2 -> before the last two messages
    an_index = next(i for i, c in enumerate(contents) if c.startswith("<authors_note>"))
    assert contents[an_index + 1] == "Neon flickers."
    assert roles[-1][0] == "system"


def test_veil_of_knowledge():
    out = assemble(base_input())
    text = system_text(out)
    mira_block = re.search(r'<character name="Mira">(.*?)</character>', text, re.S).group(1)
    assert "Mira hid the key." in mira_block
    assert "Kade took a bribe." not in mira_block
    memory_block = re.search(r"<memory>(.*?)</memory>", text, re.S).group(1)
    assert "Ash arrived by ferry." in memory_block
    assert 'Kade took a bribe. (known_by="Kade")' in memory_block  # private item of absent character
    assert "Mira hid the key." not in memory_block
    assert 'secret_from="Kade"' in text


def test_no_probabilities_and_tentative_scene():
    out = assemble(base_input())
    everything = "\n".join(m["content"] for m in out.messages)
    assert "0.93" not in everything and "probability" not in everything
    scene = next(m["content"] for m in out.messages if m["content"].startswith("<scene "))
    assert 'location="Docks"' in scene and 'mood="tense"' in scene and 'present="Mira"' in scene
    assert 'certainty="tentative"' in scene
    assert "Pacing: keep momentum." in scene


def test_scenario_overrides_keep_original():
    inp = base_input()
    inp.scenario.main_prompt_override = "{{original}}\nFocus on the docks."
    inp.scenario.post_history_override = "Be terse. {{original}}"
    out = assemble(inp)
    assert "You are the narrator" in system_text(out) and "Focus on the docks." in system_text(out)
    assert out.messages[-1]["content"].startswith("<post_history>\nBe terse. Stay in character")


def test_ooc_instruction_in_post_history():
    out = assemble(base_input(ooc=True))
    assert "out of character" in out.messages[-1]["content"]


def test_authors_note_frequency():
    out = assemble(base_input(authors_note=AuthorsNote(text="Keep it noir.", depth=2, frequency=3), turn=2))
    assert not any(m["content"].startswith("<authors_note>") for m in out.messages)


def test_trimming_order():
    inp = base_input()
    inp.history = [Message(session_id=1, turn_index=i, role="user" if i % 2 else "assistant", content="long " * 300) for i in range(40)]
    inp.preset.context_size = 4000
    inp.preset.max_tokens = 500
    out = assemble(inp)
    assert out.tokens <= out.budget
    assert out.trimmed["examples"] == 1 and out.trimmed["absent"] == 1
    assert out.trimmed["history"] > 0
    assert out.messages[-2]["content"] == inp.history[-1].content or any(m["content"] == inp.history[-1].content for m in out.messages)


def test_macros():
    assert expand("{{User}} meets {{char}}", {"user": "Ash", "char": "Mira"}) == "Ash meets Mira"
    assert expand("{{unknown}}", {}) == "{{unknown}}"
    value = int(expand("{{roll::2d6}}", {}, random.Random(3)))
    assert 2 <= value <= 12
