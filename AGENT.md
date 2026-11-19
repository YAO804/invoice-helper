# AGENT.md · 项目交接与协作约定

> 本文件面向接手本项目的开发者与 AI Agent，记录「这个项目是什么、怎么组织、怎么跑、有哪些坑」。
> 遇到问题先读这里，再读 `README-M0.md`（总说明）、`docs/`（需求与计划）、`shared/protocol.md`（通信协议）。

---

## 1. 项目定位与边界

**一句话**：个人自用的电子发票辅助归集工具——把文件收好、把字段抠出来、把台账记上、把报销人对上。

- **产品形态**：微信小程序（采集端）+ 电脑端本地服务与网页（台账端）。手机扫码/导票，结果发送到同一局域网的电脑归档。
- **名字**：攒票小匣。正式 AppID `wxebcb963f266bfdee`（测试号 `wx2b204ff465b4935c` 已弃用）。
- **只做**：信息采集辅助、本地归档、CSV 台账、报销人归集、重复提醒、补录清理。
- **不做**：自动查验、真伪判断、对外提供服务。发票真伪以国家税务总局查验平台结果为准。
- **不上传云端**：数据默认只在手机私有目录；发送给电脑时走局域网直连，不上公网。
- **使用范围**：个人自用 + 同事批量扫码场景，不上线发布，走体验版。

### 边界调整：从「完整票面归档」转向「报销归集」（2026-11-17）

销方名称/税号、买方名称/税号、不含税金额、税额、税率 7 个字段已从数据模型删除，新增 `报销人`。
票面只剩 8 个字段，**唯一的业务动作是给每张票填报销人**——「待补录」的判定就是报销人为空。

判断要不要加回票面字段时先问：这个字段会不会影响「谁报销、报多少」。不会就别加。

---

## 2. 技术栈与仓库结构

```text
invoice-helper/
├── project.config.json         # 微信开发者工具配置，appid 与 miniprogramRoot 在此
├── miniprogram/                # 微信小程序端（采集）
│   ├── app.js/.json/.wxss      # 全局；onLaunch / onShow 都起一次心跳（会立刻补报一拍）
│   ├── pages/                  # 7 个页面，每个必须有 .js/.json/.wxml（缺 .json 会白屏）
│   └── utils/                  # 全部业务逻辑，页面只做数据组装与事件转发
├── desktop/                    # 电脑端 Go 服务 + 本地网页（台账）
│   ├── main.go                 # 入口：启动 HTTP 服务 + mDNS 广播
│   ├── go.mod / go.sum         # 依赖：grandcat/zeroconf（mDNS）、skip2/go-qrcode（连接二维码）
│   ├── internal/               # api / config / discovery / files / ledger / registry
│   ├── web/                    # 纯 HTML/CSS/JS，由 embed 嵌入二进制
│   ├── data/                   # 运行时数据，不提交 Git（保留 .gitkeep）
│   └── README.md
├── shared/protocol.md          # 两端通信协议（当前 v0.9）
├── test/
│   ├── miniprogram/            # 小程序 Node 回归测试（23 套 / 732 项检查）
│   ├── desktop/                # 电脑端网页 Node 回归测试（12 套 / 290 项检查；Go 单测在 desktop/internal 各包内）
│   └── integration/            # 两端联调预留
├── docs/                       # requirements / miniprogram-plan / spike
├── scripts/                    # 图标生成、CRC 校准等开发脚本
├── assets/                     # 静态资源
├── README-M0.md                # 总说明与完整回归命令
└── AGENT.md                    # 本文件
```

- **远端**：`https://github.com/YAO804/invoice-helper.git`，主分支 `main`。
- **同仓**：小程序端与电脑端放同一仓库，不另建。

---

## 3. 环境与常用命令

**小程序**：微信开发者工具导入**仓库根目录**（`project.config.json` 在根上），AppID 用正式号。
`wx.scanCode` 和 `wx.chooseMessageFile` 必须真机跑，模拟器不支持。

**电脑端**：Go 1.22+。

```bash
# 启动电脑端（默认 :8765，数据目录 desktop/data/）
cd desktop && go run .
# 自定义：go run . -addr :9000 -data ./data
# 自定义：go run . -keep-days 30
# 环境变量：INVOICE_ADDR / INVOICE_DATA_DIR / INVOICE_KEEP_DAYS
```

**回归测试**（改动后必跑）：

```bash
# 小程序 23 套，共 732 项检查
for f in test/miniprogram/*.test.js; do node "$f" || exit 1; done

# 电脑端网页 12 套，共 290 项检查
for f in test/desktop/*.test.js; do node "$f" || exit 1; done

# 电脑端
cd desktop
go test ./...
go vet ./...
```

---

## 4. 强制约定（务必遵守）

