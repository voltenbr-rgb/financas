'use strict';

/* ============ Utilitários ============ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mesAtual = () => dateKey(new Date()).slice(0, 7);
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const CORES = ['#22d3ee', '#d946ef', '#34d399', '#fbbf24', '#fb7185', '#818cf8', '#f97316', '#2dd4bf', '#a3e635', '#e879f9'];

const state = { parsed: [], saved: [], fin: [], calDate: new Date(), calMode: 'month', calSel: null, charts: {} };

async function api(path, opts = {}) {
  const r = await fetch('/api/' + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error(data.error || 'Erro ' + r.status);
  return data;
}

function toast(msg, ok = true) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.className = `fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl px-4 py-2 text-sm font-semibold shadow-lg ${ok ? 'bg-emerald-500 text-slate-950' : 'bg-rose-500 text-white'}`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = texto; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
  }
}

/* ============ Datas ============ */
function parseData(s) {
  if (!s) return '';
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})(?:\D+(\d{1,2}):(\d{2}))?/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${pad(m[4] || 0)}:${m[5] || '00'}`;
  m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:\D+(\d{1,2}):(\d{2}))?/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}T${pad(m[4] || 0)}:${m[5] || '00'}`;
  return '';
}
function fmtData(iso) {
  if (!iso) return '';
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}` + (m[4] ? ` ${m[4]}:${m[5]}` : '');
}
function statusVenc(iso) {
  if (!iso) return { t: 'Sem data', c: 'bg-slate-500/20 text-slate-500' };
  const agora = new Date(), alvo = new Date(iso);
  if (alvo < agora) return { t: 'Vencido', c: 'bg-rose-500/20 text-rose-500' };
  if (iso.slice(0, 10) === dateKey(agora)) return { t: 'Vence hoje', c: 'bg-amber-500/20 text-amber-500' };
  const dias = Math.ceil((alvo - agora) / 864e5);
  if (dias <= 3) return { t: `Vence em ${dias}d`, c: 'bg-amber-500/20 text-amber-500' };
  return { t: `${dias} dias restantes`, c: 'bg-emerald-500/20 text-emerald-500' };
}

/* ============ Tema e abas ============ */
function aplicarTema(escuro) {
  document.documentElement.classList.toggle('dark', escuro);
  $('#themeBtn').textContent = escuro ? '☀️' : '🌙';
  try { localStorage.setItem('tema', escuro ? 'dark' : 'light'); } catch { /* ignora */ }
  if (!$('#tab-financas').classList.contains('hidden')) renderFinCharts();
}
$('#themeBtn').onclick = () => aplicarTema(!document.documentElement.classList.contains('dark'));

function abrirAba(nome) {
  $$('.tabpane').forEach(s => s.classList.toggle('hidden', s.id !== 'tab-' + nome));
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === nome));
  if (nome === 'calendario') renderCal();
  if (nome === 'financas') renderFin();
  history.replaceState(null, '', '#' + nome);
}
$$('.tab').forEach(b => b.onclick = () => abrirAba(b.dataset.tab));

/* ============ MÓDULO 1: extração ============ */
const CAMPOS = [
  ['criado', /cria[dç]|created/i],
  ['venc', /venc|expir|validade|v[aá]lid/i],
  ['senha', /senha|pass/i],
  ['usuario', /usu[aá]rio|login|user/i],
  ['url', /url|dns|servidor|server|host|link|portal/i]
];

function extrair(texto) {
  const limpo = texto.replace(/\([^()]*\)/g, ''); // ignora tudo entre ( )
  const lista = [];
  let atual = {};
  const fecha = () => { if (atual.usuario && atual.senha) lista.push(atual); atual = {}; };

  for (const linha of limpo.split(/\r?\n/)) {
    const l = linha.trim();
    if (!l) continue;
    const colchete = l.match(/\[([^\]]*)\]/); // prioridade: conteúdo entre [ ]
    const idx = l.search(/[:\[]/);
    const rotulo = idx >= 0 ? l.slice(0, idx) : l;
    let valor = colchete ? colchete[1].trim() : (l.includes(':') ? l.slice(l.indexOf(':') + 1).trim() : '');
    let campo = idx >= 0 ? (CAMPOS.find(([, re]) => re.test(rotulo)) || [])[0] : undefined;
    if (!campo) {
      const u = l.match(/https?:\/\/[^\s\]\)]+/i);
      if (u) { campo = 'url'; valor = u[0]; }
    }
    if (!campo || !valor) continue;
    if (atual[campo] !== undefined) fecha(); // campo repetido = novo teste
    if (campo === 'criado') atual.data_criacao = parseData(valor);
    else if (campo === 'venc') atual.data_vencimento = parseData(valor);
    else if (campo === 'url') atual.url_dns = valor;
    else atual[campo] = valor;
    atual[campo] ??= valor;
  }
  fecha();
  return lista.map(c => ({
    usuario: c.usuario, senha: c.senha, url_dns: c.url_dns || '',
    data_criacao: c.data_criacao || '', data_vencimento: c.data_vencimento || ''
  }));
}

const resumo = c => `Usuário: ${c.usuario}\nSenha: ${c.senha}\nURL/DNS: ${c.url_dns || '-'}\nVencimento: ${fmtData(c.data_vencimento) || '-'}`;
const msgWpp = c => `Olá! 👋 Seguem seus dados de acesso:\n\n👤 Usuário: ${c.usuario}\n🔑 Senha: ${c.senha}\n🌐 URL/DNS: ${c.url_dns || '-'}\n📅 Vencimento: ${fmtData(c.data_vencimento) || '-'}\n\n⏰ Lembrete: renove antes do vencimento para não perder o acesso.`;

function cardHTML(c, src, i) {
  const s = statusVenc(c.data_vencimento);
  const row = (k, v, cls = '') => `<div class="flex justify-between gap-3 text-sm"><span class="text-slate-500 dark:text-slate-400">${k}</span><span class="break-all text-right font-mono ${cls}">${esc(v || '-')}</span></div>`;
  return `<article class="card space-y-3" data-src="${src}" data-i="${i}">
    <div class="flex items-center justify-between">
      <span class="text-xs font-bold text-fuchsia-500">${src === 'new' ? 'Novo' : 'Salvo'}</span>
      <span class="rounded-full px-2 py-0.5 text-xs font-semibold ${s.c}">${s.t}</span>
    </div>
    ${row('Usuário', c.usuario, 'text-cyan-600 dark:text-cyan-300')}
    ${row('Senha', c.senha)}
    ${row('URL/DNS', c.url_dns)}
    ${row('Criado em', fmtData(c.data_criacao))}
    ${row('Vencimento', fmtData(c.data_vencimento), 'font-bold')}
    <input data-fone inputmode="tel" class="input" placeholder="WhatsApp do cliente (opcional): 67999998888">
    <div class="grid grid-cols-2 gap-2">
      <button data-act="copy" class="btn btn-ghost">📋 Copiar Dados</button>
      <button data-act="wpp" class="btn btn-green">💬 Enviar no WhatsApp</button>
      ${src === 'new'
        ? '<button data-act="save" class="btn btn-primary col-span-2">💾 Salvar no Banco</button>'
        : '<button data-act="del" class="btn btn-red col-span-2">🗑️ Excluir</button>'}
    </div>
  </article>`;
}

function renderClientes() {
  $('#parsed').innerHTML = state.parsed.length ? state.parsed.map((c, i) => cardHTML(c, 'new', i)).join('')
    : '<p class="text-sm text-slate-500">Cole um texto acima e clique em “Extrair dados”.</p>';
  $('#cntParsed').textContent = state.parsed.length ? `(${state.parsed.length})` : '';
  $('#btnSalvarTodos').classList.toggle('hidden', state.parsed.length < 2);
  $('#saved').innerHTML = state.saved.length ? state.saved.map((c, i) => cardHTML(c, 'saved', i)).join('')
    : '<p class="text-sm text-slate-500">Nenhum cliente salvo ainda.</p>';
  $('#cntSaved').textContent = state.saved.length ? `(${state.saved.length})` : '';
}

async function carregarClientes() {
  try { state.saved = await api('clientes'); }
  catch (e) { toast('Não foi possível carregar clientes: ' + e.message, false); }
  renderClientes();
  if (!$('#tab-calendario').classList.contains('hidden')) renderCal();
}

$('#btnExtrair').onclick = () => {
  state.parsed = extrair($('#raw').value);
  renderClientes();
  if (!state.parsed.length) toast('Nenhum usuário e senha encontrados no texto.', false);
};
$('#btnLimpar').onclick = () => { $('#raw').value = ''; state.parsed = []; renderClientes(); };
$('#btnReload').onclick = carregarClientes;
$('#btnSalvarTodos').onclick = async () => {
  try {
    await api('clientes', { method: 'POST', body: JSON.stringify(state.parsed) });
    toast(`${state.parsed.length} clientes salvos.`);
    state.parsed = []; await carregarClientes();
  } catch (e) { toast(e.message, false); }
};

/* ============ Ações delegadas (cards, calendário, finanças) ============ */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  try {
    if (act === 'dia') { state.calSel = b.dataset.dia; renderCal(); return; }
    if (act === 'toggle') {
      const it = state.fin.find(x => x.id === +b.dataset.id);
      await api('financas', { method: 'POST', body: JSON.stringify({ ...it, status: it.status === 'pago' ? 'pendente' : 'pago' }) });
      return carregarFin();
    }
    if (act === 'delfin') {
      if (!confirm('Excluir este lançamento?')) return;
      await api('financas?id=' + b.dataset.id, { method: 'DELETE' });
      toast('Lançamento excluído.'); return carregarFin();
    }
    const card = b.closest('[data-src]');
    if (!card) return;
    const src = card.dataset.src;
    const c = (src === 'new' ? state.parsed : state.saved)[+card.dataset.i];
    if (!c) return;
    if (act === 'copy') { await copiar(resumo(c)); toast('Dados copiados.'); }
    if (act === 'wpp') {
      let n = $('[data-fone]', card).value.replace(/\D/g, '');
      if (n && n.length <= 11) n = '55' + n;
      window.open(`https://wa.me/${n}?text=${encodeURIComponent(msgWpp(c))}`, '_blank', 'noopener');
    }
    if (act === 'save') {
      await api('clientes', { method: 'POST', body: JSON.stringify(c) });
      toast('Cliente salvo no Banco Volten.');
      state.parsed.splice(+card.dataset.i, 1); await carregarClientes();
    }
    if (act === 'del') {
      if (!confirm(`Excluir o cliente ${c.usuario}?`)) return;
      await api('clientes?id=' + c.id, { method: 'DELETE' });
      toast('Cliente excluído.'); await carregarClientes();
    }
  } catch (err) { toast(err.message, false); }
});

