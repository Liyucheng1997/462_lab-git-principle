// 迷你 Git 引擎：在浏览器里用与真实 Git 相同的对象格式和 SHA-1 算法模拟一个仓库。
// blob / tree / commit 的哈希与真实 git 逐字节一致（例如 "hello\n" 的 blob 就是 ce01362…）。

const enc = new TextEncoder();
const START_CLOCK = 1767225600; // 2026-01-01 08:00 (+0800)
let SEQ = 0;
let CLOCK = START_CLOCK;

/** 切换章节时重置全局的对象序号与时钟，保证每次演示的哈希都一样 */
export function resetWorld() {
  SEQ = 0;
  CLOCK = START_CLOCK;
}

export function sha1(msg) {
  const ml = msg.length;
  const data = new Uint8Array((((ml + 8) >> 6) + 1) << 6);
  data.set(msg);
  data[ml] = 0x80;
  const dv = new DataView(data.buffer);
  dv.setUint32(data.length - 8, Math.floor(ml / 0x20000000));
  dv.setUint32(data.length - 4, (ml << 3) >>> 0);
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let i = 0; i < data.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
    for (let t = 16; t < 80; t++) {
      const x = w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16];
      w[t] = (x << 1) | (x >>> 31);
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let t = 0; t < 80; t++) {
      let f, k;
      if (t < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (t < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (t < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const tmp = (((a << 5) | (a >>> 27)) + f + e + k + w[t]) | 0;
      e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = tmp;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
  }
  return [h0, h1, h2, h3, h4].map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

function hashObject(type, bytes) {
  const head = enc.encode(`${type} ${bytes.length}\0`);
  const all = new Uint8Array(head.length + bytes.length);
  all.set(head);
  all.set(bytes, head.length);
  return sha1(all);
}

const blobHashCache = new Map();
/** 只计算哈希、不写入对象库（相当于 git hash-object） */
export function hashBlob(text) {
  let h = blobHashCache.get(text);
  if (!h) {
    h = hashObject('blob', enc.encode(text));
    blobHashCache.set(text, h);
  }
  return h;
}

export class GitError extends Error {}

function tokenize(s) {
  const out = [];
  let cur = '', q = null, has = false;
  for (const ch of s) {
    if (q) {
      if (ch === q) q = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      q = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (cur || has) { out.push(cur); cur = ''; has = false; }
    } else cur += ch;
  }
  if (cur || has) out.push(cur);
  return out;
}

function splitAnd(line) {
  const parts = [];
  let cur = '', q = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === q) q = null; cur += ch; }
    else if (ch === '"' || ch === "'") { q = ch; cur += ch; }
    else if (ch === '&' && line[i + 1] === '&') { parts.push(cur); cur = ''; i++; }
    else cur += ch;
  }
  parts.push(cur);
  return parts.map((x) => x.trim()).filter(Boolean);
}

