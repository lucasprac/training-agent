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
  'Library': 'Biblioteca',
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
  'Play': 'Jogar',
  'Back': 'Voltar',
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
  'Import card': 'Importar card',
  'New scenario': 'Novo cenário',
  'Scenarios': 'Cenários',
  'No scenarios yet. Create one or import a SillyTavern card (JSON or PNG).':
    'Ainda não há cenários. Crie um ou importe um card do SillyTavern (JSON ou PNG).',
  'No description': 'Sem descrição',
  'Delete scenario': 'Excluir cenário',
  'Sessions': 'Sessões',
  'No sessions yet.': 'Ainda não há sessões.',
  'Continue': 'Continuar',
  'Delete session': 'Excluir sessão',
  'Import failed: {error}': 'A importação falhou: {error}',
  'Delete "{title}" and all its sessions? This cannot be undone.':
    'Excluir "{title}" e todas as sessões dele? Não é possível desfazer.',
  'Delete this session? This cannot be undone.': 'Excluir esta sessão? Não é possível desfazer.',

  // Personas
  'Name ({{user}})': 'Nome ({{user}})',
  'Description → <persona>': 'Descrição → <persona>',

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
  'Narrator model (global)': 'Modelo do narrador (global)',
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
  'The global preset applies to every roleplay. Scenarios can override the main prompt and the post-history instructions (with {original}) and add scenario rules, but they cannot remove the global rules.':
    'O preset global vale para todos os roleplays. Os cenários podem substituir o prompt principal e as instruções pós-histórico (com {original}) e acrescentar regras de cenário. Eles não podem remover as regras globais.',
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
  'Short summary (library card)': 'Resumo curto (card da biblioteca)',
  'World and situation → <scenario>': 'Mundo e situação → <scenario>',
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
  'Description': 'Descrição',
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
  'New character': 'Novo personagem',
  'New entry': 'Nova entrada',
  'Scenario': 'Cenário',
  'Characters ({n})': 'Personagens ({n})',
  'Lorebook ({n})': 'Lorebook ({n})',
  '+ Add character': '+ Adicionar personagem',
  '+ Add entry': '+ Adicionar entrada',
  'const': 'const',
  'secret': 'segredo',
  'Nothing here yet.': 'Ainda não há nada aqui.',

  // World-building steps
  'Your character': 'Seu personagem',
  "Create the character that you play in this roleplay. You can create more than one and choose one when you start a session. The narrator never writes your character's actions, words or thoughts.":
    'Crie o personagem que você interpreta neste roleplay. Você pode criar mais de um e escolher um quando começar uma sessão. O narrador nunca escreve as ações, as falas nem os pensamentos do seu personagem.',
  'Add the characters that the narrator plays. Give each character a description. A personality and a speech style make the voice more consistent. Your own character goes in the next step.':
    'Adicione os personagens que o narrador interpreta. Dê uma descrição a cada personagem. A personalidade e o estilo de fala deixam a voz mais consistente. O seu próprio personagem entra na próxima etapa.',
  'Start with the world. Describe the place, the time and the situation at the start of the story. Then choose the themes: they tell the narrator which genres and tones to keep. The narrator reads this text on every turn.':
    'Comece pelo mundo. Descreva o lugar, a época e a situação no início da história. Depois escolha os temas: eles dizem ao narrador quais gêneros e tons manter. O narrador lê este texto em todos os turnos.',
  'Check the list. Then choose your character and start a session.': 'Confira a lista. Depois escolha o seu personagem e comece uma sessão.',
  'Themes → <themes> (comma-separated genres and tones)': 'Temas → <themes> (gêneros e tons separados por vírgula)',
  'Example: dark fantasy, political intrigue, slow-burn romance': 'Exemplo: fantasia sombria, intriga política, romance lento',
  'Suggested themes': 'Temas sugeridos',
  'Fantasy': 'Fantasia',
  'Science fiction': 'Ficção científica',
  'Horror': 'Terror',
  'Mystery': 'Mistério',
  'Romance': 'Romance',
  'Adventure': 'Aventura',
  'Drama': 'Drama',
  'Comedy': 'Comédia',
  'Noir': 'Noir',
  'Political intrigue': 'Intriga política',
  'Survival': 'Sobrevivência',
  'Historical': 'Histórico',
  'Post-apocalyptic': 'Pós-apocalíptico',
  'Slice of life': 'Cotidiano',
  'You have a character to play ({n} characters).': 'Você tem um personagem para jogar ({n} personagens).',
  'Play as': 'Jogar como',
  'No character': 'Sem personagem',
  'Steps': 'Etapas',
  'Step {n} of {total}': 'Etapa {n} de {total}',
  'Premise': 'Premissa',
  'Characters': 'Personagens',
  'Lorebook': 'Lorebook',
  'Opening': 'Abertura',
  'Fine-tuning': 'Ajuste fino',
  'Review and play': 'Revisar e jogar',
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
  'No characters yet. Add the first character.': 'Ainda não há personagens. Adicione o primeiro personagem.',
  'No lore entries yet. You can skip this step.': 'Ainda não há entradas de lore. Você pode pular esta etapa.',
  'Add places, factions, items and secrets. An entry goes into the prompt only when one of its keys appears in the chat, or on every turn when it is constant. Location entries let the harness track the current scene.':
    'Adicione locais, facções, itens e segredos. Uma entrada entra no prompt só quando uma das chaves dela aparece no chat, ou em todos os turnos, quando ela é constante. As entradas de local permitem que o harness acompanhe a cena atual.',
  'Write the first message of the story and the rules for this scenario. The rules are added after the global rules.':
    'Escreva a primeira mensagem da história e as regras deste cenário. As regras entram depois das regras globais.',
  'Change these settings only when the global prompt does not fit this scenario. Empty fields use the global values.':
    'Altere estas configurações só quando o prompt global não serve para este cenário. Os campos vazios usam os valores globais.',
  'Example: A port city in 1720. Pirates control the harbor. The governor has just been murdered…':
    'Exemplo: uma cidade portuária em 1720. Piratas controlam o porto. O governador acaba de ser assassinado…',
  'Empty: the session starts with the first message of {name}.': 'Vazia: a sessão começa com a primeira mensagem de {name}.',
  'Empty, and no character has a first message: the session starts without a narrator message.':
    'Vazia, e nenhum personagem tem primeira mensagem: a sessão começa sem mensagem do narrador.',
  'The world has a title and a description.': 'O mundo tem título e descrição.',
  'At least one character has a name and a description ({n} characters).': 'Pelo menos um personagem tem nome e descrição ({n} personagens).',
  '{n} lore entries.': '{n} entradas de lore.',
  'The story has an opening message.': 'A história tem mensagem de abertura.',
  'Changes some global prompt settings.': 'Altera algumas configurações globais do prompt.',
  'Uses the global prompt settings.': 'Usa as configurações globais do prompt.',
  'Everything is ready.': 'Tudo pronto.',
  'Some required steps are not complete. You can play, but the story can be weak.':
    'Algumas etapas obrigatórias não estão completas. Você pode jogar, mas a história pode ficar fraca.',
  'Start session': 'Começar sessão',

  // Play
  'Narrating…': 'Narrando…',
  'Updating memory…': 'Atualizando a memória…',
  'Sage is reading the scene…': 'O Sage está lendo a cena…',
  'Delete this message?': 'Excluir esta mensagem?',
  'You': 'Você',
  'as {name}': 'como {name}',
  'Edit scenario': 'Editar cenário',
  'Narrator': 'Narrador',
  'blocked': 'bloqueada',
  'edit': 'editar',
  'delete': 'excluir',
  'What does {name} do? *action or context*, (thought), speech as plain text. Enter sends, Shift+Enter adds a line, (( )) is out of character.':
    'O que {name} faz? *ação ou contexto*, (pensamento), fala em texto simples. Enter envia, Shift+Enter cria uma linha, (( )) é fora do personagem.',
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
