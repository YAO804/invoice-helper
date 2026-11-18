# M0 技术验证工程 · 使用说明

这个工程只做一件事：**用最短时间验证五个假设，避免在错误前提上写代码。**

它没有数据库、没有云开发、没有 UI 设计。五个按钮，五个结果，跑完就扔。

> **状态：M0 已完成（2026-11-16 真机全通过）**。逐项结论见 `docs/spike.md`。
> 下文保留为操作记录；其中「待观察」的字段说明已被实测结果取代，以 §四 的结论表为准。
> 接下来进入 M1（本地数据层 + 三个页面），见 `docs/miniprogram-plan.md` §4。

---

## 一、先解决账号（这步错了后面全白跑）

### 你截图里那个是「测试号」，不能用

判别方法：**看后台左侧有没有「版本管理」和「提交审核」入口。没有 = 测试号。**

测试号的硬限制（官方社区确认）：

- **没有「服务内容声明」入口 → 配不了隐私协议**
- 因此 `wx.chooseMessageFile` 会报 `api scope is not declared in the privacy agreement`
- S2 / S3 / S4 三项全依赖这个接口，等于全废
- 不能上传、不能发布、不能做体验版

> 测试号后台也有「服务器域名」配置页，看着很像那么回事，但那配置只对本地调试生效。

### 正确做法：注册个人小程序（免费，约 5 分钟）

1. 打开 <https://mp.weixin.qq.com> → **立即注册** → 选「小程序」
2. 主体类型选**个人**，填邮箱 + 身份证 + 人脸核身
3. 注册完进后台，在「开发管理 → 开发设置」里拿 **AppID**（`wx` 开头）
4. 把 AppID 写进 `project.config.json` 的 `appid` 字段

> ✅ 已替换为正式号 AppID `wxebcb963f266bfdee`，隐私指引已过审生效。测试号 `wx2b204ff465b4935c` 弃用。
>
> 个人主体**不需要**认证（那 300 元）、**不需要** ICP 备案、**不需要**选类目。这些只有正式发布才要；本工具走体验版，永久跳过。

### 隐私协议配置（只有正式号才有这个入口）

**路径：小程序后台 → 左下角头像 → 账号设置 → 基础设置 → 服务内容声明 → 用户隐私保护指引**

（旧版后台在左侧菜单「设置 → 服务内容声明」，找不到就点左下角头像）

需要勾选：

| 项目 | 为什么 |
|---|---|
| ☑ 选中的文件 | `wx.chooseMessageFile` 必需，M0 的 S2/S3/S4 全靠它 |
| ☑ 摄像头 | `wx.scanCode` 相关，S1 用 |
| ☑ 相册 | 备用，暂不必须 |

用途描述写实一点，例如：**"选择发票文件用于本地解析与记账归档，不上传任何服务器"**。

⚠️ **提交后要审核，一般 1–3 小时；审核通过后还要约 1 小时才生效。** 配完立刻跑仍报错的，先等，别以为没配上。

### 关于那个 AppSecret

你贴出来的 `161ff8754...` 建议直接重置（后台 AppSecret 卡片右侧有「生成」/「重置」）：

1. **本项目完全不需要它**——零后端、零云开发、零网络请求。AppSecret 是给服务端换 `access_token` 用的，这里没有任何服务端。
2. 它已经明文出现在聊天记录里，重置成本为零。
3. 永远不要写进代码或 `project.config.json`。

### 审核期间的预期现象

隐私协议提交后 1–3 小时过审，过审后约 1 小时才真正生效。这段时间：

- **开发者工具模拟器**：S5 正常；S1–S4 会失败，因为工具本身就模拟不了摄像头和会话文件
- **真机**：S1–S4 报 `api scope is not declared`，这是协议还没生效，不是代码问题

等后台状态变成「已通过」，再上真机跑 S1–S4。

---

## 二、导入并跑起来

1. 打开微信开发者工具 → **导入项目**
2. 目录选 `E:\Code\Workspace\invoice-helper`（**根目录，不是 miniprogram 子目录**，`project.config.json` 在根上）
3. AppID 用你自己的正式号
4. 点右上角 **预览** → 手机微信扫码 → 真机上打开

> ⚠️ **必须用真机跑。** 开发者工具模拟不了 `wx.scanCode`（摄像头）和 `wx.chooseMessageFile`（会话文件）。

---

## 三、五项验证，逐项操作

