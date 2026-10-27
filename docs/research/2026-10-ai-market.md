# Mercado de IA para agentes — atualização 2026-10

> Pesquisa feita em 2026-10-26 para retomar o `@airyschat/mcp` (parado desde 2026-08-13).
> Volátil: reverifique antes de citar. Fontes primárias marcadas com ✓ foram lidas diretamente;
> as demais vêm de buscas agregadas e devem ser confirmadas na doc oficial antes de virar código.

## TL;DR — o que mudou desde agosto e o que isso significa para nós

| Mudança | Impacto no AirysChat MCP | Onde entra |
|---|---|---|
| **MCP 2026-07-28** ✓ — núcleo *stateless*, sem handshake/sessão, roteamento por header (`Mcp-Method`, `Mcp-Name`), MRTR (`input_required`), listas cacheáveis (`ttlMs`), framework de extensões (Apps, Tasks), JSON Schema 2020-12 | Hospedar no Cloud Run fica trivial (sem sticky session). Elicitation via MRTR substitui nosso `confirm: true`. | ADR 0004, lanes 005 e 007 |
| **Deprecações 2026-07-28** ✓ — Roots, Sampling, Logging, HTTP+SSE, `includeContext`, OAuth DCR (troca por *Client ID Metadata Documents*) | Não adotar nada disso. OAuth do serviço remoto já nasce com CIMD. | `.agents/rules/mcp-protocol.md` |
| **MCP Apps** (extensão oficial, convergência do Apps SDK da OpenAI + MCP-UI) — UI em iframe via `ui://` + `_meta.ui`, roda em Claude, ChatGPT, VS Code, Goose | Grande diferencial: quadro do CRM, relatório de preflight de campanha, ficha do deal **dentro** do chat. | Lane 007 |
| **Tasks** virou extensão (`tasks/get|update|cancel`) | Evals do MBA, importações, exports de deals viram tarefas assíncronas nativas. | Lane 007 |
| **SDK TS `@modelcontextprotocol/server` 2.4.0** (2026-10-23) | Estamos em 2.0.0 — upgrade dentro do major. | Lane 001 |
| **MCP Registry oficial** — `server.json` + `mcpName` no `package.json`, `mcp-publisher` com namespace verificado (GitHub ou domínio) | Publicar como `chat.airys/mcp` (verificação por DNS em `airys.chat`) no GA. | Lane 010 |
| **Skills (`SKILL.md`) viraram padrão aberto** — Claude Code, Codex (`$skill`), Antigravity, Gemini CLI | Um único conjunto de skills de produto serve todos os clientes. | Lane 010, ADR 0001 |
| **Plugins em todo lugar** — Claude Code (`.claude-plugin/`, marketplaces), Codex (plugins com skills+MCP), Gemini CLI (`gemini-extension.json`), Antigravity (`plugins/<n>/plugin.json` + `mcp_config.json` + `skills/` + `agents/`) | Monorepo com um plugin por cliente, todos apontando para o mesmo servidor e as mesmas skills. | Lane 010 |
| **Subagentes** como unidade de delegação (Claude Code, Antigravity, Codex, Muse Code) | Nossos fluxos internos de dev viram subagentes versionados no repo. | `.agents/agents/` |

## Modelos e plataformas (outubro/2026)

### Anthropic — Claude
- **Claude Opus 5.5** (fim de set/início de out): referência em código agêntico; ~40% mais barato que
  o anterior em cargas típicas. **Sonnet 5.5** (rápido, uso diário) e **Haiku 5.5** (alto volume,
  subagentes em background). Janela de 1M tokens, 128K de saída.
- **Claude Code**: plugins (skills + subagentes + hooks + MCP) distribuídos por marketplaces
  (`/plugin marketplace add owner/repo`); marketplace oficial `claude-plugins-official`. Comandos
  customizados foram absorvidos pelo formato de skill.
- **Claude.ai / Desktop**: conectores remotos (MCP via URL + OAuth) e diretório de conectores.
- Para nós: o plugin Claude já existe (v0.1, não publicado) — vira `plugins/claude` neste monorepo.

### Meta — Muse
- **Muse** (set/2026): agente pessoal de longo horizonte (iOS, Android, web, macOS e **dentro do
  WhatsApp**), com VM na nuvem e o framework de permissões **Sentinel** (separa leitura/escrita em
  ações sensíveis).
- **Muse Spark** (abr/2026, inclui versão open-weight) e **Muse Wonder / Wonder Full** (out/2026):
  modelos de fronteira; Wonder no **Meta Model API** (compatível com o SDK da OpenAI) e no
  **Muse Code** (agente de terminal com subagentes paralelos, worktrees, 1M de contexto, suporte a
  MCP via `~/.config/muse/settings.json`).
- **WhatsApp Business Tools MCP** oficial da Meta (`https://mcp.facebook.com/whatsapp_business_tools`,
  OAuth via Facebook Login for Business): onboarding de WABA/número, templates, webhooks, mensagem de
  teste, checagem de pré-requisitos.
