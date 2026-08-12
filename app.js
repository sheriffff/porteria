import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://hqvwouxhkkidipiqhunf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxdndvdXhoa2tpZGlwaXFodW5mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1Mzk0NjgsImV4cCI6MjEwMjExNTQ2OH0.UJ04w5bKNgk-mvKI57IKREHyNkA45N59znyC9-X0rhc';

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SCALES = {
  year: { min: 2026, max: 2050, ticks: [2026, 2032, 2038, 2044, 2050], beyond: '>2050', fallback: '2026', axisLabel: '¿en qué año?' },
  gap: { min: 0, max: 20, ticks: [0, 5, 10, 15, 20], beyond: '>20', fallback: '2', axisLabel: '¿cuántos años?' }
};
const AMOUNTS = [1, 2, 5, 10];
const DEFAULT_AMOUNT = 1;
const SECTIONS = ['Matemáticas', 'Ciencia', 'Generalidad'];
const TABS = [{ key: 'yesno', label: 'sí/no' }, { key: 'year', label: 'timeline' }, { key: 'otras', label: 'otras' }];
const EMOJIS = ['👍', '😂', '🤔', '🔥', '🙄'];

const state = {
  players: [],
  questions: [],
  answers: [],
  reactions: [],
  flags: [],
  me: null,
  tab: 'yesno',
  openForm: null,
  openPropose: false,
  reactPicker: null,
  draft: null,
  proposal: null,
  error: null,
  loginName: null,
  loginError: null,
  busy: false
};

const app = document.getElementById('app');

const el = (tag, attrs = {}, ...kids) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'style') Object.assign(node.style, v);
    else if (k in node && k !== 'list') node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return node;
};

const uid = () => crypto.randomUUID();
const scaleOf = (question) => SCALES[question.kind];
const inTab = (tab, q) => tab === 'yesno' ? q.kind === 'yesno' : tab === 'year' ? q.kind === 'year' : (q.kind !== 'yesno' && q.kind !== 'year');
const numPct = (scale, v) => v === scale.beyond
  ? 100
  : ((Math.max(scale.min, Math.min(scale.max, Number(v))) - scale.min) / (scale.max - scale.min)) * 88;
const shortDate = (iso) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' });
const implied = (amount) => Math.round((amount / (amount + 1)) * 100);

function betLine(question, value, amount) {
  const n = amount || 1;
  if (question.kind === 'yesno') {
    const side = value === 'si' ? 'que SÍ' : 'que NO';
    const other = value === 'si' ? 'que no' : 'que sí';
    return `Pongo ${n}€ a ${side} antes del ${question.deadline}, contra 1€ de quien diga ${other}.`;
  }
  if (question.kind === 'gap') {
    if (value === SCALES.gap.beyond) {
      return `Pongo ${n}€ a que pasan más de 20 años, contra 1€ de quien diga que menos.`;
    }
    return `Pongo ${n}€ a que pasan ${value} años o menos, contra 1€ de quien diga que más.`;
  }
  if (value === SCALES.year.beyond) {
    return `Pongo ${n}€ a que no pasa antes de 2050, contra 1€ de quien diga que sí.`;
  }
  return `Pongo ${n}€ a que pasa antes de que acabe ${value}, contra 1€ de quien diga que no.`;
}

function valueLabel(question, value) {
  if (question.kind === 'gap') return value === SCALES.gap.beyond ? '> 20 años' : `${value} años`;
  return value === SCALES.year.beyond ? '> 2050' : String(value);
}

const session = {
  get() {
    try { return JSON.parse(localStorage.getItem('porteria.session')); } catch { return null; }
  },
  set(v) { localStorage.setItem('porteria.session', JSON.stringify(v)); },
  clear() { localStorage.removeItem('porteria.session'); }
};

async function loadAll() {
  const [players, questions, answers, reactions, flags] = await Promise.all([
    db.from('players').select('name, pin_hash').order('name'),
    db.from('questions').select('*').order('created_at'),
    db.from('answers').select('*').order('created_at'),
    db.from('reactions').select('*'),
    db.from('flags').select('*')
  ]);
  const failed = [players, questions, answers, reactions, flags].find((r) => r.error);
  if (failed) {
    state.error = 'No se ha podido leer el registro. Revisa la configuración de Supabase.';
    render();
    return;
  }
  state.players = players.data.map((p) => ({ name: p.name, claimed: !!p.pin_hash }));
  state.questions = questions.data;
  state.answers = answers.data;
  state.reactions = reactions.data;
  state.flags = flags.data;
  state.error = null;
  render();
}

