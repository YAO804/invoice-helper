# 小程序与桌面端通信协议 v0.9

## 基础约定

- 电脑端默认监听 `:8765`。
- 手机与电脑在同一局域网时，小程序访问：
  ```text
  http://电脑IPv4:8765
  ```
- 当前版本不要求 HTTPS，也不校验小程序 request 合法域名。
- 当前版本没有 token，只允许在可信局域网内自用。
- 小程序打开时每 20 秒上报一次心跳；桌面端按 45 秒窗口判断在线。
  小程序每次启动、保存新地址（扫码/自动发现）后都会**立刻补报一拍**，不等下一个 20 秒周期；
  桌面端网页据此刷新状态（未连接 2 秒一次，连上后 5 秒一次）。

## 职责划分（v0.8 起）

**台账只有一份，在电脑上。** 小程序不保存任何发票数据：

- 列表、筛选、排序、重复判定全部由电脑端算完再返回（`GET /api/invoices`）；
- 扫码/导入得到的草稿只存在内存里，发送成功即丢，退出小程序也会丢；
- 增删改（手动录入、补录、删除、导入 CSV）只在电脑端网页做；
- 小程序连不上电脑时，台账页只能显示「未连接」，没有离线数据可看。

这样做的代价是离线不可用，换来的是不需要两端对账——不存在「手机上改了电脑不知道」的状态。

## 电脑地址连接（三级，按优先级）

### 一级：mDNS 自动发现（仅安卓）

桌面端启动时注册 mDNS 服务：

```text
实例名: invoice-helper-desktop
服务类型: _http._tcp.
域名: local.
TXT: app=攒票小匣, version=1.0.0
```

小程序安卓端用 `wx.startLocalServiceDiscovery({serviceType: '_http._tcp.'})` 搜索，
`wx.onLocalServiceFound` 返回 `ip` 和 `port`。小程序逐个请求 `/api/health` 验证，
取第一个可达地址作为 `http://IP:PORT`。搜索会在找到后停止，微信最长运行 30 秒。

同一时间只能有一个 mDNS 扫描任务，重复 `start` 会报 `scan task already exist`；
小程序侧用模块级互斥 + 失败自愈（先 `stop` 再重试一次）兜住。

iOS 微信 7.0.18 及以上不支持 mDNS，直接跳过这一级。
小程序首次启动且未配置地址时会自动尝试一次；失败后 10 分钟内不再重试。

### 二级：扫码连接（安卓 / iOS 都可用）

电脑端网页「连接小程序」卡片展示连接二维码，由 `GET /api/connect-qr.png` 生成。

二维码内容：

```text
invoice-helper://connect?base=<urlencode 后的电脑地址>
```

例：`invoice-helper://connect?base=http%3A%2F%2F192.168.1.20%3A8765`

小程序 `wx.scanCode` 扫描后：

1. 解析 `base` 参数并 `decodeURIComponent`；也接受内容直接就是 `http://ip:port` 的二维码。
2. 请求该地址的 `/api/health`，返回 200 且 `ok=true` 才保存。
3. 保存后立即启动心跳。

不是上述两种格式的二维码一律拒绝，不猜测地址。
二维码编码的是电脑端**首选**网卡地址（优选 WLAN/以太网，过滤虚拟网卡），
若手机不在同一网段，改用手动填写网页上列出的其它地址。

### 三级：手动填地址（最后手段）

在电脑端网页「连接小程序」卡片复制任一地址，填进小程序「设置 → 桌面端连接」。

## GET /api/health

检查桌面端服务本身是否可达。

响应：

```json
{
  "ok": true,
  "name": "invoice-helper-desktop",
  "version": "0.3.0"
}
```

## GET /api/connect-qr.png

返回连接二维码 PNG（`Content-Type: image/png`，320×320）。
编码内容与 `GET /api/status` 的 `network.connect_code` 一致。

未检测到局域网地址时返回 `503` 与纯文本提示。

## POST /api/devices/heartbeat

小程序上报在线状态。

请求：

```json
{
  "device_id": "mp-1763360000000-12345",
  "name": "攒票小匣小程序",
  "version": "1.0.0"
}
```

## GET /api/status

桌面端控制台总览。

响应包含：

```json
{
  "service": {},
  "network": {},
  "mini_program": {},
  "stats": {},
  "events": []
}
```

`network.primary_url` 是首选地址，`network.addresses` 给出检测到的全部局域网地址，
`network.connect_code` 是扫码用的连接串。

`mini_program.online` 表示最近 45 秒内是否收到小程序心跳。
`events` 是最近 80 条事件。

