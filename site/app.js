
(function () {
  const DATA = window.DATA;
  const PAGE = document.querySelector("[data-page]").dataset.page;
  const _dm = {};
  const $ = (id) => document.getElementById(id) || (_dm[id] = _dm[id] || document.createElement('div'));
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const rnd = () => Math.random().toString(36).slice(2, 10);
  const LS = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const rows = DATA.rows;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const FAV = { 'Assessee': ['For assessee', 'good'], 'Assessee (partly)': ['Partly for assessee', 'mid'], 'Revenue': ['For revenue', 'bad'] };
  const AREAS = ['Income-tax', 'GST', 'FEMA & Banking', 'IBC', 'Company & SEBI', 'Labour', 'Articles'];
  const HOME = (r) => r.why === 'Home bench' || r.why === 'Rajasthan';
  const dateKey = (r) => r.order_iso || '';
  const IMP = { High: 0, Medium: 1, Low: 2 };

  /* ---------- state: read marks, private annotations, shared comments ---------- */
  const READ_KEY = 'dtb:read:' + DATA.day;
  let read = new Set(LS.get(READ_KEY, []));
  const ann = new Map(Object.entries(LS.get('dtb:ann', {})));   // itemId -> {hl:[], note:''}
  const comments = new Map();                                  // itemId -> [{id, uid, text, at}]
  let db = null, user = null, uid = null, canPost = true, privMode = 'device', profiles = {};
  const pending = new Map();                                   // doc key -> write queue
  const getAnn = (id) => { if (!ann.has(id)) ann.set(id, { hl: [], note: '' }); return ann.get(id); };
  const hasAnn = (id) => { const a = ann.get(id); return !!(a && (a.note || (a.hl && a.hl.length))); };
  const cCount = (id) => (comments.get(id) || []).length;

  function persistLocal() {
    const o = {}; ann.forEach((v, k) => { if (v.note || (v.hl && v.hl.length)) o[k] = v; });
    LS.set('dtb:ann', o);
  }
  function queue(key, data) {
    if (!db || !uid) return;
    let w = pending.get(key);
    if (!w) { w = { data, timer: 0, running: false, again: false }; pending.set(key, w); }
    w.data = data; clearTimeout(w.timer);
    w.timer = setTimeout(() => flush(key), 650);
  }
  async function flush(key) {
    const w = pending.get(key);
    if (!w) return;
    if (w.running) { w.again = true; return; }
    w.running = true; w.timer = 0;
    try {
      await db.collection('data/users/' + uid).doc(key).set(w.data);
      privMode = 'account';
    } catch (e) { privMode = 'device'; }
    w.running = false;
    if (w.again) { w.again = false; flush(key); } else if (!w.timer) pending.delete(key);
    paintStatus();
  }
  function saveAnn(id) {
    persistLocal();
    const a = getAnn(id);
    queue('a_' + id, { hl: a.hl, note: a.note, u: Date.now() });
    updateBadges();
  }
  function saveRead() {
    LS.set(READ_KEY, [...read]);
    queue('read_' + DATA.day, { ids: [...read], u: Date.now() });
  }

  async function initCaps() {
    if (typeof claude === 'undefined' || !claude.use) { paintStatus(); return; }
    try { db = await claude.use('db'); user = await claude.use('user'); } catch (e) { db = null; }
    if (!db || !user) { db = null; paintStatus(); return; }
    uid = await user.id();
    if (!uid) { db = null; paintStatus(); return; }
    try { const w = await user.can('data.write'); if (w === false) canPost = false; } catch (e) {}
    privMode = 'account';
    db.collection('data/users/' + uid).onSnapshot((snap) => {
      let changedOpen = false;
      snap.docs.forEach((d) => {
        const data = d.data() || {};
        if (d.id.startsWith('a_')) {
          const item = d.id.slice(2);
          if (pending.has(d.id)) return;
          const cur = JSON.stringify(ann.get(item) || {});
          const next = { hl: data.hl || [], note: data.note || '' };
          if (cur !== JSON.stringify(next)) { ann.set(item, next); if (item === state.open) changedOpen = true; }
        } else if (d.id === 'read_' + DATA.day && !pending.has(d.id)) {
          read = new Set(data.ids || []); LS.set(READ_KEY, [...read]);
        }
      });
      persistLocal();
      if (!snap.docs.some((d) => d.id === 'read_' + DATA.day) && read.size) saveRead();
      paintRows(); progress(); updateBadges();
      if (changedOpen && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('#side'))) { renderBody(); renderNotes(); }
    }, () => { privMode = 'device'; paintStatus(); });
    db.collection('comments').onSnapshot((snap) => {
      comments.clear();
      snap.docs.forEach((d) => { const v = d.data(); if (!v || !v.item) return; const a = comments.get(v.item) || []; a.push({ id: d.id, uid: v.uid, text: v.text, at: v.at || 0 }); comments.set(v.item, a); });
      comments.forEach((a) => a.sort((x, y) => x.at - y.at));
      updateBadges(); if (state.open) renderComments();
    }, () => {});
    paintStatus();
  }

  /* ---------- lists ---------- */
  const deadline = rows.filter((r) => r.why === 'Deadline');
  const first = rows.filter((r) => r.impact === 'High' && r.why !== 'Deadline')
    .sort((a, b) => (HOME(b) - HOME(a)) || dateKey(b).localeCompare(dateKey(a)) || a.id.localeCompare(b.id));
  const firstIds = new Set(first.map((r) => r.id));
  const rest = rows.filter((r) => !firstIds.has(r.id) && r.why !== 'Deadline')
    .sort((a, b) => AREAS.indexOf(a.area) - AREAS.indexOf(b.area) || (IMP[a.impact] - IMP[b.impact]) || dateKey(b).localeCompare(dateKey(a)) || a.id.localeCompare(b.id));
  const mustIds = new Set([...first, ...deadline].map((r) => r.id));
  const state = { tab: 'All', q: '', unread: false, mine: false, open: null, tabIdx: 0, ctx: [], view: 'struct', pane: 'text', sel: null };
  const hay = new Map(rows.map((r) => [r.id, [r.headline, r.parties, r.topic, r.forum, r.area, r.why, r.mark, r.cite, r.src].join(' ').toLowerCase()]));
  const passFilter = (r) => {
    const q = state.q.trim().toLowerCase();
    return (!q || hay.get(r.id).includes(q)) && (!state.unread || !read.has(r.id)) && (!state.mine || hasAnn(r.id) || cCount(r.id) > 0);
  };

  $('date').textContent = DATA.dayLabel;
  $('h1').append(first.length + deadline.length + ' updates to ', Object.assign(el('em'), { textContent: 'read first' }), '.');
  $('sub').textContent = rows.length + ' rulings, notices and articles reached the inbox today from Taxmann and Current Tax Online, up to ' + DATA.built + '. Every one is listed below. Open any item to read its full text exactly as the source sent it, highlight passages, and add notes or comments.';
  if (deadline.length) {
    const d = $('due');
    d.hidden = false;
    d.append(el('b', '', 'Deadline notice'), el('span', '', deadline[0].headline));
    const b = el('button', 'link', 'Read full notice');
    b.type = 'button';
    b.addEventListener('click', () => openItem(deadline[0].id, deadline.map((r) => r.id)));
    d.append(b);
  }

  function rowEl(r, compact, ctxIds) {
    const li = el('li', 'row' + (compact ? ' compact' : ''));
    li.dataset.id = r.id;
    const mark = el('div', 'mark');
    const top = el('div', 'top');
    const isWord = !/^[0-9]/.test(r.mark);
    if (!isWord) top.append(el('span', 's', 's.'));
    top.append(el('span', 'n' + (isWord ? ' word' : r.mark.length > 4 ? ' long' : ''), r.mark));
    mark.append(top);
    if (r.caption) mark.append(el('span', 'cap', r.caption));
    const body = el('div', 'body');
    const kick = el('div', 'kick');
    if (r.why) kick.append(el('span', 'why', r.why));
    kick.append(el('span', '', [r.forum !== '—' ? r.forum : '', r.order, r.source].filter(Boolean).join(' · ')));
    body.append(kick, el('h3', r.headline.length > 170 ? 'clamp' : '', r.headline));
    if (r.parties) body.append(el('p', 'parties', r.parties));
    const f = FAV[r.favour];
    if (f || r.outcome) {
      const held = el('p', 'held');
      if (f) held.append(el('span', 'fav ' + f[1], f[0]));
      if (r.outcome) held.append(el('span', '', r.outcome));
      body.append(held);
    }
    const acts = el('div', 'acts');
    const open = el('button', 'btn go', 'Read full text'); open.type = 'button';
    open.addEventListener('click', () => openItem(r.id, ctxIds));
    const tick = el('button', 'btn tick', 'Mark as read'); tick.type = 'button';
    tick.addEventListener('click', () => toggle(r.id));
    const bn = el('button', 'badge'); bn.type = 'button'; bn.addEventListener('click', () => openItem(r.id, ctxIds, 'notes'));
    const bc = el('button', 'badge'); bc.type = 'button'; bc.addEventListener('click', () => openItem(r.id, ctxIds, 'comments'));
    acts.append(open, tick, bn, bc);
    body.append(acts);
    li.append(mark, body);
    li._tick = tick; li._bn = bn; li._bc = bc;
    return li;
  }
  function drawFirst() {
    const shown = first.filter(passFilter);
    const ids = shown.map((x) => x.id);
    $('first').replaceChildren(...shown.map((r) => rowEl(r, false, ids)));
    if (!shown.length) $('first').append(el('li', 'empty', 'No read-first items match.'));
    paintRows(); updateBadges();
  }
  function drawRest() {
    const counts = new Map();
    rest.filter(passFilter).forEach((r) => counts.set(r.area, (counts.get(r.area) || 0) + 1));
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const mk = (label, key, n) => {
      const b = el('button', 'chip', label); b.type = 'button';
      b.setAttribute('aria-pressed', String(state.tab === key)); b.append(el('i', '', String(n)));
      b.addEventListener('click', () => { state.tab = key; drawRest(); });
      return b;
    };
    $('chips').replaceChildren(mk('All', 'All', total), ...AREAS.filter((a) => counts.has(a) || state.tab === a).map((a) => mk(a, a, counts.get(a) || 0)));
    const list = rest.filter((r) => passFilter(r) && (state.tab === 'All' || r.area === state.tab));
    const ids = list.map((r) => r.id);
    const out = [];
    if (!list.length) out.push(el('p', 'empty', 'Nothing matches these filters.'));
    let area = null, ul = null;
    list.forEach((r) => {
      if (state.tab === 'All' && r.area !== area) {
        area = r.area;
        const g = el('div', 'grp', area); g.append(el('span', '', String(counts.get(area))));
        out.push(g); ul = el('ul', 'list'); out.push(ul);
      } else if (state.tab !== 'All' && !ul) { ul = el('ul', 'list'); out.push(ul); }
      ul.append(rowEl(r, true, ids));
    });
    $('rest').replaceChildren(...out);
    $('n-rest').textContent = list.length + ' of ' + rest.length;
    paintRows(); updateBadges();
  }
  function paintRows() {
    document.querySelectorAll('.row').forEach((li) => {
      const on = read.has(li.dataset.id);
      li.classList.toggle('done', on);
      li._tick.setAttribute('aria-pressed', String(on));
      li._tick.textContent = on ? 'Read ✓' : 'Mark as read';
    });
  }
  function updateBadges() {
    document.querySelectorAll('.row').forEach((li) => {
      const id = li.dataset.id, a = ann.get(id);
      const n = a ? (a.hl ? a.hl.length : 0) + (a.note ? 1 : 0) : 0, c = cCount(id);
      li._bn.hidden = !n; li._bn.textContent = n + (n === 1 ? ' note or highlight' : ' notes and highlights');
      li._bc.hidden = !c; li._bc.textContent = c + (c === 1 ? ' comment' : ' comments');
    });
    if (state.open) {
      const a = ann.get(state.open); const n = a ? (a.hl ? a.hl.length : 0) + (a.note ? 1 : 0) : 0, c = cCount(state.open);
      ['pt-notes', 'st-notes'].forEach((i) => { $(i).textContent = 'Notes' + (n ? ' (' + n + ')' : ''); });
      ['pt-comments', 'st-comments'].forEach((i) => { $(i).textContent = 'Comments' + (c ? ' (' + c + ')' : ''); });
    }
  }
  function progress() {
    const must = [...mustIds].filter((id) => read.has(id)).length;
    $('count').textContent = '';
    $('count').append('Read first ' + must + ' of ' + mustIds.size, Object.assign(el('span'), { textContent: '  ·  all ' + read.size + ' of ' + rows.length }));
    $('fill').style.width = (100 * must / mustIds.size) + '%';
    $('n-first').textContent = first.length + ' updates';
    const done = must === mustIds.size;
    $('finish').hidden = !done;
    if (done) {
      const days = new Set(LS.get('dtb:done', []));
      if (!days.has(DATA.day)) { days.add(DATA.day); LS.set('dtb:done', [...days]); }
      let s = 0; const d = new Date(DATA.day + 'T00:00:00Z');
      while (days.has(d.toISOString().slice(0, 10))) { s++; d.setUTCDate(d.getUTCDate() - 1); }
      $('finishH').textContent = 'You are caught up on what matters.';
      $('finishP').textContent = 'All ' + mustIds.size + ' read-first items read.' + (s > 1 ? ' ' + s + ' days in a row on this device.' : '') + ' ' + (rows.length - read.size) + ' other updates are still unread below, if you have time.';
    }
    const on = state.open && read.has(state.open);
    $('d-read').setAttribute('aria-pressed', String(!!on));
    $('d-read').textContent = on ? 'Read ✓' : 'Mark as read';
  }
  function toggle(id) {
    if (read.has(id)) read.delete(id); else read.add(id);
    saveRead(); paintRows(); progress();
    if (state.unread) { drawFirst(); drawRest(); }
  }

  /* ---------- structured reading view (same words as the source, laid out) ---------- */
  const tagEl = (t, cls) => el('span', 'tag' + (cls ? ' ' + cls : ''), t);
  const label = (t) => el('h4', '', t);
  function dl(pairs) {
    const d = el('dl');
    pairs.forEach(([k, v]) => { if (!v) return; d.append(el('dt', '', k), el('dd', '', v)); });
    return d;
  }
  function bullets(items) { const ul = el('ul'); items.forEach((t) => ul.append(el('li', '', t))); return ul; }
  function splitPieces(t) { return t.split(/\s+[-–]\s*(?=\S)/).map((s) => s.trim()).filter(Boolean); }
  function headnoteBlocks(par) {
    let t = par.trim(), m; const tags = [];
    while ((m = t.match(/\s*(\[[^\[\]]*\])\s*$/))) { tags.unshift(m[1]); t = t.slice(0, m.index); }
    const pcs = splitPieces(t), out = []; let i = 0, topics = 0, topicsDone = false, mode = 'fact';
    if (pcs[0] && /^(I\.\s*)?(Sections?|Rule|Article)\b/i.test(pcs[0])) { out.push({ k: 'ref', t: pcs[0] }); i = 1; }
    for (; i < pcs.length; i++) {
      const p = pcs[i];
      if (/^Whether\b/i.test(p)) {
        let q = p, j = i + 1, held = '';
        while (j < pcs.length && !/^Held\b/i.test(pcs[j]) && !/^Whether\b/i.test(pcs[j])) { q += ' - ' + pcs[j]; j++; }
        if (j < pcs.length && /^Held\b/i.test(pcs[j])) { held = pcs[j]; j++; }
        out.push({ k: 'issue', q, held }); i = j - 1; topicsDone = true; continue;
      }
      const hm = p.match(/^HELD\s*:\s*(.*)$/i);
      if (hm) { out.push({ k: 'heldh' }); mode = 'held'; if (hm[1]) out.push({ k: 'held', t: hm[1] }); topicsDone = true; continue; }
      if (!topicsDone && p.length <= 130 && topics < 4 && !/^(It was|Assessee|Petitioner|Appellant|Respondent)/i.test(p)) { out.push({ k: 'topic', t: p }); topics++; continue; }
      topicsDone = true; out.push({ k: mode === 'held' ? 'held' : 'fact', t: p });
    }
    return { blocks: out, tags };
  }
  function renderHeadnote(par) {
    const { blocks, tags } = headnoteBlocks(par);
    const frag = document.createDocumentFragment();
    let list = null, topicBox = null;
    const flush = () => { list = null; };
    blocks.forEach((b) => {
      if (b.k === 'ref') { flush(); frag.append(el('p', 'ref', b.t)); }
      else if (b.k === 'topic') { flush(); if (!topicBox) { topicBox = el('div', 'crumbs'); frag.append(topicBox); } topicBox.append(el('span', '', b.t)); }
      else if (b.k === 'fact' || b.k === 'held') { topicBox = null; if (!list) { list = el('ul'); frag.append(list); } list.append(el('li', '', b.t)); }
      else if (b.k === 'heldh') { flush(); frag.append(label('Held')); }
      else if (b.k === 'issue') {
        flush(); topicBox = null;
        const q = el('div', 'q');
        const a = el('div'); a.append(el('span', 'l', 'Question'), document.createTextNode(b.q)); q.append(a);
        if (b.held) {
          const h = el('div', 'held-r'); h.append(el('span', 'l', 'Held'));
          const m = b.held.match(/^Held\s*,?\s*(yes|no)\b\s*(.*)$/i);
          if (m) { h.append(el('span', 'yn ' + (m[1].toLowerCase() === 'yes' ? 'y' : 'n'), m[1][0].toUpperCase() + m[1].slice(1).toLowerCase())); if (m[2]) h.append(document.createTextNode(m[2])); }
          else h.append(document.createTextNode(b.held));
          q.append(h);
        }
        frag.append(q);
      }
    });
    if (tags.length) {
      const m = el('div', 'meta'); m.style.marginTop = '.6rem';
      tags.forEach((t) => { const low = t.toLowerCase(); m.append(tagEl(t, /in favour of assessee/.test(low) ? 'good' : /in favour of revenue/.test(low) ? 'bad' : '')); });
      frag.append(m);
    }
    return frag;
  }
  const lineIdx = (lines, s) => lines.findIndex((l) => l.trim() === s);
  function renderAlert(lines, box) {
    const cat = lines[1] || '';
    const meta = el('div', 'meta'); cat.split(' | ').forEach((c) => meta.append(tagEl(c))); box.append(meta);
    const si = lineIdx(lines, 'Summary:'), hi = lineIdx(lines, 'Headnote:'), ki = lineIdx(lines, 'Key Details:');
    const kEnd = ki < 0 ? lines.length : ki;
    if (si >= 0) { box.append(label('Summary')); box.append(el('p', 'callout', lines.slice(si + 1, hi >= 0 ? hi : kEnd).join(' ').trim())); }
    if (hi >= 0) {
      box.append(label('Headnote'));
      const act = lines[hi + 1]; box.append(el('p', 'act', act));
      const bodyText = lines.slice(hi + 2, kEnd).join('\n').trim();
      bodyText.split(/\n\s*\n/).forEach((par) => { if (par.trim()) { const w = el('div'); w.append(renderHeadnote(par)); w.style.marginBottom = '1rem'; box.append(w); } });
    } else {
      const bodyText = lines.slice(2, kEnd).join('\n').trim();
      bodyText.split(/\n\s*\n/).forEach((par) => { if (par.trim()) box.append(el('p', '', par.trim())); });
    }
    if (ki >= 0) {
      box.append(label('Key details'));
      box.append(dl(lines.slice(ki + 1).map((l) => { const m = l.match(/^([^:]+?)\s*:\s*(.*)$/); return m ? [m[1], m[2]] : ['', l]; })));
    }
  }
  function renderCTO(lines, box) {
    const [, type, court, date] = lines;
    const meta = el('div', 'meta'); [type, court, date].forEach((x) => x && meta.append(tagEl(x))); box.append(meta);
    let idx = 4;
    if (lines[4] && /^Statutes referred to:/i.test(lines[4])) { box.append(label('Statutes referred to')); box.append(el('p', 'act', lines[4].replace(/^Statutes referred to:\s*/i, ''))); idx = 5; }
    lines.slice(idx).forEach((ln, k) => {
      const m = ln.match(/^(\d+)\s+(.+?)\s+In favour of:\s*(Assessee \(partly\) Assessee|Assessee|Revenue)\s+(.*)$/);
      if (m) {
        box.append(label('Parties')); box.append(el('p', 'parties-h', m[2]));
        const fav = m[3] === 'Assessee (partly) Assessee' ? 'Assessee (partly)' : m[3];
        const f = FAV[fav]; const mm = el('div', 'meta'); mm.append(tagEl('In favour of: ' + fav, f ? f[1] : '')); box.append(mm);
        box.append(label('Headnote'));
        const segs = m[4].split('—').map((s) => s.trim()).filter(Boolean);
        const topics = []; while (topics.length < 3 && segs.length > 1 && segs[0].length <= 140) topics.push(segs.shift());
        if (topics.length) { const c = el('div', 'crumbs'); topics.forEach((t) => c.append(el('span', '', t))); box.append(c); }
        box.append(bullets(segs));
      } else if (/^\d+\s/.test(ln)) {
        box.append(label('Order')); box.append(el('p', '', ln));
      } else {
        box.append(label('Further headnote'));
        box.append(bullets(ln.split('—').map((s) => s.trim()).filter(Boolean)));
      }
    });
  }
  function renderDigest(lines, box) {
    const cat = lines[1] || '';
    const meta = el('div', 'meta'); meta.append(tagEl(cat)); box.append(meta);
    let i = 2; const head = lines[i] || '';
    const isHead = /^(SECTION|CIRCULAR|NOTIFICATION|RBI\/)/.test(head);
    if (isHead) {
      const c = el('div', 'crumbs'); head.split(' - ').forEach((t) => c.append(el('span', '', t))); box.append(c); i++;
    }
    const rest2 = lines.slice(i);
    if (cat === 'Opinions') {
      const t = rest2[0] || ''; const k = t.lastIndexOf(' - [20');
      box.append(el('p', 'parties-h', k > 0 ? t.slice(0, k) : t));
      box.append(dl([['Citation', k > 0 ? t.slice(k + 3) : ''], ['Author', rest2[1] || '']]));
    } else if (isHead && !/^SECTION/.test(head)) {
      box.append(el('p', 'parties-h', rest2[0] || ''));
      const note = rest2.slice(1).join(' ').replace(/^Editorial Note\s*:\s*/, '');
      box.append(label('Editorial note')); box.append(el('p', '', note));
    } else {
      const para = rest2.join(' ');
      const k = para.lastIndexOf(' - [20');
      if (k > 0) {
        const before = para.slice(0, k), j = before.lastIndexOf(' - ');
        box.append(label('Digest entry')); box.append(el('p', 'callout', j > 0 ? before.slice(0, j) : before));
        box.append(label('Case')); box.append(dl([['Parties', j > 0 ? before.slice(j + 3) : ''], ['Citation', para.slice(k + 3)]]));
      } else box.append(el('p', '', para));
    }
  }
  function renderNewsletter(lines, box) {
    box.append(el('p', 'parties-h', lines[0] || ''));
    box.append(dl([['Citation', lines[1] || '']]));
    box.append(label('Newsletter text'));
    lines.slice(2).filter((l) => l.trim()).forEach((p) => box.append(el('p', '', p)));
  }
  function srcOf(r, i) { return i === 0 ? { label: r.srcLabel, text: r.src, kind: r.source } : { label: r.extra[i - 1].label, text: r.extra[i - 1].text, kind: r.extra[i - 1].label }; }
  function renderStructured(s, box) {
    const lines = s.text.split('\n');
    if (s.kind === 'Taxmann') renderAlert(lines, box);
    else if (s.kind === 'Current Tax Online') renderCTO(lines, box);
    else if (s.kind === 'Taxmann Daily Digest') renderDigest(lines, box);
    else if (/GST Daily/.test(s.kind)) renderNewsletter(lines, box);
    else lines.filter((l) => l.trim()).forEach((l) => box.append(el('p', '', l)));
  }
  function renderRaw(text, box) {
    box.className = 'txt raw';
    text.split('\n').forEach((l) => { if (l.trim()) box.append(el('p', '', l)); });
  }

  /* ---------- highlights ---------- */
  function textNodes(root) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), out = []; let pos = 0, n;
    while ((n = w.nextNode())) { out.push({ n, s: pos, e: pos + n.data.length }); pos += n.data.length; }
    return { nodes: out, text: out.map((x) => x.n.data).join('') };
  }
  function applyHighlights(root, list) {
    const { nodes, text } = textNodes(root);
    const live = [];
    list.forEach((h) => {
      let s = h.s, e = h.e;
      if (text.slice(s, e) !== h.q) {
        const at = text.indexOf(h.q, Math.max(0, h.s - 400));
        const any = at >= 0 ? at : text.indexOf(h.q);
        if (any < 0) { h._orphan = true; return; }
        s = any; e = any + h.q.length;
      }
      h._orphan = false; live.push({ id: h.id, c: h.c, s, e });
    });
    nodes.forEach(({ n, s: ns, e: ne }) => {
      const cover = live.filter((h) => h.s < ne && h.e > ns);
      if (!cover.length || !n.parentNode) return;
      const pts = [...new Set([ns, ne, ...cover.flatMap((h) => [Math.max(ns, h.s), Math.min(ne, h.e)])])].sort((a, b) => a - b);
      const frag = document.createDocumentFragment();
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1]; if (a === b) continue;
        const piece = n.data.slice(a - ns, b - ns);
        const top = cover.filter((h) => h.s <= a && h.e >= b).pop();
        if (top) { const m = el('mark', 'hl c' + top.c, piece); m.dataset.hid = top.id; frag.append(m); } else frag.append(document.createTextNode(piece));
      }
      n.parentNode.replaceChild(frag, n);
    });
  }
  function offsetIn(root, node, off) { const r = document.createRange(); r.selectNodeContents(root); r.setEnd(node, off); return r.toString().length; }
  function onSelection() {
    if (!state.open || state.view !== 'struct') { hideSel(); return; }
    const sel = window.getSelection();
    const box = $('d-txt');
    if (!sel || !sel.rangeCount || sel.isCollapsed) { hideSel(); return; }
    const r = sel.getRangeAt(0);
    if (!box.contains(r.startContainer) || !box.contains(r.endContainer)) { hideSel(); return; }
    let s = offsetIn(box, r.startContainer, r.startOffset), e = offsetIn(box, r.endContainer, r.endOffset);
    const full = textNodes(box).text;
    while (s < e && /\s/.test(full[s])) s++;
    while (e > s && /\s/.test(full[e - 1])) e--;
    if (e - s < 2) { hideSel(); return; }
    state.sel = { s, e, q: full.slice(s, e) };
    $('sq').textContent = '“' + state.sel.q + '”';
    $('selbar').hidden = false;
  }
  function hideSel() { state.sel = null; $('selbar').hidden = true; }
  function addHighlight(c, withNote) {
    if (!state.sel || !state.open) return;
    const a = getAnn(state.open);
    const h = { id: rnd(), t: state.tabIdx, s: state.sel.s, e: state.sel.e, q: state.sel.q, c, n: '', at: Date.now() };
    a.hl.push(h);
    saveAnn(state.open);
    window.getSelection().removeAllRanges(); hideSel();
    renderBody(); renderNotes();
    setPane('notes');
    if (withNote) { const ta = document.querySelector('[data-hid="' + h.id + '"] textarea'); if (ta) ta.focus(); }
  }

  /* ---------- notes panel ---------- */
  function renderNotes() {
    const id = state.open; if (!id) return;
    const a = getAnn(id);
    const note = $('note');
    if (document.activeElement !== note) note.value = a.note || '';
    const mine = a.hl.filter((h) => h.t === state.tabIdx).sort((x, y) => x.s - y.s);
    $('hl-lbl').textContent = 'Highlights' + (mine.length ? ' (' + mine.length + ')' : '');
    const list = $('hl-list'); list.replaceChildren();
    if (!mine.length) list.append(el('p', 'status', 'Select text in the Structured view to highlight it. Each highlight can carry its own note.'));
    mine.forEach((h) => {
      const card = el('div', 'hlcard'); card.dataset.hid = h.id;
      const q = el('div', 'hlq c' + h.c + (h._orphan ? ' orphan' : ''), '“' + h.q + '”');
      if (!h._orphan) q.addEventListener('click', () => { setPane('text'); const m = document.querySelector('mark[data-hid="' + h.id + '"]'); if (m) { m.scrollIntoView({ block: 'center' }); m.classList.add('flash'); setTimeout(() => m.classList.remove('flash'), 1400); } });
      const ta = el('textarea', 'ta sm'); ta.placeholder = 'Note on this passage'; ta.value = h.n || ''; ta.setAttribute('aria-label', 'Note on highlighted passage');
      let t = 0; ta.addEventListener('input', () => { h.n = ta.value; clearTimeout(t); t = setTimeout(() => saveAnn(id), 400); });
      ta.addEventListener('blur', () => { clearTimeout(t); h.n = ta.value; saveAnn(id); });
      const row = el('div', 'hlrow');
      [1, 2, 3].forEach((c) => { const b = el('button', 'sw c' + c); b.type = 'button'; b.setAttribute('aria-pressed', String(h.c === c)); b.setAttribute('aria-label', 'Colour ' + c); b.addEventListener('click', () => { h.c = c; saveAnn(id); renderBody(); renderNotes(); }); row.append(b); });
      row.append(el('span', 'sp'));
      const del = el('button', 'link', 'Remove'); del.type = 'button';
      del.addEventListener('click', () => { a.hl = a.hl.filter((x) => x.id !== h.id); saveAnn(id); renderBody(); renderNotes(); });
      row.append(del);
      card.append(q, ta, row);
      if (h._orphan) card.append(el('p', 'status', 'This passage no longer matches the text, so it is not marked.'));
      list.append(card);
    });
    paintStatus();
  }
  function paintStatus() {
    const s = $('st-priv');
    if (s) s.textContent = uid && privMode === 'account' ? 'Private to you. Saved to your account, so it follows you across devices.' : 'Private to you. Saved on this device only, because you are not signed in here or your access level cannot save to the account.';
    const c = $('c-st');
    if (c) c.textContent = !uid ? 'Sign in to the artifact to post comments.' : (canPost ? '' : 'Your access level lets you read comments but not post.');
    const p = $('c-post'); if (p) p.disabled = !uid || !canPost;
  }

  /* ---------- comments panel ---------- */
  async function renderComments() {
    const id = state.open; if (!id) return;
    const list = comments.get(id) || [];
    $('c-lbl').textContent = 'Team comments' + (list.length ? ' (' + list.length + ')' : '');
    const box = $('c-list');
    if (user && list.length) { try { profiles = Object.assign(profiles, await user.profiles([...new Set(list.map((c) => c.uid))])); } catch (e) {} }
    if (state.open !== id) return;
    box.replaceChildren();
    if (!list.length) box.append(el('p', 'status', uid ? 'No comments yet. Add the first one below.' : 'Comments are shared with the team once you sign in to the artifact.'));
    list.forEach((c) => {
      const d = el('div', 'cmt');
      const who = el('div', 'who');
      const p = profiles[c.uid];
      who.append(el('b', '', c.uid === uid ? 'You' : ((p && p.name) || 'Someone')), el('span', '', new Date(c.at).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })));
      if (c.uid === uid) { const x = el('button', 'link', 'Delete'); x.type = 'button'; x.style.marginLeft = 'auto'; x.style.minHeight = '0'; x.addEventListener('click', async () => { try { await db.collection('comments').doc(c.id).delete(); } catch (e) { $('c-st').textContent = 'Could not delete that comment.'; } }); who.append(x); }
      d.append(who, el('p', '', c.text));
      box.append(d);
    });
    paintStatus();
  }
  async function postComment() {
    const ta = $('c-new'), text = ta.value.trim();
    if (!text || !db || !uid || !state.open) return;
    $('c-post').disabled = true;
    try { await db.collection('comments').add({ item: state.open, uid, text, at: Date.now() }); ta.value = ''; $('c-st').textContent = ''; }
    catch (e) { $('c-st').textContent = (e && e.code === 'invalid_argument') ? 'Your access level does not allow posting.' : 'Could not post. Try again.'; if (e && e.code === 'invalid_argument') canPost = false; }
    paintStatus();
  }

  /* ---------- pop-up shell ---------- */
  const scrim = $('scrim'), dlg = $('dlg');
  let lastFocus = null;
  const wide = () => window.matchMedia('(min-width: 900px)').matches;
  function setPane(p) {
    if (p === 'text' && wide()) p = state.pane === 'comments' ? 'comments' : 'notes';
    state.pane = p;
    dlg.dataset.pane = p;
    const side = p === 'comments' ? 'comments' : 'notes';
    $('p-notes').hidden = side !== 'notes'; $('p-comments').hidden = side !== 'comments';
    document.querySelectorAll('#pane-tabs [data-pane], .side-tabs [data-pane]').forEach((b) => {
      const on = wide() ? b.dataset.pane === side : b.dataset.pane === p;
      b.setAttribute('aria-pressed', String(on));
    });
    if (side === 'comments') renderComments();
  }
  function renderBody() {
    const r = byId.get(state.open); if (!r) return;
    const s = srcOf(r, state.tabIdx);
    const box = $('d-txt'); box.replaceChildren(); box.className = 'txt';
    $('d-prov').textContent = 'Text copied without edits from the ' + s.label + ' received on ' + DATA.dayLabel.split(',')[1].trim() + '. Mail header, footer and layout are not included. Not checked against the official order, so check that before citing. "Structured" lays the same words out in sections; "As sent" shows them exactly as one block of text.';
    if (state.view === 'struct') {
      renderStructured(s, box);
      const a = ann.get(state.open);
      if (a && a.hl.length) applyHighlights(box, a.hl.filter((h) => h.t === state.tabIdx).sort((x, y) => x.at - y.at));
      $('d-hint').textContent = 'Select text to highlight it or add a note.';
    } else {
      renderRaw(s.text, box);
      $('d-hint').textContent = 'Highlighting works in the Structured view.';
    }
    $('v-struct').setAttribute('aria-pressed', String(state.view === 'struct'));
    $('v-raw').setAttribute('aria-pressed', String(state.view === 'raw'));
    hideSel();
  }
  function openItem(id, ctx, pane) {
    const r = byId.get(id); if (!r) return;
    if (scrim.hidden) lastFocus = document.activeElement;
    state.open = id; state.tabIdx = 0; state.ctx = ctx && ctx.length ? ctx : [id];
    const kick = $('d-kick'); kick.replaceChildren();
    if (r.why) kick.append(el('span', 'why', r.why));
    kick.append(el('span', '', [r.forum !== '—' ? r.forum : '', r.order, r.cite].filter(Boolean).join(' · ')));
    $('d-title').textContent = r.parties && r.source === 'Taxmann Daily Digest' ? r.parties : r.headline;
    $('d-topic').textContent = r.topic || ''; $('d-topic').hidden = !r.topic;
    const srcs = $('d-srcs'); srcs.replaceChildren();
    if (r.extra && r.extra.length) {
      for (let i = 0; i <= r.extra.length; i++) {
        const b = el('button', 'chip', srcOf(r, i).label); b.type = 'button'; b.setAttribute('aria-pressed', String(i === 0));
        b.addEventListener('click', () => { state.tabIdx = i; [...srcs.children].forEach((x, k) => x.setAttribute('aria-pressed', String(k === i))); renderBody(); renderNotes(); $('d-body').scrollTop = 0; });
        srcs.append(b);
      }
    }
    const i = state.ctx.indexOf(id);
    $('d-pos').textContent = state.ctx.length > 1 ? (i + 1) + ' of ' + state.ctx.length : '';
    $('d-prev').hidden = $('d-next').hidden = state.ctx.length < 2;
    $('d-prev').disabled = i <= 0; $('d-next').disabled = i >= state.ctx.length - 1;
    const u = $('d-url'); u.hidden = !r.url; if (r.url) u.href = r.url;
    scrim.hidden = false; document.documentElement.style.overflow = 'hidden';
    renderBody(); renderNotes();
    $('c-new').value = '';
    setPane(pane || 'text');
    $('d-body').scrollTop = 0;
    dlg.focus(); progress(); updateBadges();
  }
  function closeItem() {
    const id = state.open;
    scrim.hidden = true; document.documentElement.style.overflow = '';
    if (id) { const a = ann.get(id); if (a) { a.note = $('note').value; saveAnn(id); } }
    state.open = null; hideSel();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    progress();
  }
  function step(d) {
    const id = state.open, a = getAnn(id); a.note = $('note').value; saveAnn(id);
    const i = state.ctx.indexOf(id) + d;
    if (i >= 0 && i < state.ctx.length) openItem(state.ctx[i], state.ctx, state.pane === 'text' ? 'text' : state.pane);
  }
  $('d-x').addEventListener('click', closeItem);
  scrim.addEventListener('click', (e) => { if (e.target === scrim) closeItem(); });
  $('d-prev').addEventListener('click', () => step(-1));
  $('d-next').addEventListener('click', () => step(1));
  $('d-read').addEventListener('click', () => { if (state.open) toggle(state.open); });
  document.querySelectorAll('#pane-tabs [data-pane], .side-tabs [data-pane]').forEach((b) => b.addEventListener('click', () => setPane(b.dataset.pane)));
  $('v-struct').addEventListener('click', () => { state.view = 'struct'; renderBody(); });
  $('v-raw').addEventListener('click', () => { state.view = 'raw'; renderBody(); });
  document.querySelectorAll('#selbar .sw').forEach((b) => { b.addEventListener('mousedown', (e) => e.preventDefault()); b.addEventListener('click', () => addHighlight(+b.dataset.c, false)); });
  $('sel-note').addEventListener('mousedown', (e) => e.preventDefault());
  $('sel-note').addEventListener('click', () => addHighlight(1, true));
  document.addEventListener('selectionchange', onSelection);
  $('d-txt').addEventListener('click', (e) => {
    const m = e.target.closest && e.target.closest('mark.hl'); if (!m || !window.getSelection().isCollapsed) return;
    setPane('notes'); const c = document.querySelector('.hlcard[data-hid="' + m.dataset.hid + '"]');
    if (c) { c.scrollIntoView({ block: 'nearest' }); c.classList.add('flash'); setTimeout(() => c.classList.remove('flash'), 1400); const ta = c.querySelector('textarea'); if (ta) ta.focus(); }
  });
  let nt = 0;
  $('note').addEventListener('input', () => { clearTimeout(nt); nt = setTimeout(() => { if (state.open) { getAnn(state.open).note = $('note').value; saveAnn(state.open); } }, 450); });
  $('note').addEventListener('blur', () => { if (state.open) { clearTimeout(nt); getAnn(state.open).note = $('note').value; saveAnn(state.open); } });
  $('c-post').addEventListener('click', postComment);
  $('c-new').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) postComment(); });
  window.addEventListener('resize', () => { if (state.open) setPane(state.pane); });
  document.addEventListener('keydown', (e) => {
    if (scrim.hidden) return;
    const typing = e.target.matches && e.target.matches('input,textarea');
    if (e.key === 'Escape') closeItem();
    else if (e.key === 'ArrowRight' && !typing) step(1);
    else if (e.key === 'ArrowLeft' && !typing) step(-1);
    else if (e.key === 'Tab') {
      const f = [...dlg.querySelectorAll('button, a[href], textarea')].filter((n) => !n.hidden && !n.disabled && n.offsetParent !== null);
      if (!f.length) return;
      const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === a || document.activeElement === dlg)) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
  });
  $('d-copy').addEventListener('click', () => {
    const r = byId.get(state.open), txt = srcOf(r, state.tabIdx).text;
    const done = (m) => { $('d-copy').textContent = m; setTimeout(() => { $('d-copy').textContent = 'Copy text'; }, 1800); };
    const manual = () => { const sel = window.getSelection(), rg = document.createRange(); rg.selectNodeContents($('d-txt')); sel.removeAllRanges(); sel.addRange(rg); done('Press Ctrl+C'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => done('Copied'), manual); else manual();
  });

  /* ---------- share, filters, boot ---------- */
  function briefText() {
    const clip = (s) => (s.length > 150 ? s.slice(0, 147) + '...' : s);
    const lines = ['*Daily Tax Brief, ' + DATA.dayLabel + '*', ''];
    if (deadline.length) lines.push('Deadline: ' + deadline[0].headline, '');
    first.forEach((r, i) => { const f = FAV[r.favour]; lines.push((i + 1) + '. ' + (/^[0-9]/.test(r.mark) ? 's. ' : '') + r.mark + ' | ' + (r.forum !== '—' ? r.forum : r.source) + ': ' + clip(r.headline) + (f ? ' (' + f[0] + (r.outcome ? ': ' + r.outcome : '') + ')' : '')); });
    lines.push('', rows.length + ' updates in all today. Unverified, from Taxmann / Current Tax Online mails. Check the official order before citing.');
    return lines.join('\n');
  }
  $('copy').addEventListener('click', () => {
    const txt = briefText();
    const manual = () => { const t = $('manual'); t.hidden = false; t.value = txt; t.focus(); t.select(); $('toast').textContent = 'Select and copy the text below.'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => { $('toast').textContent = 'Copied. Paste it into WhatsApp.'; }, manual); else manual();
  });
  const redraw = () => { drawFirst(); drawRest(); progress(); };
  $('q').addEventListener('input', (e) => { state.q = e.target.value; redraw(); });
  $('unread').addEventListener('change', (e) => { state.unread = e.target.checked; redraw(); });
  $('mine').addEventListener('change', (e) => { state.mine = e.target.checked; redraw(); });
  $('foot').textContent = 'Every item comes from a Taxmann alert, the Taxmann daily digest or the Current Tax Online digest received on ' + DATA.dayLabel.split(',')[1].trim() + ', not from the official order or notification. Section marks and the "read first" picks are rule-based, from headlines and headnotes. The short outcome lines under Current Tax Online items were written from their headnotes. Source text is shown without edits, apart from removing a stray encoding character from one author name. Highlights, notes and read marks are private to you. Comments are visible to everyone who can open this page.';

  $('b-rest').textContent = rest.length + ' updates, grouped by law';
  const AR = window.ARCH; $('b-arch').textContent = AR && AR.rows.length ? AR.rows.length + ' earlier entries' : 'Fills from tomorrow, one day at a time';
  drawFirst(); drawRest(); progress(); paintStatus();
  initCaps();
})();
