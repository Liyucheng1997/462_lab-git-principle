// 章节内容：每章 = 一段讲解 + 预置仓库（setup）+ 可逐步执行的命令（steps）。
// steps 里的命令会真的在迷你 Git 引擎里执行，3D 场景随之变化。

const INIT = ['git init', 'echo "# 我的项目" > README.md', 'echo "console.log(\'v1\')" > src/app.js', 'git add .', 'git commit -m "初始提交"'];

export const CHAPTERS = [
  {
    id: 'intro',
    title: 'Git 是什么',
    view: 'overview',
    intro: `
<p class="lead">Git 的核心其实很小：它是一个<b>按内容寻址的键值数据库</b>，上面搭了一层版本管理的界面。弄懂数据库里存了什么，所有命令都会变得顺理成章。</p>
<h3>三个要点</h3>
<ul>
<li><b>存的是快照。</b>每次提交记录的是整个项目在那一刻的完整样子。没改过的文件直接复用上一次的对象，所以并不浪费空间。</li>
<li><b>名字就是内容的哈希。</b>每个对象的文件名是它内容的 SHA-1。内容相同，名字必然相同；内容改一个字节，名字就完全变了。</li>
<li><b>几乎所有操作都在本地。</b>提交、看历史、切分支都只读写项目里的 <code>.git</code> 目录，不需要联网。</li>
</ul>
<h3>怎么看右边的 3D 场景</h3>
<ul>
<li>前排三块平台是文件所在的三个区域：<b>工作区</b>、<b>暂存区</b>、<b>版本库（HEAD 快照）</b>。</li>
<li>后方的蓝色小球是<b>提交</b>，箭头从子提交指向父提交；胶囊标签是分支和 HEAD。</li>
<li>拖动旋转，滚轮缩放，右键拖动平移；点击任何物体可以在右上角看它的真实内容。</li>
<li>下方终端可以随时自己敲命令，本页的哈希和真实 Git 算出来的一模一样。</li>
</ul>`,
    setup: [],
    steps: [
      { cmd: 'git init', note: '创建 <code>.git</code> 目录。此刻里面只有一个有意义的文件：<code>HEAD</code>，内容是 <code>ref: refs/heads/main</code>——它指向一个还不存在的分支。右上角切到「.git 目录」可以看到。' },
      { cmd: 'echo "# 我的项目" > README.md', note: '工作区出现了一个文件。Git 还不认识它，状态是<b>未跟踪</b>。' },
      { cmd: 'git add README.md', note: '两件事同时发生：文件内容被压缩成一个 <b>blob 对象</b>存进 <code>.git/objects</code>；暂存区记下一行「README.md → 这个 blob 的哈希」。卡片上的哈希在两个区域里一样。' },
      { cmd: 'git commit -m "第一次提交"', note: 'Git 把暂存区写成一个 <b>tree 对象</b>（目录清单），再写一个 <b>commit 对象</b>指向这棵 tree，最后把 <code>main</code> 分支指向这个提交。三个区域此刻完全一致。' },
      { cmd: 'git log --oneline', note: '历史里有了第一个提交。括号里的 <code>HEAD -> main</code> 说明：HEAD 指向 main，main 指向这个提交。' },
    ],
  },
  {
    id: 'areas',
    title: '三个区域',
    view: 'zones',
    intro: `
<p class="lead">同一个文件在 Git 里最多同时存在三个版本：工作区一份、暂存区一份、最近一次提交里一份。绝大多数日常命令，都是在这三者之间搬运内容。</p>
<table class="grid">
<tr><th>区域</th><th>实际位置</th><th>作用</th></tr>
<tr><td>工作区</td><td>项目目录里的普通文件</td><td>你编辑的地方</td></tr>
<tr><td>暂存区</td><td><code>.git/index</code></td><td>下一次提交的草稿：一张「路径 → blob」的表</td></tr>
<tr><td>版本库</td><td><code>.git/objects</code></td><td>已经提交的快照，永久保存</td></tr>
</table>
<p><code>git status</code> 做的事很简单：比较 <b>暂存区与 HEAD</b>（得到「要提交的变更」），再比较 <b>工作区与暂存区</b>（得到「尚未暂存的变更」）。</p>`,
    setup: INIT,
    steps: [
      { cmd: 'echo "console.log(\'v2\')" > src/app.js', note: '只改了工作区。卡片变成<b>已修改</b>：它的哈希和暂存区那张不一样了。' },
      { cmd: 'git status', note: '「尚未暂存的变更」= 工作区和暂存区的差异。' },
      { cmd: 'git diff', note: '<code>git diff</code> 不带参数时比较的是 工作区 ↔ 暂存区。' },
      { cmd: 'git add src/app.js', note: 'v2 的内容进了暂存区。暂存区和 HEAD 出现差异，状态变成<b>修改待提交</b>。' },
      { cmd: 'echo "console.log(\'v3\')" > src/app.js', note: '再改一次。现在同一个文件有三个版本：HEAD 里是 v1，暂存区是 v2，工作区是 v3。看三张卡片的哈希，各不相同。' },
      { cmd: 'git status', note: '同一个文件同时出现在「要提交」和「尚未暂存」两栏里，正是因为三个区域各存了一版。' },
      { cmd: 'git diff --staged', note: '加 <code>--staged</code> 比较的是 暂存区 ↔ HEAD，也就是这次提交会带上什么。' },
      { cmd: 'git commit -m "升级到 v2"', note: '提交只看暂存区，所以进历史的是 v2。工作区的 v3 原封不动，仍显示已修改。' },
      { cmd: 'git restore src/app.js', note: '用暂存区的版本覆盖工作区，v3 被丢弃。注意：没提交过的内容一旦这样丢掉就找不回来了。' },
      { cmd: 'echo "临时笔记" > notes.txt && git add notes.txt', note: '新文件加入暂存区。' },
      { cmd: 'git restore --staged notes.txt', note: '把它从暂存区撤出来，工作区的文件还在，只是回到未跟踪状态。' },
    ],
  },
  {
    id: 'objects',
    title: '对象模型',
    view: 'objects',
    objects: true,
    intro: `
<p class="lead">这一章打开了「对象层」：提交小球下面挂出了它引用的 tree（绿色八面体）和 blob（橙色方块）。<code>.git/objects</code> 里只有这几种东西。</p>
<table class="grid">
<tr><th>对象</th><th>内容</th><th>相当于</th></tr>
<tr><td><span class="dot c-blob"></span>blob</td><td>文件的字节内容，不含文件名</td><td>文件</td></tr>
<tr><td><span class="dot c-tree"></span>tree</td><td>一组「权限 类型 哈希 名字」</td><td>目录</td></tr>
<tr><td><span class="dot c-commit"></span>commit</td><td>一棵根 tree、父提交、作者、时间、说明</td><td>一次快照</td></tr>
</table>
<p>对象的名字这样算出来：</p>
<pre class="code">SHA-1( "blob " + 字节长度 + "\\0" + 内容 )</pre>
<p>然后用 zlib 压缩，存到 <code>.git/objects/前2位/后38位</code>。因为名字由内容决定，对象一旦写入就不可修改——改内容等于产生一个新对象。提交里包含父提交的哈希，所以任何一处历史被篡改，后面所有提交的哈希都会跟着变。</p>`,
    setup: ['git init', 'echo "# 我的项目" > README.md', 'echo "console.log(\'app\')" > src/app.js', 'echo "export const add = (a, b) => a - b" > src/util.js', 'git add .', 'git commit -m "初始结构"'],
    steps: [
      { cmd: 'git cat-file -p HEAD', note: '<code>cat-file -p</code> 解压并打印一个对象。提交对象就是这几行纯文本：指向一棵 tree，加上作者、时间和说明。第一个提交没有 parent。' },
      { cmd: 'git cat-file -p HEAD^{tree}', note: '根 tree 有两项：一个 blob（README.md）和一棵子 tree（src）。文件名存在 tree 里，blob 自己并不知道自己叫什么。' },
      { cmd: 'git hash-object README.md', note: '手动算一次哈希，结果和上面 tree 里 README.md 那一行的哈希相同。你在真实的 Git 里对同样内容执行这条命令，会得到同一串字符。' },
      { cmd: 'echo "export const add = (a, b) => a + b" > src/util.js && git commit -am "修复 add"', note: '只改了一个文件，观察新增了什么：一个新 blob（util.js）、一棵新 src tree、一棵新根 tree、一个新 commit。README.md 和 app.js 的 blob <b>被两个提交共同引用</b>，没有复制。这就是「每次都存完整快照」却不占空间的原因。' },
      { cmd: 'echo "# 我的项目" > copy.md && git add copy.md', note: '新文件的内容和 README.md 一字不差，于是哈希相同，对象库里<b>没有多出任何 blob</b>。暂存区只是多了一行指向同一个 blob 的记录。' },
      { cmd: 'git commit -m "添加一份副本"', note: '新的根 tree 里有两个名字（README.md 和 copy.md）指向同一个橙色方块。' },
    ],
  },
  {
    id: 'branch',
    title: '分支与 HEAD',
    view: 'dag',
    intro: `
<p class="lead">分支在 Git 里轻得惊人：它只是 <code>.git/refs/heads/</code> 下的一个文本文件，内容是一个 40 位的提交哈希。新建分支 = 写一个 41 字节的文件。</p>
<ul>
<li><b>分支</b>：一个会移动的指针，指向某个提交。</li>
<li><b>HEAD</b>：指向「当前分支」的指针，文件内容形如 <code>ref: refs/heads/main</code>。</li>
<li><b>提交时</b>：新提交以 HEAD 所指的提交为父，然后<b>当前分支</b>的指针前移到新提交。别的分支不动。</li>
<li><b>标签</b>：和分支一样是指向提交的文件，只是它永远不会移动。</li>
</ul>
<p>切换分支时 Git 做三件事：改写 HEAD、把暂存区换成目标提交的 tree、把工作区的文件换成对应内容。</p>`,
    setup: [...INIT, 'echo "## 安装" >> README.md', 'git commit -am "补充安装说明"', 'echo "console.log(\'v2\')" > src/app.js', 'git commit -am "升级到 v2"'],
    steps: [
      { cmd: 'git branch feature', note: '多了一个标签 <code>feature</code>，和 main 指向同一个提交。没有复制任何文件，对象库一个字节都没变。' },
      { cmd: 'git switch feature', note: 'HEAD 改为指向 feature。两个分支指向同一个提交，所以三个区域的文件没有变化。' },
      { cmd: 'echo "export function login() {}" > src/login.js && git add . && git commit -m "新增登录功能"', note: '新提交出现，<b>只有 feature 跟着前移</b>，main 留在原地。' },
      { cmd: 'git switch main', note: 'HEAD 回到 main，工作区里的 <code>src/login.js</code> 消失了——它只存在于 feature 的快照里。' },
      { cmd: 'echo "## 许可证" >> README.md && git commit -am "补充许可证"', note: '在 main 上再提交一次。两个分支从同一个提交出发、各走各路，历史<b>分叉</b>了。' },
      { cmd: 'git checkout HEAD~1', note: '<code>HEAD~1</code> 表示「HEAD 的父提交」。直接检出一个提交会进入<b>分离头指针</b>状态：HEAD 文件里存的不再是分支名，而是一个哈希。' },
      { cmd: 'git switch main', note: '切回分支，恢复正常。' },
      { cmd: 'git tag v1.0', note: '打一个轻量标签。以后 main 继续前进，<code>v1.0</code> 始终钉在这个提交上，适合标记发布版本。' },
    ],
  },
  {
    id: 'merge',
    title: '合并',
    view: 'dag',
    intro: `
<p class="lead">合并是把两条历史汇到一起。Git 会先找到两个分支的<b>最近公共祖先</b>，再根据情况选一种做法。</p>
<table class="grid">
<tr><th>情况</th><th>做法</th><th>结果</th></tr>
<tr><td>当前分支是对方的祖先</td><td>快进（fast-forward）</td><td>只移动指针，不产生新提交</td></tr>
<tr><td>两边都有新提交</td><td>三方合并</td><td>产生一个有两个父提交的合并提交</td></tr>
<tr><td>两边改了同一处</td><td>停下来报冲突</td><td>你手动决定保留什么，再提交</td></tr>
</table>
<p>三方合并逐个比较三个版本（祖先、我方、对方）：只有一方改过就取改过的那方，双方改得一样就取任意一方，双方改得不同才算冲突。</p>
<p class="tip">说明：真实 Git 的比较细到行（同一文件改了不同的行也能自动合并），本演示的引擎只比较到整个文件。</p>`,
    setup: [...INIT, 'git switch -c feature', 'echo "export function login() {}" > src/login.js', 'git add .', 'git commit -m "新增登录功能"', 'git switch main'],
    steps: [
      { cmd: 'git merge feature', note: 'main 自从分出 feature 后没有新提交，是 feature 的直接祖先。Git 只需把 main 指针<b>快进</b>到 feature 所在的提交。' },
      { cmd: 'git switch -c dark-mode', note: '新建并切到一个分支，准备制造一次真正的分叉。' },
      { cmd: 'echo ".dark { color: white }" > theme.css && git add . && git commit -m "深色模式"', note: 'dark-mode 分支上多了一个提交。' },
      { cmd: 'git switch main && echo "## 更新日志" >> README.md && git commit -am "更新文档"', note: 'main 上也多了一个提交，两边各改了不同的文件。' },
      { cmd: 'git merge dark-mode', note: '<b>三方合并</b>：两边改的文件不重叠，自动合并成功。新出现的合并提交有<b>两根箭头</b>，分别指向两个父提交。' },
      { cmd: 'git switch -c experiment && echo "# 实验性标题" > README.md && git commit -am "实验分支改标题"', note: '接下来演示冲突：先在 experiment 分支改 README.md。' },
      { cmd: 'git switch main && echo "# 正式标题" > README.md && git commit -am "主分支改标题"', note: '再在 main 上把同一个文件改成别的内容。' },
      { cmd: 'git merge experiment', note: '两边都改了 README.md 而且改得不一样，Git 无法替你决定，合并<b>暂停</b>。仓库里多了一个 <code>MERGE_HEAD</code> 文件记着对方的提交。' },
      { cmd: 'cat README.md', note: '冲突文件里两个版本都写进去了：<code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code> 到 <code>=======</code> 之间是我方，之后到 <code>&gt;&gt;&gt;&gt;&gt;&gt;&gt;</code> 是对方。' },
      { cmd: 'echo "# 正式标题（含实验内容）" > README.md && git add README.md', note: '把文件改成想要的最终样子，<code>git add</code> 告诉 Git「这个冲突我解决了」。' },
      { cmd: 'git commit -m "合并 experiment，解决标题冲突"', note: '提交完成合并。想放弃一次进行中的合并，可以用 <code>git merge --abort</code>。' },
    ],
  },
  {
    id: 'rebase',
    title: '变基与拣选',
    view: 'dag',
    intro: `
<p class="lead">变基（rebase）是另一种整合方式：把你的提交「搬」到目标分支的最新提交后面，得到一条直线的历史。</p>
<p>但提交对象是不可变的，父提交又是提交内容的一部分，所以并不存在真正的「搬」。Git 实际做的是：</p>
<ol>
<li>找出当前分支独有的提交；</li>
<li>把每个提交相对它父提交的<b>改动</b>算出来，在新的基底上<b>重新提交一遍</b>；</li>
<li>把分支指针指到最后一个新提交。</li>
</ol>
<p>新提交内容一样但哈希全变了，旧提交还留在对象库里，只是没有分支指着它们了（场景里的灰色半透明小球）。</p>
<p class="tip">黄金法则：不要对已经推送、别人可能已经拉取的提交做变基。你换掉了哈希，别人手里还是旧的，双方历史就对不上了。</p>
<p><code>git cherry-pick</code> 用的是同一个机制，只是一次只重放你指定的那一个提交。</p>`,
    setup: [...INIT, 'git switch -c feature', 'echo "export function login() {}" > src/login.js', 'git add .', 'git commit -m "登录：表单"', 'echo "export function logout() {}" > src/logout.js', 'git add .', 'git commit -m "登录：退出"', 'git switch main', 'echo "## 更新日志" >> README.md', 'git commit -am "main 上的更新"', 'git switch feature'],
    steps: [
      { cmd: 'git log --oneline --all', note: '现状：feature 有两个独有的提交，main 在分叉之后也前进了一步。' },
      { cmd: 'git rebase main', note: '两个提交在 main 的最新提交后面被<b>重新创建</b>，哈希是新的。原来的两个提交变灰：它们还在，只是不可达了。' },
      { cmd: 'git switch main && git merge feature', note: '现在 main 是 feature 的直接祖先，合并只需要快进，历史是一条直线，没有合并提交。' },
      { cmd: 'git reflog', note: 'reflog 记录了 HEAD 每一次移动。灰色的旧提交就是靠这里的记录才没被回收——变基搞砸了，可以用 <code>git reset --hard HEAD@{n}</code> 回去。' },
      { cmd: 'git switch -c release HEAD~2', note: '从两个提交之前拉一个 release 分支，它没有登录相关的任何提交。' },
      { cmd: 'git cherry-pick main', note: '只把 main 最新的那一个提交（「登录：退出」）的改动重放到 release 上，同样产生了一个新哈希的提交。' },
      { cmd: 'git reflog expire --expire=now --all && git gc --prune=now', note: '清空 reflog 之后再回收，灰色的悬空提交被真正删除。平时 Git 会保留它们大约 90 天，不必手动清理。' },
    ],
  },
  {
    id: 'undo',
    title: '撤销与找回',
    view: 'overview',
    intro: `
<p class="lead">「撤销」在 Git 里有好几条命令，区别只在于它们各自动了哪些东西。</p>
<table class="grid">
<tr><th>命令</th><th>分支指针</th><th>暂存区</th><th>工作区</th></tr>
<tr><td><code>reset --soft</code></td><td>移动</td><td>不变</td><td>不变</td></tr>
<tr><td><code>reset --mixed</code>（默认）</td><td>移动</td><td>重置</td><td>不变</td></tr>
<tr><td><code>reset --hard</code></td><td>移动</td><td>重置</td><td>重置</td></tr>
<tr><td><code>revert</code></td><td colspan="3">不改历史，追加一个内容相反的新提交</td></tr>
<tr><td><code>restore</code></td><td colspan="3">不动分支，只还原指定文件</td></tr>
</table>
<ul>
<li>提交还没推送：用 <code>reset</code> 或 <code>commit --amend</code> 改写。</li>
<li>提交已经推送：用 <code>revert</code>，不改写别人已有的历史。</li>
<li>提交过的东西几乎都能找回：<code>git reflog</code> 记着 HEAD 去过的每个位置。</li>
</ul>`,
    setup: [...INIT, 'echo "## 安装" >> README.md', 'git commit -am "补充安装说明"', 'echo "console.log(\'v2\')" > src/app.js', 'git commit -am "升级到 v2"', 'echo "export const debug = true" > src/config.js', 'git add .', 'git commit -m "加入配置文件"'],
    steps: [
      { cmd: 'git reset --soft HEAD~1', note: '<b>soft</b>：只有分支指针退了一格。看前排，暂存区里 config.js 还在，状态是「新增待提交」——提交被拆开了，内容原样留在暂存区。' },
      { cmd: 'git commit -m "加入配置文件（重写说明）"', note: '重新提交。旧的那个提交变成灰色的悬空提交。' },
      { cmd: 'git reset HEAD~1', note: '<b>mixed</b>（默认）：分支指针和暂存区都退回去了，文件只留在工作区，变成未跟踪。' },
      { cmd: 'git add . && git commit -m "加入配置文件（第三版）"', note: '再提交回来，为下一步做准备。' },
      { cmd: 'git reset --hard HEAD~2', note: '<b>hard</b>：三个区域全部回到两个提交之前，config.js 和 v2 的修改从工作区消失了。看上去像是丢了。' },
      { cmd: 'git reflog', note: '并没有丢。reflog 第二行 <code>HEAD@{1}</code> 就是 reset 之前所在的提交。' },
      { cmd: 'git reset --hard HEAD@{1}', note: '回到 reset 之前的位置，文件全部回来了。只要提交过，对象就在库里，找回的只是一个指针。' },
      { cmd: 'git revert HEAD', note: '<b>revert</b> 不删除任何历史，而是追加一个新提交把指定提交的改动反向做一遍。适合撤销已经推送的提交。' },
      { cmd: 'git commit --amend -m "撤销配置文件（待重新设计）"', note: '<b>amend</b> 修改最后一次提交。本质是用新提交顶替旧提交，所以哈希变了，旧的那个成了悬空提交。' },
      { cmd: 'echo "写到一半的功能" >> src/app.js && git stash', note: '<b>stash</b>：把没提交的修改临时收起来，工作区恢复干净，可以去处理别的事。' },
      { cmd: 'git stash pop', note: '把收起来的修改放回工作区。' },
    ],
  },
  {
    id: 'remote',
    title: '远程协作',
    view: 'remote',
    intro: `
<p class="lead">远程仓库就是放在别处的另一个 <code>.git</code>。同步的本质是：<b>把对方没有的对象复制过去，再移动对应的分支指针</b>。</p>
<table class="grid">
<tr><th>命令</th><th>做了什么</th></tr>
<tr><td><code>git clone</code></td><td>init + 添加 origin + fetch + 检出默认分支</td></tr>
<tr><td><code>git fetch</code></td><td>下载远程的新对象，更新 <code>origin/*</code>。不动你的分支和文件</td></tr>
<tr><td><code>git pull</code></td><td>fetch，然后 merge（或 <code>--rebase</code>）</td></tr>
<tr><td><code>git push</code></td><td>上传对象，请求远程把它的分支指针快进到你的提交</td></tr>
</table>
<p><b>远程跟踪分支</b>（灰色标签 <code>origin/main</code>）是你本地的一个书签，记录「上次联网时远程的 main 在哪」。它只在 fetch / push 时更新。</p>
<p>场景后方的平台是远程仓库，同一个提交在本地和远程上下对齐。</p>`,
    setup: [...INIT, 'echo "## 安装" >> README.md', 'git commit -am "补充安装说明"'],
    steps: [
      { cmd: 'git remote add origin https://github.com/you/demo.git', note: '只是在 <code>.git/config</code> 里记下一个地址，还没有传输任何东西。后方出现了空的远程仓库。' },
      { cmd: 'git push -u origin main', note: '对象被复制到远程，远程的 main 指向同一个提交。本地多了灰色标签 <code>origin/main</code>。<code>-u</code> 让本地 main 以后默认和它对应。' },
      { cmd: 'echo "console.log(\'v2\')" > src/app.js && git commit -am "本地：升级到 v2"', note: '本地提交。main 前进了，<code>origin/main</code> 留在原地——它记的是远程的位置。' },
      { cmd: 'git status', note: '「领先 1 个提交」就是通过比较 main 和 origin/main 这两个本地指针算出来的，不需要联网。' },
      { cmd: 'teammate', note: '同事小明往远程推送了一个提交。看后方：远程多了一个你本地没有的提交，而你这边毫无察觉。' },
      { cmd: 'git push', note: '推送被<b>拒绝</b>。远程的 main 不是你的提交的祖先，直接改指针会丢掉小明的提交，所以 Git 要求你先把远程的更新拿下来。' },
      { cmd: 'git fetch', note: '小明的提交被下载到本地，<code>origin/main</code> 移到了它上面。你的 main 和工作区一点没动，历史在这里分叉了。' },
      { cmd: 'git merge origin/main', note: '把远程的更新合并进来。<code>git fetch</code> 加上这一步，就等于 <code>git pull</code>。' },
      { cmd: 'git push', note: '现在远程的 main 是你的提交的祖先，可以快进，推送成功。本地与远程重新一致。' },
    ],
  },
  {
    id: 'internals',
    title: '.git 内部',
    view: 'objects',
    objects: true,
    panel: 'gitdir',
    intro: `
<p class="lead">整个仓库就是 <code>.git</code> 这一个目录。右上角已切到「.git 目录」，里面的每个文件都可以点开看。</p>
<pre class="code">.git/
├── HEAD            当前在哪个分支
├── config          仓库配置、远程地址
├── index           暂存区（二进制）
├── objects/        所有 blob / tree / commit
│   ├── ab/cdef…    松散对象，zlib 压缩
│   └── pack/       打包后的对象
├── refs/
│   ├── heads/      本地分支
│   ├── remotes/    远程跟踪分支
│   └── tags/       标签
├── logs/           reflog
└── hooks/          提交、推送等时机的钩子脚本</pre>
<h3>打包文件（packfile）</h3>
<p>每个版本存一份完整 blob 看上去浪费，其实 Git 会定期执行 <code>git gc</code>，把松散对象收进 <code>objects/pack/*.pack</code>。在包里，相似的对象只存一份完整内容，其余存成相对它的<b>差量</b>，再配一个 <code>.idx</code> 索引用于按哈希快速定位。网络传输（push / fetch）用的也是这种格式。差量只是存储层的优化，逻辑上每个对象仍然是完整快照。</p>
<h3>暂存区文件</h3>
<p><code>index</code> 是一张排好序的表，每行有路径、blob 哈希，还有文件的修改时间和大小。<code>git status</code> 先比时间和大小，没变的文件不用重新算哈希，所以大仓库里也很快。</p>
<h3>关于哈希算法</h3>
<p>Git 一直使用 SHA-1。针对已知的碰撞攻击，现在的 Git 内置了碰撞检测；新版本也支持用 SHA-256 创建仓库（<code>git init --object-format=sha256</code>）。</p>`,
    setup: [...INIT, 'echo "## 安装" >> README.md', 'git commit -am "补充安装说明"', 'git branch feature', 'git tag v1.0'],
    steps: [
      { cmd: 'cat .git/HEAD', note: 'HEAD 就是这么一行文本。' },
      { cmd: 'cat .git/refs/heads/main', note: '分支文件里是一个提交的完整哈希，仅此而已。' },
      { cmd: 'git ls-files -s', note: '暂存区的内容：权限、blob 哈希、路径。提交时 Git 就是把这张表转写成 tree 对象。' },
      { cmd: 'git cat-file -t v1.0 && git cat-file -s HEAD', note: '<code>-t</code> 看对象类型，<code>-s</code> 看字节大小。' },
      { cmd: 'echo "草稿" > draft.txt && git add draft.txt && git restore --staged draft.txt', note: '暂存又撤回。对象层最右边留下了一个<b>没有任何 tree 引用的 blob</b>：<code>git add</code> 当时就把对象写进了库里，撤回暂存并不会删除它。' },
      { cmd: 'git gc --prune=now', note: '垃圾回收：从所有分支、标签、reflog、暂存区出发，走不到的对象才会被删除。刚才那个孤立的 blob 消失了。' },
    ],
  },
  {
    id: 'cheat',
    title: '命令速查',
    view: 'overview',
    sandbox: true,
    intro: `
<p class="lead">这一章是自由练习场，右边准备了一个有分叉的仓库。点击下面任意一条命令会填进终端，改好参数按回车执行。</p>`,
    setup: [...INIT, 'echo "## 安装" >> README.md', 'git commit -am "补充安装说明"', 'git switch -c feature', 'echo "export function login() {}" > src/login.js', 'git add .', 'git commit -m "新增登录功能"', 'git switch main', 'echo "console.log(\'v2\')" > src/app.js', 'git commit -am "升级到 v2"'],
    steps: [],
    cheat: [
      ['开始', [['git init', '把当前目录变成仓库'], ['git clone <地址>', '完整复制一个远程仓库'], ['git config --global user.name "名字"', '设置提交时的署名']]],
      ['日常提交', [['git status', '三个区域之间有什么差异'], ['git add .', '把所有修改放进暂存区'], ['git commit -m "说明"', '把暂存区存成一个提交'], ['git commit -am "说明"', '已跟踪文件：暂存并提交'], ['git diff', '工作区 ↔ 暂存区'], ['git diff --staged', '暂存区 ↔ HEAD']]],
      ['查看历史', [['git log --oneline --all', '所有分支的简洁历史'], ['git show HEAD', '某个提交改了什么'], ['git reflog', 'HEAD 去过的每个位置']]],
      ['分支', [['git branch', '列出分支'], ['git switch -c topic', '新建并切换'], ['git switch main', '切换分支'], ['git branch -d topic', '删除已合并的分支'], ['git tag v2.0', '打标签']]],
      ['整合', [['git merge feature', '把 feature 合并进当前分支'], ['git rebase main', '把当前分支的提交重放到 main 之后'], ['git cherry-pick feature', '只拿某一个提交'], ['git merge --abort', '放弃进行中的合并']]],
      ['撤销', [['git restore src/app.js', '丢弃工作区的修改'], ['git restore --staged src/app.js', '取消暂存'], ['git commit --amend -m "新说明"', '修改最后一次提交'], ['git reset --soft HEAD~1', '撤销提交，保留在暂存区'], ['git reset --hard HEAD~1', '彻底回到上一个提交'], ['git revert HEAD', '用新提交抵消旧提交'], ['git stash', '临时收起未提交的修改'], ['git stash pop', '取回收起的修改']]],
      ['远程', [['git remote add origin https://github.com/you/demo.git', '关联远程仓库'], ['git push -u origin main', '首次推送并建立对应关系'], ['git fetch', '下载远程更新，不改本地分支'], ['git pull', 'fetch + merge'], ['git pull --rebase', 'fetch + rebase'], ['teammate', '（本演示）模拟同事推送']]],
      ['底层', [['git cat-file -p HEAD', '打印对象内容'], ['git cat-file -p HEAD^{tree}', '打印提交的根 tree'], ['git hash-object README.md', '计算文件的 blob 哈希'], ['git ls-files -s', '查看暂存区'], ['git gc', '打包并回收不可达对象']]],
    ],
  },
];
