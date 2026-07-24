# FinLens

`FinLens` 是当前工作名称。它是面向年轻轻投资者的每日持仓复盘助手，把用户确认的基金、ETF 和少量 A 股持仓，与有时点和来源的市场证据整理成可核对的每日分析卡。与当前持仓相关的金融概念翻译是次要价值，不能替代证据和建议。产品只提供有依据的方向性辅助，不代替用户交易，也不承诺投资结果。

## Current Status

仓库目前以产品契约和 MVP 规格为准。FNL-000 的 [`ADR-0003`](docs/decisions/0003-select-phase0-technical-and-deployment-baseline.md) 已提出 Phase 0 基线：Vite + React + TypeScript、薄 Fastify 服务，以及复用当前主机的 Nginx + Certbot HTTPS 入口。该 ADR 仍为 `Proposed`，需要 maintainer review 后才能作为 FNL-001 的绑定基线；ADR 被接受只代表技术决策成立，不代表应用、HTTPS 或回滚验收已经通过。

当前最高优先级是先通过 `FNL-000` 形成 Phase 0 技术与部署 ADR，再完成公开访客闭环：评审者从普通 HTTPS 链接、二维码或 NFC 入口进入移动端页面，明确选择模拟体验，查看一张可追溯证据的每日分析卡，并能观察市场证据失败时的诚实降级。

Phase 0 演示从版本化模拟白名单中按可见种子或场景标识确定性选择，必须可复现，不能生成任意随机持仓。主动查询属于明确的 Post-MVP 能力，不计入 MVP 或首版完成条件。

当前仓库尚无 `package.json` 或可运行应用，因此没有可执行的安装、开发、测试、构建或启动命令。FNL-001 脚手架必须实现 ADR-0003 规定的 npm 命令契约，并在命令真实通过后更新本节；不要把 ADR 中的目标命令当成现状。

## Read First

开始设计、开发或评审前，按顺序阅读：

1. [`PRODUCT.md`](PRODUCT.md)：产品目标、建议边界、隐私边界和验收证据。
2. [`CONTEXT.md`](CONTEXT.md)：领域术语、状态、不变量和数据分类。
3. [`docs/specs/mvp.md`](docs/specs/mvp.md)：完整可观察行为、失败状态和分阶段验收。
4. [`docs/decisions/`](docs/decisions/)：已接受的架构决策记录（ADR）。

若代码、Issue 或口头约定与这些文件冲突，先停止受影响的实现，明确冲突并更新契约或 ADR；不要在代码里静默创造新的产品规则。

## Product Boundaries

- 分析只能产生方向性建议，不得给出精确金额、份额、仓位比例、价格点位、交易时点或自动交易。
- 数据不足时必须输出有限分析或仅观察，列出缺口、影响和恢复动作，不得补猜。
- 公开入口、二维码和 NFC 只提供不含个人金融数据的导航。访客模拟数据必须始终明确标注。
- 截图提取只能生成待确认草稿。只有用户确认的持仓才能进入不可变、带版本和时间戳的组合快照。
- 叙事正面和理性证据背面必须引用同一版本的输入、证据和结论。
- 证据充分性和覆盖状态不表示市场结果概率，不得包装成 `high confidence` 预测承诺。
- 只有证据支持的风险边界突破可以使用更直接紧迫的措辞，仍不得给出精确交易指令。

## Delivery

开发工作使用 GitHub Issues 作为票据。每个 Issue 应交付一个可运行、可观察的纵向增量，声明依赖关系，并用用户可见结果或自动化检查定义验收。建议的 tracer-bullet 顺序和 Issue 草案见 [`docs/tickets/README.md`](docs/tickets/README.md)。

提交变更前请阅读 [`CONTRIBUTING.md`](CONTRIBUTING.md)。面向自动化开发 Agent 的项目规则见 [`AGENTS.md`](AGENTS.md)。

## Repository Governance

当前 `Wuxie233/finlens` 是只有单一所有者、尚无其他 collaborator 的个人私有仓库，短期单人开发可以继续使用。首位长期共同开发者加入前，建议创建专用 GitHub Free Organization 并受控迁移仓库：核心贡献者作为 organization member，通过团队按最小仓库角色授权；短期外部参与者按单仓库权限处理；至少两名可信任 owner 保障管理连续性，但严格限制 owner 数量。

迁移到 Organization 解决的是 GitHub 托管、权限和管理连续性，不会自动确定代码版权、劳动量、报酬、收益或退出安排。正式多人协作前应另行形成书面贡献与权益约定；仓库迁移本身不能代替该约定。当前不执行迁移，也不把 Organization 作为 Phase 0 运行时依赖。

治理依据见 GitHub 官方的 [plans](https://docs.github.com/en/get-started/learning-about-github/githubs-plans)、[organization repository roles](https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/repository-roles-for-an-organization)、[ownership continuity](https://docs.github.com/en/organizations/managing-peoples-access-to-your-organization-with-roles/maintaining-ownership-continuity-for-your-organization) 和 [repository transfer](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository) 文档。迁移前需单独核对目标套餐、Actions/Packages、保护规则和集成影响。

## Competition Context

FinLens 面向 AdventureX 度小满产品赛道，Qoder 是当前比赛构建约束。运行时必须可替换且无隐藏 Qoder 依赖，项目须支持脱离 Qoder 的本地复现，并只保留脱敏构建证据。该约束不构成对用户的能力、收益或专业资质背书。灵光和 PICO 不在项目目标范围内。