/* ============ Calendário ============ */
function renderCal() {
  const d = state.calDate, y = d.getFullYear(), m = d.getMonth(), mes = state.calMode === 'month';
  const ev = {};
  [...state.saved.map(c => ({ ...c, pend: false })), ...state.parsed.map(c => ({ ...c, pend: true }))].forEach(c => {
    if (c.data_vencimento) (ev[c.data_vencimento.slice(0, 10)] ??= []).push(c);
  });
  let ini, qtd, titulo;
  if (mes) {
    const p = new Date(y, m, 1);
    ini = new Date(y, m, 1 - p.getDay());
    qtd = Math.ceil((p.getDay() + new Date(y, m + 1, 0).getDate()) / 7) * 7;
    titulo = `${MESES[m]} ${y}`;
  } else {
    ini = new Date(y, m, d.getDate() - d.getDay()); qtd = 7;
    const f = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + 6);
    titulo = `${pad(ini.getDate())}/${pad(ini.getMonth() + 1)} – ${pad(f.getDate())}/${pad(f.getMonth() + 1)}/${f.getFullYear()}`;
  }
  $('#calTitle').textContent = titulo;
  $('#calMes').classList.toggle('active', mes);
  $('#calSem').classList.toggle('active', !mes);
  const hoje = dateKey(new Date()), max = mes ? 2 : 8;
  let h = SEM.map(s => `<div class="py-1 text-center text-xs font-semibold text-slate-500">${s}</div>`).join('');
  for (let k = 0; k < qtd; k++) {
    const dt = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + k), key = dateKey(dt), lista = ev[key] || [];
    const fora = mes && dt.getMonth() !== m;
    h += `<button data-act="dia" data-dia="${key}" class="${mes ? 'min-h-[4.5rem]' : 'min-h-[10rem]'} overflow-hidden rounded-xl border p-1 text-left text-xs transition hover:border-cyan-400 ${key === state.calSel ? 'border-cyan-400 ring-2 ring-cyan-400/40' : 'border-slate-200 dark:border-slate-800'} ${fora ? 'opacity-40' : ''} ${key === hoje ? 'bg-cyan-500/10' : ''}">
      <div class="font-bold ${key === hoje ? 'text-cyan-500' : ''}">${dt.getDate()}</div>
      ${lista.slice(0, max).map(x => `<div class="mt-0.5 truncate rounded px-1 ${chipCls(x)}">${esc(x.usuario)}</div>`).join('')}
      ${lista.length > max ? `<div class="mt-0.5 text-slate-500">+${lista.length - max}</div>` : ''}
    </button>`;
  }
  $('#calGrid').innerHTML = h;

  const sel = state.calSel && ev[state.calSel];
  $('#calDetail').innerHTML = state.calSel
    ? `<h3 class="font-bold">Vencimentos em ${fmtData(state.calSel)}</h3>` + (sel ? sel.map(x => {
        const s = statusVenc(x.data_vencimento);
        return `<div class="card flex flex-wrap items-center justify-between gap-2 text-sm">
          <div><span class="font-mono font-bold text-cyan-600 dark:text-cyan-300">${esc(x.usuario)}</span>
          <span class="text-slate-500"> · ${esc(fmtData(x.data_vencimento).slice(11) || 'sem hora')}${x.pend ? ' · não salvo' : ''}</span></div>
          <span class="rounded-full px-2 py-0.5 text-xs font-semibold ${s.c}">${s.t}</span></div>`;
      }).join('') : '<p class="text-sm text-slate-500">Nenhum vencimento neste dia.</p>')
    : '<p class="text-sm text-slate-500">Toque em um dia para ver os vencimentos.</p>';
}
const chipCls = x => x.pend ? 'bg-fuchsia-500/20 text-fuchsia-500' : statusVenc(x.data_vencimento).c;

