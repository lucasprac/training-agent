"""Sample data for a first run: a manager, a trainee and one ready scenario (pt-BR).

Created only on a new database and only when `SAMPLE_DATA` is on (the default).
"""

from sqlmodel import Session, select

from app.models import (
    Assignment,
    Character,
    Competency,
    LoreEntry,
    Persona,
    Profile,
    Scenario,
    ScenarioCompetency,
    StateVariable,
)


def _scale(*descriptions: str) -> list[dict]:
    return [{"level": n, "description": d} for n, d in enumerate(descriptions)]


def seed_sample(db: Session) -> None:
    if db.exec(select(Profile)).first() is not None or db.exec(select(Scenario)).first() is not None:
        return
    manager = Profile(name="Gestor(a)", role="manager")
    trainee = Profile(name="Ana Souza", role="user")
    scenario = Scenario(
        title="Cliente insatisfeita: entrega com defeito",
        summary="Atender uma cliente irritada que recebeu um produto quebrado pela segunda vez.",
        world=(
            "Você trabalha no atendimento ao cliente da Casa Lume, uma loja online de utilidades domésticas. "
            "A conversa acontece no chat de atendimento do site."
        ),
        themes=["atendimento ao cliente", "dificuldade média"],
        scenario_rules=(
            "Carla só se acalma quando se sente ouvida e recebe uma solução concreta, com prazo. "
            "Ela recusa respostas genéricas e promessas sem prazo."
        ),
        briefing=(
            "Você é atendente da Casa Lume. A cliente Carla Mendes abriu o chat: o pedido dela chegou quebrado "
            "pela segunda vez.\n\nSeu objetivo: entender o problema, acalmar a cliente e combinar uma solução "
            "dentro da política da empresa.\n\nPolítica: reenvio grátis, reembolso integral em até 7 dias úteis "
            "ou cupom de até 15% na próxima compra. Acima de 15%, só com aprovação da supervisão.\n\n"
            "Quando a conversa terminar, clique em \"Encerrar simulação\"."
        ),
        opening_message=(
            "*Carla Mendes abre o chat de atendimento.*\n"
            "Boa tarde. Meu pedido chegou quebrado DE NOVO. É a segunda vez. Eu quero saber o que vocês vão fazer."
        ),
        max_turns=12,
    )
    db.add_all([manager, trainee, scenario])
    db.commit()
    db.refresh(scenario)
    db.refresh(trainee)
    sid = scenario.id
    db.add_all(
        [
            Character(
                scenario_id=sid,
                name="Carla Mendes",
                description=(
                    "Cliente da Casa Lume há 3 anos. Comprou um jogo de taças de cristal (pedido 48213) para um jantar "
                    "no sábado. O primeiro envio chegou quebrado; o reenvio também."
                ),
                personality="direta, impaciente e justa: reconhece quando é bem atendida",
                speech_style="frases curtas e informais; usa letras maiúsculas quando está irritada",
            ),
            Persona(scenario_id=sid, name="Atendente", description="Atendente do chat da Casa Lume."),
            LoreEntry(
                scenario_id=sid, title="Política de compensação", kind="concept",
                content=(
                    "Reenvio grátis; reembolso integral em até 7 dias úteis; cupom de até 15% na próxima compra. "
                    "Acima de 15%, só com aprovação da supervisão."
                ),
                keys=["reembolso", "desconto", "cupom", "reenvio", "política", "compensação"],
            ),
            LoreEntry(
                scenario_id=sid, title="Prazo de entrega", kind="concept",
                content="O reenvio expresso chega em 2 dias úteis nas capitais.",
                keys=["prazo", "entrega", "expresso", "sábado"],
            ),
            StateVariable(
                scenario_id=sid, name="Confiança da cliente", kind="scale", order=0, initial_value=1,
                instructions="Quanto Carla confia na Casa Lume agora, depois da ÚLTIMA mensagem?",
                options=_scale(
                    "perdeu a confiança e quer cancelar",
                    "muito desconfiada",
                    "desconfiada, mas ouvindo",
                    "começa a confiar",
                    "confia e está satisfeita",
                ),
            ),
            StateVariable(
                scenario_id=sid, name="Confirmou o pedido", kind="yesno", is_objective=True, order=1,
                tell_narrator=False,
                instructions="O atendente já pediu ou confirmou o número do pedido da Carla?",
            ),
            StateVariable(
                scenario_id=sid, name="Ofereceu solução dentro da política", kind="yesno", is_objective=True, order=2,
                tell_narrator=False,
                instructions=(
                    "O atendente já ofereceu à Carla uma solução permitida pela política: reenvio grátis, "
                    "reembolso ou cupom de até 15%?"
                ),
            ),
            StateVariable(
                scenario_id=sid, name="Combinou um prazo", kind="yesno", is_objective=True, order=3,
                tell_narrator=False,
                instructions="O atendente já informou à Carla um prazo concreto para a solução?",
            ),
            StateVariable(
                scenario_id=sid, name="Desconto oferecido (%)", kind="extract", extract_type="decimal", order=4,
                instructions="o percentual de desconto que o atendente oferece à cliente",
            ),
            Assignment(scenario_id=sid, profile_id=trainee.id, note="Primeiro treinamento de atendimento."),
        ]
    )
    focus = {
        "Empatia": (1.5, "Reconhecer que é a segunda falha e que a cliente precisa das taças para o jantar de sábado."),
        "Escuta ativa": (1.0, ""),
        "Resolução de conflitos": (1.0, ""),
        "Negociação": (1.0, "Oferecer uma compensação dentro do limite de 15% da política."),
    }
    competencies = {c.name: c for c in db.exec(select(Competency))}
    for order, (name, (weight, text)) in enumerate(focus.items()):
        if name in competencies:
            db.add(ScenarioCompetency(scenario_id=sid, competency_id=competencies[name].id, weight=weight, focus=text, order=order))
    db.commit()
