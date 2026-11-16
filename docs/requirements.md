# 电子发票辅助归集工具 — 需求说明（v0.1）

> 定位：个人自用的**发票信息采集与本地归档辅助工具**。
> 只做"把文件收好、把字段抠出来、把台账记上"这一件事。
> 不做查验、不判定真伪、不对外提供服务。

---

## 一、先修正四处关键认知

你原始需求里有四个点，按现在的技术和监管现状需要调整。这四点决定了整个架构，建议先看。

### 修正 1：数电票二维码是明文串，但只覆盖定位信息

> **2026-11-16 真机实测修正**：原先判断"数电票用动态二维码、扫出来是加密链接"是**错的**。数电票二维码与老版电子发票同构，都是明文逗号串。

国家标准《电子凭证入账要求 第2部分》附录 D 规定了格式：

```
版本号,票种,发票代码,发票号码,合计金额,开票日期,校验码,CRC
```

真机扫数电票的实测结果：

```
01,31,,26932000001877489821,10500.00,20261110,,277D
```

| 位置 | 值 | 说明 |
|---|---|---|
| 票种码 | `31` | 数电票（老版电子普票 10 / 专票 20） |
| 发票代码 | 空 | 数电票无代码 |
| 发票号码 | `26932000001877489821` | 20 位，完整可读 |
| 价税合计 | `10500.00` | 可直接用 |
| 开票日期 | `20261110` | 可直接用 |
| 校验码 | 空 | 数电票无校验码 |

**能拿到**：发票号码、价税合计、开票日期——正好构成去重键，也够做快速录入。

**拿不到**：销方名称、税额、税率、明细。这些仍需从 XML/OFD 取。

**所以**：扫码是"快速录入口"，不是"完整解析"。原始二维码内容仍要原样存档。

> **CRC 校验已放弃**：用真实样本枚举 70 组标准 CRC-16 变体全部未命中，该算法非标准实现。只保留原值，**不得**把 CRC 不匹配当作异常或伪造信号。

### 修正 2：OCR 不该是主力，应该是第四级兜底

绝大多数数电票文件本身**已经带着结构化数据**，OCR 是把无损数据当成图片去猜，属于精度和性能的双重倒退。正确链路是分级降级：

| 级别 | 输入 | 方式 | 精度 | 成本 |
|---|---|---|---|---|
| L1 | `.xml` | 直接解析（税务机关签名原件） | 100% | 极低 |
| L2 | `.ofd` | 本质是 ZIP，读 `Content.xml` 的 `TextCode` 文本层 | 100% | 极低 |
| L3 | `.pdf` | 提取文本层（数电票 PDF 是矢量文本，非扫描件）；并探测内嵌附件 XML | ~100% | 低 |
| L4 | 图片/截图/拍照 | 先试二维码；失败再 OCR | 80~95% | 高 |

**结论：OCR 是整个项目里优先级最低、但工程量最大的一块。** 建议先用 L1~L3 跑通闭环，OCR 留到最后按需接入。

### 修正 3：归档的对象是"文件原件"，不是"数据库记录"

按财政部《电子凭证会计数据标准》和《关于规范电子会计凭证报销入账归档的通知》，数电票的**法定原件是含税务机关数字签名的 XML**，PDF/OFD 只是版式预览件，不能替代原件。电子会计凭证保管期 10 年。

**所以**：数据库只是索引，原件文件才是资产。设计上必须保证：
- 原件**只读落盘 + SHA-256 记录 + 不可变**；
- 台账丢失可从文件重建（sidecar JSON 伴生）；
- 目录结构本身可读，脱离软件也能人工翻找。

### 修正 4："不查验"会留下一个必须显式设计的缺口

不做查验是对的（查验平台有验证码、无官方开放接口、批量请求违反用户协议，且这是判定真伪的行政职权）。但要承认代价：

**数电票可以被销售方单方红冲，无需买方确认。** 发票入账后突然被冲红，你的台账不会有任何感知。