- **Para nós — posicionamento:** o MCP da Meta cobre a **camada de infraestrutura** do WhatsApp
  (montar WABA, número, template, webhook). O AirysChat MCP cobre a **camada de operação do negócio**:
  conversas, contatos, **CRM**, campanhas com preflight e saúde do número, **agentes de IA** e o
  **Meta Business Agent** — tudo multi-tenant e com as travas de segurança. São complementares;
  documentar o uso conjunto é uma vitória fácil (lane 010).
- O Sentinel valida nossa abordagem de declarar escrita/irreversível por tool; quando houver
  integração do Muse com conectores de terceiros, nossos `readOnlyHint`/`destructiveHint` já mapeiam.

### OpenAI — Codex e ChatGPT
- **Codex** (CLI + app desktop): plugins instaláveis que empacotam **skills** (`SKILL.md`, invocadas
  com `$nome`), **servidores MCP** (stdio, Streamable HTTP) e hooks; marketplace no app.
  Lê `AGENTS.md` nativamente.
- **ChatGPT**: Apps (agora sobre **MCP Apps**, padrão aberto) — o mesmo servidor com UI roda no
  ChatGPT e no Claude.
- Para nós: plugin Codex no monorepo; nosso `AGENTS.md` já é o formato nativo.

### Google — Antigravity e Gemini
- **Antigravity** (IDE + CLI `agy`): customizações em `.agents/` — **rules** (`AGENTS.md`/`GEMINI.md`,
  `.agents/rules/*.md` com gatilhos `always_on`/`model_decision`/`glob`), **skills**, **plugins**
  (`plugin.json`, `mcp_config.json`, `hooks.json`, `skills/`, `agents/`), **hooks** e MCP. Regras têm
  orçamento de contexto (limite por arquivo e agregado; excedentes viram ponteiros).
- **Gemini CLI**: extensões com `gemini-extension.json` (`mcpServers`, `contextFileName`, `settings`
  que pedem credenciais na instalação). Gemini 3 Pro disponível.
- Para nós: este repositório já usa `.agents/` (regras, skills, subagentes) — o mesmo padrão do
  repo AirysChat.

## Concorrência em CX/CRM com MCP

| Player | MCP | Observação |
|---|---|---|
| **HubSpot** | Remoto oficial `mcp.hubspot.com`, OAuth 2.1 + PKCE | Contatos, empresas, deals, tickets, cotações — o benchmark de CRM via MCP. |
| **Intercom** | Remoto oficial; Fin também consome MCP de terceiros | Conversas, contatos, Help Center. |
| **Zendesk** | Cliente MCP nativo no Admin Center; servidores via marketplace/comunidade | Tickets e base de conhecimento. |
| **Chatwoot** (nosso upstream) | Apenas comunitário + `chatwoot api` no CLI oficial | Nenhum oficial com WhatsApp/CRM/IA — **espaço aberto para o AirysChat**. |
| **Meta** | WhatsApp Business Tools MCP | Infra do WhatsApp, não operação (ver acima). |

**Leitura:** o padrão de mercado para SaaS de CX/CRM é **MCP remoto oficial com OAuth** + diretórios
de conectores (Claude, ChatGPT). Pacote npm local continua importante para devs e agências. O
diferencial do AirysChat é ser o único que junta WhatsApp oficial + CRM + agentes de IA + MBA num
servidor só, em PT-BR, com travas de envio irreversível.

## Padrões de mercado para repositório de MCP

- **Monorepo** é o padrão dos servidores oficiais de maior porte (Cloudflare `mcp-server-cloudflare`,
  Stripe `agent-toolkit`, Sentry MCP): servidor(es) + plugins/integrações + docs no mesmo repo,
  versionados com Changesets. O marketplace do Claude Code foi desenhado para morar no mesmo repo do
  plugin (`.claude-plugin/marketplace.json` na raiz).
- **Toolsets + descoberta dinâmica** em vez de uma tool por endpoint (GitHub MCP "dynamic toolsets",
  "tool search" da Anthropic, "code mode" da Cloudflare). Nossa estratégia (ADR 0002) segue isso.
- **Stateless Streamable HTTP** atrás de load balancer comum (agora oficializado no 2026-07-28).

## Fontes

- ✓ MCP 2026-07-28 Key Changes — https://modelcontextprotocol.io/specification/2026-07-28/changelog
- ✓ npm: `@modelcontextprotocol/server@2.4.0` (2026-10-23), `@modelcontextprotocol/ext-apps@2.0.3`,
  `@modelcontextprotocol/inspector@2.12.0` (consultado via `npm view` em 2026-10-26)
- MCP Registry / `mcp-publisher` — registry.modelcontextprotocol.io, github.blog
- MCP Apps — modelcontextprotocol.io (extensions), openai.com (Apps SDK → MCP Apps), workos.com
- Claude 5.5 / plugins — anthropic.com, docs do Claude Code
- Meta Muse, Muse Code, Meta Model API — meta.ai, meta.com, wikipedia, theguardian.com, cnet.com
- WhatsApp Business Tools MCP — developers.facebook.com
- Antigravity — antigravity.google (docs de rules, skills, plugins, MCP)
- Codex plugins/skills — openai.com, developers.openai.com
- Gemini CLI extensions — geminicli.com, developers.googleblog.com
- HubSpot/Intercom/Zendesk MCP — hubspot.com, intercom.com, zendesk.com
