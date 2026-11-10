"""Starter competency library (pt-BR), created once on an empty database.

Each competency has observable indicators (positive = good behaviour, negative = a
behaviour to avoid) and a 0-4 rubric that Sage uses as the levels of a scale question.
"""

from typing import Any

from sqlmodel import Session, select

from app.models import Competency


def _indicators(*items: tuple[str, str]) -> list[dict[str, Any]]:
    return [{"id": f"i{n}", "text": text, "polarity": polarity} for n, (text, polarity) in enumerate(items, 1)]


def _levels(*descriptions: str) -> list[dict[str, Any]]:
    return [{"level": n, "description": d} for n, d in enumerate(descriptions)]


LIBRARY: list[dict[str, Any]] = [
    {
        "name": "Escuta ativa",
        "description": "Ouve com atenção, confirma o entendimento e usa o que o interlocutor disse.",
        "indicators": _indicators(
            ("Faz perguntas abertas para entender a situação", "positive"),
            ("Resume ou parafraseia o que o interlocutor disse", "positive"),
            ("Usa na resposta um detalhe que o interlocutor citou", "positive"),
            ("Ignora o que foi dito, interrompe ou muda de assunto", "negative"),
        ),
        "levels": _levels(
            "Ignora o que o interlocutor disse",
            "Responde de forma genérica, sem usar o que foi dito",
            "Usa parte do que foi dito, sem confirmar o entendimento",
            "Confirma o entendimento e usa o que foi dito",
            "Confirma, aprofunda com perguntas e usa os detalhes para conduzir a conversa",
        ),
    },
    {
        "name": "Empatia",
        "description": "Reconhece e valida as emoções e a perspectiva do interlocutor.",
        "indicators": _indicators(
            ("Nomeia a emoção ou a preocupação do interlocutor", "positive"),
            ("Valida o sentimento sem culpar o interlocutor", "positive"),
            ("Pede desculpas ou assume a responsabilidade quando cabe", "positive"),
            ("Minimiza, discute ou desqualifica o sentimento do interlocutor", "negative"),
        ),
        "levels": _levels(
            "Ignora ou desqualifica a emoção do interlocutor",
            "Reconhece a emoção de forma genérica ou automática",
            "Reconhece a emoção, mas não a valida",
            "Reconhece e valida a emoção",
            "Valida a emoção e liga a validação a uma ação concreta",
        ),
    },
    {
        "name": "Comunicação clara",
        "description": "Transmite informações de forma objetiva, organizada e fácil de entender.",
        "indicators": _indicators(
            ("Explica o próximo passo com prazo ou responsável", "positive"),
            ("Usa linguagem simples, sem jargão desnecessário", "positive"),
            ("Confirma se o interlocutor entendeu", "positive"),
            ("Dá informação vaga, contraditória ou incompleta", "negative"),
        ),
        "levels": _levels(
            "Mensagem confusa ou contraditória",
            "Mensagem vaga: o interlocutor não sabe o que vai acontecer",
            "Mensagem compreensível, mas incompleta",
            "Mensagem clara e completa",
            "Mensagem clara e completa, com próximos passos e confirmação de entendimento",
        ),
    },
    {
        "name": "Negociação",
        "description": "Busca acordos que atendem às duas partes e protege os interesses da empresa.",
        "indicators": _indicators(
            ("Investiga o interesse por trás do pedido", "positive"),
            ("Propõe opções ou uma troca de valor", "positive"),
            ("Respeita os limites e as políticas da empresa", "positive"),
            ("Cede de imediato, sem negociar e sem necessidade", "negative"),
        ),
        "levels": _levels(
            "Recusa sem alternativa ou cede tudo de imediato",
            "Faz uma proposta sem entender o interesse do interlocutor",
            "Propõe uma solução razoável, sem explorar opções",
            "Explora o interesse e propõe opções dentro da política",
            "Constrói um acordo de valor para as duas partes e confirma os termos",
        ),
    },
    {
        "name": "Resolução de conflitos",
        "description": "Reduz a tensão e conduz a conversa para uma solução.",
        "indicators": _indicators(
            ("Mantém o tom calmo e respeitoso diante de pressão", "positive"),
            ("Separa o problema da pessoa e foca nos fatos", "positive"),
            ("Propõe um caminho concreto para resolver o problema", "positive"),
            ("Responde com agressividade, ironia ou defensividade", "negative"),
        ),
        "levels": _levels(
            "Aumenta o conflito",
            "Reage de forma defensiva",
            "Mantém a calma, mas não conduz para uma solução",
            "Reduz a tensão e propõe uma solução",
            "Reduz a tensão, resolve a causa e recupera a relação",
        ),
    },
]


def seed_library(db: Session) -> None:
    if db.exec(select(Competency)).first() is not None:
        return
    for item in LIBRARY:
        db.add(Competency(**item))
    db.commit()