对策不是去爬查验平台，而是：
- 记录 `status: normal | unknown | manually_verified`，默认 `unknown`；
- 提供"**待人工核验清单**"：按月列出期间收票，用户自己抽空去全国增值税发票查验平台批量核对；
- 核对完手动标记状态和时间戳，形成留痕。

---

## 二、功能范围

### P0 — 最小可用闭环

1. **文件导入**
   - 单文件 / 多选 / 整个目录拖入
   - 支持 `.xml` `.ofd` `.pdf` `.jpg` `.png`
   - 目录导入时递归，跳过已导入文件（按 SHA-256）

2. **分级解析**（L1→L4 依次降级，首个成功即止）
   - 统一输出 `Invoice` 结构 + `source` 标记 + `confidence`
   - 解析失败不丢文件，进"待处理"队列供人工补录

3. **二维码解码**
   - 从图片直接解码（ZXing）
   - 从 OFD/PDF 页面中提取二维码图像后解码
   - 识别两种格式：明文逗号串 / 动态链接
   - 明文串直接切分解析；CRC 只记录不校验（算法未公开，见修正 1）
   - 原始内容全文存库（`raw_qr`），永不丢弃

4. **去重**
   - 文件级：SHA-256 完全相同 → 直接跳过
   - 发票级：`发票号码 + 开票日期 + 价税合计` 唯一键
   - 命中时提示"疑似重复"，不静默覆盖；允许强制导入并记录原因

5. **规范归档**
   ```
   archive/{YYYY}/{MM}/
     {发票号码}_{YYYYMMDD}_{销方简称}_{价税合计}.{ext}
     {同名}.meta.json
   ```
   - 同票多格式（xml+pdf+ofd）放同一目录，`xml` 为主原件
   - 原件写盘后置只读

6. **台账与导出**
   - SQLite 存结构化字段 + 明细行
   - 导出 CSV（UTF-8 BOM，Excel 直接开）/ XLSX
   - 按月份、销方、金额区间、状态筛选

7. **人工复核界面**
   - 低置信度（L4/OCR）记录高亮
   - 字段可直接编辑，编辑留痕（`edited_fields`）
   - 缺字段的发票进"待补录"列表

### P1 — 可用性增强

8. **本地一致性校验**（替代查验的合理边界，全部离线）
   - 金额勾稽：`Σ明细金额 = 不含税金额`、`不含税 + 税额 = 价税合计`
   - 税率合法性：5%/6%/9%/13%/3%/1%/0%
   - 发票号码规则：20 位 = 年份2 + 行政区划2 + 渠道1 + 顺序15
   - 纳税人识别号校验位（18 位统一社会信用代码）
- XML 是否含 `EInvoice/TaxBureauSignature` 节点（**不是** `<Signature>`）；OFD 侧则看 `Doc_0/Signs/` **或** `Doc_0/Annots/`——真实税务 OFD 的签章是页级注释，常无 `Signs/` 目录
  - 任一不通过 → 打 `anomaly` 标签，汇总成"异常清单"。注意这只代表**结构不完整**，不代表发票有问题

9. **明细行解析**：项目名称、规格、数量、单价、金额、税率、税额

10. **分类/标签**：按销方名称或商品关键词自动归类（如"交通""餐饮""住宿"），规则可编辑

11. **统计视图**：月度/季度/年度汇总，按分类和销方排行

12. **原件完整性巡检**：定期重算 SHA-256，发现文件被改/丢失则告警

### P2 — 可选增强

13. **OCR 兜底**：PaddleOCR（Apache-2.0）本地部署，仅处理 L1~L3 全部失败的图片
14. **红冲核验清单**：按月生成待核验 CSV，含发票号码/日期/金额，方便去官方平台逐条核对
15. **备份**：台账 + 归档目录打包，可加密（age / 7z）
16. **手机扫码上传**：局域网内 H5 页面，扫码即传（自用场景够用）
17. **导入渠道扩展**：IMAP 邮箱附件自动抓取（参考 InvoiceFlowAI）

