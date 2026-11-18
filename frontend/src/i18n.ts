import { createContext, createElement, Fragment, useContext, type ReactNode } from 'react'

/**
 * Small UI translation layer. English strings are the message keys and the fallback.
 * Every key must have a pt-BR entry: `t()` only accepts keys of `ptBR`, so a missing
 * translation is a type error. Placeholders use `{name}` and are filled from `vars`.
 *
 * Text that comes from the backend (prompt presets, block labels, degraded-mode reasons,
 * guard notices, errors) and technical identifiers (tag names, label keys, roles) are not translated here.
 */
const ptBR = {
  // App shell
  'Prompt Manager': 'Gerenciador de prompts',
  'Settings': 'Configurações',
  'Language': 'Idioma',
  'backend offline': 'backend offline',
  'OpenRouter API key': 'Chave de API do OpenRouter',
  'Sage API key and /ready': 'Chave de API do Sage e /ready',

  // Shared
  'Loading…': 'Carregando…',
  'Save': 'Salvar',
  'Saving…': 'Salvando…',
  'Saved': 'Salvo',
  'Delete': 'Excluir',
  'Cancel': 'Cancelar',
  'Edit': 'Editar',
  'Position': 'Posição',
  'Text': 'Texto',
  'Depth': 'Profundidade',
  "Author's Note": 'Nota do Autor',
  'turn {n}': 'turno {n}',
  'Delete {name}?': 'Excluir {name}?',
  'Delete "{name}"?': 'Excluir "{name}"?',
  'shared': 'compartilhado',
  'known by {names}': 'conhecido por {names}',
  'yes': 'sim',
  'no': 'não',

  // Library
  'New scenario': 'Novo cenário',
  'Scenarios': 'Cenários',
  'No description': 'Sem descrição',
  'Delete scenario': 'Excluir cenário',
  'Sessions': 'Sessões',
  'No sessions yet.': 'Ainda não há sessões.',
  'Continue': 'Continuar',
  'Delete session': 'Excluir sessão',
  'Delete "{title}" and all its sessions? This cannot be undone.':
    'Excluir "{title}" e todas as sessões dele? Não é possível desfazer.',
  'Delete this session? This cannot be undone.': 'Excluir esta sessão? Não é possível desfazer.',

  // Personas
  // Settings
  'Connections': 'Conexões',
  'API key set': 'Chave de API configurada',
  'OPENROUTER_API_KEY missing in .env': 'OPENROUTER_API_KEY ausente no .env',
  'API key set, /ready = 200': 'Chave de API configurada, /ready = 200',
  'API key set, service not ready': 'Chave de API configurada, serviço não está pronto',
  'SAGE_API_KEY missing — turns run in degraded mode': 'SAGE_API_KEY ausente: os turnos rodam em modo degradado',
  'ok': 'ok',
  'off': 'desligado',
  'degraded': 'degradado',
  'Summary model': 'Modelo de resumo',
  'Backend not reachable.': 'Não foi possível acessar o backend.',
  'Keys are read from the {file} file in the project folder. They are never sent to the browser.':
    'O sistema lê as chaves do arquivo {file} na pasta do projeto. Elas nunca vão para o navegador.',
  'Current:': 'Atual:',
  '{n} ctx': '{n} ctx',
  'Use .env default': 'Usar o padrão do .env',
  'Search OpenRouter models…': 'Buscar modelos do OpenRouter…',
  'Temperature': 'Temperatura',
  'Max response tokens': 'Máximo de tokens na resposta',
  'Context size (tokens)': 'Tamanho do contexto (tokens)',
  'Sage reasoning': 'Raciocínio do Sage',
  'off (fast)': 'desligado (rápido)',
  'auto': 'automático',
  'on (slow)': 'ligado (lento)',
  'Save settings': 'Salvar configurações',

  // Prompt Manager
  'Move up': 'Mover para cima',
  'Move down': 'Mover para baixo',
  'On': 'Ligada',
  'Delete rule "{title}"?': 'Excluir a regra "{title}"?',
  'Global rules': 'Regras globais',
  '+ Add rule': '+ Adicionar regra',
  'New rule': 'Nova regra',
  'Prompts': 'Prompts',
  'Main prompt → <main_prompt>': 'Prompt principal → <main_prompt>',
  'Harness legend → <harness_legend> (explains the tags and their authority)':
    'Legenda do harness → <harness_legend> (explica as tags e a autoridade de cada uma)',
  'Post-history instructions → <post_history> (sent last)': 'Instruções pós-histórico → <post_history> (vão por último)',
  "Author's Note (default)": 'Nota do Autor (padrão)',
  'In chat @ depth': 'No chat @ profundidade',
  'After scenario': 'Depois do cenário',
  'Frequency (0 = never, 1 = every message)': 'Frequência (0 = nunca, 1 = toda mensagem)',
  'Block order': 'Ordem dos blocos',
  "Blocks above Chat History form the system prompt, in this order. In-chat injections (Author's Note, @depth lore, character notes, scene note) are placed inside the history by depth. Required blocks cannot be turned off.":
    'Os blocos acima de Chat History formam o prompt de sistema, nesta ordem. As injeções no chat (Nota do Autor, lore @depth, notas de personagem, nota de cena) entram no histórico conforme a profundidade. Não é possível desligar os blocos obrigatórios.',
  'required': 'obrigatório',
  'on': 'ligado',
  'Scene note depth': 'Profundidade da nota de cena',
  'Lore budget (% of context)': 'Orçamento de lore (% do contexto)',
  'Save preset': 'Salvar preset',

  // Scenario editor
  'Before char defs': 'Antes das definições do personagem',
  'After char defs': 'Depois das definições do personagem',
  "Top of Author's Note": 'Início da Nota do Autor',
  "Bottom of Author's Note": 'Fim da Nota do Autor',
  '@ Depth (in chat)': '@ Profundidade (no chat)',
  'location': 'local',
  'faction': 'facção',
  'item': 'item',
  'concept': 'conceito',
  'character': 'personagem',
  'other': 'outro',
  'Title': 'Título',
  'Model override (OpenRouter id, empty = global)': 'Modelo específico (id do OpenRouter; vazio = global)',
  'Scenario rules → <scenario_rules> (added after the global rules; cannot remove them)':
    'Regras do cenário → <scenario_rules> (entram depois das regras globais e não podem removê-las)',
  'Opening message (macros allowed: {{user}}, {{char}})': 'Mensagem de abertura (aceita as macros {{user}} e {{char}})',
  'Overrides': 'Substituições',
  'Main prompt override — use {{original}} to keep the global main prompt':
    'Substituição do prompt principal. Use {{original}} para manter o prompt principal global',
  'Post-history instructions override — use {{original}} to keep the global text':
    'Substituição das instruções pós-histórico. Use {{original}} para manter o texto global',
  "Author's Note default": 'Nota do Autor padrão',
  'Text (empty = global default)': 'Texto (vazio = padrão global)',
  'Depth (empty = global)': 'Profundidade (vazio = global)',
  'Frequency (empty = global)': 'Frequência (vazio = global)',
  'Name': 'Nome',
  'Personality': 'Personalidade',
  'Speech style': 'Estilo de fala',
  'First message (used when the scenario has no opening message)':
    'Primeira mensagem (usada quando o cenário não tem mensagem de abertura)',
  'Example dialogues → <examples>': 'Exemplos de diálogo → <examples>',
  'Character depth note (in chat, when present)': 'Nota de profundidade do personagem (no chat, quando presente)',
  'Depth note depth': 'Profundidade da nota',
  'Post-history addition (when present)': 'Acréscimo pós-histórico (quando presente)',
  'Title (shown to Sage, not inserted)': 'Título (o Sage vê, mas não entra no prompt)',
  'Kind (location entries feed the scene.location choice)': 'Tipo (entradas de local alimentam a escolha de scene.location)',
  'Content (inserted into the prompt)': 'Conteúdo (entra no prompt)',
  'Keys (comma-separated, /regex/i allowed)': 'Chaves (separadas por vírgula; aceita /regex/i)',
  'Optional filter (secondary keys)': 'Filtro opcional (chaves secundárias)',
  'Secondary logic': 'Lógica secundária',
  'Order (higher = later / closer to the end)': 'Ordem (maior = mais tarde, mais perto do fim)',
  'Depth (@ Depth only)': 'Profundidade (só @ Profundidade)',
  'Role (@ Depth only)': 'Papel (só @ Profundidade)',
  'Trigger %': '% de ativação',
  'Scan depth (empty = 4)': 'Profundidade de busca (vazio = 4)',
  'Sticky (turns)': 'Persistência (turnos)',
  'Cooldown (turns)': 'Recarga (turnos)',
  'Delay (min. messages)': 'Atraso (mín. de mensagens)',
  'Enabled': 'Ativada',
  'Constant (always on, skips Sage)': 'Constante (sempre ligada, ignora o Sage)',
  'Case-sensitive': 'Diferencia maiúsculas',
  'Whole words': 'Palavras inteiras',
  'Prevent further recursion': 'Impedir recursão adicional',
  'Known by (veil of knowledge — empty = common knowledge; others see it as secret_from)':
    'Conhecido por (véu do conhecimento). Vazio = conhecimento comum. Os outros recebem como secret_from',
  'New entry': 'Nova entrada',
  'Scenario': 'Cenário',
  '+ Add entry': '+ Adicionar entrada',
  'const': 'const',
  'secret': 'segredo',
  // World-building steps
  'Steps': 'Etapas',
  'Step {n} of {total}': 'Etapa {n} de {total}',
  'Fine-tuning': 'Ajuste fino',
  'Optional': 'Opcional',
  'Done': 'Concluída',
  'Next': 'Próximo',
  'Skip': 'Pular',
  'Advanced': 'Avançado',
  'Unsaved changes': 'Alterações não salvas',
  'Unsaved changes in this form will be lost. Continue?': 'As alterações não salvas deste formulário serão perdidas. Continuar?',
  'Untitled scenario': 'Cenário sem título',
  'no description': 'sem descrição',
  '(no name)': '(sem nome)',
  'Change these settings only when the global prompt does not fit this scenario. Empty fields use the global values.':
    'Altere estas configurações só quando o prompt global não serve para este cenário. Os campos vazios usam os valores globais.',
  'Empty: the session starts with the first message of {name}.': 'Vazia: a sessão começa com a primeira mensagem de {name}.',
  'Changes some global prompt settings.': 'Altera algumas configurações globais do prompt.',
  'Uses the global prompt settings.': 'Usa as configurações globais do prompt.',
  'Everything is ready.': 'Tudo pronto.',
  // Play
  'Delete this message?': 'Excluir esta mensagem?',
  'You': 'Você',
  'as {name}': 'como {name}',
  'Edit scenario': 'Editar cenário',
  'blocked': 'bloqueada',
  'edit': 'editar',
  'delete': 'excluir',
  'Stop': 'Parar',
  'Send': 'Enviar',
  'Write the last reply again with the same harness context': 'Escrever a última resposta de novo com o mesmo contexto do harness',
  'Regenerate': 'Regenerar',
  'Harness': 'Harness',
  'Prompt': 'Prompt',
  'Memory ({n})': 'Memória ({n})',
  'Labels': 'Rótulos',

  // Inspector
  'locked': 'travado',
  'high': 'alta',
  'low': 'baixa',
  'carried': 'mantida',
  'Send a message to see what the harness decided for the turn.': 'Envie uma mensagem para ver o que o harness decidiu no turno.',
  'Degraded mode': 'Modo degradado',
  '{n} questions': '{n} perguntas',
  'reused (regenerate)': 'reutilizado (regenerar)',
  'guard unsure': 'guarda incerta',
  'Lore ({n})': 'Lore ({n})',
  'Over budget: {titles}': 'Acima do orçamento: {titles}',
  'Memory in context ({n})': 'Memória no contexto ({n})',
  'Guidance': 'Orientações',
  'After the reply': 'Depois da resposta',
  'No new memory.': 'Nenhuma memória nova.',
  'Stalling: {n} / 4': 'Estagnação: {n} / 4',
  'Location from extract: {location}': 'Local extraído: {location}',
  'Summary updated up to turn {n}': 'Resumo atualizado até o turno {n}',
  'Preview next prompt': 'Ver o próximo prompt',
  '{tokens} / {budget} tokens · {n} chat messages': '{tokens} / {budget} tokens · {n} mensagens do chat',
  'The assembled prompt of the last turn appears here.': 'O prompt montado do último turno aparece aqui.',
  'Token share per block': 'Parte dos tokens por bloco',
  'trimmed {block}: {n}': 'cortado {block}: {n}',
  'active': 'ativo',
  'known by:': 'conhecido por:',
  '{n} active items': '{n} itens ativos',
  '+ Add': '+ Adicionar',
  'New fact': 'Novo fato',
  'Labels are Sage answers in typed form. The narrator sees them as tag attributes, never as numbers. Lock a label to override Sage: a locked label is not asked and not changed.':
    'Os rótulos são respostas do Sage em forma tipada. O narrador vê os rótulos como atributos de tag, nunca como números. Trave um rótulo para substituir o Sage: o harness não pergunta nem altera um rótulo travado.',
  'Value: {value}': 'Valor: {value}',
  '· source {source} · turn {n}': '· fonte {source} · turno {n}',
  'null → {policy} · renders to {target}': 'null → {policy} · vai para {target}',
  'Unlock': 'Destravar',
  'Lock': 'Travar',
  'Lock yes': 'Travar em sim',
  'Lock no': 'Travar em não',
  'value': 'valor',
  "The session Author's Note replaces the scenario and global default. Leave the text empty and save to use the default again.":
    'A Nota do Autor da sessão substitui o padrão do cenário e o padrão global. Para voltar ao padrão, deixe o texto vazio e salve.',
  'Depth (empty = default)': 'Profundidade (vazio = padrão)',
  'Frequency (empty = default)': 'Frequência (vazio = padrão)',
  'Story summary (rolling, editable)': 'Resumo da história (contínuo, editável)',

  // Training: shell and profiles
  'manager': 'gestor',
  'trainee': 'colaborador',
  'Switch profile': 'Trocar de perfil',
  'Competencies': 'Competências',
  'Team': 'Equipe',
  'Results': 'Resultados',
  'My trainings': 'Meus treinamentos',
  'Who are you?': 'Quem é você?',
  'Choose a profile. There is no login: anyone on this computer can switch profiles.':
    'Escolha um perfil. Não há login: qualquer pessoa neste computador pode trocar de perfil.',
  'Managers': 'Gestores',
  'Trainees': 'Colaboradores',
  'New profile': 'Novo perfil',
  'Role': 'Papel',
  'Create': 'Criar',
  '(no profile)': '(sem perfil)',

  // Training: scenario list, sessions, my trainings
  'No scenarios yet. Create the first training scenario.': 'Ainda não há cenários. Crie o primeiro cenário de treinamento.',
  'Run the simulation yourself, with the inspector': 'Faça a simulação você mesmo, com o inspetor',
  'Test': 'Testar',
  'completed': 'concluída',
  'in progress': 'em andamento',
  'Report': 'Relatório',
  'Open': 'Abrir',
  'No training is assigned to you yet.': 'Ainda não há treinamento atribuído a você.',
  'due {date}': 'prazo: {date}',
  '{n} completed': '{n} concluídas',
  'Practise again': 'Praticar de novo',
  'Start': 'Começar',
  'My sessions': 'Minhas sessões',

  // Training: team
  'Choose a scenario': 'Escolha um cenário',
  'Due date (optional)': 'Prazo (opcional)',
  'Assign': 'Atribuir',
  'Delete {name}? Their assignments are removed; their sessions stay.':
    'Excluir {name}? As atribuições dessa pessoa são removidas; as sessões continuam.',
  '+ Add person': '+ Adicionar pessoa',
  'No assigned scenarios.': 'Nenhum cenário atribuído.',
  'Remove assignment': 'Remover atribuição',

  // Training: competency library and rubric editors
  'Use at least 2 levels.': 'Use pelo menos 2 níveis.',
  'Use at most 26 levels.': 'Use no máximo 26 níveis.',
  'Every level needs a different number.': 'Cada nível precisa de um número diferente.',
  'Levels must be whole numbers.': 'Os níveis precisam ser números inteiros.',
  'Level': 'Nível',
  'What this level looks like': 'Como é uma resposta neste nível',
  'Remove': 'Remover',
  '+ Add level': '+ Adicionar nível',
  'Option': 'Opção',
  'When this option applies': 'Quando esta opção vale',
  '+ Add option': '+ Adicionar opção',
  'Sage needs at least 2 options.': 'O Sage precisa de pelo menos 2 opções.',
  'Kind': 'Tipo',
  'to show': 'mostrar',
  'to avoid': 'evitar',
  'An observable behaviour': 'Um comportamento que se pode observar',
  '+ Add behaviour': '+ Adicionar comportamento',
  'Description (Sage reads it to judge the competency)': 'Descrição (o Sage lê para avaliar a competência)',
  'Observable behaviours': 'Comportamentos observáveis',
  'Sage tags each behaviour that a trainee message shows. The report counts them.':
    'O Sage marca cada comportamento que aparece na mensagem do colaborador. O relatório conta esses comportamentos.',
  'Rubric': 'Rubrica',
  'Sage scores each message on these levels. Describe what each level looks like in a message.':
    'O Sage dá a cada mensagem um destes níveis. Descreva como é uma mensagem em cada nível.',
  'Delete "{name}"? The scenarios that use it lose it.': 'Excluir "{name}"? Os cenários que usam esta competência deixam de usá-la.',
  'Not shown': 'Não demonstra',
  'Weak': 'Fraco',
  'Partial': 'Parcial',
  'Good': 'Bom',
  'Excellent': 'Excelente',
  'New competency': 'Nova competência',
  'The company library. Each scenario chooses the competencies that it trains. The same competency in several scenarios lets you compare results.':
    'A biblioteca da empresa. Cada cenário escolhe as competências que treina. Quando vários cenários usam a mesma competência, você pode comparar os resultados.',
  '+ Add competency': '+ Adicionar competência',
  'No competencies yet.': 'Ainda não há competências.',

  // Training: scenario editor
  'Situation': 'Situação',
  'Counterparts': 'Interlocutores',
  'Trainee role': 'Papel do colaborador',
  'States and objectives': 'Estados e objetivos',
  'Knowledge base': 'Base de conhecimento',
  'Briefing and opening': 'Briefing e abertura',
  'Review and assign': 'Revisar e atribuir',
  'Describe the work situation: the company, the place and what is happening when the simulation starts. Then choose the context tags: they tell the simulation which context and difficulty to keep. The simulation reads this text on every turn.':
    'Descreva a situação de trabalho: a empresa, o lugar e o que acontece quando a simulação começa. Depois escolha as etiquetas de contexto: elas dizem à simulação qual contexto e qual dificuldade manter. A simulação lê este texto em todos os turnos.',
  'Add the people that the simulation plays: customers, colleagues, managers. Give each one a description with their goals and limits. A personality and a speech style make the behaviour more realistic.':
    'Adicione as pessoas que a simulação interpreta: clientes, colegas, gestores. Dê a cada uma uma descrição com os objetivos e os limites dela. A personalidade e o estilo de fala deixam o comportamento mais realista.',
  "Describe the role that the trainee plays (for example: customer service agent). The simulation never writes the trainee's actions or words.":
    'Descreva o papel que o colaborador interpreta (por exemplo: atendente). A simulação nunca escreve as ações nem as falas do colaborador.',
  'Choose the competencies from the library that this scenario trains. Sage scores every trainee message on their rubrics. A higher weight counts more in the overall score.':
    'Escolha na biblioteca as competências que este cenário treina. O Sage avalia cada mensagem do colaborador com as rubricas delas. Um peso maior conta mais na nota geral.',
  'Sage tracks these variables on every turn, for example the trust of the customer. An objective is a yes/no goal of the trainee; once reached, it stays reached. Visible variables shape how the counterparts behave; hidden ones only go to the report.':
    'O Sage acompanha estas variáveis em todos os turnos, por exemplo a confiança do cliente. Um objetivo é uma meta de sim ou não do colaborador: depois de atingido, continua atingido. As variáveis visíveis influenciam o comportamento dos interlocutores; as ocultas vão só para o relatório.',
  'Add policies, products, prices and facts. An entry goes into the prompt only when one of its keys appears in the chat, or on every turn when it is constant.':
    'Adicione políticas, produtos, preços e fatos. Uma entrada entra no prompt só quando uma das chaves dela aparece no chat, ou em todos os turnos, quando ela é constante.',
  'Write the briefing that the trainee reads before the simulation, the first message of the counterpart and the rules for this scenario. The rules are added after the global rules.':
    'Escreva o briefing que o colaborador lê antes da simulação, a primeira mensagem do interlocutor e as regras deste cenário. As regras entram depois das regras globais.',
  'Check the list. Test the simulation yourself, then assign it to trainees.':
    'Confira a lista. Teste a simulação você mesmo e depois atribua aos colaboradores.',
  'scale (levels)': 'escala (níveis)',
  'choice (options)': 'escolha (opções)',
  'yes / no': 'sim / não',
  'value from the text (Extract)': 'valor do texto (Extract)',
  'Customer service': 'Atendimento ao cliente',
  'Sales': 'Vendas',
  'Negotiation': 'Negociação',
  'Leadership': 'Liderança',
  'Feedback conversation': 'Conversa de feedback',
  'Conflict': 'Conflito',
  'Onboarding': 'Integração',
  'Easy': 'Fácil',
  'Medium difficulty': 'Dificuldade média',
  'Hard': 'Difícil',
  'Short summary (scenario card)': 'Resumo curto (card do cenário)',
  'Work situation → <scenario>': 'Situação de trabalho → <scenario>',
  'Example: You work in the customer service chat of an online shop. A customer received a broken product for the second time…':
    'Exemplo: você trabalha no chat de atendimento de uma loja online. Uma cliente recebeu um produto quebrado pela segunda vez…',
  'Context tags → <themes> (comma-separated)': 'Etiquetas de contexto → <themes> (separadas por vírgula)',
  'Example: customer service, medium difficulty': 'Exemplo: atendimento ao cliente, dificuldade média',
  'Suggested tags': 'Etiquetas sugeridas',
  'Briefing (the trainee reads it before the simulation)': 'Briefing (o colaborador lê antes da simulação)',
  'Your role, the situation, your objective and the rules that you must follow.':
    'O seu papel, a situação, o seu objetivo e as regras que você deve seguir.',
  'Turn limit (0 = no limit)': 'Limite de turnos (0 = sem limite)',
  'Empty, and no counterpart has a first message: the trainee writes first.':
    'Vazia, e nenhum interlocutor tem primeira mensagem: o colaborador escreve primeiro.',
  'Description, goals and limits': 'Descrição, objetivos e limites',
  'Role name ({{user}})': 'Nome do papel ({{user}})',
  'Role description → <persona>': 'Descrição do papel → <persona>',
  'What to find in the text (Extract definition)': 'O que procurar no texto (definição para o Extract)',
  'Question for Sage': 'Pergunta para o Sage',
  'Example: the discount percentage that the trainee offers': 'Exemplo: o percentual de desconto que o colaborador oferece',
  'Example: How much does the customer trust the company now, after the LAST message?':
    'Exemplo: quanto o cliente confia na empresa agora, depois da ÚLTIMA mensagem?',
  'Value type': 'Tipo do valor',
  'Objective of the trainee (once reached, it stays reached)': 'Objetivo do colaborador (depois de atingido, continua atingido)',
  'Initial value (optional)': 'Valor inicial (opcional)',
  'Visible to the counterparts (<sim_state>)': 'Visível para os interlocutores (<sim_state>)',
  'Weight': 'Peso',
  'What good looks like in this scenario (optional, Sage reads it)': 'O que é um bom desempenho neste cenário (opcional; o Sage lê)',
  'The competency library is empty. Add competencies on the Competencies page.':
    'A biblioteca de competências está vazia. Adicione competências na página Competências.',
  'Many competencies make each turn slower and more expensive, and the feedback less focused.':
    'Muitas competências deixam cada turno mais lento e mais caro, e o feedback menos focado.',
  'The situation has a title and a description.': 'A situação tem título e descrição.',
  'At least one counterpart has a name and a description ({n} counterparts).': 'Pelo menos um interlocutor tem nome e descrição ({n} interlocutores).',
  'The trainee has a role ({n} roles).': 'O colaborador tem um papel ({n} papéis).',
  '{n} competencies are evaluated.': '{n} competências são avaliadas.',
  '{n} state variables, {m} objectives.': '{n} variáveis de estado, {m} objetivos.',
  '{n} knowledge entries.': '{n} entradas na base de conhecimento.',
  'The trainee has a briefing, and the simulation has an opening.': 'O colaborador tem um briefing, e a simulação tem uma abertura.',
  'Some required steps are not complete. You can test, but the simulation or the evaluation can be weak.':
    'Algumas etapas obrigatórias não estão completas. Você pode testar, mas a simulação ou a avaliação podem ficar fracas.',
  'Test the simulation': 'Testar a simulação',
  'Assigned to': 'Atribuído a',
  'No trainees yet. Add people on the Team page.': 'Ainda não há colaboradores. Adicione pessoas na página Equipe.',
  'New counterpart': 'Novo interlocutor',
  'New role': 'Novo papel',
  'New variable': 'Nova variável',
  '+ Add variable': '+ Adicionar variável',
  '+ Add role': '+ Adicionar papel',
  '+ Add counterpart': '+ Adicionar interlocutor',
  'No knowledge entries yet. You can skip this step.': 'Ainda não há entradas na base de conhecimento. Você pode pular esta etapa.',
  'No variables yet. You can skip this step.': 'Ainda não há variáveis. Você pode pular esta etapa.',
  'Nothing here yet. Add the first one.': 'Ainda não há nada aqui. Adicione o primeiro.',
  'objective': 'objetivo',
  'hidden': 'oculta',

  // Training: simulation
  'End the simulation and see the report? You cannot continue it later.': 'Encerrar a simulação e ver o relatório? Depois não é possível continuar.',
  'End simulation': 'Encerrar simulação',
  '{n} turns left': 'faltam {n} turnos',
  'test mode': 'modo de teste',
  'Building the report…': 'Montando o relatório…',
  'Briefing': 'Briefing',
  'Simulation': 'Simulação',
  'You reached the objectives. You can end the simulation now.': 'Você atingiu os objetivos. Já pode encerrar a simulação.',
  'This was the last turn. End the simulation to see the report.': 'Este foi o último turno. Encerre a simulação para ver o relatório.',
  'This simulation is completed.': 'Esta simulação está concluída.',
  'See the report': 'Ver o relatório',
  'What does {name} say or do? Speech as plain text, *action* in asterisks. Enter sends, Shift+Enter adds a line, (( )) asks the simulation a question.':
    'O que {name} diz ou faz? Fala em texto simples, *ação* entre asteriscos. Enter envia, Shift+Enter cria uma linha, (( )) faz uma pergunta à simulação.',
  'The counterpart is answering…': 'O interlocutor está respondendo…',
  'Sage is updating the state and the evaluation…': 'O Sage está atualizando o estado e a avaliação…',
  'Sage is reading the conversation…': 'O Sage está lendo a conversa…',
  'State': 'Estado',
  'Evaluation': 'Avaliação',
  'Evaluated competencies: {n}': 'Competências avaliadas: {n}',
  '{n} for review': '{n} para revisar',
  'This scenario has no state variables.': 'Este cenário não tem variáveis de estado.',
  'Sage updates these values before each reply. Visible values go to the counterparts in <sim_state>; hidden ones only go to the report.':
    'O Sage atualiza estes valores antes de cada resposta. Os valores visíveis vão para os interlocutores em <sim_state>; os ocultos vão só para o relatório.',
  'No evaluations yet. Sage evaluates each trainee message after the reply.': 'Ainda não há avaliações. O Sage avalia cada mensagem do colaborador depois da resposta.',
  'corrected': 'corrigida',
  'review': 'revisar',

  // Training: report and results
  'not observed': 'não observada',
  'Level: {level}': 'Nível: {level}',
  'This simulation gave no chance to show this competency.': 'Esta simulação não deu chance de mostrar esta competência.',
  'The evaluation of this competency is waiting for the manager.': 'A avaliação desta competência está esperando o gestor.',
  'Evaluated in {n} answers.': 'Avaliada em {n} respostas.',
  'Evidence': 'Evidências',
  'Sage: {score}': 'Sage: {score}',
  'Note (optional)': 'Nota (opcional)',
  'Save level': 'Salvar nível',
  'The message did not really show this competency': 'A mensagem não mostrou de fato esta competência',
  'Discard': 'Descartar',
  'This simulation is not completed yet.': 'Esta simulação ainda não foi concluída.',
  '{n} turns': '{n} turnos',
  'overall': 'geral',
  '{n} evaluations need your review. The scores below do not count them yet.':
    '{n} avaliações precisam da sua revisão. As notas abaixo ainda não contam essas avaliações.',
  'Some evaluations are waiting for the manager. The scores can still change.': 'Algumas avaliações estão esperando o gestor. As notas ainda podem mudar.',
  'Feedback': 'Feedback',
  'No written feedback is available.': 'Não há feedback escrito.',
  'Objectives ({n} of {total})': 'Objetivos ({n} de {total})',
  'This scenario evaluates no competencies.': 'Este cenário não avalia competências.',
  'At the end of the simulation': 'No fim da simulação',
  'Review ({n})': 'Revisão ({n})',
  'Recompute the scores and write the feedback again': 'Recalcular as notas e escrever o feedback de novo',
  'Rebuild report': 'Refazer o relatório',
  'Nothing to review.': 'Nada para revisar.',
  'All scenarios': 'Todos os cenários',
  'The average of the completed sessions. A competency that a session did not observe does not count in its average.':
    'A média das sessões concluídas. Uma competência que uma sessão não observou não entra na média dela.',
  'No completed sessions yet.': 'Ainda não há sessões concluídas.',
  'Trainee': 'Colaborador',
  'Completed sessions': 'Sessões concluídas',

  // Training: settings and prompt manager
  'Simulation model (global)': 'Modelo da simulação (global)',
  'Sage reasoning for the evaluation': 'Raciocínio do Sage na avaliação',
  'The global preset applies to every simulation. Scenarios can override the main prompt and the post-history instructions (with {original}) and add scenario rules, but they cannot remove the global rules.':
    'O preset global vale para todas as simulações. Os cenários podem substituir o prompt principal e as instruções pós-histórico (com {original}) e acrescentar regras de cenário. Eles não podem remover as regras globais.',
} satisfies Record<string, string>