function fmtDate(t) {
  const d = new Date((t + 8 * 3600) * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} +0800`;
}

/** 朴素的 LCS 行级 diff */
function lineDiff(a, b) {
  const A = a === '' ? [] : a.replace(/\n$/, '').split('\n');
  const B = b === '' ? [] : b.replace(/\n$/, '').split('\n');
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { out.push({ t: ' ' + A[i], c: '' }); i++; j++; }
    else if (j < m && (i === n || dp[i][j + 1] >= dp[i + 1][j])) { out.push({ t: '+' + B[j], c: 'add' }); j++; }
    else { out.push({ t: '-' + A[i], c: 'del' }); i++; }
  }
  return out;
}

const s7 = (h) => (h ? h.slice(0, 7) : '0000000');

export class Repo {
  constructor(opts = {}) {
    this.bare = !!opts.bare;
    this.inited = !!opts.bare;
    this.user = opts.user || '你 <you@example.com>';
    this.objects = new Map(); // hash -> { type, size, seq, ...解析后的内容 }
    this.heads = new Map();
    this.tags = new Map();
    this.remotes = new Map(); // 'origin/main' -> hash（远程跟踪分支）
    this.HEAD = { ref: 'main' }; // 或 { hash }（分离头指针）
    this.index = new Map(); // path -> blob hash
    this.workdir = new Map(); // path -> 文本内容
    this.conflicts = new Set();
    this.mergeHead = null;
    this.mergeMsg = '';
    this.reflog = [];
    this.stash = [];
    this.remote = null;
    this.remoteUrl = '';
  }

  // ───────────── 对象库 ─────────────
  store(type, bytes, parsed) {
    const hash = hashObject(type, bytes);
    if (!this.objects.has(hash)) this.objects.set(hash, { type, size: bytes.length, seq: SEQ++, ...parsed });
    return hash;
  }

  writeBlob(text) {
    return this.store('blob', enc.encode(text), { text });
  }

  /** 把「路径 → blob 哈希」的平铺表递归写成 tree 对象 */
  writeTree(files) {
    const dirs = new Map();
    const entries = [];
    for (const [p, h] of files) {
      const i = p.indexOf('/');
      if (i < 0) entries.push({ mode: '100644', type: 'blob', name: p, hash: h });
      else {
        const d = p.slice(0, i);
        if (!dirs.has(d)) dirs.set(d, new Map());
        dirs.get(d).set(p.slice(i + 1), h);
      }
    }
    for (const [d, sub] of dirs) entries.push({ mode: '40000', type: 'tree', name: d, hash: this.writeTree(sub) });
    const key = (e) => e.name + (e.type === 'tree' ? '/' : '');
    entries.sort((a, b) => (key(a) < key(b) ? -1 : 1));
    const chunks = [];
    let len = 0;
    for (const e of entries) {
      const head = enc.encode(`${e.mode} ${e.name}\0`);
      const raw = new Uint8Array(20);
      for (let i = 0; i < 20; i++) raw[i] = parseInt(e.hash.substr(i * 2, 2), 16);
      chunks.push(head, raw);
      len += head.length + 20;
    }
    const bytes = new Uint8Array(len);
    let off = 0;
    for (const c of chunks) { bytes.set(c, off); off += c.length; }
    return this.store('tree', bytes, { entries });
  }

  writeCommit(tree, parents, message, author = this.user) {
    CLOCK += 1800;
    const who = `${author} ${CLOCK} +0800`;
    const text =
      `tree ${tree}\n` + parents.map((p) => `parent ${p}\n`).join('') +
      `author ${who}\ncommitter ${who}\n\n${message}\n`;
    return this.store('commit', enc.encode(text), { tree, parents, author, time: CLOCK, message, text });
  }

  /** 把某个提交的整棵 tree 展开成「路径 → blob 哈希」 */
  filesOf(commit) {
    const m = new Map();
    if (!commit) return m;
    const walk = (th, prefix) => {
      for (const e of this.objects.get(th).entries) {
        if (e.type === 'tree') walk(e.hash, prefix + e.name + '/');
        else m.set(prefix + e.name, e.hash);
      }
    };
    walk(this.objects.get(commit).tree, '');
    return m;
  }

  // ───────────── 引用 ─────────────
  headHash() {
    return this.HEAD.ref ? this.heads.get(this.HEAD.ref) || null : this.HEAD.hash;
  }

  moveHead(hash, msg) {
    if (this.HEAD.ref) this.heads.set(this.HEAD.ref, hash);
    else this.HEAD = { hash };
    this.reflog.unshift({ hash, msg });
  }

  resolve(rev, soft = false) {
    const fail = () => {
      if (soft) return null;
      throw new GitError(`fatal: 有歧义的参数 '${rev}'：未知的版本或路径不存在。`);
    };
    const m = /^(.+?)((?:~\d*|\^)*)$/.exec(rev || '');
    if (!m) return fail();
    const base = m[1];
    let h = null, r;
    if (base === 'HEAD') h = this.headHash();
    else if ((r = /^HEAD@\{(\d+)\}$/.exec(base))) h = this.reflog[+r[1]]?.hash ?? null;
    else if (this.heads.has(base)) h = this.heads.get(base);
    else if (this.remotes.has(base)) h = this.remotes.get(base);
    else if (this.tags.has(base)) h = this.tags.get(base);
    else if (/^[0-9a-f]{4,40}$/.test(base)) {
      const c = [...this.objects.keys()].filter((k) => k.startsWith(base) && this.objects.get(k).type === 'commit');
      if (c.length === 1) h = c[0];
    }
    if (!h) return fail();
    for (const s of m[2].match(/~\d*|\^/g) || []) {
      let n = s === '^' ? 1 : s.length > 1 ? +s.slice(1) : 1;
      while (n--) {
        h = this.objects.get(h).parents[0];
        if (!h) return fail();
      }
    }
    return h;
  }

  resolveObj(x) {
    if (x.endsWith('^{tree}')) return this.objects.get(this.resolve(x.slice(0, -7))).tree;
    if (/^[0-9a-f]{4,40}$/.test(x)) {
      const c = [...this.objects.keys()].filter((k) => k.startsWith(x));
      if (c.length === 1) return c[0];
      if (c.length > 1) throw new GitError(`error: 短对象 ID ${x} 有歧义`);
    }
    return this.resolve(x);
  }

  ancestors(hash) {
    const seen = new Set();
    const stack = hash ? [hash] : [];
    while (stack.length) {
      const h = stack.pop();
      if (seen.has(h) || !this.objects.has(h)) continue;
      seen.add(h);
      stack.push(...this.objects.get(h).parents);
    }
    return seen;
  }

  isAncestor(a, b) {
    return this.ancestors(b).has(a);
  }

  mergeBase(a, b) {
    const A = this.ancestors(a);
    const cand = [...this.ancestors(b)].filter((h) => A.has(h));
    cand.sort((x, y) => this.objects.get(y).seq - this.objects.get(x).seq);
    // 取不被其他候选者包含的最近公共祖先
    for (const c of cand) if (!cand.some((o) => o !== c && this.isAncestor(c, o))) return c;
    return cand[0] || null;
  }

  /** 从所有引用出发能到达的提交（到不了的就是"悬空"提交） */
  reachableCommits() {
    const seen = new Set();
    const roots = [...this.heads.values(), ...this.tags.values(), ...this.remotes.values(), this.headHash(), this.mergeHead];
    for (const r of roots) if (r) for (const h of this.ancestors(r)) seen.add(h);
    return seen;
  }

  decorations(hash) {
    const d = [];
    const hh = this.headHash();
    if (hh === hash && !this.HEAD.ref) d.push('HEAD');
    for (const [n, h] of this.heads) if (h === hash) d.push(this.HEAD.ref === n ? `HEAD -> ${n}` : n);
    for (const [n, h] of this.remotes) if (h === hash) d.push(n);
    for (const [n, h] of this.tags) if (h === hash) d.push(`tag: ${n}`);
    d.sort((a, b) => (b.startsWith('HEAD') ? 1 : 0) - (a.startsWith('HEAD') ? 1 : 0));
    return d;
  }

  // ───────────── 工作区 / 暂存区 ─────────────
  isDirty() {
    const head = this.filesOf(this.headHash());
    if (head.size !== this.index.size) return true;
    for (const [p, h] of this.index) {
      if (head.get(p) !== h) return true;
      if (!this.workdir.has(p) || hashBlob(this.workdir.get(p)) !== h) return true;
    }
    return false;
  }

  needClean() {
    if (this.isDirty()) throw new GitError('error: 您的本地修改会被此操作覆盖。\n请先提交（git commit）或储藏（git stash）它们。');
  }

  checkoutFiles(target) {
    for (const p of this.index.keys()) this.workdir.delete(p);
    for (const [p, h] of target) this.workdir.set(p, this.objects.get(h).text);
    this.index = new Map(target);
    this.conflicts.clear();
  }

  /** 文件级三方合并：B 是共同祖先，O 是我方，T 是对方 */
  merge3(B, O, T) {
    const files = new Map();
    const conflicts = [];
    for (const p of new Set([...B.keys(), ...O.keys(), ...T.keys()])) {
      const b = B.get(p), o = O.get(p), t = T.get(p);
      let r;
      if (o === t) r = o;
      else if (b === o) r = t;
      else if (b === t) r = o;
      else { r = o; conflicts.push({ path: p, ours: o, theirs: t }); }
      if (r !== undefined) files.set(p, r);
    }
    return { files, conflicts };
  }

  // ───────────── 命令入口 ─────────────
  exec(line) {
    const out = [];
    const p = (t, c) => String(t).split('\n').forEach((x) => out.push({ t: x, c: c || '' }));
    try {
      for (const part of splitAnd(line)) this.run(tokenize(part), p);
      return { lines: out, ok: true };
    } catch (e) {
      if (!(e instanceof GitError)) throw e;
      p(e.message, 'err');
      return { lines: out, ok: false };
    }
  }

  run(argv, p) {
    const [cmd, ...a] = argv;
    switch (cmd) {
      case 'git': {
        const sub = a[0];
        if (!sub) return p('用法：git <命令> [参数]，输入 help 查看本演示支持的命令');
        if (sub === 'init') return this.cmd_init(p);
        if (!this.inited) throw new GitError('fatal: 不是 git 仓库（或者任何父目录）：.git\n提示：先执行 git init');
        const fn = this['cmd_' + sub.replace(/-/g, '_')];
        if (!fn) throw new GitError(`git：'${sub}' 不是本演示支持的命令。输入 help 查看列表。`);
        return fn.call(this, a.slice(1), p);
      }
      case 'echo': {
        const i = a.findIndex((x) => x === '>' || x === '>>');
        const text = (i < 0 ? a : a.slice(0, i)).join(' ').replace(/\\n/g, '\n');
        if (i < 0) return p(text);
        const path = a[i + 1];
        if (!path) throw new GitError('echo: 缺少目标文件');
        this.workdir.set(path, (a[i] === '>>' ? this.workdir.get(path) || '' : '') + text + '\n');
        return;
      }
      case 'touch':
        for (const f of a) if (!this.workdir.has(f)) this.workdir.set(f, '');
        return;
      case 'rm':
        for (const f of a.filter((x) => !x.startsWith('-'))) {
          if (!this.workdir.has(f)) throw new GitError(`rm: 无法删除 '${f}'：没有那个文件`);
          this.workdir.delete(f);
        }
        return;
      case 'ls':
        return p([...this.workdir.keys()].sort().join('\n') || '（空目录）');
      case 'cat': {
        const f = a[0] || '';
        if (this.workdir.has(f)) return p(this.workdir.get(f).replace(/\n$/, ''));
        if (f.startsWith('.git/')) {
          const e = this.gitDir().find((x) => x.path === f);
          if (e) return p(e.content);
        }
        throw new GitError(`cat: ${f}: 没有那个文件`);
      }
      case 'teammate':
        return this.teammate(a, p);
      case 'help':
        return p(HELP);
      default:
        throw new GitError(`${cmd}: 未找到命令。输入 help 查看本演示支持的命令。`);
    }
  }

  cmd_init(p) {
    if (this.inited) return p('重新初始化已存在的 Git 仓库于 ~/demo/.git/');
    this.inited = true;
    p('已初始化空的 Git 仓库于 ~/demo/.git/');
  }

  cmd_add(a, p) {
    if (!a.length) throw new GitError('没有指定文件，也没有文件被添加。\n提示：也许您想要执行 git add .？');
    const all = a.includes('.') || a.includes('-A') || a.includes('--all');
    const paths = all ? new Set([...this.workdir.keys(), ...this.index.keys()]) : new Set();
    if (!all)
      for (const x of a) {
        const hit = [...this.workdir.keys(), ...this.index.keys()].filter((k) => k === x || k.startsWith(x.replace(/\/$/, '') + '/'));
        if (!hit.length) throw new GitError(`fatal: 路径规格 '${x}' 未匹配任何文件`);
        hit.forEach((k) => paths.add(k));
      }
    for (const path of paths) {
      if (this.workdir.has(path)) this.index.set(path, this.writeBlob(this.workdir.get(path)));
      else this.index.delete(path);
      this.conflicts.delete(path);
    }
  }

  cmd_rm(a, p) {
    const cached = a.includes('--cached');
    for (const f of a.filter((x) => !x.startsWith('-'))) {
      if (!this.index.has(f)) throw new GitError(`fatal: 路径规格 '${f}' 未匹配任何文件`);
      this.index.delete(f);
      if (!cached) this.workdir.delete(f);
      p(`rm '${f}'`);
    }
  }

  cmd_commit(a, p) {
    let msg = null, amend = false, all = false;
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      if (x === '-m') msg = a[++i];
      else if (x === '-am') { all = true; msg = a[++i]; }
      else if (x === '-a') all = true;
      else if (x === '--amend') amend = true;
      else if (x === '--no-edit') { /* 沿用原说明 */ }
      else throw new GitError(`error: 未知选项 ${x}`);
    }
    if (all)
      for (const path of [...this.index.keys()]) {
        if (this.workdir.has(path)) this.index.set(path, this.writeBlob(this.workdir.get(path)));
        else this.index.delete(path);
      }
    if (this.conflicts.size)
      throw new GitError('error: 无法提交，因为您有未合并的文件。\n提示：修改冲突文件后用 git add <文件> 标记为已解决。');
    const head = this.headHash();
    const tree = this.writeTree(this.index);
    let parents, kind = 'commit';
    if (amend) {
      if (!head) throw new GitError('fatal: 您还没有可修补的提交。');
      const hc = this.objects.get(head);
      parents = hc.parents;
      msg ??= hc.message;
      kind = 'commit (amend)';
    } else if (this.mergeHead) {
      parents = [head, this.mergeHead];
      msg ??= this.mergeMsg;
      kind = 'commit (merge)';
    } else {
      parents = head ? [head] : [];
      if (msg == null) throw new GitError('提示：本演示没有文本编辑器，请用 git commit -m "说明" 提交。');
      if ((head && this.objects.get(head).tree === tree) || (!head && !this.index.size))
        throw new GitError(`位于分支 ${this.HEAD.ref || '（分离头指针）'}\n无文件要提交，干净的工作区（先用 git add 把修改放进暂存区）`);
      if (!head) kind = 'commit (initial)';
    }
    const h = this.writeCommit(tree, parents, msg);
    this.mergeHead = null;
    this.conflicts.clear();
    this.moveHead(h, `${kind}: ${msg}`);
    p(`[${this.HEAD.ref || '分离头指针'}${parents.length ? '' : '（根提交）'} ${s7(h)}] ${msg}`);
  }

  cmd_status(a, p) {
    const head = this.filesOf(this.headHash());
    p(this.HEAD.ref ? `位于分支 ${this.HEAD.ref}` : `头指针分离于 ${s7(this.HEAD.hash)}`);
    if (!this.headHash()) p('\n尚无提交');
    const up = this.HEAD.ref && this.remotes.get('origin/' + this.HEAD.ref);
    if (up && this.headHash()) {
      const mine = this.ancestors(this.headHash()), theirs = this.ancestors(up);
      const ahead = [...mine].filter((h) => !theirs.has(h)).length;
      const behind = [...theirs].filter((h) => !mine.has(h)).length;
      const name = `'origin/${this.HEAD.ref}'`;
      if (ahead && behind) p(`您的分支和 ${name} 出现了偏离，\n并且分别有 ${ahead} 和 ${behind} 处不同的提交。`);
      else if (ahead) p(`您的分支领先 ${name} 共 ${ahead} 个提交。\n  （使用 "git push" 来发布您的本地提交）`);
      else if (behind) p(`您的分支落后 ${name} 共 ${behind} 个提交，并且可以快进。\n  （使用 "git pull" 来更新您的本地分支）`);
      else p(`您的分支与上游分支 ${name} 一致。`);
    }
    if (this.mergeHead) p(this.conflicts.size ? '您有尚未合并的路径。\n  （解决冲突并运行 "git commit"）' : '所有冲突已解决但您仍处于合并中。\n  （使用 "git commit" 结束合并）');
    const staged = [], unstaged = [], untracked = [];
    for (const path of new Set([...head.keys(), ...this.index.keys()])) {
      if (this.conflicts.has(path)) continue;
      const h = head.get(path), i = this.index.get(path);
      if (h === i) continue;
      staged.push(`${!h ? '新文件：  ' : !i ? '删除：    ' : '修改：    '}${path}`);
    }
    for (const [path, i] of this.index) {
      if (this.conflicts.has(path)) continue;
      if (!this.workdir.has(path)) unstaged.push(`删除：    ${path}`);
      else if (hashBlob(this.workdir.get(path)) !== i) unstaged.push(`修改：    ${path}`);
    }
    for (const path of this.workdir.keys()) if (!this.index.has(path) && !this.conflicts.has(path)) untracked.push(path);
    if (staged.length) {
      p('\n要提交的变更：\n  （使用 "git restore --staged <文件>..." 以取消暂存）');
      staged.forEach((x) => p('\t' + x, 'add'));
    }
    if (this.conflicts.size) {
      p('\n未合并的路径：\n  （使用 "git add <文件>..." 标记解决方案）');
      for (const x of this.conflicts) p('\t双方修改： ' + x, 'del');
    }
    if (unstaged.length) {
      p('\n尚未暂存以备提交的变更：\n  （使用 "git add <文件>..." 更新要提交的内容）');
      unstaged.forEach((x) => p('\t' + x, 'del'));
    }
    if (untracked.length) {
      p('\n未跟踪的文件：\n  （使用 "git add <文件>..." 以包含要提交的内容）');
      untracked.sort().forEach((x) => p('\t' + x, 'del'));
    }
    if (!staged.length && !unstaged.length && !untracked.length && !this.conflicts.size) p('无文件要提交，干净的工作区');
  }

  diffMaps(A, textA, B, textB, p) {
    let any = false;
    for (const path of [...new Set([...A.keys(), ...B.keys()])].sort()) {
      const x = A.get(path), y = B.get(path);
      if (x === y) continue;
      any = true;
      p(`diff --git a/${path} b/${path}`, 'hl');
      p(`index ${s7(x)}..${s7(y)}`, 'dim');
      p(`--- ${x ? 'a/' + path : '/dev/null'}`, 'dim');
      p(`+++ ${y ? 'b/' + path : '/dev/null'}`, 'dim');
      for (const l of lineDiff(x ? textA(path) : '', y ? textB(path) : '')) p(l.t, l.c);
    }
    return any;
  }

  cmd_diff(a, p) {
    const head = this.filesOf(this.headHash());
    const blob = (m) => (path) => this.objects.get(m.get(path)).text;
    if (a.includes('--staged') || a.includes('--cached')) return void this.diffMaps(head, blob(head), this.index, blob(this.index), p);
    const W = new Map();
    for (const path of this.index.keys()) if (this.workdir.has(path)) W.set(path, hashBlob(this.workdir.get(path)));
    this.diffMaps(this.index, blob(this.index), W, (path) => this.workdir.get(path), p);
  }

  cmd_show(a, p) {
    const h = this.resolve(a.find((x) => !x.startsWith('-')) || 'HEAD');
    const c = this.objects.get(h);
    this.printCommit(h, p);
    p('');
    const A = this.filesOf(c.parents[0]), B = this.filesOf(h);
    const blob = (m) => (path) => this.objects.get(m.get(path)).text;
    this.diffMaps(A, blob(A), B, blob(B), p);
  }

  printCommit(h, p) {
    const c = this.objects.get(h);
    const d = this.decorations(h);
    p(`commit ${h}${d.length ? ` (${d.join(', ')})` : ''}`, 'hl');
    if (c.parents.length > 1) p(`Merge: ${c.parents.map(s7).join(' ')}`);
    p(`Author: ${c.author}`);
    p(`Date:   ${fmtDate(c.time)}`);
    p(`\n    ${c.message}`);
  }

  cmd_log(a, p) {
    const oneline = a.includes('--oneline');
    let limit = Infinity;
    a.forEach((x, i) => {
      if (/^-\d+$/.test(x)) limit = +x.slice(1);
      if (x === '-n') limit = +a[i + 1];
    });
    const rev = a.find((x, i) => !x.startsWith('-') && a[i - 1] !== '-n');
    const starts = a.includes('--all')
      ? [...this.heads.values(), ...this.remotes.values(), ...this.tags.values(), this.headHash()]
      : [rev ? this.resolve(rev) : this.headHash()];
    const set = new Set();
    for (const s of starts) if (s) for (const h of this.ancestors(s)) set.add(h);
    if (!set.size) throw new GitError(`fatal: 您的当前分支 '${this.HEAD.ref}' 尚无任何提交`);
    const list = [...set].sort((x, y) => this.objects.get(y).seq - this.objects.get(x).seq).slice(0, limit);
    list.forEach((h, i) => {
      if (oneline) {
        const d = this.decorations(h);
        p(`${s7(h)}${d.length ? ` (${d.join(', ')})` : ''} ${this.objects.get(h).message}`);
      } else {
        if (i) p('');
        this.printCommit(h, p);
      }
    });
  }

  cmd_branch(a, p) {
    if (!a.length || a[0] === '-a' || a[0] === '--list' || a[0] === '-v') {
      for (const [n, h] of [...this.heads].sort()) p(`${this.HEAD.ref === n ? '* ' : '  '}${n}${a[0] === '-v' ? '  ' + s7(h) : ''}`, this.HEAD.ref === n ? 'add' : '');
      if (!this.HEAD.ref) p(`* （头指针分离于 ${s7(this.HEAD.hash)}）`, 'add');
      if (a[0] === '-a') for (const n of [...this.remotes.keys()].sort()) p(`  remotes/${n}`, 'del');
      return;
    }
    if (a[0] === '-d' || a[0] === '-D' || a[0] === '--delete') {
      const n = a[1];
      if (!this.heads.has(n)) throw new GitError(`error: 分支 '${n}' 未发现。`);
      if (this.HEAD.ref === n) throw new GitError(`error: 无法删除当前所在的分支 '${n}'。`);
      const h = this.heads.get(n);
      if (a[0] !== '-D' && !this.isAncestor(h, this.headHash()))
        throw new GitError(`error: 分支 '${n}' 没有完全合并。\n如果您确认要删除它，执行 git branch -D ${n}。`);
      this.heads.delete(n);
      return p(`已删除分支 ${n}（曾为 ${s7(h)}）。`);
    }
    if (a[0] === '-m' || a[0] === '-M') {
      const n = a[1], old = this.HEAD.ref;
      if (!old || !n) throw new GitError('fatal: 需要指定新的分支名');
      if (this.heads.has(old)) { this.heads.set(n, this.heads.get(old)); this.heads.delete(old); }
      this.HEAD = { ref: n };
      return;
    }
    const n = a[0];
    if (n.startsWith('-')) throw new GitError(`error: 未知选项 ${n}`);
    if (this.heads.has(n)) throw new GitError(`fatal: 一个名为 '${n}' 的分支已经存在。`);
    const h = a[1] ? this.resolve(a[1]) : this.headHash();
    if (!h) throw new GitError("fatal: 不是一个有效的对象名：'main'（还没有任何提交）");
    this.heads.set(n, h);
  }

  switchTo(target, p, { create = false, detach = false, start = null } = {}) {
    const from = this.HEAD.ref || s7(this.HEAD.hash);
    if (create) {
      if (this.heads.has(target)) throw new GitError(`fatal: 一个名为 '${target}' 的分支已经存在。`);
      const h = start ? this.resolve(start) : this.headHash();
      if (start && h !== this.headHash()) { this.needClean(); this.checkoutFiles(this.filesOf(h)); }
      if (h) this.heads.set(target, h);
      this.HEAD = { ref: target };
      if (h) this.reflog.unshift({ hash: h, msg: `checkout: moving from ${from} to ${target}` });
      return p(`切换到一个新分支 '${target}'`);
    }
    if (this.heads.has(target) && !detach) {
      if (this.HEAD.ref === target) return p(`已经位于 '${target}'`);
      const h = this.heads.get(target);
      if (h !== this.headHash()) { this.needClean(); this.checkoutFiles(this.filesOf(h)); }
      this.HEAD = { ref: target };
      this.reflog.unshift({ hash: h, msg: `checkout: moving from ${from} to ${target}` });
      return p(`切换到分支 '${target}'`);
    }
    const h = this.resolve(target);
    if (h !== this.headHash()) { this.needClean(); this.checkoutFiles(this.filesOf(h)); }
    this.HEAD = { hash: h };
    this.reflog.unshift({ hash: h, msg: `checkout: moving from ${from} to ${target}` });
    p(`注意：正在切换到 '${target}'。\n\n您正处于"分离头指针"状态：HEAD 直接指向提交而不是分支。\n在这里做的提交不属于任何分支，切走后只能靠 reflog 找回。\n想保留就新建分支：git switch -c <新分支名>\n\nHEAD 目前位于 ${s7(h)} ${this.objects.get(h).message}`);
  }

  cmd_switch(a, p) {
    if (a[0] === '-c' || a[0] === '-C') return this.switchTo(a[1], p, { create: true, start: a[2] });
    if (a[0] === '--detach' || a[0] === '-d') return this.switchTo(a[1] || 'HEAD', p, { detach: true });
    if (!a[0]) throw new GitError('fatal: 缺少分支名');
    if (!this.heads.has(a[0])) throw new GitError(`fatal: 无效引用：${a[0]}\n提示：git switch 只能切到分支；要检出某个提交请用 git switch --detach 或 git checkout。`);
    this.switchTo(a[0], p);
  }

  cmd_checkout(a, p) {
    if (a[0] === '-b' || a[0] === '-B') return this.switchTo(a[1], p, { create: true, start: a[2] });
    if (a[0] === '--') return this.cmd_restore(a.slice(1), p);
    if (!a[0]) throw new GitError('fatal: 缺少分支名或提交');
    if (!this.heads.has(a[0]) && this.resolve(a[0], true) === null && (this.index.has(a[0]) || this.workdir.has(a[0])))
      return this.cmd_restore(a, p);
    this.switchTo(a[0], p);
  }

  cmd_restore(a, p) {
    const staged = a.includes('--staged');
    const files = a.filter((x) => !x.startsWith('-'));
    if (!files.length) throw new GitError('fatal: 您必须指定要恢复的路径');
    const head = this.filesOf(this.headHash());
    for (const f of files.includes('.') ? [...new Set([...this.index.keys(), ...head.keys()])] : files) {
      if (staged) {
        if (head.has(f)) this.index.set(f, head.get(f));
        else if (this.index.has(f)) this.index.delete(f);
        else throw new GitError(`error: 路径规格 '${f}' 未匹配任何 git 已知文件`);
      } else {
        if (!this.index.has(f)) throw new GitError(`error: 路径规格 '${f}' 未匹配任何 git 已知文件`);
        this.workdir.set(f, this.objects.get(this.index.get(f)).text);
      }
    }
  }

  cmd_merge(a, p) {
    if (a[0] === '--abort') {
      if (!this.mergeHead) throw new GitError('fatal: 没有要中止的合并（MERGE_HEAD 丢失）。');
      this.mergeHead = null;
      this.checkoutFiles(this.filesOf(this.headHash()));
      return p('已中止合并，回到合并前的状态。');
    }
    const name = a.find((x) => !x.startsWith('-'));
    if (!name) throw new GitError('fatal: 未指定要合并的分支');
    if (this.mergeHead) throw new GitError('fatal: 您尚未结束您的合并（存在 MERGE_HEAD）。\n请在合并前先提交您的修改。');
    const theirs = this.resolve(name), ours = this.headHash();
    if (!ours) throw new GitError('fatal: 当前分支还没有提交');
    const base = this.mergeBase(ours, theirs);
    if (base === theirs) return p('已经是最新的。');
    this.needClean();
    if (base === ours && !a.includes('--no-ff')) {
      this.moveHead(theirs, `merge ${name}: Fast-forward`);
      this.checkoutFiles(this.filesOf(theirs));
      return p(`更新 ${s7(ours)}..${s7(theirs)}\nFast-forward（快进：只是把分支指针往前挪，没有产生新提交）`);
    }
    const O = this.filesOf(ours), T = this.filesOf(theirs);
    const { files, conflicts } = this.merge3(this.filesOf(base), O, T);
    const msg = `Merge ${this.remotes.has(name) ? 'remote-tracking branch' : 'branch'} '${name}'${this.HEAD.ref && this.HEAD.ref !== 'main' ? ` into ${this.HEAD.ref}` : ''}`;
    this.checkoutFiles(files);
    if (!conflicts.length) {
      const h = this.writeCommit(this.writeTree(files), [ours, theirs], msg);
      this.moveHead(h, `merge ${name}: Merge made by the 'ort' strategy.`);
      return p(`Merge made by the 'ort' strategy.（三方合并：生成了一个有两个父提交的合并提交 ${s7(h)}）`);
    }
    this.mergeHead = theirs;
    this.mergeMsg = msg;
    for (const c of conflicts) {
      const o = c.ours ? this.objects.get(c.ours).text : '', t = c.theirs ? this.objects.get(c.theirs).text : '';
      this.workdir.set(c.path, `<<<<<<< HEAD\n${o}=======\n${t}>>>>>>> ${name}\n`);
      if (!this.index.has(c.path)) this.index.set(c.path, c.theirs);
      this.conflicts.add(c.path);
      p(`自动合并 ${c.path}`);
      p(`冲突（内容）：合并冲突于 ${c.path}`, 'err');
    }
    throw new GitError('自动合并失败，修正冲突然后提交修正的结果。');
  }

  /** 把提交 c 相对其父提交的改动"重放"到 onto 之上，返回新提交 */
  replay(c, onto, label) {
    const co = this.objects.get(c);
    const { files, conflicts } = this.merge3(this.filesOf(co.parents[0]), this.filesOf(onto), this.filesOf(c));
    if (conflicts.length)
      throw new GitError(`error: 无法应用 ${s7(c)}… ${co.message}\n冲突文件：${conflicts.map((x) => x.path).join('、')}\n本演示遇到${label}冲突会自动中止并保持原状（真实 Git 会停下来等你解决，再执行 --continue）。`);
    const tree = this.writeTree(files);
    if (tree === this.objects.get(onto).tree) return onto; // 改动已经在目标里了，跳过
    return this.writeCommit(tree, [onto], co.message, co.author);
  }

  cmd_rebase(a, p) {
    const name = a.find((x) => !x.startsWith('-'));
    if (!name) throw new GitError('fatal: 请指定要变基到的分支');
    this.needClean();
    const up = this.resolve(name), head = this.headHash();
    const base = this.mergeBase(head, up);
    if (base === up) return p(`当前分支 ${this.HEAD.ref || ''} 是最新的。`);
    if (base === head) {
      this.moveHead(up, `rebase (finish): fast-forward to ${name}`);
      this.checkoutFiles(this.filesOf(up));
      return p(`成功快进并更新 ${this.HEAD.ref || 'HEAD'}。`);
    }
    const todo = [];
    for (let h = head; h && h !== base && !this.isAncestor(h, up); h = this.objects.get(h).parents[0])
      if (this.objects.get(h).parents.length === 1) todo.unshift(h);
    let cur = up;
    for (const c of todo) cur = this.replay(c, cur, '变基');
    this.moveHead(cur, `rebase (finish): onto ${s7(up)}`);
    this.checkoutFiles(this.filesOf(cur));
    p(`已把 ${todo.length} 个提交逐个重放到 ${name} 之上（它们都是全新的提交，哈希变了）。\n成功变基并更新 refs/heads/${this.HEAD.ref || 'HEAD'}。`);
  }

  cmd_cherry_pick(a, p) {
    if (!a[0]) throw new GitError('fatal: 请指定要拣选的提交');
    this.needClean();
    const c = this.resolve(a[0]);
    const h = this.replay(c, this.headHash(), '拣选');
    if (h === this.headHash()) throw new GitError('拣选的提交没有带来任何新改动（这些改动当前分支已经有了）。');
    this.moveHead(h, `cherry-pick: ${this.objects.get(c).message}`);
    this.checkoutFiles(this.filesOf(h));
    p(`[${this.HEAD.ref || '分离头指针'} ${s7(h)}] ${this.objects.get(c).message}`);
  }

  cmd_revert(a, p) {
    if (!a[0]) throw new GitError('fatal: 请指定要撤销的提交');
    this.needClean();
    const c = this.resolve(a[0]), co = this.objects.get(c), head = this.headHash();
    const { files, conflicts } = this.merge3(this.filesOf(c), this.filesOf(head), this.filesOf(co.parents[0]));
    if (conflicts.length) throw new GitError(`error: 无法还原 ${s7(c)}：后续提交又改过 ${conflicts.map((x) => x.path).join('、')}，产生冲突。`);
    const msg = `Revert "${co.message}"`;
    const h = this.writeCommit(this.writeTree(files), [head], msg);
    this.moveHead(h, `revert: ${msg}`);
    this.checkoutFiles(files);
    p(`[${this.HEAD.ref || '分离头指针'} ${s7(h)}] ${msg}`);
  }

  cmd_reset(a, p) {
    let mode = 'mixed';
    const rest = [];
    for (const x of a) {
      if (x === '--soft' || x === '--mixed' || x === '--hard') mode = x.slice(2);
      else if (x !== '--') rest.push(x);
    }
    let target = this.headHash();
    if (rest.length && this.resolve(rest[0], true)) target = this.resolve(rest.shift());
    if (rest.length) {
      const tf = this.filesOf(target);
      for (const f of rest) {
        if (tf.has(f)) this.index.set(f, tf.get(f));
        else this.index.delete(f);
      }
      return p('已取消暂存指定的文件（工作区内容不变）。');
    }
    if (!target) throw new GitError('fatal: 还没有任何提交可以重置');
    const tf = this.filesOf(target);
    if (mode === 'hard') this.checkoutFiles(tf);
    else if (mode === 'mixed') { this.index = new Map(tf); this.conflicts.clear(); }
    if (mode !== 'soft') this.mergeHead = null;
    this.moveHead(target, `reset: moving to ${a.find((x) => !x.startsWith('-')) || 'HEAD'}`);
    if (mode === 'hard') p(`HEAD 现在位于 ${s7(target)} ${this.objects.get(target).message}`);
    else if (mode === 'mixed') p('分支指针和暂存区已重置，工作区文件保持不变。');
    else p('只移动了分支指针，暂存区和工作区都保持不变。');
  }

  cmd_tag(a, p) {
    if (!a.length) return p([...this.tags.keys()].sort().join('\n'));
    if (a[0] === '-d') {
      if (!this.tags.delete(a[1])) throw new GitError(`error: 标签 '${a[1]}' 未发现。`);
      return p(`已删除标签 '${a[1]}'`);
    }
    const args = a.filter((x, i) => !x.startsWith('-') && a[i - 1] !== '-m');
    if (this.tags.has(args[0])) throw new GitError(`fatal: 标签 '${args[0]}' 已存在`);
    const h = args[1] ? this.resolve(args[1]) : this.headHash();
    if (!h) throw new GitError('fatal: 还没有提交可以打标签');
    this.tags.set(args[0], h);
  }

  cmd_stash(a, p) {
    const sub = a[0] || 'push';
    if (sub === 'list') return this.stash.forEach((s, i) => p(`stash@{${i}}: WIP on ${s.branch}: ${s7(s.head)} ${this.objects.get(s.head).message}`));
    if (sub === 'push' || sub === 'save') {
      if (!this.isDirty()) return p('没有要保存的本地修改');
      const head = this.headHash();
      if (!head) throw new GitError('您还没有初始提交');
      const work = new Map();
      for (const path of this.index.keys()) if (this.workdir.has(path)) work.set(path, this.workdir.get(path));
      this.stash.unshift({ tracked: [...this.index.keys()], work, head, branch: this.HEAD.ref || '（分离头指针）' });
      this.checkoutFiles(this.filesOf(head));
      return p(`保存工作目录和索引状态 WIP on ${this.HEAD.ref}: ${s7(head)} ${this.objects.get(head).message}`);
    }
    if (sub === 'pop' || sub === 'apply') {
      const s = this.stash[0];
      if (!s) throw new GitError('error: 没有储藏条目');
      for (const path of s.tracked) if (!s.work.has(path)) this.workdir.delete(path);
      for (const [path, text] of s.work) this.workdir.set(path, text);
      if (sub === 'pop') this.stash.shift();
      p(`已恢复储藏的修改到工作区${sub === 'pop' ? '，并丢弃了 stash@{0}' : ''}。`);
      return;
    }
    if (sub === 'drop' || sub === 'clear') {
      if (sub === 'clear') this.stash = [];
      else this.stash.shift();
      return;
    }
    throw new GitError(`git stash：不支持的子命令 ${sub}`);
  }

  cmd_reflog(a, p) {
    if (a[0] === 'expire') {
      this.reflog = [];
      return p('已清空 reflog：悬空提交失去了最后的引用。');
    }
    if (!this.reflog.length) return p('（reflog 为空）');
    this.reflog.forEach((e, i) => p(`${s7(e.hash)} HEAD@{${i}}: ${e.msg}`));
  }

  cmd_cat_file(a, p) {
    const flag = a[0], h = this.resolveObj(a[1] || '');
    const o = this.objects.get(h);
    if (!o) throw new GitError(`fatal: 不是一个有效的对象名 ${a[1]}`);
    if (flag === '-t') return p(o.type);
    if (flag === '-s') return p(String(o.size));
    if (flag !== '-p') throw new GitError('用法：git cat-file (-t | -s | -p) <对象>');
    if (o.type === 'blob') return p(o.text.replace(/\n$/, ''));
    if (o.type === 'commit') return p(o.text.replace(/\n$/, ''));
    for (const e of o.entries) p(`${e.mode.padStart(6, '0')} ${e.type} ${e.hash}\t${e.name}`);
  }

  cmd_ls_tree(a, p) {
    const h = this.resolveObj(a.find((x) => !x.startsWith('-')) || 'HEAD');
    const o = this.objects.get(h);
    const t = o.type === 'commit' ? this.objects.get(o.tree) : o;
    for (const e of t.entries) p(`${e.mode.padStart(6, '0')} ${e.type} ${e.hash}\t${e.name}`);
  }

  cmd_ls_files(a, p) {
    const s = a.includes('-s') || a.includes('--stage');
    for (const [path, h] of [...this.index].sort()) p(s ? `100644 ${h} 0\t${path}` : path);
  }

  cmd_hash_object(a, p) {
    const f = a.find((x) => !x.startsWith('-'));
    if (!this.workdir.has(f)) throw new GitError(`fatal: 无法打开 '${f}'：没有那个文件`);
    p(a.includes('-w') ? this.writeBlob(this.workdir.get(f)) : hashBlob(this.workdir.get(f)));
  }

  cmd_count_objects(a, p) {
    p(`${this.objects.size} 个对象`);
  }

  cmd_gc(a, p) {
    const keep = new Set();
    const mark = (h) => {
      const o = this.objects.get(h);
      if (!o || keep.has(h)) return;
      keep.add(h);
      if (o.type === 'commit') { mark(o.tree); o.parents.forEach(mark); }
      else if (o.type === 'tree') o.entries.forEach((e) => mark(e.hash));
    };
    [...this.heads.values(), ...this.tags.values(), ...this.remotes.values(), this.headHash(), this.mergeHead,
      ...this.reflog.map((e) => e.hash), ...this.index.values(), ...this.stash.map((s) => s.head)].forEach(mark);
    let n = 0;
    for (const h of [...this.objects.keys()]) if (!keep.has(h)) { this.objects.delete(h); n++; }
    const dangling = [...this.objects].some(([h, o]) => o.type === 'commit' && !this.reachableCommits().has(h));
    p(`已把松散对象打包，并清理了 ${n} 个不可达对象。`);
    if (dangling) p('提示：还有悬空提交被 reflog 引用着（Git 默认保留 90 天）。\n想立刻清掉：git reflog expire --expire=now --all && git gc --prune=now', 'dim');
  }

  // ───────────── 远程 ─────────────
  cmd_remote(a, p) {
    if (a[0] === 'add') {
      if (this.remote) throw new GitError(`error: 远程 ${a[1]} 已经存在。`);
      if (a[1] !== 'origin') throw new GitError('本演示只支持名为 origin 的远程。');
      this.remote = new Repo({ bare: true, user: '小明 <ming@example.com>' });
      this.remoteUrl = a[2] || 'https://github.com/you/demo.git';
      return;
    }
    if (!this.remote) return;
    if (a[0] === '-v') return p(`origin\t${this.remoteUrl} (fetch)\norigin\t${this.remoteUrl} (push)`);
    p('origin');
  }

  needRemote() {
    if (!this.remote) throw new GitError("fatal: 'origin' 看起来不是一个 git 仓库\n提示：先执行 git remote add origin <地址>");
  }

  static copyReachable(from, to, hash) {
    let n = 0;
    const walk = (h) => {
      if (to.objects.has(h)) return;
      const o = from.objects.get(h);
      to.objects.set(h, o);
      n++;
      if (o.type === 'commit') { walk(o.tree); o.parents.forEach(walk); }
      else if (o.type === 'tree') o.entries.forEach((e) => walk(e.hash));
    };
    walk(hash);
    return n;
  }

  cmd_push(a, p) {
    this.needRemote();
    const force = a.includes('-f') || a.includes('--force');
    const rest = a.filter((x) => !x.startsWith('-'));
    const br = rest[1] || this.HEAD.ref;
    const h = br && this.heads.get(br);
    if (!h) throw new GitError(`error: 源引用规格 ${br || 'HEAD'} 没有匹配`);
    const rh = this.remote.heads.get(br);
    if (rh === h) return p('Everything up-to-date');
    if (rh && !force && !(this.objects.has(rh) && this.isAncestor(rh, h)))
      throw new GitError(`To ${this.remoteUrl}\n ! [rejected]        ${br} -> ${br} (${this.objects.has(rh) ? 'non-fast-forward' : 'fetch first'})\nerror: 推送一些引用到 '${this.remoteUrl}' 失败\n提示：远程有您本地没有的提交。先 git pull（或 git fetch 再合并），然后再推送。`);
    const n = Repo.copyReachable(this, this.remote, h);
    this.remote.heads.set(br, h);
    this.remotes.set('origin/' + br, h);
    p(`枚举对象中: ${n}, 完成.\n写入对象中: 100% (${n}/${n}), 完成.\nTo ${this.remoteUrl}`);
    p(rh ? `${force && !this.isAncestor(rh, h) ? ' + ' : '   '}${s7(rh)}..${s7(h)}  ${br} -> ${br}${force ? ' (forced update)' : ''}` : ` * [new branch]      ${br} -> ${br}`);
    if (a.includes('-u') || a.includes('--set-upstream')) p(`分支 '${br}' 设置为跟踪 'origin/${br}'。`);
  }

  cmd_fetch(a, p) {
    this.needRemote();
    let any = false;
    for (const [b, h] of this.remote.heads) {
      const old = this.remotes.get('origin/' + b);
      if (old === h) continue;
      if (!any) p(`来自 ${this.remoteUrl}`);
      any = true;
      Repo.copyReachable(this.remote, this, h);
      this.remotes.set('origin/' + b, h);
      p(old ? `   ${s7(old)}..${s7(h)}  ${b.padEnd(10)} -> origin/${b}` : ` * [新分支]          ${b.padEnd(10)} -> origin/${b}`);
    }
    if (!any) p('已是最新，远程没有新内容。', 'dim');
  }

  cmd_pull(a, p) {
    this.needRemote();
    this.cmd_fetch([], p);
    const t = 'origin/' + this.HEAD.ref;
    if (!this.remotes.has(t)) throw new GitError(`当前分支 ${this.HEAD.ref} 在远程没有对应的分支。`);
    if (a.includes('--rebase')) this.cmd_rebase([t], p);
    else this.cmd_merge([t], p);
  }

  cmd_clone() {
    throw new GitError('本演示从 git init 开始。clone 相当于：git init + git remote add origin + git fetch + 检出默认分支。');
  }

  /** 模拟同事小明直接向远程推送一个提交：teammate [文件 [内容]] */
  teammate(a, p) {
    this.needRemote();
    const r = this.remote;
    const br = r.heads.has('main') ? 'main' : [...r.heads.keys()][0];
    if (!br) throw new GitError('远程还没有任何提交，先 git push 一次。');
    const rh = r.heads.get(br);
    const files = r.filesOf(rh);
    const path = a[0] || 'docs/teammate.md';
    const old = files.has(path) ? r.objects.get(files.get(path)).text : '';
    const text = a[1] != null ? a[1].replace(/\\n/g, '\n') + '\n' : old + `- 小明的第 ${old.split('\n').length} 条笔记\n`;
    files.set(path, r.writeBlob(text));
    const msg = a[2] || `小明：更新 ${path}`;
    const h = r.writeCommit(r.writeTree(files), [rh], msg);
    r.heads.set(br, h);
    p(`（同事小明向远程 ${br} 推送了提交 ${s7(h)}「${msg}」，你的本地仓库还不知道）`, 'dim');
  }

  // ───────────── .git 目录的样子 ─────────────
  gitDir() {
    if (!this.inited) return [];
    const out = [];
    const f = (path, content, extra) => out.push({ path, content, ...extra });
    f('.git/HEAD', this.HEAD.ref ? `ref: refs/heads/${this.HEAD.ref}` : this.HEAD.hash);
    if (this.mergeHead) f('.git/MERGE_HEAD', this.mergeHead);
    f('.git/config', '[core]\n\trepositoryformatversion = 0\n\tbare = false' +
      (this.remote ? `\n[remote "origin"]\n\turl = ${this.remoteUrl}\n\tfetch = +refs/heads/*:refs/remotes/origin/*` : ''));
    f('.git/index', this.index.size
      ? [...this.index].sort().map(([path, h]) => `100644 ${h} 0\t${path}`).join('\n')
      : '（空：还没有暂存任何文件）', { note: '二进制文件，这里显示的是 git ls-files -s 的结果' });
    if (this.reflog.length) f('.git/logs/HEAD', this.reflog.map((e) => `${s7(e.hash)} ${e.msg}`).reverse().join('\n'));
    for (const [n, h] of [...this.heads].sort()) f(`.git/refs/heads/${n}`, h, { hash: h });
    for (const [n, h] of [...this.remotes].sort()) f(`.git/refs/remotes/${n}`, h, { hash: h });
    for (const [n, h] of [...this.tags].sort()) f(`.git/refs/tags/${n}`, h, { hash: h });
    for (const [h, o] of [...this.objects].sort((x, y) => (x[0] < y[0] ? -1 : 1)))
      f(`.git/objects/${h.slice(0, 2)}/${h.slice(2)}`, `zlib 压缩的 ${o.type} 对象，${o.size} 字节`, { hash: h, objType: o.type });
    return out;
  }
}

const HELP = `本演示支持的命令（和真实 Git 用法一致）：
  文件      echo "内容" > 文件   echo "内容" >> 文件   rm   cat   ls   touch
  基础      git init / status / add / rm / commit [-m|-am|--amend] / diff [--staged] / log [--oneline --all] / show
  分支      git branch [-d|-D|-m] / switch [-c] / checkout [-b] / tag
  整合      git merge [--abort|--no-ff] / rebase / cherry-pick
  撤销      git restore [--staged] / reset [--soft|--mixed|--hard] / revert / stash [pop|list] / reflog
  远程      git remote add origin <地址> / push [-u|-f] / fetch / pull [--rebase]
            teammate [文件 [内容]]   ← 模拟同事向远程推送
  底层      git cat-file (-t|-s|-p) <对象> / hash-object [-w] / ls-tree / ls-files -s / count-objects / gc
            cat .git/HEAD   cat .git/refs/heads/main
  其他      多条命令可用 && 连接；版本可写成 HEAD~2、HEAD^、HEAD@{1}、分支名、标签或哈希前缀`;