1. **每次修改代码后必须提交 Git**：测试通过后立即 `git add` + `git commit`，写清楚改了什么；出错可回溯。不要攒着一次性提交。提交后推送 `main`。
2. **代码要优美**：单文件超过约 200 行考虑拆分，单函数超过约 40 行考虑拆分。
3. **页面只做数据组装和事件转发**，业务逻辑放 `miniprogram/utils/`；台账数据一律经 `utils/ledger.js` / `utils/lanservice.js` 走后端接口，页面不许自己发请求。
4. **重复逻辑抽成共用函数**，不在多个文件复制粘贴；命名能看出用途；注释只写「为什么」。
5. **每个小程序页面必须有 `.js` / `.json` / `.wxml` 三件套**，缺 `.json` 会白屏（踩过）。
6. **判重口径改动必须两端同步**：`miniprogram/utils/draft.js` 的 `dedupeKey` 与 `desktop/internal/ledger/identity.go` 的 `identityKey` 是同一套规则，只改一边就是埋雷。
7. 已知历史债：`utils/einvoice.js`（434 行）偏长，是早期快速验证产物。触碰时顺手拆，不要继续堆逻辑。
8. **小程序不存台账**：不要重新引入本地持久化，否则又会出现两端对账问题。草稿只放内存。
9. **改 `desktop/web/` 下任何文件都必须重新编译**：那是 `embed` 进二进制的，改完不 `go build` / 不重启进程，浏览器拿到的还是旧代码。已把静态资源统一设成 `Cache-Control: no-store`，并在控制台显示服务版本，用来区分「代码没生效」和「功能有 bug」。
10. **台账表是固定布局**（`table-layout: fixed` + `<colgroup>` 百分比列宽，共 9 列）：不要给它加 `min-width`、也不要把内含长文本的单元格改成 `white-space: normal`——前者会重新引入横向滚动条，后者会让 20 位号码折行、被看成两个号。超长内容走 `ellipsis` + `title`。**列数改动必须同时改 `colgroup`、`thead`、行渲染和 `emptyRow` 的 colspan**，`filter-panel.test.js` 会数这三处的列数。
11. **`desktop/web/*.js` 是经典脚本，顶层全局名只能有一处定义**：统一用 `render.js` 的 `$`，别在别的脚本里再声明 `function $` / `const $`——两个脚本在浏览器里会互相冲突，后加载的整份脚本直接 SyntaxError，界面只剩「renderStatus is not defined」。`script-order.test.js` 守着这条。
12. **时间显示一律北京时间（UTC+8）**：后端把文件、事件时间按 UTC RFC3339 存，网页渲染必须经 `desktop/web/time.js` 的 `beijingTime()` / `beijingClock()`；不要用 `toLocaleString`（跟随系统时区，机器时区不对界面就错），也不要直接贴 `item.at` / `item.uploaded_at`。台账的 `created_at` 由 `desktop/internal/ledger` 的 `nowText()` 用 `time.FixedZone("CST", 8*3600)` 生成，不依赖机器时区；控制台「今日接收」也按北京自然日统计（`files.todayRange`），不是 UTC 日期。`time-format.test.js`、`TestNowTextIsBeijing`、`TestTodayRangeIsBeijing` 守着这几处。
13. **连接状态只有一个来源、一套说法**：所有页面用 `status` 四态（`none` / `checking` / `ok` / `fail`）+ 顶部 `<conn-bar>` 组件，不许再出现「`getBase()` 有值就是已连接」这种判断——那只是「存过地址」。收票页用台账同步当探活、传输页和导出页调 `lanservice.probe()`，**徽标必须由真实请求背书**；文案一律从 `utils/connect-hint.js` 取，页面和组件里不写死状态字。新页面要连电脑就挂 `<conn-bar>`，别自己再画一个徽标。`conn-bar.test.js` 守着「谁挂了、谁没挂、旧徽标有没有回来」。

> 项目约定另记录在 `.workbuddy/memory/MEMORY.md`（不进 Git），每日工作日志在 `.workbuddy/memory/YYYY-MM-DD.md`。

---

## 5. 核心数据模型

### 发票字段（电脑端 CSV 8 列）

```text
发票号码,发票代码,票种,开票日期,价税合计,报销人,录入批次,录入时间
```

- 读取按**表头名**定位列，所以旧版 12/14 列 CSV 仍能打开，缺的列按空值处理；写入一律 8 列（UTF-8 BOM，Excel 直接开）。
- 金额是**普通元字符串**（如 `"147.00"`）；小程序内部草稿用**整数分**，发送前才转成字符串元。
- 每次写入（接收/导入/补录/手动录入/清理）前自动备份上一版到 `desktop/data/backup/`。

### 小程序端不存台账（2026-11-18 起）

小程序只保留**内存草稿**和**电脑台账的内存镜像**，退出即丢：

```text
电脑 desktop/data/invoices.csv   ← 唯一权威数据
        ↑ POST /api/invoices      扫码/导入发送
        ↓ GET  /api/invoices      台账页同步（筛选/排序/重复都由电脑端算）
小程序内存 ledger 缓存            ← 只读镜像，供列表渲染与扫码当场判重
小程序内存 draft（草稿）           ← 收票到发送之间，成功即丢
```

- 代价是**离线不可用**；换来的是不需要两端对账，不存在「手机上改了电脑不知道」。
- 原来本地的分片台账（`invoices/ledger/*.json`）、索引、分类、待复核、清理、原件归档全部下线。

### 判重口径（两端一致，2026-11-18 统一）