### 明确不做

- ❌ 自动查验 / 批量查验 / 绕过验证码
- ❌ 自动登录电子税务局抓取发票
- ❌ 判定发票真伪、出具任何"已验证"结论
- ❌ 多用户、云端托管、对外提供服务
- ❌ 与财务系统/ERP 对接

---

## 三、数据模型

```sql
-- 发票主表
invoices(
  id            INTEGER PK,
  invoice_no    TEXT NOT NULL,        -- 数电票 20 位 / 老票 8 位
  invoice_code  TEXT,                 -- 老票 12 位；数电票为空
  invoice_type  TEXT,                 -- 数电票/电子专票/电子普票/铁路/航空/通行费...
  issue_date    DATE,
  seller_name   TEXT,
  seller_tax_id TEXT,
  buyer_name    TEXT,
  buyer_tax_id  TEXT,
  amount_excl_tax REAL,               -- 不含税金额
  tax_amount    REAL,
  total_amount  REAL,                 -- 价税合计
  tax_rate      TEXT,
  status        TEXT,                 -- normal | unknown | manually_verified
  verified_at   DATETIME,             -- 人工核验时间
  source        TEXT,                 -- xml|ofd|pdf_text|qr|ocr
  confidence    REAL,
  raw_qr        TEXT,                 -- 二维码原始内容，永不丢弃
  qr_integrity  TEXT,                 -- ok | failed | n/a
  anomaly       TEXT,                 -- 校验异常 JSON 数组
  edited_fields TEXT,                 -- 人工改过的字段
  note          TEXT,
  created_at    DATETIME,
  UNIQUE(invoice_no, issue_date, total_amount)
);

-- 原件表（一个发票可挂多个文件）
invoice_files(
  id         INTEGER PK,
  invoice_id INTEGER FK,
  file_path  TEXT,
  file_type  TEXT,        -- xml|ofd|pdf|image
  sha256     TEXT UNIQUE,
  size       INTEGER,
  is_primary BOOLEAN,     -- xml 原件为 true
  is_signed  BOOLEAN,     -- 是否检出税务数字签名
  imported_at DATETIME
);

-- 明细行
invoice_items(
  id         INTEGER PK,
  invoice_id INTEGER FK,
  line_no    INTEGER,
  name       TEXT,
  spec       TEXT,
  unit       TEXT,
  quantity   REAL,
  unit_price REAL,
  amount     REAL,
  tax_rate   TEXT,
  tax_amount REAL
);
```

**Sidecar 伴生文件**（`{同名}.meta.json`）：与原件同目录，存发票字段 + SHA-256 + 来源 + 导入时间。目的是**台账库丢了也能靠文件目录重建**，这是长期归档的底线。

---

## 四、二维码解析规则

### 4.1 明文串格式（老版电子发票 + 数电票，实测通用）

按 `,` 切分，字段顺序固定：

| 序号 | 含义 | 长度 | 说明 |
|---|---|---|---|
| 1 | 版本号 | 2 | 固定 `01` |
| 2 | 票种码 | 2 | `10` 电子普票(含通行费) / `20` 电子专票 / **`31` 数电票（实测）** |
| 3 | 发票代码 | 12 | 数电票为空 |
| 4 | 发票号码 | 8 或 20 | 数电票为 20 位 |
| 5 | 合计金额 | - | 两位小数（价税合计） |
| 6 | 开票日期 | 8 | `YYYYMMDD` |
| 7 | 校验码 | 20 | 数电票为空；老票后 6 位亦可用于查验 |
| 8 | CRC | 4 | **算法未公开，只记录不校验** |

**实测样本（数电票）**：`01,31,,26932000001877489821,10500.00,20261110,,277D`

CRC 算法非标准 CRC-16（70 组标准变体实测均不匹配），因此**不做完整性判断**，仅把原值存进 `raw_qr` 备查。

### 4.2 链接型二维码（兼容保留）

