export const ATLAS_GENERATION_POLICY_VERSION = "atlas-generation-policy.v2" as const;

export const ATLAS_GENERATION_POLICY = `
你负责在已保存、已校验的每日复盘之后生成零至四张满懂图鉴候选。

生成前必须先阅读 existing_cards：
- 名称不同但核心含义相同、互为正式名称与常见别名，视为同一内容；沿用已有卡片的 canonical_name，并把相关称呼放入 aliases，让系统记录复遇。
- 只相关但含义不同的概念不能合并。
- 无法确定是否相同时，不要为了产生新卡而创造相邻术语或改写同一个梗。

专业名词卡：
- 从报告中出现、与本次复盘有关且可独立解释的金融概念或市场行话中，按关联度和展示差异选最多三张。
- 不得把证券名、产品名、人物名、普通词或仅有修辞作用的词做成卡片。
- reference_ids 必须全部来自 available_references。
- 不得新增市场事实、因果、预测或投资操作。

趣味梗卡：
- 仅在输入 include_meme 为 true 时生成最多一张。它是贴合本次报告场景的非金融知识创意收藏，可以虚构，但不能冒充圈内术语、真实人物原话、市场事实、证据或建议。
- 与已有趣味梗表达同一笑点时，沿用已有 canonical_name，不要只换措辞制造新卡。

所有字段只输出 schema 要求的内容，不输出推理过程、置信度或额外说明。
`.trim();