```text
identityKey = 发票代码 + "|" + 发票号码
```

- 数电票没有发票代码（20 位号码全国唯一），键退化为 `|号码`；老票必须「代码+号码」才唯一——8 位号码跨年份、跨地区会撞号。
- **金额与开票日期不参与判重**。它们会因补录、格式抖动（`147.0` 与 `147.00`）而变，一旦进了键，同一张票就会算出不同的键。漏判一张重复票就是重复报销，代价远高于多留一条记录让用户自己删。
- 发送前查重（`/api/invoices/check`）是**宽松**的：客户端没给代码时按号码匹配，宁可多提示一次。
- 重复票**仍会写入并高亮**，由用户自行删除，不自动删。

### 排序与归月

```js
sort = created | issued | number | reimburser   // 默认 created（录入时间倒序）
```

- 排序口径两端只有一份：由电脑端 `GET /api/invoices?sort=` 算，小程序只传参数、不本地排序。
- 报销人排序时空值排最后，方便先看已填写的。
- 「归月口径」随本地台账一起下线，小程序不再按月分组。

### 二维码能力边界（真机实测，不可违背）

- 数电票二维码是**明文逗号串**：`01,31,,26932000001877489821,10500.00,20261110,,277D`
- **能拿到**：发票号码、价税合计、开票日期。
- **拿不到**：销方名称、税号、税额、税率、明细、税务签名——必须从 XML/OFD 原件取。
- **CRC 非标准**：枚举 70 组 CRC-16 变体均未命中，只保留 `crcDeclared`，**不做校验**，不得把 CRC 不匹配当异常。
- 解析分级：L1 XML（字段最全）> L2 OFD（ZIP+XML，端侧不解压，只存档）> L3 PDF（只存不解析）> L4 二维码（草稿）。OCR 已砍。

---

## 6. 小程序端模块地图

### 页面（`pages/`，首页为收票页，共 7 个）

| 页面 | 职责 |
|---|---|
| `collect` | **首页**。顶部 `<conn-bar>` 统一显示连接状态，下面是导读卡（`statusHint` 一句话讲这一步做什么，未连接时多给一个「去连接电脑」按钮）＋三张操作卡：扫码（单张/批量）、文件导入（把票的信息记进台账，XML 填全字段、OFD/PDF 只取名）、文件归档（把原件发到电脑，跳传输页）。未连接时四个操作按钮置灰（`btn-off`）、点了弹 toast 指回顶部状态条（`requireReady`）。发送成功弹窗可「查看这批票」，批次号经 `globalData.pendingBatch` 带给台账页（只做筛选，不写进任何文案） |
| `list` | **只读台账**：顶部 `<conn-bar>` + 三层排布——① 概览卡（张数 · 合计金额 + 可点的「仅看重复 / 仅看待补录」pill + 清空条件）；② 筛选卡（搜索、条件 pill、四段排序）；③ 列表项（号码 + 金额一行，票种 · 开票日期一行，报销人标签 + 录入时间一行）。空态按 `status` 分两段：`fail` 说「连不上电脑」并给出地址，「none」说「台账在电脑上」。数据来自 `GET /api/invoices`，支持下拉刷新；「最近录入」是筛选卡里的 pill，点一下只看那天，再点取消；录入批次不出现在界面（收票页带来的批次号只用于收敛列表，显示为「刚发的那批」） |
| `detail` | **只读详情**：7 个票面字段（无录入批次）+ 同组重复记录；可复制号码，没有编辑/删除 |
| `export` | 导出 CSV：顶部 `<conn-bar>`（先 `probe()` 探活再拉台账，不再「存过地址就当连上」）→ 选范围（全部/仅重复/仅待补录）→ 电脑端生成 → 下载 → 微信转发 |
| `transfer` | **传输中心**：顶部 `<conn-bar>`（同样四态，靠 `lanservice.probe()` 探活而不是靠「存过地址」），下面分「发到电脑」「从电脑取」两个方向。发：会话文件上传，看「我的上传」「电脑已收」；取：看「电脑待取」，可单条接收（转发到聊天/预览）或批量接收。两边都支持勾选删除、全部删除、清理超 30 天 |
| `settings` | 桌面端连接（自动搜索 / **一个扫码按钮同时认登录码和连接码** / 手填）、PIN 设置与修改、数据在哪、导出入口、关于 |
| `index` | M0 技术验证页（保留） |

> 2026-11-18 下线：统计页、`edit`（手动录入/编辑）、`manage`（台账清理）、`review`（待复核）。
> 这些活现在都在电脑端：新增发票走网页「新增发票」，补录点报销人单元格，删除/清理在台账页，待复核用「仅看待补录」筛选。
> 收票页同日移除「查看台账」入口（tabBar 已直达）和 M0 入口（开发期残留，设置页仍保留入口）；文件导入与文件归档分卡，文案讲清区别。

### 组件（`components/`）

