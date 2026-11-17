# 小程序与桌面端通信协议 v0.4

## 基础约定

- 电脑端默认监听 `:8765`。
- 手机与电脑在同一局域网时，小程序访问：
  ```text
  http://电脑IPv4:8765
  ```
- 当前版本不要求 HTTPS，也不校验小程序 request 合法域名。
- 当前版本没有 token，只允许在可信局域网内自用。
- 小程序打开时每 20 秒上报一次心跳；桌面端按 45 秒窗口判断在线。

## GET /api/health

检查桌面端服务本身是否可达。

响应：

```json
{
  "ok": true,
  "name": "invoice-helper-desktop",
  "version": "0.2.0"
}
```

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

`network.addresses` 给出检测到的局域网地址。
`mini_program.online` 表示最近 45 秒内是否收到小程序心跳。
`events` 是最近 80 条事件。

## 文件传输接口

```text
POST /api/files/upload
GET  /api/files
GET  /api/incoming/{id}/download
GET  /api/outgoing/{name}/download
DELETE /api/incoming/{id}
DELETE /api/outgoing/{name}
```

上传字段：

| 字段 | 必填 | 说明 |
|---|---:|---|
| `file` | 是 | 文件本体 |
| `source` | 否 | 来源标记，例如 `qr`、`xml`、`web` |
| `device_id` | 否 | 小程序设备 ID |

单文件最大 20MB。相同 SHA256 + 大小复用旧记录。

## 发票台账接口

台账文件：`desktop/data/invoices.csv`

CSV 列：

```text
发票号码,发票代码,票种,开票日期,销方名称,销方税号,买方名称,买方税号,
不含税金额,税额,价税合计,税率,录入批次,录入时间
```

兼容旧版 12 列 CSV；缺少批次和录入时间时自动生成。

### POST /api/invoices/check

发送前查重。小程序把本次发票号码一次性提交，避免重复票静默入库。

请求：

```json
{
  "numbers": ["26932000001877489821", "26932000001295659876"]
}
```

响应 `matches` 以发票号码为键，值为台账中已有的那条记录：

```json
{
  "matches": {
    "26932000001877489821": {
      "number": "26932000001877489821",
      "seller_name": "宁波顺渝餐饮管理有限公司",
      "total": "147.00",
      "issue_date": "2026-08-02"
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
      "seller_name": "",
      "seller_tax_id": "",
      "buyer_name": "",
      "buyer_tax_id": "",
      "amount": "",
      "tax": "",
      "total": "147.00",
      "tax_rate": "",
      "batch": "",
      "created_at": ""
    }
  ]
}
```

- 单批最多 200 张，超出返回 400。
- `batch` 和 `created_at` 留空时由电脑端自动生成。
- 金额字段是普通元字符串；扫码草稿只有号码、日期、价税合计，销方/税额等留空，台账列表会标记「待补录」。
- 重复票仍会写入并高亮，由用户自行删除。

响应：

```json
{ "added": 1, "batch": "B-20261117-153012" }
```

### GET /api/invoices

查询发票列表。支持参数：

```text
keyword, number, code, kind, seller, buyer, batch,
date_from, date_to, amount_min, amount_max,
only_duplicates=1, only_need_fill=1
```

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

判重口径：**发票号码相同即为重复**。
重复记录会写入台账并高亮显示，由用户自行选择删除，不自动删除。

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

重复行仍会写入台账，方便用户对比后自行删除；只有缺发票号码的行会被跳过。

### GET /api/invoices/export

导出 CSV。可使用查询参数筛选，也可用 `ids=1,2,3` 导出选中记录。

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
├── incoming/     小程序上传进来的文件
├── outgoing/     电脑提供给小程序下载的文件
├── backup/       发票台账历史备份
├── invoices.csv  发票台账主文件
├── index.json    上传记录索引
└── registry.json 设备与事件记录
```
