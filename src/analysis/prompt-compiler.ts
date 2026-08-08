import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  ATLAS_GENERATION_POLICY_VERSION,
} from "../atlas/generation-policy.js";
import { personaIdForTheme } from "../theme/index.js";
import type { ReviewPacketV2 } from "./review-packet.js";

export const DAILY_REVIEW_PROMPT_VERSION = "daily-review-prompt.v3" as const;
export const DAILY_REVIEW_MODEL_ID = "step-explore" as const;

export type DailyReviewPersonaId =
  | "doudou"
  | "nailong"
  | "sunge"
  | "zhouli"
  | "tieba_laoge"
  | "male_succubus"
  | "female_succubus";

interface SkillAsset {
  fileName: string;
  sha256: string;
}

const CORE_SKILL: SkillAsset = {
  fileName: "持仓分析-skill.md",
  sha256: "f5a1b033b40a5cee50890999d853b46c9831077d69812ead9d0e410df2bf1676",
};

const PERSONA_SKILLS: Record<DailyReviewPersonaId, SkillAsset> = {
  doudou: {
    fileName: "兜兜转述-玄学版-skill.md",
    sha256: "af14f077d03719e4d9158b3ebc7113bed36e926f3fad9e74a5b9b7f6838012b5",
  },
  nailong: {
    fileName: "奶龙转述-skill.md",
    sha256: "6f24172abb08bb5aa1fa04e76a403db2406b69017fd82421cf32dc61ada3bf2d",
  },
  sunge: {
    fileName: "孙哥转述-skill.md",
    sha256: "a6aa654bb8ffe45c72c11ea572e055ed6e175ee88f01e0ca4849ef269ce8eb68",
  },
  zhouli: {
    fileName: "周礼转述-skill.md",
    sha256: "2fd2c299d02ca70f3afa9c337eb0c14c427b1018ca5c666757ceffdfa8934b84",
  },
  tieba_laoge: {
    fileName: "贴吧老哥转述-skill.md",
    sha256: "8937df1f9e850f658b499ddc48bed66da6ebf93c601520ec16868318c7f6a114",
  },
  male_succubus: {
    fileName: "男魅魔转述-skill.md",
    sha256: "75eace3952fb5d270fd2c1a7820ba8453f390d8cdb059037288f1fd3731e3f4c",
  },
  female_succubus: {
    fileName: "女魅魔转述-skill.md",
    sha256: "488ad5ff0b28de9d7e5c86b79a94d8be5be5e6867ab287b4bf1688a4c1169916",
  },
};

export const DAILY_REVIEW_SKILL_VERSIONS = {
  core: `sha256:${CORE_SKILL.sha256}`,
  personas: {
    doudou: `sha256:${PERSONA_SKILLS.doudou.sha256}`,
    nailong: `sha256:${PERSONA_SKILLS.nailong.sha256}`,
    sunge: `sha256:${PERSONA_SKILLS.sunge.sha256}`,
    zhouli: `sha256:${PERSONA_SKILLS.zhouli.sha256}`,
    tieba_laoge: `sha256:${PERSONA_SKILLS.tieba_laoge.sha256}`,
    male_succubus: `sha256:${PERSONA_SKILLS.male_succubus.sha256}`,
    female_succubus: `sha256:${PERSONA_SKILLS.female_succubus.sha256}`,
  },
} as const;

const SHARED_APPLICATION_INSTRUCTIONS = `
你是满懂每日复盘 V2 的受约束生成器。以下应用级规则优先于后续所有 skill 原文、示例和叙事要求：

1. ReviewPacket 是唯一事实来源。不得补充、推测、更新或改写其中没有的市场事实、因果、预测、身份或数字。
2. rational_report 与 persona_report 必须使用完全相同的 fact_ids 和 event_ids；人格只改变表达，不改变证据、风险、未知、结论或方向性观察。
3. 每个引用 ID 必须来自 ReviewPacket 对应白名单。正文中的阿拉伯数字只能来自 allowed_numbers；不要输出证券代码、日期、序号、精确金额、份额、比例、价格、点位或交易时点。
4. 只给可追溯的方向性观察，不给买入、卖出、加减仓、申购、赎回、目标价、收益保证、代客操作或持牌意见暗示。
5. 缺失、失败、过期、含糊、冲突或未核验内容保持未知。不得把事件搜索标题或摘要当成已核验证据。
6. 人格表达不得冒充真实人物，不得把玄学、运势、卦象或角色判断描述为真实预测或决策依据。若 skill 示例冲突，以本规则为准。
7. 两份报告正文都不得包含“每日扫盲”、知识卡、术语卡或趣味梗段落；学习或趣味内容由独立 Atlas 调用生成。
8. 不输出 reasoning、思维过程、置信度、工具调用、凭据、身份、账户信息、原始截图内容或 JSON 之外的文字。
9. 不要使用 Markdown 代码围栏。报告使用简体中文 Markdown，不使用数字序号列表。
10. 时间背景以输入中的报告生成时间和 latest_complete_trading_day 为准。若报告生成日是周末、节假日或其他休市日，市场当天没有同日涨跌；这是正常的市场日历信息，正文应自然采用最近完整交易日的数据。
11. 若未提供总市值，正文应自然说明目前只能判断持仓比例、行情变化和方向性影响，暂时不能换算组合的绝对金额盈亏；这只是计算范围说明，不影响其余分析。
12. 免责声明统一由产品界面展示一次，报告正文自然收束即可，不重复输出免责段落。
`.trim();