## 文件传输接口

文件是双向的：小程序 → 电脑进 `incoming/`，电脑 → 小程序进 `outgoing/`。
两边的目录、接口、保留期都对称，客户端不用记两套规则。

```text
POST   /api/files/upload           小程序 → 电脑（进 incoming/）
POST   /api/files/outgoing         电脑 → 小程序（进 outgoing/，网页「发送到小程序」用）
GET    /api/files                  两边列表一起返回 {incoming, outgoing}
GET    /api/incoming/{id}/download 取回小程序传上来的原件（attachment，浏览器直接下载）
GET    /api/incoming/{id}/view     在浏览器里预览（inline，仅白名单类型）
GET    /api/outgoing/{name}/download 取回电脑给的文件（按文件名）
DELETE /api/incoming               批量删（{ids} 或 {all:true}）
DELETE /api/outgoing               批量删（{names} 或 {all:true}）
DELETE /api/incoming/{id}
DELETE /api/outgoing/{name}
POST   /api/incoming/purge          按 uploaded_at 清理
POST   /api/outgoing/purge          按修改时间清理
```

`/api/files/upload` 上传字段：

| 字段 | 必填 | 说明 |
|---|---:|---|
| `file` | 是 | 文件本体 |
| `source` | 否 | 来源标记，例如 `qr`、`xml`、`web`、`miniprogram`、`ledger` |
| `device_id` | 否 | 小程序设备 ID |

单文件最大 20MB。相同 SHA256 + 大小复用旧记录，响应里的 `duplicate=true` 表示电脑端已存在。

`/api/files/outgoing` 只收 `file` 一个字段，响应 `{name, size, modified_at, duplicate}`：

- 同名同内容 → `duplicate=true`，不新增文件；
- 同名不同内容 → 另存为 `名字 (2).ext`，**不覆盖**（可能有人正拿着旧那份在下载）；
- 复制而不是移动，电脑上的源文件不受影响。

小程序「传输中心」页单次最多选 20 个文件，顺序上传，任一失败不影响其余。

### 保留期与清理

`incoming/` 与 `outgoing/` 默认都保留 **30 天**，超期自动删除：

- 电脑端启动时执行一次，之后每 6 小时执行一次；`-keep-days` / `INVOICE_KEEP_DAYS` 可改，≤0 表示关闭自动清理。
- 两个目录都是副本（原件分别在手机和用户电脑的原位置），所以自动清理不会让用户丢东西。
- 小程序端发送历史按同一口径在本机裁剪（`utils/filesend.js` 的 `RETENTION_DAYS`），不询问用户。
- 时间是唯一口径：解析不出的时间一律不删（incoming 看 `uploaded_at`，outgoing 看文件修改时间）。
- 手动清理走 purge 接口，都是「先预览、再确认」，避免误触一次性清空。

### POST /api/incoming/purge 与 POST /api/outgoing/purge

按保留天数清理，两者请求与响应完全一致。

```json
{ "days": 30, "confirm": false }
```

| 字段 | 说明 |
|---|---|
| `days` | 保留天数，必须 > 0；≤0 返回 400 |
| `confirm` | `false` 只数不删，`true` 才真正删除 |

响应：

```json
{ "confirmed": false, "days": 30, "removed": 0 }
```

### DELETE /api/incoming 与 DELETE /api/outgoing

批量删除，两种形态互斥（incoming 用 `ids`，outgoing 用 `names`）：

```json
{ "ids": ["a1b2", "c3d4"] }
```

```json
{ "names": ["a.pdf", "b.ofd"] }
```

```json
{ "all": true }
```

既不传列表也不传 `all` 返回 400。响应 `{"deleted": 2}` 表示实际删除数量；单个文件删除失败不中断其余，删除失败数在服务端日志里。

### GET /api/incoming/{id}/view

电脑端网页预览用：`Content-Disposition: inline`，让浏览器自己渲染而不是弹出下载框。
`/api/files` 的每条 `incoming` 记录都带一个 `preview` 字段，取值就是下面这张表，
前端据此决定用 iframe、img 还是 pre 显示，不再自己维护一份扩展名列表。

| `preview` | 扩展名 | Content-Type |
|---|---|---|
| `pdf` | `.pdf` | `application/pdf` |
| `image` | `.png` `.jpg` `.jpeg` `.gif` `.webp` `.bmp` | 对应的 `image/*` |
| `text` | `.txt` `.xml` `.json` `.csv` `.log` `.md` | `text/plain; charset=utf-8` |
| 空串 | 其余（OFD、ZIP、Office、HTML、SVG…） | 预览返回 415，提示下载 |

