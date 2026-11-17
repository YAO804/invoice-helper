# M0 验证结果记录

> 每跑完一项就把结论填进来。这份记录决定了后续架构是否成立。

---

## S5 · 本地存储与过期清理 — 通过

### 模拟器

微信开发者工具 2.02.2609250 / 基础库 3.18.0 / iPhone 12-13

| 检测项 | 实测 |
|---|---|
| `dir` | `http://usr/invoices`（工具虚拟路径） |
| `dirCreated` | `true` |
| `write5MB` | `ok: true`, `554ms` |
| `limitSizeKB` | **10240** |
| `cleanedTestFile` | `true` |

### 真机

| 检测项 | 实测 | 对比模拟器 |
|---|---|---|
| `dir` | `wxfile://usr/invoices` ✓ | 符合预期 |
| `dirCreated` | `true` | 一致 |
| `write5MB` | `ok: true`, **22ms** | **快 25 倍** |
| `limitSizeKB` | **10486** | 略大于 10240 |
| `storageInfo.keyCount` | 0 | 未占用 Storage |
| `cleanedTestFile` | `true` | 一致 |

**S5b 清理逻辑**：`removedCount: 0`, `remainCount: 0` —— 目录为空属正常，不报错即通过。

### 结论

**架构前提成立：原件走文件系统，台账不能走 Storage。**

`limitSizeKB` 真机 10486 / 模拟器 10240，都约等于 10MB，证实 Storage 配额就是 10MB 量级。而文件系统写入 5MB 仅 22ms，完全够存几百张发票原件。

> 附带发现：模拟器的文件 IO 比真机慢 25 倍，**不要用模拟器的性能数据判断真机体验**。

### 待补充

- [ ] 真机 `USER_DATA_PATH` 实际可用总容量（官方口径 200MB，需灌满测试）
- [ ] 存满后的报错形态（决定"容量不足"如何提示用户）

---

## S1 · 扫码取原文 — 通过，且推翻了一个前置判断

**真机样本（数电票）**：

```
01,31,,26932000001877489821,10500.00,20261110,,277D
```

`kind: legacy-csv`，`scanType: QR_CODE`，`charSet: utf-8`，`rawLength: 51`

### 关键结论：数电票二维码是**明文串**，不是加密链接

规划阶段判断"数电票用动态二维码，扫出来是带时效令牌的 HTTPS 链接"，**实测证明这个判断是错的**。数电票与老版电子发票的二维码同构，都是逗号分隔明文：

| 位置 | 值 | 说明 |
|---|---|---|
| 1 版本号 | `01` | |
| 2 票种码 | `31` | **数电票**（老版电子普票 10 / 专票 20） |
| 3 发票代码 | 空 | 数电票无代码 |
| 4 发票号码 | `26932000001877489821` | 20 位，完整可读 |
| 5 价税合计 | `10500.00` | |
| 6 开票日期 | `20261110` | |
| 7 校验码 | 空 | 数电票无校验码 |
| 8 CRC | `277D` | 算法未知 |

### 影响

**扫码升级为可行的主入口**：一次扫码即可拿到「发票号码 + 价税合计 + 开票日期」，这三项正好构成去重键，也足够做快速录入（只需补销方名称）。

但仍**拿不到**销方名称、税额、税率、明细——这些必须从 XML/OFD 取。所以扫码是"快速录入口"，不是"完整解析"。

### CRC 校验：放弃

用真实样本枚举 **70 组**（14 种标准 CRC-16 变体 × 5 种载荷边界）全部未命中，说明这不是标准 CRC-16 算法。

已从代码中移除校验计算，只保留 `crcDeclared` 原值。**不要把 CRC 不匹配当作异常信号。**

---

## S2 · 从会话选文件 — 部分验证

**真机结果**：选中的是一张 **jpg 图片**，不是 XML。

```json
{
  "name": "de400ab21179b1a3f39fab1a9bdcaf92.jpg",
  "ext": "jpg",
  "size": 289827,
  "type": "image",
  "readable": true
}
```

### 已确认

- `chooseMessageFile` 可正常调用，返回路径可读
- 图片类文件 `type` 为 `"image"`，**文件名被微信重命名**（32 位 hex），原始名丢失

### 后续补测：以「文件」消息发送

S2 加上 `extension` 过滤后重跑，`.xml` / `.ofd` / `.pdf` 均能选中并**保留原始文件名**：

- `dzfp_26932000001295659876_20260802160711.xml`
- `26932000001295659876_宁波顺渝餐饮管理有限公司_20260802160633.ofd`
- `26932000001295659876_宁波顺渝餐饮管理有限公司_20260802160633.pdf`

