// Cloudflare Pages Function: /api/financas
// Requer o binding D1 chamado DB (Banco Volten).

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });

export async function onRequestGet({ request, env }) {
  try {
    const mes = new URL(request.url).searchParams.get('mes'); // opcional: YYYY-MM
    const stmt = /^\d{4}-\d{2}$/.test(mes || '')
      ? env.DB.prepare('SELECT * FROM financas WHERE data_vencimento LIKE ? ORDER BY data_vencimento ASC, id DESC').bind(mes + '%')
      : env.DB.prepare('SELECT * FROM financas ORDER BY data_vencimento ASC, id DESC');
    const { results } = await stmt.all();
    return json(results);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// POST sem "id" cria um lançamento; com "id" atualiza o existente.
export async function onRequestPost({ request, env }) {
  try {
    const b = await request.json();
    const descricao = String(b.descricao ?? '').trim().slice(0, 120);
    const categoria = String(b.categoria ?? '').trim().slice(0, 60) || 'Outros';
    const valor = Number(b.valor);
    const tipo = b.tipo;
    const status = b.status === 'pago' ? 'pago' : 'pendente';
    const data = String(b.data_vencimento ?? '');

    if (!descricao) return json({ error: 'Informe a descrição.' }, 400);
    if (!Number.isFinite(valor) || valor <= 0) return json({ error: 'Informe um valor maior que zero.' }, 400);
    if (tipo !== 'entrada' && tipo !== 'saida') return json({ error: 'Tipo deve ser entrada ou saida.' }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return json({ error: 'Data de vencimento inválida.' }, 400);

    if (b.id) {
      const id = Number(b.id);
      if (!Number.isInteger(id) || id <= 0) return json({ error: 'ID inválido.' }, 400);
      const r = await env.DB
        .prepare('UPDATE financas SET descricao = ?, valor = ?, categoria = ?, tipo = ?, data_vencimento = ?, status = ? WHERE id = ?')
        .bind(descricao, valor, categoria, tipo, data, status, id)
        .run();
      if (!r.meta.changes) return json({ error: 'Lançamento não encontrado.' }, 404);
      return json({ ok: true, id });
    }

    const r = await env.DB
      .prepare('INSERT INTO financas (descricao, valor, categoria, tipo, data_vencimento, status) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(descricao, valor, categoria, tipo, data, status)
      .run();
    return json({ ok: true, id: r.meta.last_row_id }, 201);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) return json({ error: 'ID inválido.' }, 400);
    const r = await env.DB.prepare('DELETE FROM financas WHERE id = ?').bind(id).run();
    if (!r.meta.changes) return json({ error: 'Lançamento não encontrado.' }, 404);
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