async function call(fn, args) {
  const s = session.get();
  const { data, error } = await db.rpc(fn, { p_name: s.name, p_pin: s.pin, ...args });
  if (error) {
    state.error = 'No se ha podido guardar: ' + error.message;
    render();
    return null;
  }
  return data;
}

function subscribe() {
  db.channel('registry')
    .on('postgres_changes', { event: '*', schema: 'public' }, () => {
      if (state.openForm || state.openPropose) return;
      loadAll();
    })
    .subscribe();
}

function answersFor(qid) {
  return state.answers.filter((a) => a.question_id === qid);
}

function historyOf(qid, player) {
  return answersFor(qid)
    .filter((a) => a.player === player)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

function renderGoalpost(question) {
  const rows = state.players
    .map((p) => ({ name: p.name, list: historyOf(question.id, p.name) }))
    .filter((r) => r.list.length);
  if (!rows.length) return null;

  if (question.kind === 'yesno') {
    return el('div', { class: 'goalpost' },
      rows.map((r) => el('div', { class: 'row' },
        el('span', { class: 'who' }, r.name),
        el('span', { class: 'seq' },
          r.list.flatMap((a, i) => [
            i > 0 ? el('span', { class: 'arrow' }, '→') : null,
            el('span', { class: 'cell' + (i === r.list.length - 1 ? ' last' : '') },
              a.value === 'si' ? 'SÍ' : 'NO',
              ' ',
              el('em', {}, shortDate(a.created_at)))
          ]).filter(Boolean))))
    );
  }

  const scale = scaleOf(question);
  const ticks = [...scale.ticks, scale.beyond];
  return el('div', { class: 'goalpost' },
    el('div', { class: 'axis' },
      ticks.map((t) => el('span', {
        class: 'tick' + (t === scale.beyond ? ' never' : ''),
        style: { left: numPct(scale, t) + '%' }
      }, t))),
    rows.map((r) => el('div', { class: 'lane' },
      el('span', { class: 'who' }, r.name),
      el('div', { class: 'track' },
        el('div', { class: 'rail' }),
        r.list.flatMap((a, i) => {
          const x = numPct(scale, a.value);
          const prev = i > 0 ? numPct(scale, r.list[i - 1].value) : null;
          return [
            prev !== null ? el('div', {
              class: 'segment',
              style: { left: Math.min(prev, x) + '%', width: Math.abs(x - prev) + '%' }
            }) : null,
            el('div', {
              class: 'dot' + (i === r.list.length - 1 ? ' last' : '') + (a.value === scale.beyond ? ' never' : ''),
              style: { left: x + '%' },
              title: `${a.value} · ${shortDate(a.created_at)}`
            })
          ].filter(Boolean);
        })))),
    rows.some((r) => r.list.length > 1)
      ? el('p', { class: 'foot' }, 'Cada punto es una respuesta con su fecha. El relleno es la última.')
      : null
  );
}

async function toggleReaction(answerId, emoji) {
  const existing = state.reactions.find((r) => r.answer_id === answerId && r.player === state.me && r.emoji === emoji);
  await call('toggle_reaction', { p_answer_id: answerId, p_emoji: emoji, p_remove: !!existing });
  await loadAll();
}

function renderAnswers(question) {
  const latest = state.players
    .map((p) => historyOf(question.id, p.name).slice(-1)[0])
    .filter(Boolean)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (!latest.length) return null;

  return el('div', { class: 'answers' }, latest.map((a) => {
    const rs = state.reactions.filter((r) => r.answer_id === a.id);
    const pred = question.kind === 'yesno' ? (a.value === 'si' ? 'SÍ' : 'NO') : valueLabel(question, a.value);
    return el('div', { class: 'answer' },
      el('div', { class: 'aline' },
        el('strong', {}, a.player),
        el('span', { class: 'pred' }, pred),
        question.kind === 'yesno' ? el('span', { class: 'prob' }, implied(a.ratio) + '%') : null,
        a.comment ? el('span', { class: 'cmt' }, a.comment) : null,
        el('span', { class: 'reacts' },
          EMOJIS.filter((e) => rs.some((r) => r.emoji === e)).map((e) => {
            const who = rs.filter((r) => r.emoji === e);
            return el('button', {
              class: 'rchip' + (who.some((r) => r.player === state.me) ? ' on' : ''),
              title: who.map((r) => r.player).join(', '),
              onclick: () => toggleReaction(a.id, e)
            }, e, el('span', {}, who.map((r) => r.player).join(' ')));
          }),
          state.me ? el('button', {
            class: 'radd',
            onclick: () => { state.reactPicker = state.reactPicker === a.id ? null : a.id; render(); }
          }, '＋') : null)),
      state.me && state.reactPicker === a.id
        ? el('div', { class: 'picker' }, EMOJIS.map((e) =>
            el('button', { class: 'opt', onclick: () => { state.reactPicker = null; toggleReaction(a.id, e); } }, e)))
        : null);
  }));
}

function renderForm(question) {
  const d = state.draft;
  const update = (patch) => { Object.assign(d, patch); render(); };
  const isBet = question.kind === 'yesno';
  const betNode = el('p', { class: 'bet-line' }, betLine(question, d.value, d.ratio));
  const refreshBet = () => { betNode.textContent = betLine(question, d.value, d.ratio); };

  let valueOptions;
  if (question.kind === 'yesno') {
    valueOptions = [['si', 'Sí'], ['no', 'No']].map(([v, label]) =>
      el('button', { class: 'opt' + (d.value === v ? ' on' : ''), onclick: () => update({ value: v }) }, label));
  } else {
    const scale = scaleOf(question);
    const isBeyond = d.value === scale.beyond;
    valueOptions = [
      el('input', {
        type: 'text', inputMode: 'numeric', maxLength: 4, class: 'inline-num',
        placeholder: question.kind === 'gap' ? 'años' : 'año',
        value: isBeyond ? '' : d.value,
        oninput: (e) => { e.target.value = e.target.value.replace(/\D/g, ''); d.value = e.target.value; },
        onchange: () => render()
      }),
      el('button', { class: 'opt never' + (isBeyond ? ' on' : ''), onclick: () => update({ value: scale.beyond }) }, scale.beyond)
    ];
  }

  const amountOptions = isBet ? [
    ...AMOUNTS.map((n) =>
      el('button', { class: 'opt' + (Number(d.ratio) === n ? ' on' : ''), onclick: () => update({ ratio: n }) }, n + '€')),
    el('input', {
      type: 'text', inputMode: 'numeric', maxLength: 4, class: 'inline-num',
      placeholder: 'otra',
      value: AMOUNTS.includes(Number(d.ratio)) ? '' : d.ratio,
      oninput: (e) => { e.target.value = e.target.value.replace(/\D/g, ''); d.ratio = Number(e.target.value || 0); refreshBet(); },
      onchange: () => render()
    })
  ] : null;

  return el('div', { class: 'form' },
    el('label', { class: 'label' }, question.kind === 'yesno' ? 'Tu predicción' : scaleOf(question).axisLabel),
    el('div', { class: 'options' }, valueOptions),
    isBet ? el('label', { class: 'label' }, 'Cuánto apuestas (contra 1€)') : null,
    isBet ? el('div', { class: 'options' }, amountOptions) : null,
    isBet ? betNode : null,
    el('label', { class: 'label' }, 'Comentario'),
    el('textarea', {
      rows: 2, value: d.comment, placeholder: 'Por qué crees eso',
      oninput: (e) => { d.comment = e.target.value; }
    }),
    el('div', { class: 'actions' },
      el('button', { class: 'btn', disabled: state.busy, onclick: () => submitAnswer(question) }, 'Guardar respuesta'),
      el('button', { class: 'btn ghost', onclick: () => { state.openForm = null; state.draft = null; render(); } }, 'Cancelar'))
  );
}

async function submitAnswer(question) {
  const d = state.draft;
  if (question.kind !== 'yesno') {
    const scale = scaleOf(question);
    if (d.value !== scale.beyond && !/^\d{1,4}$/.test(String(d.value))) {
      state.error = question.kind === 'gap' ? 'Pon un número de años o elige ">20".' : 'Pon un año de 4 cifras o elige ">2050".';
      render();
      return;
    }
  }
  const amount = Math.max(1, Math.floor(Number(d.ratio) || 0));
  state.busy = true;
  render();
  const ok = await call('submit_answer', {
    p_id: uid(),
    p_question_id: question.id,
    p_value: String(d.value),
    p_ratio: amount,
    p_comment: d.comment.trim(),
    p_change_mind: d.changeMind.trim()
  });
  state.busy = false;
  if (ok !== null) {
    state.openForm = null;
    state.draft = null;
  }
  await loadAll();
}

async function setStatus(question, status, resolution) {
  await call('set_question_status', { p_question_id: question.id, p_status: status, p_resolution: resolution || null });
  await loadAll();
}

function renderCard(question) {
  const mine = state.me ? historyOf(question.id, state.me) : [];
  const isAdmin = state.me === 'Sheriff';

  const openForm = () => {
    const last = mine.slice(-1)[0];
    state.draft = {
      value: last ? last.value : (question.kind === 'yesno' ? 'si' : scaleOf(question).fallback),
      ratio: last ? last.ratio : DEFAULT_AMOUNT,
      comment: '',
      changeMind: ''
    };
    state.openForm = question.id;
    render();
  };

  return el('article', { class: 'card' + (question.status !== 'active' ? ' ' + question.status : '') },
    el('header', { class: 'card-head' },
      el('span', { class: 'deadline' }, question.kind === 'yesno' ? `sí / no · antes del ${question.deadline}` : scaleOf(question).axisLabel),
      question.status === 'proposed' ? el('span', { class: 'stamp' }, 'propuesta') : null,
      question.status === 'resolved' ? el('span', { class: 'stamp done' }, 'resuelta: ' + question.resolution) : null),
    el('h2', {}, question.text),
    renderGoalpost(question),
    renderAnswers(question),
    question.status !== 'resolved' && state.openForm === question.id
      ? renderForm(question)
      : el('div', { class: 'actions' },
          state.me && question.status !== 'resolved'
            ? el('button', { class: 'btn', onclick: openForm }, mine.length ? 'Responder de nuevo' : 'Responder')
            : null,
          isAdmin && question.status === 'proposed'
            ? el('button', { class: 'btn ghost', onclick: () => setStatus(question, 'active') }, 'Aprobar')
            : null)
  );
}

function renderPropose() {
  if (!state.openPropose) {
    return el('button', {
      class: 'btn ghost wide',
      onclick: () => {
        state.proposal = { section: SECTIONS[0], kind: 'year', deadline: '31/12/2027', text: '', criterion: '' };
        state.openPropose = true;
        render();
      }
    }, 'Proponer una pregunta');
  }

  const p = state.proposal;
  const update = (patch) => { Object.assign(p, patch); render(); };

  return el('div', { class: 'form' },
    el('div', { class: 'options' }, SECTIONS.map((s) =>
      el('button', { class: 'opt' + (p.section === s ? ' on' : ''), onclick: () => update({ section: s }) }, s))),
    el('div', { class: 'options' },
      el('button', { class: 'opt' + (p.kind === 'year' ? ' on' : ''), onclick: () => update({ kind: 'year' }) }, '¿En qué año?'),
      el('button', { class: 'opt' + (p.kind === 'gap' ? ' on' : ''), onclick: () => update({ kind: 'gap' }) }, '¿Cuántos años?'),
      el('button', { class: 'opt' + (p.kind === 'yesno' ? ' on' : ''), onclick: () => update({ kind: 'yesno' }) }, 'Sí / no con fecha')),
    p.kind === 'yesno'
      ? el('input', { value: p.deadline, placeholder: 'Fecha límite', oninput: (e) => { p.deadline = e.target.value; } })
      : null,
    el('label', { class: 'label' }, 'La pregunta'),
    el('textarea', {
      rows: 2, value: p.text, placeholder: 'Algo que ocurra o no ocurra, sin adjetivos',
      oninput: (e) => { p.text = e.target.value; }
    }),
    el('label', { class: 'label' }, 'Cómo se resuelve'),
    el('textarea', {
      rows: 2, value: p.criterion,
      placeholder: 'Quién lo declara y con qué evidencia. Si no cabe en una frase, la pregunta no sirve.',
      oninput: (e) => { p.criterion = e.target.value; }
    }),
    el('div', { class: 'actions' },
      el('button', { class: 'btn', disabled: state.busy, onclick: submitProposal }, 'Proponer'),
      el('button', { class: 'btn ghost', onclick: () => { state.openPropose = false; state.proposal = null; render(); } }, 'Cancelar'))
  );
}

async function submitProposal() {
  const p = state.proposal;
  if (!p.text.trim() || !p.criterion.trim()) return;
  state.busy = true;
  render();
  const ok = await call('propose_question', {
    p_id: uid(),
    p_section: p.section,
    p_kind: p.kind,
    p_text: p.text.trim(),
    p_criterion: p.criterion.trim(),
    p_deadline: p.kind === 'yesno' ? p.deadline.trim() : null
  });
  state.busy = false;
  if (ok !== null) {
    state.openPropose = false;
    state.proposal = null;
  }
  await loadAll();
}

async function login(name, pin) {
  if (!/^\d{4}$/.test(pin)) {
    state.loginError = 'El PIN son 4 cifras.';
    render();
    return;
  }
  const { data, error } = await db.rpc('login', { p_name: name, p_pin: pin });
  if (error || !data) {
    state.loginError = error ? error.message : `Ese PIN no es el de ${name}.`;
    render();
    return;
  }
  session.set({ name, pin });
  state.me = name;
  state.loginError = null;
  await loadAll();
}

async function addPlayer(name) {
  const clean = name.trim();
  if (!clean) return;
  const { error } = await db.from('players').insert({ name: clean });
  if (error) {
    state.loginError = 'Ese nombre ya existe o no se ha podido crear.';
    render();
    return;
  }
  state.loginName = clean;
  await loadAll();
}

function renderLogin() {
  let pinValue = '';
  let newName = '';
  const selected = state.loginName;
  const claimed = selected ? state.players.find((p) => p.name === selected)?.claimed : false;

  return el('div', { class: 'login' },
    el('p', { class: 'lead' }, 'Elige tu nombre. La primera vez que entras, el PIN que pongas queda como el tuyo.'),
    el('div', { class: 'names' }, state.players.map((p) =>
      el('button', {
        class: 'chip' + (selected === p.name ? ' on' : ''),
        onclick: () => { state.loginName = p.name; state.loginError = null; render(); }
      }, p.name, !p.claimed ? el('span', { class: 'unclaimed' }, 'sin PIN') : null))),
    selected ? el('div', { class: 'pin-row' },
      el('input', {
        class: 'pin', inputMode: 'numeric', maxLength: 4, placeholder: '····',
        'aria-label': 'PIN de 4 cifras',
        oninput: (e) => { e.target.value = e.target.value.replace(/\D/g, ''); pinValue = e.target.value; }
      }),
      el('button', { class: 'btn', onclick: () => login(selected, pinValue) }, claimed ? 'Entrar' : 'Fijar PIN y entrar')
    ) : null,
    state.loginError ? el('p', { class: 'error' }, state.loginError) : null,
    el('div', { class: 'add' },
      el('input', { placeholder: 'Añadir a otro jugador', oninput: (e) => { newName = e.target.value; } }),
      el('button', { class: 'btn ghost', onclick: () => addPlayer(newName) }, 'Añadir')),
    el('p', { class: 'note' }, 'Esto es un candado de cortesía entre amigos, no seguridad. Lo que protege el registro es que las respuestas no se pueden editar ni borrar.')
  );
}

function render() {
  app.replaceChildren();

  if (state.error) app.append(el('p', { class: 'error' }, state.error));

  if (!state.me) {
    app.append(renderLogin());
    return;
  }

  app.append(
    el('div', { class: 'bar' },
      el('span', {}, 'Entras como ', el('strong', {}, state.me)),
      el('button', {
        class: 'btn ghost',
        onclick: () => { session.clear(); state.me = null; state.loginName = null; render(); }
      }, 'Salir')),
    el('div', { class: 'filters' }, TABS.map((t) => el('button', {
      class: state.tab === t.key ? 'on' : '',
      onclick: () => { state.tab = t.key; render(); }
    }, t.label))),
    ...state.questions.filter((q) => inTab(state.tab, q)).map(renderCard),
    renderPropose()
  );
}

const saved = session.get();
if (saved) state.me = saved.name;
loadAll().then(subscribe);