**操作口径写进使用说明**：必须点聊天里的「文件」发送，不能发图片。发成图片会被微信改名成 32 位 hex 且丢失扩展名，`extension` 过滤直接失效。

---

## S3 · 端侧解析 XML — 通过，并据此重写了字段映射

**真机样本**：

| 项 | 值 |
|---|---|
| 文件名 | `dzfp_26932000001295659876_20260802160711.xml` |
| 大小 | 4304 字节 |
| BOM | 无 |
| 声明编码 | `utf-8`（与 `readFile` 默认读取一致，无转码问题） |
| 根节点 | `EInvoice` |
| 标签路径数 | 63 |
| 税务签名节点 | 存在 |

### 关键结论：三个「猜不出来」的路径陷阱

旧版 `einvoice.js` 用标签名模糊匹配，真机结果直接暴露了两个错误：

| 字段 | 旧猜测 | 真实路径 | 后果 |
|---|---|---|---|
| 价税合计 | `TotalTaxIncludedAmount` | `BasicInformation/TotalTax-includedAmount`（**带连字符**） | 靠 `pick()` 兜底命中了明细行的 `TotaltaxIncludedAmount`（**小写 t**）。单行明细时数值恰好相等，错误被掩盖 |
| 开票日期 | `IssueTime` 泛匹配 | `TaxSupervisionInfo/IssueTime` | `BasicInformation` 下只有 `RequestTime`（申请时间），语义不同 |
| 票种 | `GeneralOrSpecialVAT` 直接取文本 | `.../GeneralOrSpecialVAT/LabelName` | 取到的是容器 XML 串 `<LabelCode>02</LabelCode><LabelName>普通发票</LabelName>` |

另有两点：

- 个人抬头的 `BuyerInformation` 下**没有** `BuyerIdNum`，缺失属正常，不能报为字段异常。
- 销方名称 `宁波顺渝餐饮管理有限公司`，税号 `91330205MACB4PTU91`；买方 `姚未正（个人）`。

### 真实标签树（63 路径，用于校准映射表）

```
EInvoice
├─ Header
│  ├─ EIid, Version, EInvoiceTag
│  ├─ InherentLabel
│  │  ├─ EInvoiceType{LabelCode,LabelName}             → 01 / 电子发票
│  │  ├─ GeneralOrSpecialVAT{LabelCode,LabelName}      → 02 / 普通发票
│  │  ├─ InIssuType{LabelCode,LabelName}               → Y / 是否蓝字发票标志
│  │  └─ TaxpayerType{LabelCode,LabelName}             → 1 / 一般纳税人
│  └─ UndefinedLabel/Label{LabelCode,LabelName,LabelType}
├─ EInvoiceData
│  ├─ SellerInformation
│  │  └─ SellerName, SellerIdNum, SellerAddr,
│  │     SellerTelNum, SellerBankName, SellerBankAccNum
│  ├─ BuyerInformation
│  │  └─ BuyerName                       （个人抬头无 BuyerIdNum）
│  ├─ BasicInformation
│  │  └─ Drawer, RequestTime,
│  │     TotalAmWithoutTax, TotalTaxAm,
│  │     TotalTax-includedAmount, TotalTax-includedAmountInChinese
│  ├─ IssuItemInformation                （可重复，每行 6 个字段）
│  │  └─ ItemName, TaxClassificationCode, TaxRate,
│  │     Amount, ComTaxAm, TotaltaxIncludedAmount
│  ├─ SpecificInformation
│  └─ AdditionalInformation
├─ TaxSupervisionInfo
│  └─ InvoiceNumber, IssueTime
├─ SellerAuthentication
│  └─ AuthenticationMethods
└─ TaxBureauSignature
   └─ KeyInfo, Reference, SignatureAlgorithm, SignatureFormat,
      SignatureTime, SignatureValue
```

### 实测值全表（真机复跑确认）

| 字段 | 实测值 |
|---|---|
| `EIid` | `26932000001295659876`（**本票等于发票号码**） |
| `Version` | `0.37` |
| `EInvoiceTag` | `SWEI3302` |
| `Drawer` | 林素贞 |
| `RequestTime` | `2026-08-02 16:06:33`（≠ 开票日期 16:02 签名时间） |
| 大写金额 | `壹佰肆拾柒圆整`（是「圆」不是「元」） |
| 销方地址/电话/银行 | 均已取到（地址含"万象城 L4 层 L460 号"） |
| `TaxClassificationCode` | `3070401000000000000`（19 位） |
| 明细 | `*生产生活服务*餐饮`，金额 `138.68`，税额 `8.32`，税率 `0.06`，合计 `147.00` |
| `AuthenticationMethods` | `01` |
| `SignatureAlgorithm` | `1.2.156.10197.1.501`（OID，**SM2**） |
| `SignatureFormat` | `DETACH`（分离式签名） |
| `SignatureTime` | `2026-08-02 16:02:09` |
| `SignatureValue` 长度 | 781 字符 |
| `missing` | 空数组 ✓ |

