# 电脑端

这是运行在电脑上的本地服务，负责接收小程序上传的文件，并提供一个本地网页查看文件列表。

当前版本支持：

- 健康检查：`GET /api/health`
- 上传文件：`POST /api/files/upload`
- 文件列表：`GET /api/files`
- 下载已接收文件：`GET /api/incoming/{id}/download`
- 下载电脑待取文件：`GET /api/outgoing/{name}/download`
- 本地网页：`http://电脑IP:8765/`

## 启动

在 `desktop/` 目录下执行：

```bash
go run .
```

也可以自定义监听地址和目录：

```bash
go run . -addr :9000 -data ./data
```

或设置环境变量：

```bash
INVOICE_ADDR=:9000
INVOICE_DATA_DIR=./data
```

## 数据目录

```text
desktop/data/
├── incoming/     小程序上传到电脑的文件
├── outgoing/     电脑提供给小程序下载的文件
└── index.json    上传记录索引
```

把要发给小程序的文件放进 `outgoing/` 即可。

## 测试

```bash
go test ./...
```

## 当前限制

- 单文件最大 20MB
- 没有 token 验证，只能在可信局域网内自用
- 不自动发现电脑地址，后续再加

接口协议见 `shared/protocol.md`。