每项跑完点「复制结果」，微信会提示已复制。**五项都跑完后一起发我。**

### S1 · 扫码取原文

点「开始扫码」，扫这三种票各一张：

| 票种 | 从哪来 |
|---|---|
| 数电票 | 打印出来的数电票 PDF，或手机屏幕上的发票文件 |
| 老版电子普票 | 2022 年前的电子发票 PDF/打印件 |
| 铁路 / 航空票 | 12306 或航司开的电子发票 |

**重点看：**
- `kind`：`url` 还是 `legacy-csv`？
- 如果是 `url`，`urlParts.params` 里有没有能直接读出**发票号码**的字段？
- 如果是 `legacy-csv`，记下 `raw` 全文与 `crcDeclared`
- `scanType` / `charSet`

> **CRC 校准已放弃**：真实样本枚举 70 组 CRC-16 变体全部未命中，算法非标准。代码已移除校验计算，**不要**期待 `crcComputed` 字段，也**不要**把 CRC 不匹配当异常。

### S2 · 从会话选文件

1. 先在微信里把几个发票文件**发到「文件传输助手」**（`.xml`、`.ofd`、`.pdf` 各一个）
2. 回到小程序点「选择文件」，从会话里选这几个文件

**重点看：**
- `readable` 是否都是 `true`
- `name` 是不是**原始文件名**（不是 `tmp_xxx`）
- `ext` 是否正确

### S3 · 端侧解析 XML

点「选择 XML 并解析」，选一张**真实的数电票 XML**。

**重点看：**
- 结果顶部摘要：发票号码、开票日期、销方、价税合计、票种、明细行数、缺失字段
- `extracted.missing`：必填项有没有漏
- `extracted.labels`：固有票种标签
- `allTags`：完整标签路径（首次校准用，现已沉淀到 `docs/spike.md`）
- `encoding.declared`：`utf-8` 可直接读；GBK 需另做转码

> 解析器已按真实路径重写，摘要在前、完整 JSON 在后，不必再翻 63 条标签。

### S4 · OFD 容器结构

点「选择文件并探测」，选一张 `.ofd`（有 `.pdf` 也顺手试一下）。

**重点看：**
- `isZip`：`true` 说明「OFD 就是 ZIP」这个前提成立
- `hasContentXml`：`true` 说明能读到票面文本层
- `entryCount`：内部条目数
- `hasAnnotation` / `hasCustomTags`：**签章和票面标记的真实位置**。`hasDocSignature: false` 不代表票有问题（实测样本就没有 `Signs/`）

### S5 · 本地存储

点「跑存储测试」。

**重点看：**
- `write5MB.ok`：`true` 说明私有目录能存大文件
- `storageInfo.limitSizeKB`：本地 Storage 上限（预期 10240，即 10MB）
- `dirCreated`：数据目录建成功没

再点「清理 30 天前文件」，确认清理逻辑能跑（现在目录是空的，`removedCount` 应为 0，不报错即可）。

---

## 四、验证结论（2026-11-16 真机）

| # | 假设 | 实测结论 |
|---|---|---|
| S1 | 数电票二维码里能拿到可用字段 | ✅ **成立且超预期**：明文串，20 位号码/金额/日期全可读；但无销方与明细 |
| S2 | 能从微信会话选到发票文件 | ✅ **成立**：`.xml`/`.ofd`/`.pdf` 均可，保留原名（必须以「文件」消息发送） |
| S3 | 小程序端能稳定解析 XML | ✅ **成立**：UTF-8 直读，63 条标签路径全 dump，无需第三方解析器 |
| S4 | OFD 是标准 ZIP 且带文本层 | ✅ **成立**：15 条目、`Content.xml` 存在；签章在 `Annots/` 而非 `Signs/` |
| S5 | 私有目录够用，30 天清理可行 | ✅ **成立**：5MB 写入 22ms，Storage 上限 10486KB，TTL 清理正常 |

### 实测推翻的两个前置判断

1. ~~数电票二维码是加密链接~~ → 是明文串，扫码可做主入口。
2. ~~OFD 没 `Signs/` 就是没签章~~ → 电子印章是页级注释，在 `Doc_0/Annots/Page_0/Annotation.xml`。

### 一项放弃

CRC16 校验：70 组标准变体全部不匹配，**只记录原值，不做完整性判断**。PDF 确认不是 ZIP，**只存不解析**。

---

## 五、工程结构