### 新增发现：InIssuType 不是"蓝字发票"四个字

`EInvoice/Header/InherentLabel/InIssuType` 的 `LabelName` 实测是**字段名**「是否蓝字发票标志」，
真正的状态在 `LabelCode`：`Y` = 蓝字，`N` = 红字。

如果代码直接把 `LabelName` 当票种描述展示，界面上会出现「是否蓝字发票标志」这种不像人话的文案。
已在 `extractInvoice` 增加 `isBlue` 归一化字段（`Y/1 → true`，`N/0 → false`，其余 `null`），
`SignatureAlgorithm` 也加了 OID → 算法名映射（当前样本解析为 `SM2`）。

### 真机复跑确认（2026-11-16 14:21）

用户用更新后的代码在真机重跑：S3 摘要区输出
「发票号码 26932000001295659876 / 开票日期 2026-08-02 / 销方 宁波顺渝餐饮管理有限公司 / 价税合计 147.00 元 / 票种 普通发票 / 明细行数 1 / 税务签名 有 / 缺失字段 无」；
S4 输出 `hasDocSignature:false`、`hasAnnotation:true`、`hasCustomTags:true`、`hasTpl:true`、
`hasSigns:true`，`signatureHints` 为 Annots + Tags 两条。**与本地测试预期完全一致。**

### 代码变更

`einvoice.js` 已从「标签名候选匹配」重写为「真 XML 树 + 完整路径取值」：

- 新增 `parseXml / getNode / getAll / getText / flatText`，`getAll` 支持重复的 `IssuItemInformation`
- 对外主 API 改为 `extractInvoice(text)`，返回 `seller / buyer / amount / items[] / labels / signature / missing`
- 旧 `extractFields` 已删除
- 金额保留原始字符串，不做浮点求和
- `test/miniprogram/einvoice.test.js` 按真实树 1:1 重建（双明细，故意让明细行合计 100.00 + 47.00 ≠ 合计 147.00，确保「取错行」必被测试抓到），并按真机复跑值校准 `version / tag / EIid / LabelCode / 签名 OID / 大写金额 / 税收分类编码`，**60 项断言全通过**

---

## S4 · OFD / PDF 容器结构 — 通过，并修正了签名探测

### OFD

| 项 | 值 |
|---|---|
| 文件头 | `50 4b 03 04`（PK） → `isZip: true` |
| 大小 | 76327 字节 |
| 中央目录条目 | `declaredCount: 15`，实读 `entryCount: 15` ✓ |
| `OFD.xml` | 有 |
| `Content.xml` | 有（`Doc_0/Pages/Page_0/Content.xml`，6940 字节；另有模板 `Doc_0/Tpls/Tpl_0/Content.xml`，12373 字节） |
| `hasSigns` | **false** |

15 个条目：

```
OFD.xml
Doc_0/Document.xml, DocumentRes.xml, PublicRes.xml
Doc_0/Pages/Page_0/Content.xml
Doc_0/Tpls/Tpl_0/Content.xml
Doc_0/Res/image_6946.png, image_6920.png
Doc_0/font_6946.ttf, font_6946_0.ttf, font_6946_1.ttf
Doc_0/Annots/Annotations.xml
Doc_0/Annots/Page_0/Annotation.xml      ← 电子印章在这里
Doc_0/Tags/CustomTag.xml, CustomTags.xml
```

### 关键结论：没有 `Doc_0/Signs/` ≠ 没有签章

真实税务 OFD 把**文档级签名**放在 `Doc_0/Signs/`（本标准示例有，样本无），但**电子印章是页级注释**，放在 `Doc_0/Annots/Page_0/Annotation.xml`；业务标记在 `Doc_0/Tags/CustomTag.xml`。

已修正 `zip.js`：拆出 `hasDocSignature / hasAnnotation / hasCustomTags / hasTpl`，`signatureHints` 列出命中线索；`hasSigns` 保留为兼容字段，语义改为「存在任一签章线索」。避免把真票误判成「无签章」。

### PDF

文件头 `25 50 44 46 2d 31 2e 37` = `%PDF-1.7`，`isZip: false`，大小 145639 字节，**符合预期**。

PDF 不是容器，不做文本层解析；按既定策略 **原件留档、字段从 XML/OFD 取**。

### 结论

OFD 走 ZIP 路线成立：下一步引入 pako 解压 `Doc_0/Pages/Page_0/Content.xml`，抽取 `<TextCode>` 文本作为 L2 兜底。样式和字体资源（约 12 万字节）完全不用解，只解 Content.xml 即可。