部分场景仍可能扫到以 `https://` 开头、域名指向税务系统的链接。处理策略：

1. **原样保存**整个 URL 到 `raw_qr`；
2. 尝试解析 query 参数，能识别出的字段填入，其余留空；
3. **不发起任何网络请求**（触发平台风控、且链接有时效）；
4. 解析不足 → 降级到 L2/L3 从文件本体取数。

> 数电票主流程走 4.1 的明文串，这条只是兜底。把"链接型解析"实现成可插拔规则表，别硬编码。

### 4.3 解码失败的处理

- 图片模糊/裁切 → 先做预处理（灰度、二值化、放大 2x、去边距）再重试一次
- 仍失败 → 不阻塞导入，标记 `qr_integrity: n/a`，走文件本体解析
- 全部失败 → 进"待补录"队列

### 4.4 XML 字段映射（2026-11-16 真机样本已校验）

样本 `dzfp_26932000001295659876_20260802160711.xml`，共 63 条标签路径，完整树见 `docs/spike.md` §S3。核心映射：

| 内部字段 | XML 完整路径 | 实测值 |
|---|---|---|
| `invoice_no` | `EInvoice/TaxSupervisionInfo/InvoiceNumber` | `26932000001295659876` |
| `issue_date` | `EInvoice/TaxSupervisionInfo/IssueTime` | `2026-08-02` |
| `request_time` | `EInvoice/EInvoiceData/BasicInformation/RequestTime` | 申请时间，≠ 开票日期 |
| `seller_name` | `EInvoice/EInvoiceData/SellerInformation/SellerName` | 宁波顺渝餐饮管理有限公司 |
| `seller_tax_id` | `.../SellerInformation/SellerIdNum` | `91330205MACB4PTU91` |
| `buyer_name` | `.../BuyerInformation/BuyerName` | 姚未正（个人） |
| `buyer_tax_id` | `.../BuyerInformation/BuyerIdNum` | **个人抬头不存在此节点** |
| `total_amount` | `.../BasicInformation/TotalTax-includedAmount` | `147.00`（**带连字符**） |
| `amount_excl_tax` | `.../BasicInformation/TotalAmWithoutTax` | `138.68` |
| `tax_amount` | `.../BasicInformation/TotalTaxAm` | `8.32` |
| `items[].name` | `.../IssuItemInformation/ItemName` | `*生产生活服务*餐饮` |
| `items[].amount` | `.../IssuItemInformation/Amount` | |
| `items[].tax_amount` | `.../IssuItemInformation/ComTaxAm` | |
| `items[].total` | `.../IssuItemInformation/TotaltaxIncludedAmount` | **小写 t，无连字符** |
| `items[].tax_rate` | `.../IssuItemInformation/TaxRate` | `0.06` |
| `invoice_type` | `EInvoice/Header/InherentLabel/GeneralOrSpecialVAT/LabelName` | `普通发票`（LabelCode `02`） |
| `is_blue` | `.../InherentLabel/InIssuType/LabelCode` | `Y`=蓝字 / `N`=红字；`LabelName` 是字段名「是否蓝字发票标志」，**不是状态文本** |
| `version` / `tag` | `Header/Version`、`Header/EInvoiceTag` | `0.37` / `SWEI3302` |
| `sign_algorithm` | `.../SignatureAlgorithm` | OID `1.2.156.10197.1.501` → SM2；`SignatureFormat: DETACH` |

**实现要求**：一律按完整路径取值，禁止按标签名模糊匹配。合计行与明细行的价税合计字段名只差大小写和连字符，单行明细时数值相同，模糊匹配会静默取错。

---

## 五、技术选型

### 方案 A（推荐）：Go 单体 + 可选 OCR sidecar

贴合你现有技术栈，核心链路完全可以纯 Go 实现，单二进制分发。