```
invoice-helper/
├── project.config.json          # 开发者工具配置（miniprogramRoot 指向 miniprogram/）
├── miniprogram/
│   ├── app.js / app.json / app.wxss / sitemap.json
│   ├── pages/                  # collect / list / detail / export / transfer / settings / index
│   └── utils/
│       ├── einvoice.js          # XML 树 + 完整路径取值、标签 dump、二维码解析（无 CRC 计算）
│       ├── zip.js               # ZIP/OFD 容器结构探测（零依赖，不解压）
│       ├── fsx.js               # 私有目录读写（只剩 M0 验证页在用）
│       ├── draft.js             # 纯函数：二维码/XML → 草稿、金额分↔元、判重键、号码校验
│       ├── ledger.js            # 电脑台账的内存镜像：查询串、sync、卡片映射、判重索引
│       ├── collect.js           # 扫码与文件导入草稿（不落盘）
│       ├── scanbatch.js         # 批量连续扫码（扫到取消为止，重复靠内存镜像判断）
│       ├── exportflow.js        # 把已落盘文件逐个转发到微信聊天
│       ├── lanservice.js        # 桌面端连接、心跳、查重、发票发送、台账只读拉取、导出地址
│       ├── filesend.js          # 原件上传：发送历史（30 天）、电脑已收列表、批量删
│       ├── filetake.js          # 从电脑取：待取列表、下载、转发/预览、批量接收
│       ├── transferops.js       # 传输页三个列表的删除与清理文案/调用
│       ├── selection.js         # 列表勾选纯逻辑（切分段清空、剔除失效项）
│       ├── format.js            # 文件大小与时间文本格式化
│       ├── invoicesend.js       # 草稿转电脑台账字段、重复确认
│       └── discover.js          # mDNS 自动发现电脑地址（安卓）
├── desktop/
│   ├── internal/                # 电脑端 Go 模块目录：api / files / ledger / registry / config
│   ├── web/                     # 本地网页静态文件
│   ├── data/                    # 运行时数据，不提交 Git
│   └── README.md                # 电脑端目录约定
├── shared/
│   └── protocol.md              # 小程序与桌面端通信协议 v0.8
├── test/
│   ├── miniprogram/
│   │   ├── einvoice.test.js     # 真实 XML 树 1:1 回归，60 项断言
│   │   ├── zip.test.js          # 手工构造 zip + S4 真机结构回归，14 项
│   │   ├── fsx.test.js          # 私有目录与 TTL 清理回归，11 项
│   │   ├── draft.test.js        # 金额换算、判重键、号码校验、二维码/XML 映射，36 项
│   │   ├── ledger.test.js       # 查询串、远程快照、判重索引、重复组，27 项
│   │   ├── list.test.js         # 台账页：未连接空态、筛选排序请求、错误兜底，32 项
│   │   ├── collect.test.js      # 扫码/文件导入回归，31 项（模拟 wx API）
│   │   ├── scanbatch.test.js    # 批量扫码交互与重复提示回归，27 项
│   │   ├── lanservice.test.js   # 地址、心跳节奏、查重、发送、台账拉取与导出地址，52 项
│   │   ├── filesend.test.js     # 发送历史 30 天裁剪、电脑已收列表与删除，31 项
│   │   ├── filetake.test.js     # 取文件：格式判断、下载地址、批量接收容错，29 项
│   │   ├── transfer.test.js     # 传输中心页：两个方向、勾选、批量删、清理、接收，41 项
│   │   ├── selection.test.js    # 勾选逻辑：toggle / prune / mark / allSelected，13 项
│   │   ├── invoicesend.test.js  # 草稿转换、查重发送与 200 张上限，18 项
│   │   └── discover.test.js     # mDNS 自动发现与 iOS 兜底，21 项
│   ├── desktop/                 # 电脑端联调测试预留；Go 单元测试在 desktop/internal 各包内
│   └── integration/             # 小程序与电脑端联调测试，后续添加
├── scripts/                     # 图标生成与开发脚本
├── assets/                      # 项目静态资源
└── docs/
    ├── requirements.md          # 需求说明（含实测 XML 字段映射表）
    ├── miniprogram-plan.md      # 执行计划（M0 已完成）
    └── spike.md                 # M0 逐项验证结果
```

跑全部回归测试：