| 组件 | 职责 |
|---|---|
| `conn-bar` | 顶部**连接状态条**，四个要连电脑的页面共用（收票 / 台账 / 传输 / 导出）。四态由 `connect-hint.js` 的 `barView()` 算：`none` 琥珀「未连接电脑·扫码收票前要先连上·去连接」、`checking` 灰「正在连电脑·稍等一下」、`ok` 白底细线「已连接 · 12 张 · 3 分钟前」、`fail` 红「连不上电脑 · 地址 · 去设置」。点它跳设置页（`ok` / `checking` 时点了没用，直接 return），`ok` 时每 30 秒重算一次「几分钟前」，`detached` 里清定时器。文案全在 `utils/connect-hint.js`，组件不写死任何一个状态字。 |

> 为什么不用 toast/右上角徽标：web.dev 与 WCAG 的共识是**持续状态不能用转瞬即逝的提示**，且状态不能只靠颜色区分（色盲看不出）。状态条带文字、常驻、还附带「下一步」，三条都满足。

### 工具（`utils/`，按职责拆分）

- `connect-hint.js`：连接状态的所有文案与派生态，页面只管传 `status`。
  `statusView(status, opts)` → 状态卡用的 `badge` / `tone` / `hint`；`viewState(current, patch)` 把四态折成 `needConnect` / `ready`；`barView(status, opts)` → 顶部状态条的 `tone` / `badge` / `detail` / `action`；`agoText(now, at)` 出「刚刚 / N 分钟前 / N 小时前 / 昨天 / 日期」；`hostText(base)` 把地址裁成 `ip:端口`；`failureTip(error)` 翻译扫码/探活失败。**状态徽标必须由真实请求背书**——`!!getBase()` 只说明「存过地址」，不是「连得上」。
- `einvoice.js`：XML 树 + 完整路径取值、标签 dump、二维码解析（最长，历史债）。
- `draft.js`：纯函数。二维码/XML/版式文件 → 草稿，金额分↔元、判重键、号码位数校验、转电脑端 payload。
- `ledger.js`：电脑台账的内存镜像。拼查询串、`sync()` 拉取、卡片映射、判重索引（同键保留最早一条）、重复组。
- `collect.js` / `scanbatch.js`：扫码与文件导入 / 批量连续扫码（扫到取消、每 10 张确认、重复靠镜像当场弹窗）。
- `zip.js` / `fsx.js`：ZIP-OFD 结构探测 / 私有目录读写（只剩 M0 验证页在用）。
- `lanservice.js`：桌面端地址、**探活 `probe()`（GET `/api/health`，2s 超时，不带 PIN、不抛错，只回 `true`/`false`）**、心跳、查重、发送、上传、台账只读拉取、导出地址、待取文件的下载地址/删除/清理。
- `filesend.js`：原件上传（只支持微信会话文件），本地留 100 条发送历史，单文件 20MB、单次 20 个；
  发送记录与电脑端副本都只保留 **30 天**，`purgeOldHistory()` 在页面打开时顺手清超期记录。
- `invoicesend.js`：草稿 → 电脑端、重复确认、**200 张上限提示**。
- `filetake.js`：**从电脑取**——待取列表、下载到临时文件、`wx.openDocument` 预览、转发到聊天、批量接收（单个失败不中断）。
- `transferops.js`：传输页三个列表（本机记录 / 电脑已收 / 电脑待取）的删除与清理文案和调用，避免页面里写三套相似分支。
- `selection.js`：勾选纯逻辑（toggle / prune / mark / allSelected），切分段清空、删完剔除失效项都靠它。
- `format.js`：文件大小与时间文本格式化，发文件与取文件两侧共用。
- `exportflow.js`：把已落盘的临时文件逐个用 `wx.shareFileMessage` 转发（微信一次只能发一个）。
- `discover.js`：三级连接——mDNS 自动发现（安卓）→ 解析电脑网页二维码 → 手填地址兜底。

> 已删除（随本地台账下线）：`store.js`、`category.js`、`batch.js`、`batchmark.js`、`review.js`、`purge.js`、`csv.js`、`archive.js`、`export.js`、`exportsel.js`、`labels.js`。

---

## 7. 电脑端模块地图

### Go 包（`desktop/internal/`）

| 包 | 职责 |
|---|---|
| `api` | 全部 HTTP 路由、请求校验、JSON 响应；`network.go` 优选 WLAN/以太网、过滤虚拟网卡；`connect.go` 生成扫码连接串与二维码 PNG |
| `config` | `-addr` / `-data` / `-keep-days` 与环境变量，默认 `:8765` / `data` / `30` |
| `discovery` | mDNS 广播 `_http._tcp.`，实例名 `invoice-helper-desktop` |
| `files` | 文件传输数据层，双向对称：`incoming`（收）+ `outgoing`（待取）。SHA256+大小去重，单文件上限 20MB；`outgoing_save.go` 负责入库与同名改名，`purge.go` / `outgoing_clean.go` 负责按保留期、按 id/名字、清空三种删除 |
| `ledger` | 发票台账：CSV 读写、备份、判重、搜索、导入导出、补录、按录入时间清理；`identity.go` 定义判重键 |
| `registry` | 设备心跳与事件注册表；45 秒窗口判断在线 |

### 网页（`desktop/web/`，embed 嵌入）