| 环节 | 选型 | 许可 |
|---|---|---|
| 二维码 | `makiuchi-d/gozxing` + `golang.org/x/image` 做预处理 | Apache-2.0 |
| XML 解析 | 标准库 `encoding/xml` | - |
| OFD | 标准库 `archive/zip` + `encoding/xml`（读 `Doc_0/Pages/*/Content.xml` 的 `TextCode`） | - |
| PDF | `pdfcpu`（文本提取 + EmbeddedFiles 附件探测） | Apache-2.0 |
| 数据库 | `modernc.org/sqlite`（纯 Go，免 CGO） | BSD-3 |
| Web UI | 标准库 `net/http` + `embed` 内嵌静态页 | - |
| OCR（P2） | 外部 PaddleOCR HTTP 服务，主程序只发图 | Apache-2.0 |

> OFD 不要急着上第三方库。它就是 ZIP + XML，自己解 300 行左右，可控性远好于引入依赖。

### 方案 B：Python 单栈（开发最快）

`pyzbar` / `pypdfium2` / `easyofd` / `lxml` / `PaddleOCR` / `FastAPI` + SQLite。
生态最全、迭代最快，适合验证想法。**注意 `PyMuPDF` 是 AGPL-3.0**，自用无碍，但别把它带进任何可能分发的产物。

### 建议

先用方案 A 跑通 L1~L3，因为**这三条路径已经覆盖你 95% 的票**，且全是字符串处理，不需要任何模型。OCR 用 sidecar 隔离，避免 Go 侧被 CGO 和模型依赖拖住。

---

## 六、合规与风险声明

工具内应在"关于"页明示，并写入 README：

1. 本工具仅用于个人发票信息的**采集、整理与本地归档辅助**，不提供任何发票查验、真伪判定服务。
2. 发票真伪及状态**以国家税务总局全国增值税发票查验平台结果为准**。
3. 所有数据**仅存储于本地**，不上传任何第三方服务器；OCR 如启用亦为本地推理。
4. 发票文件含个人敏感信息（姓名、身份证号、银行账号、手机号），归档目录应做访问控制与定期备份。
5. 电子会计凭证法定保管期为 **10 年**，建议"本地 + 离线介质"双备份。

---

## 七、参考项目

| 项目 | 语言 | 可借鉴点 |
|---|---|---|
| [EthanYoQ/Invoice-Downloader](https://github.com/EthanYoQ/Invoice-Downloader) | Python | 最成熟的对标。XML/OFD/PDF 多路抽取、分类归档、Excel 汇总、低置信度交人工复核。Apache-2.0 |
| [GitHub1he/QrToInvoice](https://github.com/GitHub1he/QrToInvoice) | Java | 二维码字段规则库写得很全：按票种分类识别（数电票第 5 位 8=航空/9=铁路，qrType 32=通行费等），责任链 + 策略模式 |
| [sanluan/einvoice](https://github.com/sanluan/einvoice) | Java | 早期电子发票识别实现，OFD/PDF 处理思路 |
| [renoyuan/easyofd](https://github.com/renoyuan/easyofd) | Python | 纯 Python OFD 解析，验证"OFD = ZIP + XML"这条路径 |
| [LeviTK/invoice-OCR](https://github.com/LeviTK/invoice-OCR) | Python | 极简自用范式：扫目录 → 解二维码 → 出 CSV，不碰原图。可作为 MVP 形态参考 |
| [PaddlePaddle/PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) | Python | 中文票据 OCR 事实标准，Apache-2.0 |

---

## 八、建议的实施顺序

1. **第 1 步**：XML 解析 + SQLite 台账 + 归档落盘 + 去重。这一步做完就已经能用了。
2. **第 2 步**：OFD 解析（ZIP + TextCode）。覆盖率补齐。
3. **第 3 步**：PDF 文本层 + 二维码解码。覆盖"只有 PDF / 只有截图"的场景。
4. **第 4 步**：本地一致性校验 + 异常清单。这是"不查验"前提下最该补的质量关。
5. **第 5 步**：OCR 兜底、统计视图、备份。

先别做 Web UI。CLI 够用两周，等你确认真实使用频率和字段需求，再决定要不要界面。
