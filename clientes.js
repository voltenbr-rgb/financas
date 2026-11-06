// Cloudflare Pages Function: /api/clientes
// Requer o binding D1 chamado DB (Banco Volten).

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });

const txt = (v, max) => String(v ?? '').trim().slice(0, max);
const dataOk = v => (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(v) ? v : '');

export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB
      .prepare('SELECT * FROM clientes ORDER BY data_vencimento ASC, id DESC')
      .all();
    return json(results);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const lista = Array.isArray(body) ? body : [body];
    if (!lista.length || lista.length > 200) return json({ error: 'Envie de 1 a 200 clientes.' }, 400);

    const stmts = [];
    for (const c of lista) {
      const usuario = txt(c.usuario, 120);
      const senha = txt(c.senha, 120);
      if (!usuario || !senha) return json({ error: 'Usuário e senha são obrigatórios.' }, 400);
      const url = txt(c.url_dns, 300);
      const criacao = dataOk(txt(c.data_criacao, 20));
      const venc = dataOk(txt(c.data_vencimento, 20));

      const existente = await env.DB
        .prepare('SELECT id FROM clientes WHERE usuario = ? AND url_dns = ?')
        .bind(usuario, url)
        .first();

      stmts.push(
        existente
          ? env.DB
              .prepare('UPDATE clientes SET senha = ?, data_criacao = ?, data_vencimento = ? WHERE id = ?')
              .bind(senha, criacao, venc, existente.id)
          : env.DB
              .prepare('INSERT INTO clientes (usuario, senha, url_dns, data_criacao, data_vencimento) VALUES (?, ?, ?, ?, ?)')
              .bind(usuario, senha, url, criacao, venc)
      );
    }
    await env.DB.batch(stmts);
    return json({ ok: true, total: stmts.length }, 201);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) return json({ error: 'ID inválido.' }, 400);
    const r = await env.DB.prepare('DELETE FROM clientes WHERE id = ?').bind(id).run();
    if (!r.meta.changes) return json({ error: 'Cliente não encontrado.' }, 404);
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