export type MessageKey = keyof typeof ptBR
export type Lang = 'en' | 'pt-BR'
export type Vars = Record<string, string | number>

export const LANGUAGES: { value: Lang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'pt-BR', label: 'Português (BR)' },
]

const dictionaries: Record<Lang, Partial<Record<MessageKey, string>>> = { en: {}, 'pt-BR': ptBR }
export const LANG_STORAGE_KEY = 'lang'

export function initialLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY)
    if (stored === 'en' || stored === 'pt-BR') return stored
  } catch {
    // Storage can be blocked; fall back to the browser language.
  }
  return navigator.language?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en'
}

export function translate(lang: Lang, key: MessageKey, vars?: Vars): string {
  const template = dictionaries[lang][key] ?? key
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match))
}

/** Renders a translated string with one `{name}` placeholder replaced by a React node (for example a `<code>` element). */
export function withNode(template: string, name: string, node: ReactNode): ReactNode {
  const marker = `{${name}}`
  const at = template.indexOf(marker)
  if (at < 0) return template
  return createElement(Fragment, null, template.slice(0, at), node, template.slice(at + marker.length))
}

export interface I18n {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: MessageKey, vars?: Vars) => string
}

export const I18nContext = createContext<I18n | null>(null)

export function useI18n(): I18n {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider')
  return ctx
}