function moverCal(dir) {
  const d = state.calDate;
  state.calDate = state.calMode === 'month' ? new Date(d.getFullYear(), d.getMonth() + dir, 1) : new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * dir);
  renderCal();
}
$('#calPrev').onclick = () => moverCal(-1);
$('#calNext').onclick = () => moverCal(1);
$('#calHoje').onclick = () => { state.calDate = new Date(); state.calSel = dateKey(new Date()); renderCal(); };
$('#calMes').onclick = () => { state.calMode = 'month'; renderCal(); };
$('#calSem').onclick = () => { state.calMode = 'week'; renderCal(); };

/* ============ MÓDULO 2: finanças ============ */
async function carregarFin() {
  try { state.fin = await api('financas'); }
  catch (e) { toast('Não foi possível carregar finanças: ' + e.message, false); }
  renderFin();
}

function filtroFin() {
  const mes = $('#fMes').value, st = $('#fFiltroStatus').value;
  return state.fin.filter(x => (!mes || x.data_vencimento.startsWith(mes)) && (!st || x.status === st));
}
const soma = l => l.reduce((a, x) => a + Number(x.valor), 0);

function renderFin() {
  const l = filtroFin().sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
  const ent = soma(l.filter(x => x.tipo === 'entrada')), sai = soma(l.filter(x => x.tipo === 'saida'));
  $('#stEnt').textContent = brl(ent);
  $('#stSai').textContent = brl(sai);
  $('#stSaldo').textContent = brl(ent - sai);
  $('#stSaldo').className = `text-2xl font-extrabold ${ent - sai >= 0 ? 'text-cyan-500' : 'text-rose-500'}`;
  $('#cntFin').textContent = l.length ? `(${l.length})` : '';
  $('#finList').innerHTML = l.length ? l.map(x => `
    <div class="flex flex-wrap items-center justify-between gap-2 py-3">
      <div class="min-w-0"><p class="truncate font-semibold">${esc(x.descricao)}</p>
        <p class="text-xs text-slate-500">${esc(x.categoria)} · ${fmtData(x.data_vencimento)}</p></div>
      <div class="flex items-center gap-2">
        <span class="font-mono font-bold ${x.tipo === 'entrada' ? 'text-emerald-500' : 'text-rose-500'}">${x.tipo === 'entrada' ? '+' : '−'} ${brl(x.valor)}</span>
        <button data-act="toggle" data-id="${x.id}" class="btn btn-ghost !px-2 !py-1 text-xs ${x.status === 'pago' ? 'text-emerald-500' : 'text-amber-500'}" title="Alternar status">${x.status === 'pago' ? '✅ Pago' : '⏳ Pendente'}</button>
        <button data-act="delfin" data-id="${x.id}" class="btn btn-ghost !px-2 !py-1 text-xs" aria-label="Excluir">🗑️</button>
      </div>
    </div>`).join('') : '<p class="py-3 text-sm text-slate-500">Nenhum lançamento neste filtro. Use o formulário para adicionar.</p>';
  renderFinCharts();
}

