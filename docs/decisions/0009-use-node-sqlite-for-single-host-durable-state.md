# ADR-0009: Use Node SQLite for Single-Host Durable State

- Status: Accepted
- Date: 2026-07-25
- Ticket: #61 / MD-021（单机耐久状态与生产接线）

## Context

满懂的公开 Demo 需要让匿名工作区、不可变复盘历史和删除墓碑跨进程重启保留。目标部署是单主机、单 Node 进程、低并发 Demo；本票不选择多实例数据库、账号体系、跨设备恢复或长期备份。数据库不可用时不能回退进程内存，否则旧 locator 会得到一个外观正常但内容丢失的新状态面。

Node 22.22.1 的本地 capability check 验证了内置 `node:sqlite`：SQLite 3.51.2 可打开数据库、执行 `BEGIN IMMEDIATE` 事务、启用外键级联，并设置和读取 `busy_timeout`。仓库集成测试进一步验证 WAL、`user_version`、双连接唯一写入、锁超时、迁移回滚、损坏库与未知 schema 失败路径。Node 22 中该模块仍会发出 ExperimentalWarning，因此使用范围必须留在 Store 适配器后，并由固定 Node 22 运行时与验收测试约束。

## Decision

使用 Node 22 内置 `node:sqlite` 的同步 `DatabaseSync` 作为单主机持久化驱动，不增加原生第三方依赖。

1. 生产启动先打开数据库、执行完整性检查和迁移，再绑定 HTTP 端口。任何路径、权限、损坏、未知 schema 或迁移错误都终止启动，不创建 `MemoryWorkspaceStore` 或 `MemoryHistoryStore` 作为回退。
2. 每个连接显式启用 WAL、`foreign_keys=ON`、有限 `busy_timeout` 和 `trusted_schema=OFF`。数据库及已存在的 WAL/SHM 文件收紧为 `0600`。
3. `migrations/*.sql` 按编号串行执行；每个文件和对应 `PRAGMA user_version` 在同一 `BEGIN IMMEDIATE` 事务提交。高于当前版本的 schema 直接拒绝，避免旧 release 误写新结构。
4. `SqliteWorkspaceStore` 与 `SqliteHistoryStore` 实现既有 Store 接口。历史记录以完整 envelope 单行提交，并以 `(workspace_id, record_id)` 和 `(workspace_id, analysis_id)` 保证唯一。
5. 主动删除和 TTL 删除在事务内先写 `workspace_tombstones`，再删除 workspace；外键在同一事务级联 history。墓碑阻止迟到分析在删除后重新写入。过期、删除、缺失和伪造 locator 对外统一为 `unauthorized`。
6. 工作区 Cookie 固定为 `Secure; HttpOnly; SameSite=Lax; Path=/` 的 `__Host-md_workspace`，不设置 Domain。清理只通过本地 maintenance CLI 执行，不提供公开 purge route；命令只输出计数。
7. `HOST`、`PORT`、`APP_VERSION`、`MANDONG_DB_PATH`、迁移目录和锁等待上限由服务端环境配置。默认数据库路径为 `/var/lib/mandong/mandong.sqlite3`；部署必须预先创建仅服务用户可访问的父目录，并把候选 commit SHA 写入 `APP_VERSION`。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| `better-sqlite3` | 当前不选。API 成熟，但增加原生二进制依赖和 Node ABI/安装面；本地所需能力已由 Node 22 内置模块证明。若内置模块稳定性在目标运行时不满足验收，可仅替换 Store 适配器。 |
| `sqlite3` | 当前不选。异步绑定与额外依赖没有为单进程低并发 Demo 提供必要收益。 |
| PostgreSQL/托管数据库 | 推迟。多实例、跨主机恢复和独立数据库运维不属于 #61；提前引入会扩大凭据、网络和部署故障面。 |
| 进程内存 + 文件快照 | 拒绝。无法可靠提供事务级联、并发唯一性、锁语义和崩溃一致性。 |

## Consequences

- 单进程同步数据库调用会短暂占用事件循环，因此该选择只适用于当前低并发单机 Demo；扩展到多实例或持续高写入前必须重新评估。
- `node:sqlite` 的实验状态由固定 Node 22 小版本、启动自检和持久化验收测试控制；领域层和 HTTP 层不依赖其类型。
- 数据库文件不是备份方案。Demo 只承诺 30 天工作区与不可恢复删除，不承诺跨设备找回或长期归档。
- 未来数据库替换只实现 `WorkspaceStore` 与 `HistoryStore`，不改变工作区、历史或分析契约。

## References

- [`PRODUCT.md`](../../PRODUCT.md)
- [`docs/specs/demo-v1.md`](../specs/demo-v1.md)
- ADR-0008
- GitHub Issue #61 / MD-021
