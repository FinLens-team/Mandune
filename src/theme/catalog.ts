export const DEFAULT_THEME_ID = "eastern_observation" as const;

export const THEME_IDS = [
  DEFAULT_THEME_ID,
  "jixing_doudou",
  "sunge",
  "zhouli",
  "tieba_laoge",
  "male_succubus",
  "female_succubus",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];
export type ThemePersonaId =
  | "doudou"
  | "nailong"
  | "sunge"
  | "zhouli"
  | "tieba_laoge"
  | "male_succubus"
  | "female_succubus";

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
  zhouli: {
    id: "zhouli", label: "周礼", description: "凡仓中之事，先正名分，再问是否合乎周礼", personaId: "zhouli",
    mascot: { name: "周礼先生", alt: "执玉笏的周礼先生", caption: "此方合乎周礼" },
    copy: {
      homeAction: "请先生议礼", resumeAction: "礼官议仓中", resultTitle: "周礼先生论今日持仓",
      danmaku: ["我曾听闻，仓有仓礼", "古人有言，名不正则仓不顺", "或问曰，此涨合礼否", "先列鼎，再列持仓", "一仓独大，恐失宾主之序", "礼书未载，不可强断", "此非亏损，乃礼数未周", "依礼而言，当先正名", "今日开盘，百官就位", "红绿虽异，各有其名", "盈亏有序，方成其礼", "仓位失序，礼崩乐坏", "数据未至，礼官不书", "先定君臣，再论涨跌", "凡事过犹不及", "此等结构，古已有之", "账可乱，名分不可乱", "复盘如朝聘，不可草率", "礼成而后论得失", "如此方合乎周礼"],
    },
    tokens: { accent: "#d6ad61", background: "#2b1112", backgroundDeep: "#16090a", border: "rgb(255 239 211 / 20%)", focus: "#f1cc82", ink: "#fff7ea", inkSoft: "rgb(255 247 234 / 80%)", onAccent: "#271416", surface: "#461c1c", surfaceRaised: "#612626" },
  },
  tieba_laoge: {
    id: "tieba_laoge", label: "贴吧老哥", description: "楼主这仓位多少沾点，老哥先喷完再给你拆", personaId: "tieba_laoge",
    mascot: { name: "贴吧老哥", alt: "坐在老网吧里的贴吧老哥", caption: "典中典，先上数据" },
    copy: {
      homeAction: "让老哥锐评", resumeAction: "老哥对线中", resultTitle: "贴吧老哥一层锐评",
      danmaku: ["典，太典了", "老哥稳", "楼主多少沾点", "有一说一先看仓位", "绷不住了", "插眼等后续", "这波属于是反向封神", "没图没数据说个鸡毛", "小登别急", "老登又嘴硬", "就这也敢梭哈", "裤衩还在就算成功", "你这仓位是人能配的", "别装死，逐个说", "高赞预定", "建议改名戒赌吧", "急了急了", "笑麻了但数据是真的", "喷归喷，账得算明白", "封楼前再补一刀"],
    },
    tokens: { accent: "#df4a3d", background: "#151917", backgroundDeep: "#090c0a", border: "rgb(214 235 220 / 18%)", focus: "#8ebd92", ink: "#eff7f0", inkSoft: "rgb(239 247 240 / 78%)", onAccent: "#170c0b", surface: "#26322b", surfaceRaised: "#34463b" },
  },
  male_succubus: {
    id: "male_succubus", label: "男魅魔", description: "看着我，别让那点涨跌替你说谎", personaId: "male_succubus",
    mascot: { name: "男魅魔", alt: "黑红礼服的男魅魔", caption: "把注意力交给我" },
    copy: {
      homeAction: "接受他的审阅", resumeAction: "耳语分析中", resultTitle: "男魅魔的私人审阅",
      danmaku: ["看着我", "乖一点，把仓位摊开", "别躲，我看见你的贪心了", "小可怜，又在嘴硬", "先说你最舍不得哪一只", "涨了就想要奖励吗", "亏损也可以很诚实", "靠近一点再看数据", "你对它可真专一", "别让恐惧替你回答", "每个数字都在告密", "我喜欢听真话", "集中度像一场迷恋", "呼吸，慢慢看", "今天不许敷衍我", "这只票比我还会吊你胃口", "把侥幸交出来", "你的目光停得太久了", "再检查一遍，宝贝", "晚安之前把账说清"],
    },
    tokens: { accent: "#b7253f", background: "#100d12", backgroundDeep: "#080609", border: "rgb(244 216 225 / 18%)", focus: "#e15a72", ink: "#fff3f6", inkSoft: "rgb(255 243 246 / 78%)", onAccent: "#18080d", surface: "#27151c", surfaceRaised: "#3b1e29" },
  },
  female_succubus: {
    id: "female_succubus", label: "女魅魔", description: "过来，让我看看是谁又被贪心牵着走", personaId: "female_succubus",
    mascot: { name: "女魅魔", alt: "黑玫红礼服的女魅魔", caption: "抬头，接受审判" },
    copy: {
      homeAction: "接受她的召见", resumeAction: "欲望审判中", resultTitle: "女魅魔的欲望审判",
      danmaku: ["过来", "抬头看我", "乖孩子先交代仓位", "小狗又在偷偷加码", "你以为我看不出贪心吗", "涨一点就得意了", "嘴硬可藏不住亏损", "让我看看你最忠诚哪一只", "这份集中度真可爱", "胆小鬼也要看完", "甜言蜜语骗不了账本", "别急着求饶", "数据比你诚实", "把侥幸一项项说出来", "今天允许你紧张", "谁准你移开视线", "你的欲望正在失控", "乖，复盘完再走", "最后一项也不许藏", "现在，接受结论"],
    },
    tokens: { accent: "#dd3b83", background: "#120c14", backgroundDeep: "#09060a", border: "rgb(255 222 242 / 18%)", focus: "#f06ca8", ink: "#fff3fa", inkSoft: "rgb(255 243 250 / 78%)", onAccent: "#1d0914", surface: "#2b1425", surfaceRaised: "#451d3a" },
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
