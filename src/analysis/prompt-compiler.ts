import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  ATLAS_GENERATION_POLICY_VERSION,
} from "../atlas/generation-policy.js";
import type { ReviewPacketV2 } from "./review-packet.js";

export const DAILY_REVIEW_PROMPT_VERSION = "daily-review-prompt.v3" as const;
export const DAILY_REVIEW_MODEL_ID = "step-explore" as const;

export type DailyReviewPersonaId = "doudou" | "nailong" | "sunge";

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
};

export const DAILY_REVIEW_SKILL_VERSIONS = {
  core: `sha256:${CORE_SKILL.sha256}`,
  personas: {
    doudou: `sha256:${PERSONA_SKILLS.doudou.sha256}`,
    nailong: `sha256:${PERSONA_SKILLS.nailong.sha256}`,
    sunge: `sha256:${PERSONA_SKILLS.sunge.sha256}`,
  },
} as const;

const THEME_PERSONAS: Readonly<Record<string, DailyReviewPersonaId>> = {
  eastern_observation: "doudou",
  nailong: "nailong",
  sunge: "sunge",
  sun_ge: "sunge",
};

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
`.trim();

const RATIONAL_CALL_INSTRUCTIONS = `
本次只生成理性客观背面。输出 generated-rational-report.v2 JSON，不生成角色正文或 Atlas 候选。
完整说明已确认变化、确定性派生、组合结构、风险、未知边界和方向性观察；不要复述 skill 中的每日学习内容。
fact_ids 与 event_ids 只列出正文实际使用的 ReviewPacket 引用。
`.trim();

const PERSONA_CALL_INSTRUCTIONS = `
本次只生成角色正面。输入同时包含 ReviewPacket 和已经通过校验的 rational_report；不得重新分析、取数或形成新结论。
完整执行当前角色 skill 的人设与语气，但应用边界覆盖其中冲突的示例、交易暗示、真实人物冒充、玄学预测和每日课堂要求。
正面是 400 至 800 个汉字的快速读懂版，角色口吻贯穿全文；逐项覆盖理性背面的关键持仓、组合风险和未知边界，不沿用报告腔。
输出 generated-persona-report.v2 JSON。fact_ids 与 event_ids 必须与 rational_report 完全相同。
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
  return THEME_PERSONAS[themeId] ?? "doudou";
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