- `index.html`：控制台 + 发票台账两个 tab。
- `app.js` / `render.js` / `api.js`：控制台（状态、连接二维码与地址、设备、发送到小程序、两边文件列表）。
- `events.js`：最近事件渲染。协议里的事件类型是英文（`upload` / `put` / `delete` / `import`），界面统一映射成中文（接收 / 发送 / 删除 / 台账），原始类型只留在 `class` 和 `title` 里。**新增事件类型必须同时补中文标签**，`events.test.js` 会扫后端 `MarkEvent("...")` 校验。
- `suggest.js`：输入框的历史值下拉浮层，替代原生 `datalist`（浏览器自绘的弹出层字号/行高/圆角跟页面完全不是一套，也限制不了条数）。浮层挂 `body`、`position: fixed` 跟着输入框定位（挂在输入框里会被弹窗或表格的 `overflow` 裁掉），最多 8 条，聚焦列全部历史值、打字才过滤，上下键 + 回车可选，Esc 只收浮层（`stopImmediatePropagation`，别让行内编辑以为要取消），选中后补发 `input`/`change` 让行内编辑直接落库。`suggest.test.js` 守着。
- `preview.js`：文件预览弹层——PDF 用 iframe 交给浏览器内置阅读器、图片用 img、文本抓下来塞 `pre`（>512KB 拒绝预览）；可预览类型只认后端返回的 `preview` 字段。
- `ledger-app.js` / `ledger-render.js` / `ledger-api.js` / `ledger-stats.js`：台账（搜索、排序、筛选、导入、补录、行内改报销人、清理、重复抽屉、导出、号码点击复制；勾选后显示张数与合计金额，金额按分求和避免浮点尾数）。
- 补录体验（2026-11-18）：报销人有值时旁边带复制按钮（复用 `.copy-cell` 委托，点它不会进编辑）；勾选后可用「批量填报销人」一次统一（走页面内模态框 `#batchReimburserModal`，不用 `window.prompt`，输入框挂同一个历史建议列表，Enter 即提交，留空表示清空）——串行 `PUT` 且必须带齐其余字段；`reimburser` / `kind` 输入框挂自绘浮层（`suggest.js`，**不再用原生 `datalist`**——它的字号/行高/圆角由浏览器定，跟页面差一截且限制不了条数），建议来自台账历史值（`suggestionPool` 只增不减，避免筛选后丢历史）；浮层聚焦列全部、打字才过滤、上下键 + 回车可选、Esc 只收浮层，选中后补发 `change` 让行内编辑直接落库；补录弹窗粘贴扫码串或 Excel 制表符一行时，`parsePastedInvoice` 自动拆字段，认不出就放行原生粘贴。`reimburser-fill.test.js` 守着。
- `ledger-stats.js`：顶部统计卡片兼筛选入口——点「重复组 / 待补录 / 最近录入」直接筛列表，再点一次取消，条件写回筛选面板（两处共用一份状态，卡片高亮跟 `aria-pressed` 走）。「最近录入」取后端 `latest_created_at`（全表）只显示日期，点一下把「录入时间起/止」都设成那天，再点清空；**卡片的日期必须来自后端全表口径**，取当前列表第一行的话一筛选它就跟着变。
- 台账列宽（2026-11-18 重排）：9 列百分比为 check 3 / number 17 / code 11 / kind 17 / issued 9 / total 7 / reimburser 14 / created 12 / actions 10（合计 100）。旧版「号码 18% / 票种 7%」是反的——号码最多 20 位、12px 字 175px 就够，票种是 9 个汉字、7% 只剩 72px，永远显示成「增值税电子…」。金额列右对齐后额外留 14px 右边距、报销人列 10px 左内边距，避免「160.79 蔡文姬」糊在一起。**表头一律居中**（`thead th` + `thead th.num` + `thead th.col-actions` 三条选择器必须成套写，否则 `.invoice-table th.num` 的特异性会把金额表头留在右对齐），数据行不动：文字左、金额右、操作右；金额表头额外把右内边距从 14px 收回 6px，否则居中后视觉上偏左 4px。
- 台账列与筛选（2026-11-18 调整）：**不再有「录入批次」列**，批次号对用户没意义；筛选面板也**去掉了录入批次与全局搜索**，改加「录入时间起/止」（后端 `created_from` / `created_to`，按 `created_at` 的日期部分比较）。`filter-panel.test.js` 守着「旧条件不许回来」和「colgroup/表头/行三处列数一致」。
- 小程序同步同一口径（2026-11-18）：台账页「最新批次」卡片换成「最近录入 · 日期」，点一下把录入时间起止都设成那天（同桌面端逻辑）；筛选卡加两个 `picker mode="date"`（录入起/止）与「清除日期」；搜索框占位符不再提批次；详情页删掉「录入批次」行。收票页发送成功文案不再打印批次号，但「查看这批票」仍把批次号放 `globalData.pendingBatch`，台账页用 `batch=` 参数收敛列表并以「刚发的那批 ✕」chip 呈现，取消即清。`list.test.js` / `ledger.test.js` 守着。

### 数据目录（`desktop/data/`，不提交）

