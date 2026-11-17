# 小程序与桌面端通信协议 v0.2

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

响应：

```json
{
  "ok": true,
  "device": {
    "id": "mp-1763360000000-12345",
    "name": "攒票小匣小程序",
    "version": "1.0.0",
    "last_seen": "2026-11-17T07:20:00Z",
    "uploads": 0
  }
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
`stats` 包含接收文件数、接收字节、待取文件数、待取字节、今日接收数和字节。
`events` 是最近 80 条传输/删除事件。

## POST /api/files/upload

小程序上传文件到电脑。

请求格式：`multipart/form-data`

字段：

| 字段 | 必填 | 说明 |
|---|---:|---|
| `file` | 是 | 文件本体 |
| `source` | 否 | 来源标记，例如 `qr`、`xml`、`web` |
| `device_id` | 否 | 小程序设备 ID，用于设备在线和上传计数 |

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

## 下载接口

```text
GET /api/incoming/{id}/download
GET /api/outgoing/{name}/download
```

`name` 必须是文件名，不包含路径分隔符。

## 删除接口

```text
DELETE /api/incoming/{id}
DELETE /api/outgoing/{name}
```

删除成功返回：

```json
{ "ok": true }
```

## 数据目录

```text
desktop/data/
├── incoming/     小程序上传进来的文件
├── outgoing/     电脑提供给小程序下载的文件
├── index.json    上传记录索引
└── registry.json 设备与事件记录
```