```bash
node test/miniprogram/einvoice.test.js
node test/miniprogram/zip.test.js
node test/miniprogram/fsx.test.js
node test/miniprogram/draft.test.js
node test/miniprogram/ledger.test.js
node test/miniprogram/list.test.js
node test/miniprogram/collect.test.js
node test/miniprogram/collect-page.test.js
node test/miniprogram/collect-send.test.js
node test/miniprogram/scanbatch.test.js
node test/miniprogram/lanservice.test.js
node test/miniprogram/filesend.test.js
node test/miniprogram/filetake.test.js
node test/miniprogram/transfer.test.js
node test/miniprogram/invoicesend.test.js
node test/miniprogram/discover.test.js
node test/miniprogram/selection.test.js
node test/miniprogram/auth.test.js
node test/miniprogram/settings.test.js

# 电脑端网页：金额计算与选中汇总、上传进度下标、文件预览弹层、事件类型中文标签、统计卡片筛选、台账行渲染、脚本加载顺序
node test/desktop/ledger-render.test.js
node test/desktop/upload-progress.test.js
node test/desktop/preview.test.js
node test/desktop/events.test.js
node test/desktop/stat-filter.test.js
node test/desktop/invoice-row.test.js
node test/desktop/script-order.test.js
node test/desktop/logout.test.js
node test/desktop/reimburser-fill.test.js

cd desktop
go test ./...
```

小程序十九套共 553 项检查；`auth.test.js` 覆盖 PIN 存储、登录码解析、扫码登录、改 PIN，`discover.test.js` 覆盖多网卡/无效 IP 过滤与「找到但连不上」提示，`settings.test.js` 覆盖自动搜索提示以及「扫码连接电脑」同时处理登录码/连接码/无 PIN 现场设置，`collect-page.test.js` 覆盖收票页四卡结构、bindtap 与方法对应、冗余入口不回归，`collect-send.test.js` 覆盖发送弹窗「查看这批票」的确认跳转/稍后不跳，`ledger.test.js` 与 `list.test.js` 覆盖最新批次透传与一键回看。
电脑端网页九套共 170 项检查：选中发票张数与合计金额（分成单位累加，避免浮点误差）、批量上传进度回调的下标语义（一个文件只能占一行）、预览弹层的打开/关闭与不可预览格式的提示、最近事件的中文标签（并扫描后端 `MarkEvent` 调用，漏配就报错）、统计卡片与筛选面板的双向同步（最新批次取全表，不随筛选漂移）、台账行渲染（10 列齐全、录入时间拆两行、转义与空列表）、脚本按 index.html 顺序加载无全局声明冲突、退出登录调 logout 接口后重载回扫码态（失败时提示且不重载）、报销人补录体验（扫码串/Excel 粘贴拆分、历史建议去重、已填值给复制按钮、批量填报销人整条替换，且走页面内模态框而非原生 prompt：打开显示张数、取消不发请求、留空表示清空）。
电脑端 Go 测试单独运行，覆盖文件保存、去重、删除、统计、设备心跳、状态总览、上传接口、下载接口、待取文件入库与同名改名、接收文件预览（类型白名单与 inline 响应头）、待取/接收文件批量删除与按保留期清理、发票台账 CSV、判重（代码+号码）、搜索排序、导入导出、扫码结果查重接收、补录编辑、按录入时间清理、mDNS 端口解析、连接二维码和本地网页（含静态资源 no-store 与预览脚本的加载顺序）。

---

## 六、常见问题

**`chooseMessageFile:fail api scope is not declared in the privacy agreement`**
隐私协议没声明「选中的文件」。原因可能是：① 用的是测试号（没入口，只能换正式号）② 声明了但还在审核 ③ 审核通过不足 1 小时。

**扫码提示 `scanCode:fail`**
先确认隐私协议已过审。仍失败则检查手机是否给微信开了摄像头权限。

**选择文件时看不到文件**
文件必须先发到「文件传输助手」。`chooseMessageFile` 只能读**微信会话里的文件**，读不到手机本地目录，也读不到电脑文件夹。

**S3 报「选择失败」但 S2 正常**
说明 `extension` 过滤在 iOS 上不生效。这是已知兼容问题，S2 之所以不加过滤就是为了对照。告诉我，我改用 `type:'all'` + 后缀判断。

**S3 里中文是乱码**
`encoding.declared` 大概是 GBK。小程序 `readFile` 不支持 GBK，需要额外转码——这本身就是一条重要结论，把结果发我。

**预览打不开 / 提示无权限**
AppID 用的还是测试号。换成正式号的 AppID。