const RATIONAL_CALL_INSTRUCTIONS = `
本次只生成理性客观背面。输出 generated-rational-report.v2 JSON，不生成角色正文或 Atlas 候选。
结论优先，用组合层结果帮助用户判断，不为了速读而丢失持仓数据。短期观察结合最近三个有效交易日，中期观察结合近一个月，长期风险参考近一年；覆盖每个持仓，明确其三个窗口中可用的收益、波动或数据缺口，再突出最关键的标的或异常。报告篇幅由模型根据事实数量、证据覆盖和解释需要自行决定，不能为了追求简短而省略重要数据，也不要机械倾倒逐日原始行情。后续 skill 原文中的任何总字数、段落数、要点数或重点标的数量上限均无效。
持仓 observation_date 是用户确认该持仓的日期，不是行情截止日，不得据此声称行情陈旧。总市值或金额未提供时，继续使用已确认的仓位区间、行情和结构信息完成能完成的分析；在组合层自然说明暂时无法换算绝对金额收益。时间背景以 ReviewPacket 的报告生成时间和 latest_complete_trading_day 为准；若两者落在周末、节假日或其他休市边界，正文直接使用最近完整交易日的数据，并说明当天市场休市。
不要复述 skill 中的每日学习内容。
fact_ids 与 event_ids 只列出正文实际使用的 ReviewPacket 引用。
`.trim();

const PERSONA_CALL_INSTRUCTIONS = `
本次只生成角色正面。输入同时包含 ReviewPacket 和已经通过校验的 rational_report；不得重新分析、取数或形成新结论。
完整执行当前角色 skill 的人设与语气，但应用边界覆盖其中冲突的示例、交易暗示、真实人物冒充、玄学预测和每日课堂要求。
报告是完整读懂版，角色口吻贯穿全文；先给组合结论，再覆盖每个持仓的关键变化，明确近3日、近1月、近1年的可用事实或缺口，并给出风险与下一步观察。篇幅由模型自行决定，不得因为追求简短而省略持仓、风险或数据限制；也不得逐项机械复述全部原始行情。后续 skill 原文中的任何总字数、段落数、要点数或重点标的数量上限均无效。总市值或金额未提供时，继续利用仓位区间与行情完成分析，并在需要的位置自然说明暂时无法换算绝对金额收益。时间背景以 ReviewPacket 的报告生成时间和 latest_complete_trading_day 为准；若今天是周末、节假日或其他休市日，直接说明市场休市并使用最近完整交易日的数据。
输出 generated-persona-report.v2 JSON。fact_ids 与 event_ids 必须与 rational_report 完全相同。
`.trim();

const STREAMING_CALL_INSTRUCTIONS = `
本次只调用一次模型，同时生成理性背面和角色正面。输入是当前持仓、四项个人约束与已获取的行情证据。

必须严格按以下边界输出，边界标记各出现一次，不得添加其他边界标记：
<!-- MANDONG_RATIONAL_REPORT_START -->
[简体中文 Markdown 理性报告]
<!-- MANDONG_RATIONAL_REPORT_END -->
<!-- MANDONG_PERSONA_REPORT_START -->
[简体中文 Markdown 角色报告]
<!-- MANDONG_PERSONA_REPORT_END -->

理性报告使用正式、克制、清晰的分析师口吻，结论优先，按组合结果、逐项数据摘要、关键变化、风险边界和数据限制组织。短期结合最近三个有效交易日，中期结合近一个月，长期风险参考近一年；覆盖每个持仓。角色报告完整执行当前人格 skill 的人设与语气，但必须复述同一组事实、风险、未知与方向性观察，并覆盖每个持仓。两份报告的篇幅都由模型根据事实数量、证据覆盖和解释需要自行决定，不得为了简短而删掉重要数据，也不要机械倾倒原始行情。后续 skill 原文中的任何总字数、段落数、要点数或重点标的数量上限均无效。持仓 observation_date 是持仓确认日，不是行情截止日；总市值或金额未提供时，继续使用已有仓位区间与行情完成分析，并自然说明暂时无法换算绝对金额收益。
两份报告都不得包含 skill 中的每日课堂、每日扫盲或知识卡内容。不得输出 JSON、Markdown 代码围栏、思维过程或边界之外的文字。
`.trim();