```text
incoming/       小程序上传的文件（手机 → 电脑）
outgoing/       电脑提供给小程序下载的文件（电脑 → 手机）
backup/         发票台账历史备份
invoices.csv    发票台账主文件
index.json      上传记录索引
registry.json   设备与事件记录
```

---

## 8. 通信协议（v0.9，详见 shared/protocol.md）

- 基础：`http://电脑IPv4:8765`，局域网直连，不要求 HTTPS/合法域名。
- **鉴权**：`/api/*` 默认要 PIN/会话，白名单仅 health、connect-qr.png、auth/challenge、auth/qr.png、auth/confirm、auth/session、auth/logout。小程序请求带 `X-PIN`（`utils/auth.js`），网页用 HttpOnly cookie `ih_session`（30 天，token 由 PIN 派生 HMAC 签名）。默认 PIN `123456`，首次写入 `data/pin.json`（0600）后以文件为准，改 PIN 后旧会话全失效。扫码登录串 `invoice-helper://login?base=...&c=...`：一次性、5 分钟有效，小程序扫一次同时连地址并授权网页。网页 header 的「退出登录」调 `POST /api/auth/logout` 清 cookie，成功后整页重载回扫码态（顺带清掉两个页面模块的轮询定时器）；`logout.test.js` 守着这条。
- 心跳：小程序每 20 秒 `POST /api/devices/heartbeat`，电脑 45 秒窗口判在线。
  `startAutoHeartbeat()` 每次调用都会**立刻补报一拍**（启动、扫码换地址、从后台回到前台），
  不等下一个周期；电脑网页在未连接时按 2 秒轮询 `/api/status`，连上后降到 5 秒。
  ⚠️ 别把「立即报一次」挪到「是否已有定时器」的判断之后——那样换地址等于没连上，用户要等 20 秒。

### 连接策略（三级，按优先级）

1. **mDNS 自动发现**（仅安卓）：`_http._tcp.local.`，逐个 `/api/health` 验证取第一个可用地址。首次启动自动搜一次，失败后 10 分钟不重试。iOS 微信 7.0.18+ 不支持，直接跳过这一级。

   ⚠️ **服务端广播的两个硬约束**（`discovery.Start`，改动前先读这段）：
   - A 记录只能放有效局域网 IP。`Register(..., nil)` 会把所有网卡地址（含 `169.254.x.x` APIPA、VMware/蓝牙虚拟网卡）塞进同一条应答；微信 `onLocalServiceFound` 只回一个 `ip`，拿到无效地址后探活失败，最终被误报成「找不到电脑」。必须用 `RegisterProxy` 并通过 `ips` 参数只传 `api.LANAddresses()` 的结果。
   - `ifaces` 参数必须保留**全部**组播网卡（`api.MulticastInterfaces()`），不能用裁剪后的有效网卡列表。只给单张网卡时 Windows 上 mDNS 组播收发异常，局域网内其他设备搜不到服务（已用独立进程 browse 实测：单网卡无效、全网卡有效）。小程序侧另有 `discover.js` 的 `validIP` 做二次过滤。
2. **扫码连接**（兜底主力，安卓/iOS 都可用）：电脑端有两类二维码——未登录遮罩上的登录码 `invoice-helper://login?base=...&c=...`、已登录控制台里的连接码 `invoice-helper://connect?base=...`。设置页只有一个「扫码连接电脑」按钮，扫到哪类就办哪件事：登录码额外带 PIN 确认挑战码并授权网页（没 PIN 会现场问），连接码只探 `/api/health` 后保存地址。用户不需要二选一。
   - **失败提示**：一律走 `showConnectFailure` → `utils/connect-hint.js` 的 `failureTip()`，弹模态框给「结论 + 下一步」（toast 一行装不下原因），状态卡留一行结论。内部串（`HTTP 401`、`request:fail`）由该模块翻译，不许直出。
   - **取消不算失败**：`discover.scanRaw` 把 `scanCode:fail cancel` 标成 `error.cancelled`，设置页静默复位；停搜、取消设 PIN 同理。新增扫码入口别自己再包一层 `wx.scanCode`，否则取消又会被报成「扫码失败」。
