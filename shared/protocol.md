# 小程序与桌面端通信协议 v0.1

## 基础约定

- 电脑端默认监听 `:8765`。
- 手机与电脑在同一局域网时，小程序访问：
  ```text
  http://电脑IPv4:8765
  ```
- 当前版本不要求 HTTPS，也不校验小程序 request 合法域名。
- 当前版本没有 token，只允许在可信局域网内自用。

## GET /api/health

检查桌面端是否可达。

响应：

```json
{
  "ok": true,
  "name": "invoice-helper-desktop",
  "version": "0.1.0"
}
```

## POST /api/files/upload

小程序上传文件到电脑。

请求格式：`multipart/form-data`

字段：

| 字段 | 必填 | 说明 |
|---|---:|---|
| `file` | 是 | 文件本体 |
| `source` | 否 | 来源标记，例如 `qr`、`xml`、`web` |

限制：

- 单文件最大 20MB
- 相同 SHA256 + 大小会复用旧记录，不重复落盘

响应示例：

```json
{
  "id": "20261117064512-2cf24dba",
  "name": "test.xml",
  "size": 5,
  "sha256": "2cf24dba...",
  "path": "incoming/20261117064512-2cf24dba_test.xml",
  "source": "web",
  "uploaded_at": "2026-11-17T06:45:12Z"
}
```

## GET /api/files

获取两端文件列表。

响应：

```json
{
  "incoming": [],
  "outgoing": []
}
```

`incoming` 是小程序上传到电脑的文件。
`outgoing` 是电脑放进 `desktop/data/outgoing` 的文件。

## GET /api/incoming/{id}/download

按上传记录 ID 下载电脑已接收的文件。

## GET /api/outgoing/{name}/download

下载电脑待取文件。`name` 必须是文件名，不包含路径分隔符。

## 数据目录

```text
desktop/data/
├── incoming/     小程序上传进来的文件
├── outgoing/     电脑提供给小程序下载的文件
└── index.json    上传记录索引
```