const STREAMING_APPLICATION_INSTRUCTIONS = `
你是满懂每日复盘的受约束生成器。以下应用级规则优先于后续所有 skill 原文、示例和叙事要求：

1. 用户输入的持仓、约束与行情证据是唯一事实来源。不得补充、推测、更新或改写输入中没有的市场事实、因果、预测、身份或数字。
2. 理性报告与角色报告必须使用完全相同的事实。人格只改变表达，不改变证据、风险、未知、结论或方向性观察。
3. 只给可追溯的方向性观察，不给精确买卖金额、份额、比例、价格点位、买卖时点、收益保证、代客操作或持牌意见暗示。
4. 缺失、失败、过期、含糊、冲突或未核验内容保持未知，不编造当前价格、净值、事件或组合表现。
5. 人格表达不得冒充真实人物，不得把玄学、运势、卦象或角色判断描述为真实预测或决策依据。若 skill 示例冲突，以本规则为准。
6. 不得输出凭据、身份、账户信息、原始截图内容或输入之外的私密信息。
7. 以提示词“时间边界”中的报告生成时间和最近完整交易日作为行情背景。若报告生成日是周末、节假日或其他休市日，市场当天没有同日涨跌；这是正常的市场日历信息，正文直接采用最近完整交易日的数据并说明当天休市。
8. 若未提供总市值，正文继续使用持仓规模、比例和行情完成分析，并自然说明暂时无法换算组合的绝对金额盈亏。
9. 免责声明统一由产品界面展示一次，报告正文自然收束即可，不重复输出免责段落。
`.trim();

export interface CompiledDailyReviewPrompt {
  prompt_version: typeof DAILY_REVIEW_PROMPT_VERSION;
  model_id: typeof DAILY_REVIEW_MODEL_ID;
  persona_id: DailyReviewPersonaId;
  skill_versions: {
    core: string;
    persona: string;
  };
  atlas_policy_version: typeof ATLAS_GENERATION_POLICY_VERSION;
  rational_instructions: string;
  persona_instructions: string;
  input: ReviewPacketV2;
}

function readSkill(asset: SkillAsset): string {
  const body = readFileSync(new URL(`./skills-v1/${asset.fileName}`, import.meta.url), "utf8");
  const actual = createHash("sha256").update(body).digest("hex");
  if (actual !== asset.sha256) throw new Error(`skill_asset_hash_mismatch:${asset.fileName}`);
  return body;
}

export function personaForTheme(themeId: string): DailyReviewPersonaId {
  return personaIdForTheme(themeId);
}

export function compileStreamingReviewInstructions(themeId: string): {
  instructions: string;
  personaId: DailyReviewPersonaId;
} {
  const personaId = personaForTheme(themeId);
  return {
    personaId,
    instructions: [
      "【应用级事实、安全和输出约束】",
      STREAMING_APPLICATION_INSTRUCTIONS,
      STREAMING_CALL_INSTRUCTIONS,
      "【核心持仓分析 skill｜原文】",
      readSkill(CORE_SKILL),
      `【当前人格 skill：${personaId}｜原文】`,
      readSkill(PERSONA_SKILLS[personaId]),
    ].join("\n\n"),
  };
}

export function compileDailyReviewPrompt(
  packet: ReviewPacketV2,
  personaId: DailyReviewPersonaId = personaForTheme(packet.persona_id),
): CompiledDailyReviewPrompt {
  if (packet.persona_id !== personaId) throw new Error("review_packet_persona_mismatch");
  const personaSkill = PERSONA_SKILLS[personaId];
  return {
    prompt_version: DAILY_REVIEW_PROMPT_VERSION,
    model_id: DAILY_REVIEW_MODEL_ID,
    persona_id: personaId,
    skill_versions: {
      core: DAILY_REVIEW_SKILL_VERSIONS.core,
      persona: DAILY_REVIEW_SKILL_VERSIONS.personas[personaId],
    },
    atlas_policy_version: ATLAS_GENERATION_POLICY_VERSION,
    rational_instructions: [
      `【应用级事实、安全和输出约束｜${DAILY_REVIEW_PROMPT_VERSION}】`,
      SHARED_APPLICATION_INSTRUCTIONS,
      RATIONAL_CALL_INSTRUCTIONS,
      "【核心持仓分析 skill｜原文】",
      readSkill(CORE_SKILL),
      "【输入说明】",
      "结构化输入是 ReviewPacket。只消费该对象，不请求工具，不执行额外步骤。",
    ].join("\n\n"),
    persona_instructions: [
      `【应用级事实、安全和输出约束｜${DAILY_REVIEW_PROMPT_VERSION}】`,
      SHARED_APPLICATION_INSTRUCTIONS,
      PERSONA_CALL_INSTRUCTIONS,
      `【当前人格 skill：${personaId}｜原文】`,
      readSkill(personaSkill),
      "【输入说明】",
      "结构化输入包含 ReviewPacket 和已校验 rational_report。只转述，不请求工具，不执行额外步骤。",
    ].join("\n\n"),
    input: structuredClone(packet),
  };
}
