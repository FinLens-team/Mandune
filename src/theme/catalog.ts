export const DEFAULT_THEME_ID = "eastern_observation" as const;

export const THEME_IDS = [DEFAULT_THEME_ID, "jixing_doudou", "sunge"] as const;

export type ThemeId = (typeof THEME_IDS)[number];
export type ThemePersonaId = "doudou" | "nailong" | "sunge";

export interface ThemeTokens {
  accent: string;
  background: string;
  backgroundDeep: string;
  border: string;
  focus: string;
  ink: string;
  inkSoft: string;
  onAccent: string;
  surface: string;
  surfaceRaised: string;
}

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  description: string;
  personaId: ThemePersonaId;
  mascot: {
    name: string;
    alt: string;
    caption: string;
  };
  copy: {
    homeAction: string;
    resumeAction: string;
    resultTitle: string;
    danmaku: readonly string[];
  };
  tokens: ThemeTokens;
}

export const THEMES: Readonly<Record<ThemeId, ThemeDefinition>> = {
  eastern_observation: {
    id: "eastern_observation",
    label: "我是龙",
    description: "我是奶龙！哈哈哈哈哈",
    personaId: "nailong",
    mascot: {
      name: "奶龙",
      alt: "奶龙，我是龙主题的复盘向导",
      caption: "陪你看懂，也陪你稳住",
    },
    copy: {
      homeAction: "进行今日复盘",
      resumeAction: "复盘进行中",
      resultTitle: "奶龙带你看看今天的仓",
      danmaku: [
        "我是奶龙！哈哈哈哈哈",
        "奶龙来咯，先看看今天发生了啥",
        "涨涨跌跌，先别慌慌",
        "先核对，再判断",
        "看懂一点，安心一点",
        "笑一笑，再稳稳看",
        "这只票今天偷偷充能了吗",
        "风险要讲清楚，不能只顾着香香",
        "未知就是未知，不乱猜",
        "今天的肉肉从哪里来",
        "别急着截图，先拆一拆",
        "组合抖一抖，我来瞅一瞅",
        "证据到齐，再开讲",
        "一只票很亮，也要看整盘",
        "有变化不等于有答案",
        "先看结构，再看热闹",
        "奶龙认真模式启动",
        "开心可以，结论要稳",
        "不编数字，只讲看得见的",
        "今天也要把未知说出来",
      ],
    },
    tokens: {
      accent: "#f2c14e",
      background: "#46403b",
      backgroundDeep: "#38332f",
      border: "rgb(247 242 233 / 18%)",
      focus: "#ffd97a",
      ink: "#f7f2e9",
      inkSoft: "rgb(247 242 233 / 82%)",
      onAccent: "#3b3530",
      surface: "#474139",
      surfaceRaised: "#565047",
    },
  },
  jixing_doudou: {
    id: "jixing_doudou",
    label: "吉星高照",
    description: "贫道掐指一算，先借星象之趣，把市场之理讲明白",
    personaId: "doudou",
    mascot: {
      name: "兜兜玄师",
      alt: "兜兜玄师，吉星高照主题的复盘向导",
      caption: "借玄学之说，喻市场之理",
    },
    copy: {
      homeAction: "请兜兜批盘",
      resumeAction: "批盘进行中",
      resultTitle: "兜兜玄师今日批盘",
      danmaku: [
        "贫道掐指一算，先看证据",
        "借星象之趣，讲市场之理",
        "诸星归位，再看今日变化",
        "吉星高照，也要看风险边界",
        "命盘不可乱断，数据不可乱编",
        "紫气东来，先核对来源",
        "一宫独旺，未必全盘皆安",
        "八字偏枯，说的是结构集中",
        "凶星犯宫，只是风险比喻",
        "天机未明，就把未知留下",
        "先观组合，再论一星",
        "贫道只解盘，不替你决断",
        "此乃比喻，不是真实预测",
        "财气如何，先看证据覆盖",
        "星宿有明暗，数据有边界",
        "卦象再玄，也不能越过事实",
        "今日命盘，从持仓结构说起",
        "五行要平衡，组合也看集中",
        "未核验之事，贫道不妄言",
        "收坛之前，把风险讲清",
      ],
    },
    tokens: {
      accent: "#d9ad55",
      background: "#281735",
      backgroundDeep: "#160c20",
      border: "rgb(245 231 255 / 20%)",
      focus: "#f3cd75",
      ink: "#fbf4ff",
      inkSoft: "rgb(251 244 255 / 80%)",
      onAccent: "#25162f",
      surface: "#382548",
      surfaceRaised: "#49315d",
    },
  },
  sunge: {
    id: "sunge",
    label: "孙哥",
    description: "兄弟们，梗可以有，证据、风险和未知一个都不能少",
    personaId: "sunge",
    mascot: {
      name: "孙哥",
      alt: "孙哥主题的像素复盘向导",
      caption: "格局要有，边界也要有",
    },
    copy: {
      homeAction: "让孙哥复盘",
      resumeAction: "这波分析中",
      resultTitle: "孙哥带你复盘今日持仓",
      danmaku: [
        "兄弟们，这波先看证据",
        "格局打开，风险也要摊开",
        "别急着 FOMO，先看结构",
        "to the moon 之前先核对事实",
        "diamond hands 不是忽略风险",
        "这波能不能讲，取决于证据",
        "一个账户，不代表全部人生",
        "长期主义也要承认未知",
        "先看集中度，再谈格局",
        "兄弟们，未核验的不吹",
        "今天谁是 MVP，证据说了算",
        "all in 是梗，不是建议",
        "涨了别上头，跌了别脑补",
        "这波复盘，只讲看得见的",
        "信仰归信仰，边界归边界",
        "先拆贡献，再看组合",
        "家人们，风险提示不能省",
        "市场有波动，报告有依据",
        "有结论就讲原因，没证据就留白",
        "向钱看，也要向风险看",
      ],
    },
    tokens: {
      accent: "#ff6a21",
      background: "#371112",
      backgroundDeep: "#1d0809",
      border: "rgb(255 239 225 / 20%)",
      focus: "#ffad73",
      ink: "#fff5eb",
      inkSoft: "rgb(255 245 235 / 80%)",
      onAccent: "#2d0c0d",
      surface: "#4b191a",
      surfaceRaised: "#622222",
    },
  },
};

const LEGACY_PERSONAS: Readonly<Record<string, ThemePersonaId>> = {
  nailong: "nailong",
  sun_ge: "sunge",
};

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

export function themeForId(value: string | null | undefined): ThemeDefinition {
  return isThemeId(value) ? THEMES[value] : THEMES[DEFAULT_THEME_ID];
}

export function personaIdForTheme(value: string): ThemePersonaId {
  return isThemeId(value) ? THEMES[value].personaId : LEGACY_PERSONAS[value] ?? "nailong";
}

export function resultTitleForTheme(value: string): string {
  return themeForId(value).copy.resultTitle;
}