3. **手动填地址**（最后手段）：地址在电脑端网页「连接小程序」里能看到，可复制。

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/health` | 健康检查（自动发现与扫码都用它验证候选地址） |
| GET | `/api/status` | 控制台总览（含 `network.connect_code`） |
| GET | `/api/connect-qr.png` | 连接二维码 PNG（编码首选局域网地址） |
| POST | `/api/devices/heartbeat` | 设备心跳 |
| POST | `/api/files/upload` | multipart 上传文件（小程序 → 电脑，进 `incoming/`） |
| POST | `/api/files/outgoing` | multipart 放入待取区（电脑 → 小程序，进 `outgoing/`） |
| GET | `/api/files` | 两边文件列表（`{incoming, outgoing}`） |
| POST | `/api/invoices/check` | 发送前查重（提交 `{number, code}`） |
| POST | `/api/invoices` | 小程序扫码结果写入台账（单批 ≤ 200 张） |
| POST | `/api/invoices/manual` | 网页手动录入单条（批次固定「手动录入」） |
| PUT | `/api/invoices/{id}` | 补录单张发票字段 |
| POST | `/api/invoices/purge` | 按录入时间清理（先预览再确认） |
| GET | `/api/invoices` | 台账列表（支持多条件筛选与 `sort`；同时是小程序台账页的唯一数据源） |
| POST | `/api/invoices/import` | CSV 导入（默认预览，`?confirm=1` 写入） |
| GET | `/api/invoices/export` | CSV 导出（支持 `ids=1,2,3` 与全部查询参数） |
| DELETE | `/api/invoices` | 按 id 批量删除 |
| DELETE | `/api/incoming` `/api/outgoing` | 批量删除（incoming 用 `{ids}`、outgoing 用 `{names}`，或 `{all:true}`） |
| POST | `/api/incoming/purge` `/api/outgoing/purge` | 按保留天数清理（`{days, confirm}`，先预览再确认） |
| GET | `/api/incoming/{id}/view` | 浏览器内预览（inline，仅 pdf/图片/纯文本白名单） |
| GET/DELETE | `/api/incoming/{id}` `/api/outgoing/{name}` | 文件下载与删除 |

- **单次发送上限 200 张**：小程序超限时先弹提示，用户选「只发前 200 张」或取消，不静默截断。
- **台账只传解析字段，不传原件**；原件走独立的传输页，两条链路互不影响。
- **文件双向**：`incoming/` 是小程序 → 电脑，`outgoing/` 是电脑 → 小程序，目录/接口/保留期完全对称。
  网页「发送到小程序」把文件**复制**进 `outgoing/`（源文件不动）；同名同内容判重、同名不同内容另存为 `名字 (2).ext`，不覆盖。
- **两个目录都保留 30 天**：电脑端启动时清一次、之后每 6 小时清一次（`-keep-days` 可改，≤0 关闭自动清理）；小程序端发送历史同样按 30 天裁剪。两端都可手动清理。
- **电脑端预览是白名单**：`files/preview.go` 的 `PreviewKind` 决定 `/api/incoming/{id}/view` 能不能 inline。
  文本一律 `text/plain` + `nosniff`，`.html` / `.svg` 故意不在白名单里——预览响应与网页同源，按 HTML 渲染等于开 XSS 口子。
- **小程序取文件的落地方式只有两种**：`wx.shareFileMessage` 转发到聊天（任何格式）和 `wx.openDocument` 预览（pdf/doc/docx/xls/xlsx/ppt/pptx）。OFD/XML/ZIP 不给「预览」，别给用户一个点了必然失败的入口。
- **`duplicates` / `duplicate_groups` 按全量计算**，不受 `keyword` 等筛选影响；`items` / `total` / `need_fill` 才是筛选后的结果；`latest_batch` / `latest_created_at` 同样是全表口径。
- **列表查询参数**：`number` / `code` / `kind` / `reimburser` / `keyword` / `batch` / `date_from` / `date_to`（开票日期）/ `created_from` / `created_to`（录入时间，按 `created_at` 的日期部分比较）/ `amount_min` / `amount_max` / `only_duplicates` / `only_need_fill` / `sort`。电脑端网页已不用 `keyword` 和 `batch`（改由 `created_from` / `created_to` 筛），但**后端保留这两个参数**——小程序批量发送后仍用 `batch=批次号` 收敛「只看刚发的那批」。
- **导出前必须先标记重复**：`Export` 若只 `markNeedFill` 不 `markDuplicates`，`only_duplicates` 会导出一张只剩表头的空表（2026-11-18 修复，有回归测试守着）。

---

## 9. 测试体系

- **小程序 23 套 / 732 项检查**（Node 直接跑，模拟 `wx` API 与内存 FS）：
  `lanservice 69`（含探活：认 /api/health、不带 PIN 头、没地址不发请求）、`einvoice 60`、`list 53`、`settings 48`（失败统一弹模态框说原因和下一步、取消静默、两种二维码合并入口）、`transfer 41`、`draft 36`、`discover 34`（多网卡/无效 IP 过滤、找到但连不上与没找到分开提示、扫码取消标记 cancelled）、`ledger 38`（含 `latest_created_at` 取日期部分、列表时间精简格式、批次参数拼装与清空）、`collect 31`、`filesend 31`、`filetake 29`、`scanbatch 27`、`auth 22`（PIN 存储、登录码解析、登录确认接口、改 PIN）、`connect-hint 59`（失败文案归类：原因判对、401/request:fail 不漏给用户、判断顺序不误判）、`invoicesend 18`、`zip 14`、`selection 13`、`collect-page 12`（收票页四卡结构、bindtap 与方法一一对应、冗余入口不回归、导入/归档文案区分）、`conn-bar 32`（状态条组件四件套、全局注册、四个页面挂载、详情与设置页不挂、旧徽标不许回来、导出页不再「存过地址就当连上」）、`collect-status 18`（收票页状态机：没配地址说未连接、请求失败说连不上并给连接入口、同步成功才说已连接、中途断线立刻改口且张数清零）、`list-layout 23`（台账页三层结构、概览不留四等分统计条、最近录入降级为 pill、列表项不放 12 位代码、空态一键去收票）、`collect-send 12`（发送弹窗查看这批票：确认跳转、稍后不跳、无批次单按钮）、`fsx 11`。
- **电脑端网页 12 套 / 290 项检查**（`vm.runInThisContext` + 假 DOM / 假 XHR，直接加载 `desktop/web/*.js`）：
  `invoice-row 25`（台账行渲染：9 列、不再有批次列、录入时间拆行、标移到号码下面、转义与空列表）、`preview 25`（预览弹层：打开、关闭、不可预览格式只提示、文本转义与体积上限）、`ledger-render 23`（选中合计金额按分累加）、`events 24`（事件类型中文标签，含扫描后端 `MarkEvent` 校验无遗漏；事件时间必须是北京时间）、`reimburser-fill 49`（粘贴解析、建议池去重与按出现次数排序（常用的排前、筛选后不缩水、无筛选时按全量重建让改名后的旧值消失）、复制按钮有无、批量填报销人走页面内模态框：打开/取消/提交/留空清空、开票日期用原生日期选择器：旧格式归一成 ISO、认不出的脏值保存时原样保留不被抹掉）、`suggest 42`（自绘历史值浮层：聚焦展开、打字过滤、最多 8 条、上下键 + 回车选值、Esc 只收浮层、选完补发 change、数据刷新同步、浮层自身滚动不收起、刚填过的置顶、超过 8 条时给出「共 N 位」总数提示）、`stat-filter 21`（统计卡片与筛选面板双向同步、最近录入按日期筛并取全表口径）、`upload-progress 14`（批量上传回调下标从 0 起，一个文件只占一行）、`logout 10`（退出按钮绑定、POST logout、重载回登录态、失败提示）、`script-order 4`（按 index.html 顺序加载全部脚本，防顶层声明冲突把 render.js 整份搞挂）、`filter-panel 31`（查询参数拼装、不再发送 keyword/batch、重置与计数、colgroup/表头/行三处列数一致、表头必须跟随列内容对齐：文字列左、金额和操作右，不许改回统一居中；操作列与金额列一样补 14px 右内边距）、`time-format 22`（UTC 串统一换北京时间、带偏移按绝对时刻算、本地文本不二次 +8、系统时区改成 UTC 后结果不变）。
- **电脑端**：Go 标准测试分布在 `internal/api`、`internal/files`、`internal/ledger`、`internal/registry`、`internal/discovery` 各包内。
- 起服务冒烟：启动 `go run .` 后 `curl /api/health`、`/api/connect-qr.png` 应返回 200；台账接收/补录/手动录入/清理/导出接口应返回 200。

---

## 10. 当前状态与已知限制

**已完成里程碑**：M0 技术验证（真机全通过）→ M1 本地数据层 → M2 扫码 → M3 文件导入 → M5 导出 → P0（tabBar/分类/待复核）→ 批量扫码与导出优化 → 台账清理 → 仓库分层 → 电脑端最小文件服务 → 控制台 v0.2 → 电脑台账 v1 → 扫码结果发送台账 → 补录/按录入时间清理 → 地址自动发现 → 界面重排与行内补录 → 字段精简加报销人 → 原件传输页 → 判重口径统一 + 扫码连接 → 传输中心 → **电脑端成为唯一数据源（小程序去本地台账、去分类、去手动录入，导出改从电脑端下载）** → **文件双向传输（网页发送到小程序、小程序从电脑取）**。

**已知限制 / 待真机验收**：

- 扫码连接需真机验证（安卓、iOS 都应可用）；二维码编码的是电脑端**首选**网卡地址，若手机不在同一网段，改用网页上列出的其它地址手填。
- mDNS 自动发现仍需在安卓真机 + 同一 WiFi 验收；Windows 首次可能要在防火墙放行 UDP 5353。沙箱环境无法完成端到端 mDNS 验证。
- 电脑端无 token，仅可信局域网自用。
- **小程序完全依赖电脑端**：电脑不开机/不在同一网段时，台账页、导出、甚至扫码发送都不可用（扫码能解析，但发不出去）。这是「不做本地存储」的直接代价。
- **未发送的草稿会丢**：扫码中途退出小程序、或发送失败，这批草稿需要重扫。发送失败时的提示已明确说明这一点。
- 小程序导出依赖 `wx.downloadFile` 访问局域网 HTTP 地址，和 request 一样属于「不校验合法域名」的自用场景；真机需确认非 HTTPS 下 downloadFile 不被拦。
- 小程序详情页数据来自台账页同步的内存镜像，直接从别处跳进来时会先补拉一次；电脑端无单条查询接口。
- 30 天保留是**时间**口径，不是容量口径：一次传几千张仍会占满磁盘，暂无限额。
- 传输页两栏删除范围不同：删「我的上传」只清小程序本地历史（电脑端已收文件不动）；删「电脑已收」才真正删电脑磁盘文件。页脚有说明，但仍需真机确认用户不会误读。

**详细踩坑与决策**：见 `docs/spike.md`、`docs/miniprogram-plan.md` §5/§7/§8、`README-M0.md` §6。