两点是安全要求，不是偏好：

- **白名单而不是黑名单**。`.html` / `.svg` 必须落在「不可预览」里——预览响应和网页同源，
  一旦让浏览器按 HTML 渲染用户上传的文件，就等于给局域网开了个存储型 XSS 的口子。
- **所有文本都按 `text/plain` 输出**，并带 `X-Content-Type-Options: nosniff`。
  发票 XML 里出现什么标签都不该被解析。

`/api/incoming/{id}/download` 保持 `attachment` 不变：要下载还是要点预览，由用户选。

### 小程序取文件的两个动作

微信没有「保存到手机磁盘」的通用接口，落地只有两条路：

| 动作 | 接口 | 适用格式 |
|---|---|---|
| 转发到聊天 | `wx.shareFileMessage` | 全部（pdf/ofd/xml/zip…） |
| 预览 | `wx.openDocument` | pdf、doc、docx、xls、xlsx、ppt、pptx |

所以 OFD / XML / ZIP 只提供「转发」，不提供必定失败的「预览」。

## 发票台账接口

台账文件：`desktop/data/invoices.csv`

CSV 列（8 列）：

```text
发票号码,发票代码,票种,开票日期,价税合计,报销人,录入批次,录入时间
```

读取按表头名定位列，兼容旧版 12/14 列 CSV（多余的列忽略，缺的列按空值处理）；
缺少批次和录入时间时自动生成。

### 判重口径

```text
identityKey = 发票代码 + "|" + 发票号码
```

- 数电票没有发票代码（20 位号码全国唯一），键退化为号码本身。
- 老票必须「代码+号码」才唯一；只按 8 位号码会把跨地区、跨年份的票误判成同一张。
- **金额与开票日期不参与判重**：补录和格式抖动会让同一张票算出不同的键，漏判即重复报销。

### POST /api/invoices/check

发送前查重。小程序把本次发票一次性提交，避免重复票静默入库。

请求（推荐，带代码）：

```json
{
  "invoices": [
    { "number": "26932000001877489821", "code": "" },
    { "number": "12345678", "code": "033001900111" }
  ]
}
```

旧格式仍兼容（只有号码，按号码宽松匹配）：

```json
{ "numbers": ["26932000001877489821"] }
```

匹配规则：

- 给了 `code`：按「代码+号码」精确匹配。
- 没给 `code`：按号码匹配。查重只用于发送前提示，宁可多提示一次，也不要把真重复放过去。

响应 `matches` **以发票号码为键**，值为台账中已有的那条记录：

```json
{
  "matches": {
    "26932000001877489821": {
      "number": "26932000001877489821",
      "code": "",
      "kind": "数电票",
      "issue_date": "2026-08-02",
      "total": "147.00",
      "reimburser": ""
    }
  }
}
```

未命中的号码不出现在 `matches` 中。小程序据此弹窗让用户选择「仍然发送」或「跳过重复」。

### POST /api/invoices

小程序把扫码/导入草稿写入电脑台账。

请求：

```json
{
  "device_id": "mp-1763360000000-12345",
  "invoices": [
    {
      "number": "26932000001877489821",
      "code": "",
      "kind": "数电票",
      "issue_date": "2026-08-02",
      "total": "147.00",
      "reimburser": "",
      "batch": "",
      "created_at": ""
    }
  ]
}
```

- 单批最多 200 张，超出返回 400。小程序超限时先弹窗，用户选「只发前 200 张」或取消。
- `batch` 和 `created_at` 留空时由电脑端自动生成。
- 金额是普通元字符串；扫码草稿只有号码、日期、价税合计，报销人留空，台账列表会标记「待补录」。
- 重复票仍会写入并高亮，由用户自行删除。

响应：

```json
{ "added": 1, "batch": "B-20261117-153012" }
```

### POST /api/invoices/manual

电脑端网页「新增发票」用的单条录入。小程序不调用。

请求：

```json
{
  "number": "26932000001877489821",
  "code": "",
  "kind": "数电票",
  "issue_date": "2026-11-18",
  "total": "66.00",
  "reimburser": "王五"
}
```

- `number` 必填，首尾空格会被去掉；为空返回 400。
- 批次固定写 `手动录入`，与扫码/导入的自动批次区分开。
- 录入时间由电脑端生成。
- 响应里的 `duplicate` 是写入时算好的：同「代码+号码」已存在就是 `true`，但仍然会写入，由用户在网页上删。

响应（201）：

