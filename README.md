# Volten Dashboard

Dashboard SPA (HTML + Tailwind via CDN + JavaScript) com Cloudflare Pages Functions e banco Cloudflare D1 "Banco Volten".

- **Clientes:** cole o texto bruto, extraia usuário, senha, URL/DNS, criado em e vencimento (ignora `( )`, prioriza `[ ]`), copie, envie por WhatsApp, salve no banco e veja os vencimentos no calendário (mês/semana).
- **Finanças:** entradas e saídas, status pago/pendente, totais, saldo, gráficos por categoria e evolução mensal, filtros por mês e status.

## Estrutura

```
index.html
js/app.js
functions/api/clientes.js
functions/api/financas.js
schema.sql
wrangler.toml
README.md
```

## 1. Criar o banco D1

Pelo terminal (precisa de Node.js):

```bash
npx wrangler login
npx wrangler d1 create "Banco Volten"
```

O comando mostra o `database_id`. Copie esse valor.

> Se o Cloudflare recusar o espaço no nome, use `banco-volten`. O nome é só um rótulo: o código usa o **binding `DB`**, então nada mais muda.

Pelo painel: **Workers & Pages → D1 SQL Database → Create database**.

## 2. Ajustar o `wrangler.toml`

Troque `database_id` pelo ID do passo anterior (e `database_name`, se usou outro nome). Sem isso o deploy falha na validação.

## 3. Rodar a migration (criar as tabelas)

```bash
npx wrangler d1 execute "Banco Volten" --remote --file=./schema.sql
```

Para testar localmente use `--local` no lugar de `--remote`. Pelo painel: abra o banco, aba **Console**, cole o conteúdo de `schema.sql` e execute.

Conferir:

```bash
npx wrangler d1 execute "Banco Volten" --remote --command "SELECT name FROM sqlite_master WHERE type='table'"
```

## 4. Publicar no Cloudflare Pages via GitHub

1. Suba os arquivos para um repositório no GitHub (na raiz, com `functions/` ao lado do `index.html`).
2. **Workers & Pages → Create → Pages → Connect to Git** e escolha o repositório.
3. Configuração de build: **Framework preset:** None · **Build command:** vazio · **Build output directory:** `/` (ou `.`).
4. Salve e faça o deploy.

## 5. Vincular o D1 ao projeto (se não usar o `wrangler.toml`)

Se o painel não aplicar o binding do `wrangler.toml`: **projeto Pages → Settings → Bindings → Add → D1 database**, em *Variable name* digite `DB`, selecione "Banco Volten" e salve. Faça um novo deploy (**Deployments → Retry deployment**).

## Testar localmente

```bash
npx wrangler d1 execute "Banco Volten" --local --file=./schema.sql
npx wrangler pages dev .
```

Abra o endereço mostrado (normalmente `http://localhost:8788`).

## Segurança (importante)

A API não tem login. Quem souber a URL do site consegue ler e gravar senhas de clientes e finanças. Proteja o domínio com **Cloudflare Zero Trust → Access → Applications**, criando uma aplicação autoguiada para o seu domínio `*.pages.dev` ou personalizado, liberando só o seu e-mail.

Como `pages_build_output_dir = "."` publica a raiz, `schema.sql`, `wrangler.toml` e `README.md` ficam acessíveis por URL. Eles não contêm segredos, mas se preferir mover o front-end para uma pasta `public/`, ajuste esse valor para `public`.

## Formato aceito pelo extrator

```
Usuário: [teste123]
Senha: [abc123]
URL: [http://dns.exemplo.com]
Criado em: [06/11/2026 10:00]
Vencimento: [06/11/2026 14:00]
Plano: (ignorado por estar entre parênteses)
```

- O rótulo pode variar: usuário/login/user, senha/password, url/dns/servidor, criado/criação, vencimento/expira/validade.
- Sem colchetes, o valor é lido depois dos dois pontos.
- Vários testes colados juntos são separados automaticamente quando um campo se repete.
- Datas em `dd/mm/aaaa hh:mm` ou `aaaa-mm-dd hh:mm`.

## API

| Rota | Métodos |
| --- | --- |
| `/api/clientes` | GET, POST (um objeto ou lista), DELETE `?id=` |
| `/api/financas` | GET (`?mes=AAAA-MM` opcional), POST (com `id` atualiza), DELETE `?id=` |
