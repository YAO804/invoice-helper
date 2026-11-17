# AGENT.md · 项目交接与协作约定

> 本文件面向接手本项目的开发者与 AI Agent，记录「这个项目是什么、怎么组织、怎么跑、有哪些坑」。
> 遇到问题先读这里，再读 `README-M0.md`（总说明）、`docs/`（需求与计划）、`shared/protocol.md`（通信协议）。

---

## 1. 项目定位与边界

**一句话**：个人自用的电子发票辅助归集工具——把文件收好、把字段抠出来、把台账记上。

- **产品形态**：微信小程序（采集端）+ 电脑端本地服务与网页（台账端）。手机扫码/导票，结果发送到同一局域网的电脑归档。
- **名字**：攒票小匣。正式 AppID `wxebcb963f266bfdee`（测试号 `wx2b204ff465b4935c` 已弃用）。
- **只做**：信息采集辅助、本地归档、CSV 台账、重复提醒、补录清理。
- **不做**：自动查验、真伪判断、对外提供服务。发票真伪以国家税务总局查验平台结果为准。
- **不上传云端**：数据默认只在手机私有目录；发送给电脑时走局域网直连，不上公网。
- **使用范围**：个人自用 + 同事批量扫码场景，不上线发布，走体验版。

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
│   ├── go.mod / go.sum         # 唯一第三方依赖：github.com/grandcat/zeroconf（mDNS）
│   ├── internal/               # api / config / discovery / files / ledger / registry
│   ├── web/                    # 纯 HTML/CSS/JS，由 embed 嵌入二进制
│   ├── data/                   # 运行时数据，不提交 Git（保留 .gitkeep）
│   └── README.md
├── shared/protocol.md          # 两端通信协议（当前 v0.5）
├── test/
│   ├── miniprogram/            # 小程序 Node 回归测试（13 套）
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
# 小程序 13 套，共 348 项断言
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
6. 已知历史债：`utils/einvoice.js`（434 行）、`utils/store.js`（495 行）偏长，是早期快速验证产物。触碰时顺手拆，不要继续堆逻辑。

> 项目约定另记录在 `.workbuddy/memory/MEMORY.md`（不进 Git），每日工作日志在 `.workbuddy/memory/YYYY-MM-DD.md`。

---

## 5. 核心数据模型

### 发票字段（电脑端 CSV 14 列）

```text
发票号码,发票代码,票种,开票日期,销方名称,销方税号,买方名称,买方税号,
不含税金额,税额,价税合计,税率,录入批次,录入时间
```

- 兼容旧版 12 列；缺批次/录入时间时自动生成。
- 金额是**普通元字符串**（如 `"147.00"`）；小程序内部用**整数分**存储，显示层除 100。
- 每次写入（接收/导入/补录/清理）前自动备份上一版到 `desktop/data/backup/`。

### 关键口径

```js
// 小程序本地判重键
dedupeKey = 发票号码 | 开票日期 | 价税合计(分)

// 电脑端判重：发票号码相同即为重复（重复也写入并高亮，由用户自行删除，不自动删）

// 来源质量分级：低质量草稿不挡高质量原件
SOURCE_RANK = { qr: 1, pdf: 2, manual: 2, ofd: 3, xml: 4 }

// 整理（筛选）口径
created  // 默认按导入时间；可切 issue_date（开票日期），偏好存 ledger_basis
```

### 二维码能力边界（真机实测，不可违背）

- 数电票二维码是**明文逗号串**：`01,31,,26932000001877489821,10500.00,20261110,,277D`
- **能拿到**：发票号码、价税合计、开票日期。
- **拿不到**：销方名称、税号、税额、税率、明细、税务签名——必须从 XML/OFD 原件取。
- **CRC 非标准**：枚举 70 组 CRC-16 变体均未命中，只保留 `crcDeclared`，**不做校验**，不得把 CRC 不匹配当异常。
- 解析分级：L1 XML（字段最全）> L2 OFD（ZIP+XML）> L3 PDF（只存不解析）> L4 二维码（草稿）。OCR 已砍。

---

## 6. 小程序端模块地图

### 页面（`pages/`，首页为收票页）

| 页面 | 职责 |
|---|---|
| `collect` | **首页**。扫码/批量连续扫码/文件导入/手动入口，完成后询问是否发送电脑台账 |
| `list` | 台账列表，长按删除、跳转详情/编辑 |
| `stats` | 统计（分类、来源、月份） |
| `settings` | 排序口径、桌面端连接（手动地址 + 自动搜索）、数据备份、关于 |
| `detail` / `edit` | 发票详情 / 手动录入编辑 |
| `export` | 台账 CSV / 原件清单 / 原件转发；默认范围=本次扫码，支持自定义 |
| `manage` | 台账清理：勾选删除、按导入时间区间删除 |
| `review` | 待复核清单 |
| `index` | M0 技术验证页（保留） |

### 工具（`utils/`，按职责拆分）

- `einvoice.js`：XML 树 + 完整路径取值、标签 dump、二维码解析（最长，历史债）。
- `store.js`：本地台账持久化，按月分片 `ledger/YYYY-MM.json` + `index.json`，原件在 `files/`（历史债）。
- `collect.js` / `scanbatch.js`：扫码与文件导入 / 批量连续扫码（扫到取消、每 10 张确认、重复当场弹窗）。
- `batch.js` / `batchmark.js`：批量落库与来源升级合并 / 记住最后一次批次。
- `archive.js` / `fsx.js` / `zip.js`：原件复制与摘要 / 私有目录读写与 30 天 TTL 清理 / ZIP-OFD 结构探测。
- `csv.js` / `export.js` / `exportsel.js` / `exportflow.js`：CSV 拼装、导出范围与内容选择、逐个转发。
- `category.js` / `labels.js` / `stats.js` / `review.js` / `purge.js`：分类预填、文案枚举、统计聚合、待复核原因、清理筛选。
- `lanservice.js`：桌面端地址/心跳/查重/发送。
- `invoicesend.js`：扫码草稿转电脑台账字段、重复确认、**200 张上限提示**。
- `discover.js`：mDNS 自动发现电脑地址（安卓），逐个 `/api/health` 验证取第一个可用地址。