```json
{
  "invoice": {
    "id": 12, "number": "...", "code": "", "kind": "数电票",
    "issue_date": "2026-11-18", "total": "66.00", "reimburser": "王五",
    "batch": "手动录入", "created_at": "2026-11-18 09:10:18",
    "need_fill": false, "duplicate": false
  }
}
```

### GET /api/invoices

查询发票列表。支持参数：

```text
keyword, number, code, kind, reimburser, batch,
date_from, date_to, amount_min, amount_max,
only_duplicates=1, only_need_fill=1,
sort=created|issued|number|reimburser
```

- `date_from` / `date_to` 比较的是**开票日期**。
- `sort` 默认 `created`（录入时间倒序）；`reimburser` 排序时空值排最后。
- `only_need_fill=1` 的判定是**报销人为空**。

响应：

```json
{
  "items": [],
  "duplicates": [],
  "total": 0,
  "duplicate_groups": 0,
  "need_fill": 0
}
```

`duplicates` 是按 `identityKey` 聚合的重复组，每组带 `number`、`code`、`items`。

**注意**：`duplicates` 与 `duplicate_groups` 始终按**全量台账**计算，不受 `keyword` 等筛选条件影响；
`items` / `total` / `need_fill` 才是筛选后的结果。小程序据此实现「仅看重复」：
它把筛选交给电脑端，同时用 `duplicates` 判断某条记录属于哪一组。

小程序台账页的同步流程：

```text
进入页面 / 下拉刷新
  → GET /api/invoices?keyword=...&only_duplicates=1&sort=...
  → 覆盖内存镜像（items / duplicates / 统计）
  → 渲染；扫码时用镜像按「代码+号码」当场判重
```

### PUT /api/invoices/{id}

补录单张发票字段。`id` 是列表里的行号。请求体直接传发票字段：

```json
{
  "number": "26932000001877489821",
  "code": "",
  "kind": "数电票",
  "issue_date": "2026-08-02",
  "total": "147.00",
  "reimburser": "张三"
}
```

整条替换语义：没传的字段会被清空，客户端必须带上完整票面字段。
`batch` 和 `created_at` 不允许覆盖，保持原值。写入前自动备份。

响应：

```json
{ "updated": true, "invoice": {} }
```

### POST /api/invoices/purge

按电脑端「录入时间」清理台账。

请求：

```json
{ "from": "2026-11-01", "to": "2026-11-17", "confirm": false }
```

`confirm=false`（默认）只返回命中数量，不删除；`confirm=true` 执行删除并自动备份。
`from` 和 `to` 至少填一个，比较的是 `created_at` 的日期部分。

响应：

```json
{ "removed": 12, "confirmed": false }
```

### POST /api/invoices/import

导入 CSV，字段 `file`，格式 `multipart/form-data`。

默认是预览，不写入：

```text
POST /api/invoices/import
```

预览响应包含：

```json
{
  "total": 3,
  "new_count": 1,
  "duplicate_count": 1,
  "invalid_count": 1,
  "items": []
}
```

确认写入：

```text
POST /api/invoices/import?confirm=1
```

响应：

```json
{ "imported": 2 }
```

判重与列表同口径（`identityKey`）。重复行仍会写入台账，方便用户对比后自行删除；只有缺发票号码的行会被跳过。

### GET /api/invoices/export

导出 CSV（8 列，带 UTF-8 BOM，Excel 可直接打开）。可使用查询参数筛选，也可用 `ids=1,2,3` 导出选中记录。

查询参数与 `GET /api/invoices` 完全一致（含 `only_duplicates` / `only_need_fill` / `sort`）。
筛选前会先按全量算出重复标记，否则 `only_duplicates` 会导出一张只有表头的空表。

小程序导出页不自己拼 CSV，而是：

```text
wx.downloadFile(电脑地址 + /api/invoices/export?<同样的查询串>)
  → 临时文件 → wx.shareFileMessage 转发到聊天
```

因此导出内容与小程序上看到的筛选结果一致；电脑端网页也支持导出当前筛选与勾选记录。

### DELETE /api/invoices

请求：

```json
{ "ids": [1, 2] }
```

响应：

```json
{ "deleted": 2 }
```

## 数据目录

```text
desktop/data/
├── incoming/     小程序上传进来的文件（手机 → 电脑）
├── outgoing/     电脑提供给小程序下载的文件（电脑 → 手机）
├── backup/       发票台账历史备份
├── invoices.csv  发票台账主文件
├── index.json    上传记录索引
└── registry.json 设备与事件记录
```

`outgoing/` 里的文件两种来源：网页「发送到小程序」上传，或用户直接把文件拷进这个目录。
两者等价，小程序只认目录内容。
