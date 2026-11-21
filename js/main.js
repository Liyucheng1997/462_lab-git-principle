// 界面胶水：教程面板、终端、对象 / .git 面板，与 3D 舞台和迷你 Git 引擎之间的连接。
import { Repo, resetWorld } from './git.js';
import { CHAPTERS } from './chapters.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pad2 = (n) => String(n).padStart(2, '0');

const state = { chapter: 0, step: 0, repo: null, sel: null, tab: 'obj', history: [], hi: -1 };
let stage = null;

// ───────────── 主题 ─────────────
function store(k, v) {
  try {
    if (v === undefined) return localStorage.getItem(k);
    localStorage.setItem(k, v);
  } catch { /* 隐私模式下可能不可用 */ }
  return null;
}
let dark = (store('git3d-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
function applyTheme() {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  if (stage) stage.setTheme(dark);
}
applyTheme();
$('#theme').onclick = () => {
  dark = !dark;
  store('git3d-theme', dark ? 'dark' : 'light');
  applyTheme();
};

// ───────────── 3D 舞台（失败时页面其余部分照常工作）─────────────
try {
  const { Stage } = await import('./scene.js');
  stage = new Stage($('#stage'), {
    onSelect: (info) => {
      state.sel = info;
      if (info) setTab('obj');
      else renderInspector();
    },
    onHover: (h) => {
      const t = $('#tooltip');
      if (!h) return t.classList.remove('show');
      t.textContent = h.text;
      t.classList.add('show');
      const w = t.offsetWidth;
      t.style.left = Math.min(innerWidth - w - 8, h.x + 14) + 'px';
      t.style.top = h.y + 16 + 'px';
    },
  });
  stage.setTheme(dark);
} catch (e) {
  console.error(e);
  $('#webgl-error').hidden = false;
  $('#hud').hidden = true;
}

// ───────────── 终端 ─────────────
const out = $('#term-out'), input = $('#term-in');
function print(text, cls) {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  out.appendChild(d);
}
function promptText() {
  const r = state.repo;
  if (!r || !r.inited) return '$';
  return `(${r.HEAD.ref || r.HEAD.hash.slice(0, 7)}) $`;
}
function run(cmd) {
  cmd = cmd.trim();
  if (!cmd) return true;
  const d = document.createElement('div');
  d.className = 'in';
  d.innerHTML = `<span class="ps">${esc(promptText())}</span> ${esc(cmd)}`;
  out.appendChild(d);
  let ok = true;
  if (cmd === 'clear') out.textContent = '';
  else {
    const res = state.repo.exec(cmd);
    ok = res.ok;
    for (const l of res.lines) print(l.t, 'o ' + l.c);
  }
  out.scrollTop = out.scrollHeight;
  refresh();
  return ok;
}
function refresh() {
  $('#prompt').textContent = promptText();
  if (stage) stage.sync();
  renderInspector();
}
$('#term-form').onsubmit = (e) => {
  e.preventDefault();
  const v = input.value.trim();
  input.value = '';
  if (!v) return nextStep();
  state.history.unshift(v);
  state.hi = -1;
  run(v);
};
input.onkeydown = (e) => {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  e.preventDefault();
  state.hi = Math.max(-1, Math.min(state.history.length - 1, state.hi + (e.key === 'ArrowUp' ? 1 : -1)));
  input.value = state.hi < 0 ? '' : state.history[state.hi];
};
$('#term-clear').onclick = () => (out.textContent = '');
$('#term-help').onclick = () => run('help');

// ───────────── 教程 ─────────────
function loadChapter(i, announce = true) {
  const ch = CHAPTERS[i];
  state.chapter = i;
  state.step = 0;
  state.sel = null;
  resetWorld();
  const repo = (state.repo = new Repo());
  for (const c of ch.setup) {
    const r = repo.exec(c);
    if (!r.ok) console.warn('章节预置命令失败：', c, r.lines);
  }
  history.replaceState(null, '', '#' + ch.id);
  if (announce) {
    out.textContent = '';
    print(`第 ${i + 1} 章 · ${ch.title}${ch.setup.length ? '（已准备好演示仓库）' : ''}`, 'sys');
  }
  if (stage) {
    stage.showObjects = !!ch.objects;
    stage.setRepo(repo);
    stage.flyTo(ch.view);
  }
  syncHud();
  state.tab = ch.panel || 'obj';
  $('#inspector').classList.toggle('folded', !ch.panel); // 平时收起，点到东西再展开，不挡场景
  renderChapters();
  renderContent();
  refresh();
  syncTabs();
}

function renderChapters() {
  $('#chapters').innerHTML = CHAPTERS.map(
    (c, i) => `<button data-i="${i}" class="${i === state.chapter ? 'active' : ''}"><span class="n">${i + 1}</span>${esc(c.title)}</button>`,
  ).join('');
}
$('#chapters').onclick = (e) => {
  const b = e.target.closest('button');
  if (b) loadChapter(+b.dataset.i);
};

function renderContent() {
  const ch = CHAPTERS[state.chapter];
  let html = `<h2><span class="n">第 ${pad2(state.chapter + 1)} 章 / 共 ${pad2(CHAPTERS.length)} 章</span>${esc(ch.title)}</h2>${ch.intro}`;
  if (ch.steps.length) {
    html += '<h3>动手演示</h3><ol class="steps">' +
      ch.steps.map((s, i) => `<li data-i="${i}"><span class="cmd">${esc(s.cmd)}</span><div class="note">${s.note}</div></li>`).join('') + '</ol>';
  }
  if (ch.cheat) {
    html += '<div class="cheat">' + ch.cheat.map(([group, items]) =>
      `<h3>${esc(group)}</h3>` + items.map(([cmd, desc]) => `<button data-cmd="${esc(cmd)}"><b>${esc(cmd)}</b><span>${esc(desc)}</span></button>`).join('')).join('') + '</div>';
  }
  const el = $('#content');
  el.innerHTML = html;
  el.scrollTop = 0;
  renderSteps();
}

function renderSteps() {
  const ch = CHAPTERS[state.chapter], n = ch.steps.length;
  document.querySelectorAll('ol.steps li').forEach((li, i) => {
    li.classList.toggle('done', i < state.step);
    li.classList.toggle('current', i === state.step);
  });
  const last = state.chapter === CHAPTERS.length - 1;
  const done = state.step >= n;
  const bar = $('#stepbar');
  bar.innerHTML =
    `<span class="progress">${n ? (done ? '本章演示完成' : `步骤 ${state.step + 1} / ${n}`) : '自由练习'}</span>` +
    `<button class="btn" id="reset">重置</button>` +
    (done ? (last ? '' : `<button class="btn btn-primary" id="next">下一章</button>`) : `<button class="btn btn-primary" id="next">执行下一步</button>`);
  $('#reset').onclick = () => loadChapter(state.chapter);
  if ($('#next')) $('#next').onclick = nextStep;
}

function nextStep() {
  const ch = CHAPTERS[state.chapter];
  if (state.step >= ch.steps.length) {
    if (state.chapter < CHAPTERS.length - 1 && ch.steps.length) loadChapter(state.chapter + 1);
    return;
  }
  run(ch.steps[state.step].cmd);
  state.step++;
  renderSteps();
  const li = document.querySelector(`ol.steps li[data-i="${state.step - 1}"]`);
  if (li) li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

$('#content').onclick = (e) => {
  const li = e.target.closest('ol.steps li.current');
  if (li) return nextStep();
  const c = e.target.closest('.cheat button');
  if (c) {
    input.value = c.dataset.cmd;
    input.focus();
  }
};

// ───────────── 场景上的控件 ─────────────
function syncHud() {
  if (!stage) return;
  $('#toggle-objects').setAttribute('aria-pressed', String(stage.showObjects));
  document.querySelectorAll('#views button').forEach((b) => b.classList.toggle('active', b.dataset.view === stage.viewName));
}
$('#views').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b || !stage) return;
  stage.flyTo(b.dataset.view);
  syncHud();
};
$('#toggle-objects').onclick = () => {
  if (!stage) return;
  stage.setShowObjects(!stage.showObjects);
  syncHud();
};

// ───────────── 对象详情 / .git 目录 ─────────────
function setTab(t) {
  state.tab = t;
  $('#inspector').classList.remove('folded');
  syncTabs();
  renderInspector();
}
function syncTabs() {
  document.querySelectorAll('#insp-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
}
$('#insp-tabs').onclick = (e) => {
  const b = e.target.closest('button');
  if (b) setTab(b.dataset.tab);
};
$('#insp-fold').onclick = () => $('#inspector').classList.toggle('folded');

const link = (h) => `<a class="h" data-hash="${h}" title="${h}">${h.slice(0, 10)}</a>`;
const TYPE_NAME = { commit: '提交 commit', tree: '目录 tree', blob: '文件内容 blob' };

function objectHtml(hash, remote) {
  const src = remote ? state.repo.remote : state.repo;
  const o = src && src.objects.get(hash);
  if (!o) return null;
  let h = `<h4><i class="dot c-${o.type}"></i>${TYPE_NAME[o.type]}${remote ? '（远程仓库里）' : ''}</h4><div class="hash">${hash}</div>`;
  h += `<dl class="kv"><dt>存放位置</dt><dd><code>.git/objects/${hash.slice(0, 2)}/${hash.slice(2, 10)}…</code></dd><dt>大小</dt><dd>${o.size} 字节（压缩前）</dd>`;
  if (o.type === 'commit') {
    h += `<dt>根目录</dt><dd>${link(o.tree)}</dd>`;
    h += `<dt>父提交</dt><dd>${o.parents.length ? o.parents.map(link).join('　') : '无（根提交）'}</dd>`;
    h += `<dt>作者</dt><dd>${esc(o.author)}</dd><dt>说明</dt><dd>${esc(o.message)}</dd></dl>`;
    h += `<div class="cap">对象的原始内容（git cat-file -p）</div><pre>${esc(o.text)}</pre>`;
  } else if (o.type === 'tree') {
    h += `</dl><div class="cap">目录清单：名字存在这里，不在 blob 里</div><table class="entries">` +
      o.entries.map((e) => `<tr><td class="t">${e.mode.padStart(6, '0')} ${e.type}</td><td>${link(e.hash)}</td><td>${esc(e.name)}${e.type === 'tree' ? '/' : ''}</td></tr>`).join('') + '</table>';
  } else {
    h += `</dl><div class="cap">内容</div><pre>${esc(o.text) || '（空文件）'}</pre>`;
  }
  return h;
}

function renderInspector() {
  const body = $('#insp-body'), repo = state.repo;
  if (!repo) return;
  if (state.tab === 'gitdir') {
    const files = repo.gitDir();
    if (!files.length) {
      body.innerHTML = '<div class="empty">还没有 <code>.git</code> 目录。执行 <code>git init</code> 之后这里会出现内容。</div>';
      return;
    }
    const meta = files.filter((f) => !f.objType), objs = files.filter((f) => f.objType);
    body.innerHTML =
      meta.map((f) => `<div class="gd-file"><div class="p">${esc(f.path)}</div>${f.note ? `<div class="nt">${esc(f.note)}</div>` : ''}<div class="v">${f.hash ? link(f.hash) + esc(f.content.slice(10)) : esc(f.content)}</div></div>`).join('') +
      `<div class="gd-group">.git/objects/ · 共 ${objs.length} 个对象</div>` +
      objs.map((f) => `<button class="gd-obj" data-hash="${f.hash}"><i class="dot c-${f.objType}"></i>${f.hash.slice(0, 2)}/${f.hash.slice(2, 16)}…<span class="ty">${f.objType}</span></button>`).join('');
    return;
  }
  const s = state.sel;
  let html = null;
  if (s && s.kind === 'object') html = objectHtml(s.hash, s.remote);
  else if (s && s.kind === 'file') {
    const text = s.text ?? repo.objects.get(s.hash)?.text;
    if (text !== undefined)
      html = `<h4>${esc(s.path)}</h4><div class="hash">位于${s.where}</div><dl class="kv"><dt>状态</dt><dd>${s.status || '与相邻区域一致'}</dd><dt>内容哈希</dt><dd>${repo.objects.has(s.hash) ? link(s.hash) : `<code>${s.hash.slice(0, 10)}</code>（还没写入对象库）`}</dd></dl><div class="cap">内容</div><pre>${esc(text) || '（空文件）'}</pre>`;
  }
  if (!html) {
    state.sel = null;
    html = '<div class="empty">点击场景里的提交、tree、blob 或文件卡片，这里会显示它在仓库里的真实内容。</div>';
  }
  body.innerHTML = html;
}
$('#insp-body').onclick = (e) => {
  const a = e.target.closest('[data-hash]');
  if (!a) return;
  state.sel = { kind: 'object', hash: a.dataset.hash };
  if (stage) stage.selectHash(a.dataset.hash);
  setTab('obj');
};

// ───────────── 启动 ─────────────
const start = Math.max(0, CHAPTERS.findIndex((c) => '#' + c.id === location.hash));
loadChapter(start);
window.__git3d = { state, get stage() { return stage; } };