---

## 7. 电脑端模块地图

### Go 包（`desktop/internal/`）

| 包 | 职责 |
|---|---|
| `api` | 全部 HTTP 路由、请求校验、JSON 响应；`network.go` 优选 WLAN/以太网、过滤虚拟网卡 |
| `config` | `-addr` / `-data` 与环境变量，默认 `:8765` / `data` |
| `discovery` | mDNS 广播 `_http._tcp.`，实例名 `invoice-helper-desktop` |
| `files` | 文件传输数据层，SHA256+大小去重，单文件上限 20MB |
| `ledger` | 发票台账：CSV 读写、备份、判重、搜索、导入导出、补录、按录入时间清理 |
| `registry` | 设备心跳与事件注册表；45 秒窗口判断在线 |

### 网页（`desktop/web/`，embed 嵌入）

- `index.html`：控制台 + 发票台账两个 tab。
- `app.js` / `render.js` / `api.js`：控制台（状态、地址、设备、文件、事件）。
- `ledger-app.js` / `ledger-render.js` / `ledger-api.js`：台账（搜索、导入、补录、清理、重复抽屉、导出）。

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

## 8. 通信协议（v0.5，详见 shared/protocol.md）

- 基础：`http://电脑IPv4:8765`，局域网直连，不要求 HTTPS/合法域名，无 token（仅可信局域网自用）。
- 心跳：小程序每 20 秒 `POST /api/devices/heartbeat`，电脑 45 秒窗口判在线。
- 自动发现：mDNS `_http._tcp.local.`；iOS 微信 7.0.18+ 不支持，手动填地址兜底；首次启动自动搜一次，失败后 10 分钟不重试。

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/health` | 健康检查（自动发现也用它验证候选地址） |
| GET | `/api/status` | 控制台总览 |
| POST | `/api/devices/heartbeat` | 设备心跳 |
| POST | `/api/files/upload` | multipart 上传文件 |
| GET | `/api/files` | 文件列表 |
| POST | `/api/invoices/check` | 发送前按号码查重 |
| POST | `/api/invoices` | 小程序扫码结果写入台账（单批 ≤ 200 张） |
| PUT | `/api/invoices/{id}` | 补录单张发票字段 |
| POST | `/api/invoices/purge` | 按录入时间清理（先预览再确认） |
| GET | `/api/invoices` | 台账列表（支持多条件筛选） |
| POST | `/api/invoices/import` | CSV 导入（默认预览，`?confirm=1` 写入） |
| GET | `/api/invoices/export` | CSV 导出（支持 `ids=1,2,3`） |
| DELETE | `/api/invoices` | 按 id 批量删除 |
| GET/DELETE | `/api/incoming/{id}` `/api/outgoing/{name}` | 文件下载与删除 |

- **单次发送上限 200 张**：小程序超限时先弹提示，用户选「只发前 200 张」或取消，不静默截断。
- **只传解析字段**，不传 PDF/OFD/XML 原件。

---

## 9. 测试体系

- **小程序 13 套 / 348 项断言**（Node 直接跑，模拟 `wx` API 与内存 FS）：
  `einvoice 60`、`store 72`、`collect 35`、`export 30`、`p0 28`、`scanbatch 27`、`exportsel 19`、`invoicesend 16`、`lanservice 15`、`purge 14`、`zip 14`、`fsx 11`、`discover 7`。
- **电脑端**：Go 标准测试分布在 `internal/api`、`internal/files`、`internal/ledger`、`internal/registry`、`internal/discovery` 各包内。
- 起服务冒烟：启动 `go run .` 后 `curl /api/health`、台账接收/补录/清理接口应返回 200。

---

## 10. 当前状态与已知限制

**已完成里程碑**：M0 技术验证（真机全通过）→ M1 本地数据层 → M2 扫码 → M3 文件导入 → M5 导出 → P0（tabBar/分类/待复核）→ 批量扫码与导出优化 → 台账清理 → 仓库分层 → 电脑端最小文件服务 → 控制台 v0.2 → 电脑台账 v1 → 扫码结果发送台账 → 补录/按录入时间清理 → 地址自动发现。

**已知限制 / 待真机验收**：

- mDNS 自动发现需在安卓真机 + 同一 WiFi 验收；Windows 首次可能要在防火墙放行 UDP 5353。沙箱环境无法完成端到端 mDNS 验证。
- iOS 微信 7.0.18+ 不支持 mDNS，只能手动填地址。
- 电脑端无 token，仅可信局域网自用。
- 小程序扫码草稿字段有限，写入台账后需人工补录销方、税额等。
- 小程序与电脑两份 CSV 口径不同：小程序导出 13 列带「来源」，电脑台账 14 列带「批次/录入时间」（设计差异，非 bug）。
- 「清理台账」入口目前在台账页，未加到收票页（用户尚未确认是否要加）。

**详细踩坑与决策**：见 `docs/spike.md`、`docs/miniprogram-plan.md` §5/§7/§8、`README-M0.md` §6。
