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
│   ├── app.js/.json/.wxss      # 全局；onLaunch 初始化 store + 心跳 + 自动发现
│   ├── pages/                  # 10 个页面，每个必须有 .js/.json/.wxml（缺 .json 会白屏）
│   └── utils/                  # 全部业务逻辑，页面只做数据组装与事件转发
├── desktop/                    # 电脑端 Go 服务 + 本地网页（台账）
│   ├── main.go                 # 入口：启动 HTTP 服务 + mDNS 广播
│   ├── go.mod / go.sum         # 依赖：grandcat/zeroconf（mDNS）、skip2/go-qrcode（连接二维码）
│   ├── internal/               # api / config / discovery / files / ledger / registry
│   ├── web/                    # 纯 HTML/CSS/JS，由 embed 嵌入二进制
│   ├── data/                   # 运行时数据，不提交 Git（保留 .gitkeep）
│   └── README.md
├── shared/protocol.md          # 两端通信协议（当前 v0.7）
├── test/
│   ├── miniprogram/            # 小程序 Node 回归测试（15 套 / 439 项检查）
│   ├── desktop/                # 电脑端联调预留（Go 单测在 desktop/internal 各包内）
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
# 环境变量：INVOICE_ADDR / INVOICE_DATA_DIR
```

**回归测试**（改动后必跑）：

```bash
# 小程序 15 套，共 439 项检查
for f in test/miniprogram/*.test.js; do node "$f" || exit 1; done

# 电脑端
cd desktop
go test ./...
go vet ./...
```

---

## 4. 强制约定（务必遵守）

1. **每次修改代码后必须提交 Git**：测试通过后立即 `git add` + `git commit`，写清楚改了什么；出错可回溯。不要攒着一次性提交。提交后推送 `main`。
2. **代码要优美**：单文件超过约 200 行考虑拆分，单函数超过约 40 行考虑拆分。
3. **页面只做数据组装和事件转发**，业务逻辑放 `miniprogram/utils/`；数据访问统一走 `utils/store.js`。
4. **重复逻辑抽成共用函数**，不在多个文件复制粘贴；命名能看出用途；注释只写「为什么」。
5. **每个小程序页面必须有 `.js` / `.json` / `.wxml` 三件套**，缺 `.json` 会白屏（踩过）。
6. **判重口径改动必须两端同步**：`miniprogram/utils/store.js` 的 `dedupeKey` 与 `desktop/internal/ledger/identity.go` 的 `identityKey` 是同一套规则，只改一边就是埋雷。
7. 已知历史债：`utils/store.js`（512 行）、`utils/einvoice.js`（434 行）偏长，是早期快速验证产物。触碰时顺手拆，不要继续堆逻辑。

> 项目约定另记录在 `.workbuddy/memory/MEMORY.md`（不进 Git），每日工作日志在 `.workbuddy/memory/YYYY-MM-DD.md`。

---

## 5. 核心数据模型

### 发票字段（电脑端 CSV 8 列）

```text
发票号码,发票代码,票种,开票日期,价税合计,报销人,录入批次,录入时间
```

- 读取按**表头名**定位列，所以旧版 12/14 列 CSV 仍能打开，缺的列按空值处理；写入一律 8 列（UTF-8 BOM，Excel 直接开）。
- 金额是**普通元字符串**（如 `"147.00"`）；小程序内部用**整数分**存储，显示层除 100。
- 每次写入（接收/导入/补录/清理）前自动备份上一版到 `desktop/data/backup/`。

### 小程序台账记录（`invoices/ledger/YYYY-MM.json`）

除 8 个票面字段外，还保留解析期的结构：`items[]`（明细行）、`meta`（签名算法、销方详情等原始解析结果）、`category`、`source`、`confidence`、`anomaly[]`、`files[]`、`raw_qr`。
这些只给详情页展示与排障用，**不参与导出，也不发给电脑端**。

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
sort  = created | issued | number | reimburser   // 默认 created（录入时间倒序）
basis = created | issued                        // 仅小程序「归月口径」，默认 created
```

- 电脑端 `sort` 通过 `/api/invoices?sort=` 传；小程序偏好存本地 Storage（`ledger_sort`）。
- 报销人排序时空值排最后，方便先看已填写的。
- 小程序物理分片固定按**开票日期**；`basis=created` 只是展示口径变化，会全量读入再按 `created_at` 过滤。

### 二维码能力边界（真机实测，不可违背）

- 数电票二维码是**明文逗号串**：`01,31,,26932000001877489821,10500.00,20261110,,277D`
- **能拿到**：发票号码、价税合计、开票日期。
- **拿不到**：销方名称、税号、税额、税率、明细、税务签名——必须从 XML/OFD 原件取。
- **CRC 非标准**：枚举 70 组 CRC-16 变体均未命中，只保留 `crcDeclared`，**不做校验**，不得把 CRC 不匹配当异常。
- 解析分级：L1 XML（字段最全）> L2 OFD（ZIP+XML，端侧不解压，只存档）> L3 PDF（只存不解析）> L4 二维码（草稿）。OCR 已砍。

---

## 6. 小程序端模块地图

### 页面（`pages/`，首页为收票页）

| 页面 | 职责 |
|---|---|
| `collect` | **首页**。扫码/批量连续扫码/文件导入/手动入口，完成后询问是否发送电脑台账 |
| `list` | 台账列表，长按删除、跳转详情/编辑 |
| `settings` | 排序与归月口径、桌面端连接（自动搜索/扫码/手填）、数据备份、关于 |
| `detail` / `edit` | 发票详情 / 手动录入编辑 |
| `export` | 台账 CSV / 原件清单 / 原件转发；默认范围=本次扫码，支持自定义 |
| `manage` | 台账清理：勾选删除、按导入时间区间删除 |
| `review` | 待复核清单 |
| `transfer` | **传输中心**：上传原件（会话文件 / 台账已存），分「我的上传」「电脑已收」两段查看记录，支持勾选删除、全部删除、清理超 30 天 |
| `index` | M0 技术验证页（保留） |

> 统计页已下线（2026-11-18），tabBar 由「统计」换成「传输」；`utils/stats.js` 一并删除。

### 工具（`utils/`，按职责拆分）

- `einvoice.js`：XML 树 + 完整路径取值、标签 dump、二维码解析（最长，历史债）。
- `store.js`：本地台账持久化，按月分片 `ledger/YYYY-MM.json` + `index.json`，原件在 `files/`（历史债）。
  索引带 `INDEX_VERSION`，结构变更时递增即自动重建，旧数据不用手工迁移。
- `collect.js` / `scanbatch.js`：扫码与文件导入 / 批量连续扫码（扫到取消、每 10 张确认、重复当场弹窗）。
- `batch.js` / `batchmark.js`：批量落库与来源升级合并 / 记住最后一次批次。
- `archive.js` / `fsx.js` / `zip.js`：原件复制与摘要 / 私有目录读写与 30 天 TTL 清理 / ZIP-OFD 结构探测。
- `csv.js` / `export.js` / `exportsel.js` / `exportflow.js`：CSV 拼装、导出范围与内容选择、逐个转发。
- `category.js` / `labels.js` / `review.js` / `purge.js`：分类预填、文案枚举、待复核原因、清理筛选。
- `lanservice.js`：桌面端地址/心跳/查重/发送/上传。
- `filesend.js`：原件上传（微信会话 / 台账已存），本地留 100 条发送历史，单文件 20MB、单次 20 个；
  发送记录与电脑端副本都只保留 **30 天**，`purgeOldHistory()` 在页面打开时顺手清超期记录。
- `invoicesend.js`：扫码草稿转电脑台账字段、重复确认、**200 张上限提示**。
- `discover.js`：三级连接——mDNS 自动发现（安卓）→ 解析电脑网页二维码 → 手填地址兜底。

---

## 7. 电脑端模块地图

### Go 包（`desktop/internal/`）

| 包 | 职责 |
|---|---|
| `api` | 全部 HTTP 路由、请求校验、JSON 响应；`network.go` 优选 WLAN/以太网、过滤虚拟网卡；`connect.go` 生成扫码连接串与二维码 PNG |
| `config` | `-addr` / `-data` / `-keep-days` 与环境变量，默认 `:8765` / `data` / `30` |
| `discovery` | mDNS 广播 `_http._tcp.`，实例名 `invoice-helper-desktop` |
| `files` | 文件传输数据层，SHA256+大小去重，单文件上限 20MB；`purge.go` 负责按保留期/按 id/清空三种删除 |
| `ledger` | 发票台账：CSV 读写、备份、判重、搜索、导入导出、补录、按录入时间清理；`identity.go` 定义判重键 |
| `registry` | 设备心跳与事件注册表；45 秒窗口判断在线 |

### 网页（`desktop/web/`，embed 嵌入）

- `index.html`：控制台 + 发票台账两个 tab。
- `app.js` / `render.js` / `api.js`：控制台（状态、连接二维码与地址、设备、文件、事件）。
- `ledger-app.js` / `ledger-render.js` / `ledger-api.js`：台账（搜索、排序、筛选、导入、补录、行内改报销人、清理、重复抽屉、导出、号码点击复制）。

### 数据目录（`desktop/data/`，不提交）

```text
incoming/       小程序上传的文件
outgoing/       电脑提供给小程序下载的文件
backup/         发票台账历史备份
invoices.csv    发票台账主文件
index.json      上传记录索引
registry.json   设备与事件记录
```

---

## 8. 通信协议（v0.7，详见 shared/protocol.md）

- 基础：`http://电脑IPv4:8765`，局域网直连，不要求 HTTPS/合法域名，无 token（仅可信局域网自用）。
- 心跳：小程序每 20 秒 `POST /api/devices/heartbeat`，电脑 45 秒窗口判在线。

### 连接策略（三级，按优先级）

1. **mDNS 自动发现**（仅安卓）：`_http._tcp.local.`，逐个 `/api/health` 验证取第一个可用地址。首次启动自动搜一次，失败后 10 分钟不重试。iOS 微信 7.0.18+ 不支持，直接跳过这一级。
2. **扫码连接**（兜底主力，安卓/iOS 都可用）：电脑端网页展示二维码，内容为 `invoice-helper://connect?base=<urlencode 后的地址>`；小程序扫码解析后先探 `/api/health`，通了才保存。
3. **手动填地址**（最后手段）：地址在电脑端网页「连接小程序」里能看到，可复制。

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/health` | 健康检查（自动发现与扫码都用它验证候选地址） |
| GET | `/api/status` | 控制台总览（含 `network.connect_code`） |
| GET | `/api/connect-qr.png` | 连接二维码 PNG（编码首选局域网地址） |
| POST | `/api/devices/heartbeat` | 设备心跳 |
| POST | `/api/files/upload` | multipart 上传文件 |
| GET | `/api/files` | 文件列表 |
| POST | `/api/invoices/check` | 发送前查重（提交 `{number, code}`） |
| POST | `/api/invoices` | 小程序扫码结果写入台账（单批 ≤ 200 张） |
| PUT | `/api/invoices/{id}` | 补录单张发票字段 |
| POST | `/api/invoices/purge` | 按录入时间清理（先预览再确认） |
| GET | `/api/invoices` | 台账列表（支持多条件筛选与 `sort`） |
| POST | `/api/invoices/import` | CSV 导入（默认预览，`?confirm=1` 写入） |
| GET | `/api/invoices/export` | CSV 导出（支持 `ids=1,2,3`） |
| DELETE | `/api/invoices` | 按 id 批量删除 |
| DELETE | `/api/incoming` | 批量删接收文件（`{ids:[...]}` 指定，`{all:true}` 清空） |
| POST | `/api/incoming/purge` | 按保留天数清理接收文件（`{days, confirm}`，先预览再确认） |
| GET/DELETE | `/api/incoming/{id}` `/api/outgoing/{name}` | 文件下载与删除 |

- **单次发送上限 200 张**：小程序超限时先弹提示，用户选「只发前 200 张」或取消，不静默截断。
- **台账只传解析字段，不传原件**；原件走独立的传输页（`/api/files/upload`），两条链路互不影响。
- **接收文件保留 30 天**：电脑端启动时清一次、之后每 6 小时清一次（`-keep-days` 可改，≤0 关闭自动清理）；小程序端发送历史同样按 30 天裁剪。两端都可手动清理。

---

## 9. 测试体系

- **小程序 15 套 / 439 项检查**（Node 直接跑，模拟 `wx` API 与内存 FS）：
  `einvoice 60`、`store 82`、`collect 35`、`lanservice 35`、`filesend 33`、`export 28`、`scanbatch 27`、`p0 22`、`transfer 21`、`discover 21`、`exportsel 19`、`invoicesend 17`、`purge 14`、`zip 14`、`fsx 11`。
- **电脑端**：Go 标准测试分布在 `internal/api`、`internal/files`、`internal/ledger`、`internal/registry`、`internal/discovery` 各包内。
- 起服务冒烟：启动 `go run .` 后 `curl /api/health`、`/api/connect-qr.png` 应返回 200；台账接收/补录/清理接口应返回 200。

---

## 10. 当前状态与已知限制

**已完成里程碑**：M0 技术验证（真机全通过）→ M1 本地数据层 → M2 扫码 → M3 文件导入 → M5 导出 → P0（tabBar/分类/待复核）→ 批量扫码与导出优化 → 台账清理 → 仓库分层 → 电脑端最小文件服务 → 控制台 v0.2 → 电脑台账 v1 → 扫码结果发送台账 → 补录/按录入时间清理 → 地址自动发现 → 界面重排与行内补录 → 字段精简加报销人 → 原件传输页 → 判重口径统一 + 扫码连接 → 传输中心（统计页下线，30 天保留 + 手动/全部/自定义清理）。

**已知限制 / 待真机验收**：

- 扫码连接需真机验证（安卓、iOS 都应可用）；二维码编码的是电脑端**首选**网卡地址，若手机不在同一网段，改用网页上列出的其它地址手填。
- mDNS 自动发现仍需在安卓真机 + 同一 WiFi 验收；Windows 首次可能要在防火墙放行 UDP 5353。沙箱环境无法完成端到端 mDNS 验证。
- 电脑端无 token，仅可信局域网自用。
- 小程序扫码草稿只有号码/日期/金额，写入台账后需人工补报销人；电脑端可在台账页点报销人单元格直接改。
- 小程序导出 CSV 是 8 列 + 「来源」共 9 列；电脑台账 8 列（设计差异，非 bug）。
- 「清理台账」入口目前在台账页，未加到收票页（用户尚未确认是否要加）。
- 30 天保留是**时间**口径，不是容量口径：一次传几千张仍会占满磁盘，暂无限额。
- 传输页两栏删除范围不同：删「我的上传」只清小程序本地历史（电脑端已收文件不动）；删「电脑已收」才真正删电脑磁盘文件。页脚有说明，但仍需真机确认用户不会误读。

**详细踩坑与决策**：见 `docs/spike.md`、`docs/miniprogram-plan.md` §5/§7/§8、`README-M0.md` §6。