function mk(id, canvas, cfg) {
  state.charts[id]?.destroy();
  state.charts[id] = new Chart($('#' + canvas), cfg);
}

function renderFinCharts() {
  if (typeof Chart === 'undefined' || $('#tab-financas').classList.contains('hidden')) return;
  const escuro = document.documentElement.classList.contains('dark');
  Chart.defaults.color = escuro ? '#cbd5e1' : '#475569';
  Chart.defaults.borderColor = escuro ? '#1e293b' : '#e2e8f0';

  const porCat = {};
  filtroFin().filter(x => x.tipo === 'saida').forEach(x => porCat[x.categoria] = (porCat[x.categoria] || 0) + Number(x.valor));
  const vazio = !Object.keys(porCat).length;
  mk('cat', 'cvCat', {
    type: 'doughnut',
    data: { labels: vazio ? ['Sem despesas'] : Object.keys(porCat), datasets: [{ data: vazio ? [1] : Object.values(porCat), backgroundColor: vazio ? ['#64748b55'] : CORES, borderWidth: 0 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { enabled: !vazio, callbacks: { label: c => `${c.label}: ${brl(c.parsed)}` } } } }
  });

  const [by, bm] = ($('#fMes').value || mesAtual()).split('-').map(Number);
  const meses = Array.from({ length: 6 }, (_, i) => { const d = new Date(by, bm - 1 - (5 - i), 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; });
  const st = $('#fFiltroStatus').value, base = state.fin.filter(x => !st || x.status === st);
  const serie = t => meses.map(mm => soma(base.filter(x => x.tipo === t && x.data_vencimento.startsWith(mm))));
  mk('evo', 'cvEvo', {
    type: 'bar',
    data: {
      labels: meses.map(mm => `${MESES[+mm.slice(5) - 1].slice(0, 3)}/${mm.slice(2, 4)}`),
      datasets: [
        { label: 'Entradas', data: serie('entrada'), backgroundColor: '#34d399', borderRadius: 6 },
        { label: 'Saídas', data: serie('saida'), backgroundColor: '#d946ef', borderRadius: 6 }
      ]
    },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${brl(c.parsed.y)}` } } }, scales: { y: { beginAtZero: true, ticks: { callback: v => brl(v) } } } }
  });
}

$('#fMes').onchange = $('#fFiltroStatus').onchange = renderFin;

$('#finForm').onsubmit = async e => {
  e.preventDefault();
  const body = {
    descricao: $('#fDesc').value.trim(), valor: parseFloat($('#fValor').value), categoria: $('#fCat').value,
    tipo: $('#fTipo').value, data_vencimento: $('#fData').value, status: $('#fStatus').value
  };
  try {
    await api('financas', { method: 'POST', body: JSON.stringify(body) });
    toast('Lançamento salvo.');
    $('#fDesc').value = ''; $('#fValor').value = '';
    await carregarFin();
  } catch (err) { toast(err.message, false); }
};

/* ============ Inicialização ============ */
(function init() {
  $('#themeBtn').textContent = document.documentElement.classList.contains('dark') ? '☀️' : '🌙';
  $('#fMes').value = mesAtual();
  $('#fData').value = dateKey(new Date());
  const h = location.hash.slice(1);
  abrirAba(['clientes', 'calendario', 'financas'].includes(h) ? h : 'clientes');
  renderClientes();
  carregarClientes();
  carregarFin();
})();
