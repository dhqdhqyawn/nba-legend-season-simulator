export const ENGINE_VERSION = "nba5-2016-finals-1.2.0";

export const TEAM_IDS = Object.freeze({
  WARRIORS: "warriors",
  CAVALIERS: "cavaliers"
});

export const EVENT_CATEGORIES = Object.freeze({
  shooting: "投射手感",
  clutch: "关键回合",
  defense: "防守高光",
  hustle: "篮板拼抢",
  mistake: "失误与纪律",
  tactics: "战术变化"
});

export const TEAMS = Object.freeze({
  [TEAM_IDS.WARRIORS]: Object.freeze({
    id: TEAM_IDS.WARRIORS,
    name: "16勇士",
    city: "GOLDEN STATE",
    color: "#f4c542",
    colorSoft: "#2b3652",
    offense: 91.3,
    defense: 89.4,
    power: 90.4,
    playerIds: ["curry", "klay", "iguodala", "barnes", "draymond"]
  }),
  [TEAM_IDS.CAVALIERS]: Object.freeze({
    id: TEAM_IDS.CAVALIERS,
    name: "16骑士",
    city: "CLEVELAND",
    color: "#f0b04b",
    colorSoft: "#5a1b2d",
    offense: 90.5,
    defense: 90.1,
    power: 90.2,
    playerIds: ["kyrie", "jr", "lebron", "love", "tristan"]
  })
});

export const PLAYERS = Object.freeze({
  curry: Object.freeze({
    id: "curry", teamId: TEAM_IDS.WARRIORS, slot: "PG", name: "斯蒂芬·库里",
    englishName: "Stephen Curry", number: "30", scoringShare: .28,
    rebounds: 5.2, assists: 6.4, steals: 1.7, blocks: .2, threes: 4.2,
    topicVersion: "2015-16 全票 MVP", sourceVersion: "2015-16 Unanimous MVP",
    art: "assets/cards/2kdb-stephen-curry-warriors-2015-16-unanimous-mvp-2662687.png"
  }),
  klay: Object.freeze({
    id: "klay", teamId: TEAM_IDS.WARRIORS, slot: "SG", name: "克莱·汤普森",
    englishName: "Klay Thompson", number: "11", scoringShare: .23,
    rebounds: 3.8, assists: 2.3, steals: 1.0, blocks: .5, threes: 3.4,
    topicVersion: "2015-16 水花侧翼", sourceVersion: "2015-16 Splash Wing",
    art: "assets/cards/2kdb-klay-thompson-warriors-2015-16-splash-wing-2662495.png"
  }),
  iguodala: Object.freeze({
    id: "iguodala", teamId: TEAM_IDS.WARRIORS, slot: "SF", name: "安德烈·伊戈达拉",
    englishName: "Andre Iguodala", number: "9", scoringShare: .13,
    rebounds: 4.7, assists: 3.8, steals: 1.4, blocks: .4, threes: 1.0,
    topicVersion: "2016 总决赛防守锋线", sourceVersion: "复用 2014-15 Finals Stopper 卡面",
    art: "assets/cards/2kdb-andre-iguodala-warriors-2014-15-finals-stopper-2461689.png"
  }),
  barnes: Object.freeze({
    id: "barnes", teamId: TEAM_IDS.WARRIORS, slot: "PF", name: "哈里森·巴恩斯",
    englishName: "Harrison Barnes", number: "40", scoringShare: .15,
    rebounds: 4.9, assists: 1.6, steals: .7, blocks: .2, threes: 1.5,
    topicVersion: "2016 总决赛空间锋线", sourceVersion: "用户提供勇士 Splash 卡面",
    art: "assets/harrison-barnes-warriors.png"
  }),
  draymond: Object.freeze({
    id: "draymond", teamId: TEAM_IDS.WARRIORS, slot: "C", name: "德雷蒙德·格林",
    englishName: "Draymond Green", number: "23", scoringShare: .11,
    rebounds: 8.8, assists: 7.1, steals: 1.6, blocks: 1.3, threes: 1.2,
    topicVersion: "2016 小球中轴", sourceVersion: "复用 2016-17 DPOY Connector 卡面",
    art: "assets/cards/2kdb-draymond-green-warriors-2016-17-dpoy-connector-2661923.png"
  }),
  kyrie: Object.freeze({
    id: "kyrie", teamId: TEAM_IDS.CAVALIERS, slot: "PG", name: "凯里·欧文",
    englishName: "Kyrie Irving", number: "2", scoringShare: .25,
    rebounds: 3.2, assists: 5.4, steals: 1.3, blocks: .2, threes: 2.4,
    topicVersion: "2016 总决赛关键球手", sourceVersion: "复用 2016-17 Finals Shot Maker 卡面",
    art: "assets/cards/2kdb-kyrie-irving-cavaliers-2016-17-finals-shot-maker-2662742.png"
  }),
  jr: Object.freeze({
    id: "jr", teamId: TEAM_IDS.CAVALIERS, slot: "SG", name: "JR·史密斯",
    englishName: "J.R. Smith", number: "5", scoringShare: .14,
    rebounds: 3.1, assists: 1.8, steals: 1.1, blocks: .3, threes: 2.1,
    topicVersion: "2015-16 冠军射手", sourceVersion: "2015-16 Champion Sniper",
    art: "assets/cards/2kdb-j-r-smith-cleveland-cavaliers-2015-16-champion-sniper-2662534.png"
  }),
  lebron: Object.freeze({
    id: "lebron", teamId: TEAM_IDS.CAVALIERS, slot: "SF", name: "勒布朗·詹姆斯",
    englishName: "LeBron James", number: "23", scoringShare: .27,
    rebounds: 8.4, assists: 7.4, steals: 1.8, blocks: 1.1, threes: 1.4,
    topicVersion: "2015-16 克利夫兰之盾", sourceVersion: "2015-16 Cleveland Block",
    art: "assets/cards/lebron-james-2kdb.webp"
  }),
  love: Object.freeze({
    id: "love", teamId: TEAM_IDS.CAVALIERS, slot: "PF", name: "凯文·乐福",
    englishName: "Kevin Love", number: "0", scoringShare: .16,
    rebounds: 9.9, assists: 2.4, steals: .8, blocks: .5, threes: 2.1,
    topicVersion: "2015-16 冠军空间四号位", sourceVersion: "专题 V3.5 角色卡 · 用户提供骑士卡面",
    art: "assets/kevin-love-cavaliers.png",
    evidence: Object.freeze({
      games: 77, minutes: 31.5, ppg: 16.0, rpg: 9.9, apg: 2.4,
      threePa: 5.7, threePct: .36, ts: .553, usage: .234, per: 19.0,
      ws: 9.7, bpm: 2.2, playoffThreePct: .414, playoffTs: .539
    })
  }),
  tristan: Object.freeze({
    id: "tristan", teamId: TEAM_IDS.CAVALIERS, slot: "C", name: "特里斯坦·汤普森",
    englishName: "Tristan Thompson", number: "13", scoringShare: .09,
    rebounds: 9.2, assists: 1.1, steals: .5, blocks: .8, threes: 0,
    topicVersion: "2016 前场篮板中锋", sourceVersion: "复用 2019-20 Cavaliers Rim Runner 卡面",
    art: "assets/cards/2kdb-tristan-thompson-cleveland-cavaliers-2019-20-modern-rotation-219339.jpg"
  })
});

function defineEvent(
  playerId,
  category,
  weight,
  momentum,
  title,
  detail,
  stats = {},
  conflictGroup = null,
  resultConstraint = null
) {
  return Object.freeze({
    id: `${playerId}-${category}-${title}`,
    playerId,
    teamId: PLAYERS[playerId].teamId,
    category,
    weight,
    momentum,
    title,
    detail,
    stats: Object.freeze({ ...stats }),
    conflictGroup: resultConstraint ? "decisive-outcome" : conflictGroup,
    resultConstraint
  });
}

const SIGNATURE_EVENTS = Object.freeze([
  defineEvent("curry", "shooting", 1.5, .046, "库里把距离拉到中圈", "库里连续借掩护出手，两记超远三分把防线直接拉散。", { pts: 8, threes: 2 }),
  defineEvent("curry", "clutch", 1.25, .055, "库里命中关键三分", "最后两分钟，库里在换防到来前完成后撤步，三分空心入网。", { pts: 6, threes: 1 }, "curry-clutch-shot", "actor_wins"),
  defineEvent("curry", "clutch", 1.05, -.046, "库里关键三分偏出", "库里迎着扑防出手制胜三分，篮球弹框而出。", { pts: -5, threes: -1 }, "curry-clutch-shot", "actor_loses"),
  defineEvent("curry", "tactics", 1.1, .029, "库里连续吸引夹击", "骑士把两个人推向持球端，库里及时出球，让弱侧连续得到空位。", { ast: 4 }),
  defineEvent("curry", "mistake", .82, -.029, "库里被逼出连续失误", "骑士延误挡拆并堵住回传线路，库里连续两次丢掉球权。", { pts: -3, ast: -2 }),
  defineEvent("curry", "defense", .72, .021, "库里预判传球完成抢断", "库里提前站到传球线上，抢断后一路推进打成转换。", { pts: 3, stl: 2 }),

  defineEvent("klay", "shooting", 1.6, .052, "汤普森进入佛祖模式", "汤普森不等球落地就再次出手，短时间内连中三记三分。", { pts: 11, threes: 3 }, "klay-form"),
  defineEvent("klay", "shooting", 1.3, -.047, "汤普森手感不佳", "汤普森连续得到熟悉的接球机会，却一次次砸在篮筐前沿。", { pts: -8, threes: -2 }, "klay-form"),
  defineEvent("klay", "defense", 1.0, .026, "汤普森接管外线领防", "汤普森贴住欧文的第一步，迫使骑士把进攻转向边线。", { stl: 1 }),
  defineEvent("klay", "clutch", .94, .041, "汤普森底角一击命中", "勇士转移球找到底角，汤普森稳稳命中反超三分。", { pts: 5, threes: 1 }, null, "actor_wins"),
  defineEvent("klay", "mistake", .72, -.025, "汤普森强行出手被封住", "汤普森没有等到掩护完全落位，迎着两人出手被干扰。", { pts: -4, threes: -1 }),
  defineEvent("klay", "tactics", .82, .024, "汤普森无球跑动撕开缺口", "汤普森连续穿过两道掩护，让骑士的弱侧轮转出现空档。", { pts: 3 }),

  defineEvent("iguodala", "defense", 1.25, .034, "伊戈达拉切掉詹姆斯的突破", "伊戈达拉在詹姆斯合球瞬间下手，勇士顺势打出反击。", { stl: 2, pts: 2 }),
  defineEvent("iguodala", "clutch", 1.2, -.042, "伊戈达拉上篮遭到大帽", "伊戈达拉冲向篮筐，詹姆斯从身后追上把球钉在篮板上。", { pts: -4 }, "lebron-iguodala-block", "actor_loses"),
  defineEvent("iguodala", "tactics", .98, .026, "伊戈达拉成为第二组织点", "伊戈达拉接管短挡拆出球，连续找到空切队友。", { ast: 4 }),
  defineEvent("iguodala", "shooting", .82, .025, "伊戈达拉回应放投", "骑士收缩禁区，伊戈达拉在弧顶连续惩罚空位。", { pts: 6, threes: 2 }),
  defineEvent("iguodala", "shooting", .68, -.026, "伊戈达拉空位三分失准", "骑士主动放空伊戈达拉，他的两次正面三分都没有命中。", { pts: -4, threes: -1 }),
  defineEvent("iguodala", "hustle", .78, .021, "伊戈达拉拼下长篮板", "伊戈达拉从侧翼冲进来控制长篮板，勇士获得第二次进攻。", { reb: 3 }),

  defineEvent("barnes", "shooting", 1.55, -.052, "巴恩斯连续投篮不中", "巴恩斯连续获得底角空位，却始终没能把球送进篮筐。", { pts: -9, threes: -2 }, "barnes-shot"),
  defineEvent("barnes", "shooting", 1.05, .035, "巴恩斯抓住底角空位", "骑士继续收缩，巴恩斯在同一位置连中两记三分。", { pts: 7, threes: 2 }, "barnes-shot"),
  defineEvent("barnes", "hustle", .9, .023, "巴恩斯冲抢前场篮板", "巴恩斯从弱侧切入拼下前场篮板，补篮帮助勇士稳住回合。", { reb: 3, pts: 3 }),
  defineEvent("barnes", "defense", .78, .022, "巴恩斯顶住乐福低位", "巴恩斯用下盘力量守住禁区，迫使乐福转身后勉强出手。", { reb: 2 }),
  defineEvent("barnes", "mistake", .74, -.025, "巴恩斯快攻处理犹豫", "巴恩斯在二打一中错过第一传球点，骑士回防完成破坏。", { pts: -3 }),
  defineEvent("barnes", "tactics", .76, .021, "巴恩斯空切打穿夹击", "骑士夹击库里时，巴恩斯从底线切入接球完成终结。", { pts: 4 }),

  defineEvent("draymond", "tactics", 1.35, .039, "格林掌控四打三", "格林在短挡拆中连续找到弱侧射手，勇士的传切重新转起来。", { ast: 5 }),
  defineEvent("draymond", "defense", 1.35, .041, "格林连续换防成功", "格林先封住欧文的突破，再回到篮下破坏特里斯坦的接球。", { stl: 1, blk: 2 }),
  defineEvent("draymond", "mistake", 1.08, -.051, "格林的争议动作让比赛升温", "格林一次抬腿动作被吹罚恶意犯规，勇士被迫提前调整轮换。", { pts: -3, ast: -2, minutes: -5 }, "draymond-discipline"),
  defineEvent("draymond", "mistake", .86, -.032, "格林吃到技术犯规", "格林持续向裁判抱怨判罚，骑士得到罚球并重新稳住节奏。", { pts: -2 }, "draymond-discipline"),
  defineEvent("draymond", "hustle", 1.0, .029, "格林抢下关键篮板", "格林卡住两名内线收下篮板，随后亲自推进完成转换助攻。", { reb: 4, ast: 2 }),
  defineEvent("draymond", "shooting", .78, .029, "格林在弧顶命中三分", "骑士选择收缩禁区，格林用正面三分回应放投。", { pts: 5, threes: 1 }),

  defineEvent("kyrie", "clutch", 1.55, .058, "欧文命中决胜三分", "欧文在三分线外面对库里完成变向，后撤步出手稳稳命中。", { pts: 7, threes: 1 }, "kyrie-clutch-shot", "actor_wins"),
  defineEvent("kyrie", "clutch", 1.1, -.044, "欧文的决胜球弹框而出", "欧文面对汤普森拉开单打，后撤步三分稍稍偏长。", { pts: -5, threes: -1 }, "kyrie-clutch-shot", "actor_loses"),
  defineEvent("kyrie", "shooting", 1.35, .045, "欧文单打连续得手", "欧文用连续变向拆开防线，中距离和抛投接连命中。", { pts: 9 }),
  defineEvent("kyrie", "mistake", .84, -.031, "欧文突破后丢掉球权", "勇士收缩第二道防线，欧文在起步后被夹击切掉篮球。", { pts: -3, ast: -2 }),
  defineEvent("kyrie", "tactics", 1.0, .028, "欧文和詹姆斯轮流点名", "骑士连续寻找错位，让勇士无法只用一种换防方式解决回合。", { pts: 4, ast: 2 }),
  defineEvent("kyrie", "defense", .62, .019, "欧文抢断后完成反击", "欧文从背后拍掉篮球，独自推进到前场完成上篮。", { stl: 2, pts: 3 }),

  defineEvent("jr", "shooting", 1.34, .042, "JR突然连中三分", "JR在转换和底角连续接球命中，骑士的外线瞬间升温。", { pts: 9, threes: 3 }, "jr-shot"),
  defineEvent("jr", "shooting", 1.06, -.036, "JR的远投连续打铁", "JR连续选择高难度出手，三次投篮都没能落袋。", { pts: -7, threes: -2 }, "jr-shot"),
  defineEvent("jr", "mistake", 1.16, -.046, "JR抢到篮板却跑错方向", "JR控制住关键篮板后向后场运球，队友急忙提醒才避免更大的失误。", { pts: -3, reb: 2 }, "jr-direction"),
  defineEvent("jr", "defense", .8, .023, "JR绕过掩护完成干扰", "JR紧追汤普森的无球路线，在出手瞬间给到足够压力。", { stl: 1 }),
  defineEvent("jr", "clutch", .78, .032, "JR命中压哨远投", "进攻时间即将耗尽，JR接球后直接拔起命中高难度三分。", { pts: 5, threes: 1 }, null, "actor_wins"),
  defineEvent("jr", "mistake", .7, -.023, "JR转换进攻选择冒险", "JR没有等队友落位就提前出手，勇士抓住长篮板反击。", { pts: -3 }),

  defineEvent("lebron", "defense", 1.6, .057, "詹姆斯追身大帽伊戈达拉", "伊戈达拉已经冲到篮下，詹姆斯从身后追上把球钉在篮板上。", { blk: 2, pts: 2 }, "lebron-iguodala-block", "actor_wins"),
  defineEvent("lebron", "clutch", 1.35, .052, "詹姆斯隔扣奠定胜局", "詹姆斯从弧顶加速突破，在协防到来前完成强硬隔扣。", { pts: 7 }, null, "actor_wins"),
  defineEvent("lebron", "tactics", 1.45, .044, "詹姆斯连续找到射手", "勇士把防线收向禁区，詹姆斯连续把球送到JR和乐福手中。", { ast: 5 }),
  defineEvent("lebron", "shooting", .94, -.036, "詹姆斯的外线手感降温", "勇士收缩一步等待出手，詹姆斯连续两次跳投偏出。", { pts: -7, threes: -1 }),
  defineEvent("lebron", "mistake", .76, -.027, "詹姆斯遭遇夹击失误", "格林提前协防封住传球角度，詹姆斯在包夹中丢掉球权。", { pts: -2, ast: -2 }),
  defineEvent("lebron", "hustle", 1.05, .032, "詹姆斯控制篮板发动反击", "詹姆斯收下后场篮板后直接提速，骑士没有给勇士落位机会。", { reb: 4, ast: 2 }),

  defineEvent("love", "shooting", 1.35, .041, "乐福拉开空间连中三分", "乐福站到弧顶和侧翼，连续命中接球三分，勇士的小阵容不敢继续收缩。", { pts: 8, threes: 2 }, "love-spacing"),
  defineEvent("love", "shooting", .92, -.034, "乐福外线手感冰冷", "乐福获得三次空位机会，却没能延续季后赛的外线手感。", { pts: -7, threes: -2 }, "love-spacing"),
  defineEvent("love", "hustle", 1.25, .034, "乐福统治后场篮板", "乐福连续卡住勇士锋线，骑士守住篮板后立刻发动长传。", { reb: 5, ast: 1 }),
  defineEvent("love", "tactics", 1.04, .028, "乐福长传打穿退防", "乐福抢下篮板后直接送出四分卫长传，欧文在前场轻松得分。", { reb: 2, ast: 3 }),
  defineEvent("love", "defense", 1.18, -.041, "乐福被勇士连续点名", "勇士通过挡拆把乐福拉到外线，连续利用换防制造突破空间。", { pts: -4 }, "love-switch"),
  defineEvent("love", "defense", .72, .026, "乐福守住最后一次换防", "乐福后退控制距离，迫使库里在终场前投出高难度三分。", { reb: 2 }, "love-switch", "actor_wins"),

  defineEvent("tristan", "hustle", 1.55, .043, "特里斯坦连续冲下前场篮板", "特里斯坦在两名勇士球员之间连续点抢，骑士获得额外进攻机会。", { reb: 6, pts: 4 }),
  defineEvent("tristan", "defense", 1.02, .031, "特里斯坦守住篮下", "特里斯坦没有吃晃，连续干扰勇士的小个终结。", { blk: 2, reb: 2 }),
  defineEvent("tristan", "mistake", 1.0, -.036, "特里斯坦陷入犯规麻烦", "特里斯坦在掩护和补防中连续被吹犯规，骑士被迫缩短他的出场时间。", { reb: -3, minutes: -6 }),
  defineEvent("tristan", "tactics", .94, .027, "特里斯坦掩护创造空位", "特里斯坦连续改变掩护角度，为欧文和JR清出投篮窗口。", { ast: 2 }),
  defineEvent("tristan", "hustle", .8, -.025, "特里斯坦补篮连续偏出", "特里斯坦抢到位置却没能完成终结，勇士最终保护住篮板。", { pts: -5, reb: 2 }),
  defineEvent("tristan", "defense", .82, -.029, "特里斯坦被迫换到外线", "勇士不断把特里斯坦拉出禁区，库里借此获得突破和撤步空间。", { reb: -2 }),

  defineEvent("curry", "hustle", .9, .027, "库里收下长篮板发动快攻", "库里判断到远投落点，抢下长篮板后立刻把球送向前场。", { reb: 3, ast: 1 }),
  defineEvent("curry", "defense", .9, -.027, "库里换防后被强攻", "骑士连续把库里留在错位中，利用身材优势完成篮下终结。", { pts: -3 }),
  defineEvent("curry", "shooting", .82, .022, "库里绕过双掩护急停命中", "库里从底线连续穿过掩护，接球急停三分稳稳落袋。", { pts: 6, threes: 2 }),
  defineEvent("curry", "shooting", .82, -.022, "库里遭遇延误失去节奏", "骑士内线提高到三分线外，库里两次仓促出手都偏离篮筐。", { pts: -4, threes: -1 }),
  defineEvent("curry", "clutch", .72, .018, "库里高抛越过补防", "决胜回合库里突破后送出高抛，篮球越过指尖轻轻入网。", { pts: 4 }, null, "actor_wins"),
  defineEvent("curry", "tactics", .72, -.018, "库里提前出球被识破", "骑士预判到库里的弱侧传球，截断线路后完成反击。", { ast: -2 }),

  defineEvent("klay", "hustle", .9, .027, "汤普森飞身救回边线球", "篮球即将出界时汤普森飞身把球拨回，勇士续上一次宝贵进攻。", { reb: 2, pts: 2 }),
  defineEvent("klay", "mistake", .9, -.027, "汤普森落地后踩出边线", "汤普森接球时脚步没有完全站稳，裁判判罚出界，勇士错失回合。", { pts: -3 }),
  defineEvent("klay", "tactics", .82, .022, "汤普森假掩护突然外弹", "汤普森佯装为库里掩护后快速外弹，接球获得完整出手空间。", { pts: 6, threes: 2 }),
  defineEvent("klay", "shooting", .82, -.022, "汤普森中距离连续偏短", "骑士把汤普森赶进两分区域，他的急停跳投连续落在篮筐前沿。", { pts: -4 }),
  defineEvent("klay", "defense", .72, .018, "汤普森封住欧文右手", "汤普森用身体角度迫使欧文转向协防，勇士成功守住关键回合。", { stl: 1 }, null, "actor_wins"),
  defineEvent("klay", "clutch", .72, -.018, "汤普森反超球涮筐而出", "汤普森获得底角反超机会，篮球在篮筐上转了一圈后滑出。", { pts: -3, threes: -1 }, null, "actor_loses"),

  defineEvent("iguodala", "defense", .9, .027, "伊戈达拉预判突破完成造犯规", "伊戈达拉提前站定位置，迫使骑士的强攻以进攻犯规结束。", { stl: 1 }),
  defineEvent("iguodala", "mistake", .9, -.027, "伊戈达拉传球直接出界", "伊戈达拉试图寻找底角射手，传球角度过大直接飞出边线。", { ast: -2 }),
  defineEvent("iguodala", "hustle", .82, .022, "伊戈达拉连续争到五五开球", "伊戈达拉两次抢先碰到地板球，把转换机会留给勇士。", { reb: 2, pts: 2 }),
  defineEvent("iguodala", "shooting", .82, -.022, "伊戈达拉罚球线急停失准", "骑士放出中距离空间，伊戈达拉的两次急停都没能命中。", { pts: -4 }),
  defineEvent("iguodala", "tactics", .72, .018, "伊戈达拉反跑接球助攻", "伊戈达拉佯装手递手后突然反跑，吸引防守再把球送到篮下。", { ast: 3 }),
  defineEvent("iguodala", "clutch", .72, -.018, "伊戈达拉关键罚球偏出", "最后阶段伊戈达拉站上罚球线，却没能把领先优势继续扩大。", { pts: -2 }, null, "actor_loses"),

  defineEvent("barnes", "shooting", .9, .027, "巴恩斯弧顶三分终于开张", "巴恩斯没有因前面的打铁犹豫，在弧顶果断出手命中三分。", { pts: 6, threes: 2 }),
  defineEvent("barnes", "shooting", .9, -.027, "巴恩斯底角空位再次偏出", "勇士的传导已经创造出完全空位，巴恩斯的底角三分仍然弹出。", { pts: -5, threes: -1 }),
  defineEvent("barnes", "defense", .82, .022, "巴恩斯协防封住欧文上篮", "巴恩斯从弱侧及时收缩，在篮板另一侧干扰欧文的拉杆终结。", { blk: 1, reb: 2 }),
  defineEvent("barnes", "mistake", .82, -.022, "巴恩斯接球后走步", "巴恩斯面对扑防急于启动，轴心脚提前移动被吹走步。", { pts: -3 }),
  defineEvent("barnes", "tactics", .72, .018, "巴恩斯顺下吸走护筐人", "巴恩斯从侧翼果断顺下，把骑士中锋带离弱侧，为队友留下空篮。", { pts: 2, ast: 1 }),
  defineEvent("barnes", "hustle", .72, -.018, "巴恩斯漏掉弱侧篮板", "巴恩斯转身寻找球时失去卡位，骑士从他身后抢到第二次机会。", { reb: -2 }),

  defineEvent("draymond", "defense", .9, .027, "格林拆掉骑士手递手", "格林提前上抢破坏手递手配合，随后倒地把球交给库里。", { stl: 2 }),
  defineEvent("draymond", "mistake", .9, -.027, "格林掩护被吹进攻犯规", "格林移动中的掩护撞倒防守人，勇士刚形成的空位被判无效。", { ast: -1 }),
  defineEvent("draymond", "tactics", .82, .022, "格林弧顶指挥背切", "格林持球观察防线，连续用击地传球找到从底线切入的队友。", { ast: 4 }),
  defineEvent("draymond", "shooting", .82, -.022, "格林放投机会连续打铁", "骑士完全收在罚球线以内，格林的外线回应始终没能命中。", { pts: -4, threes: -1 }),
  defineEvent("draymond", "hustle", .72, .018, "格林倒地拼下球权", "格林和特里斯坦同时扑向地板球，最终把球拨到勇士一侧。", { reb: 2 }),
  defineEvent("draymond", "defense", .72, -.018, "格林补防过度漏出底角", "格林收缩过深，骑士及时把球传向底角命中空位三分。", { pts: -3 }),

  defineEvent("kyrie", "shooting", .9, .027, "欧文连续命中高难度抛投", "欧文在禁区边缘不断改变出手角度，两记高抛先后越过封盖。", { pts: 7 }),
  defineEvent("kyrie", "mistake", .9, -.027, "欧文运球砸到脚面", "欧文准备连续变向时篮球碰到脚面，勇士趁机抢回球权。", { pts: -3, ast: -1 }),
  defineEvent("kyrie", "tactics", .82, .022, "欧文拒绝掩护突入腹地", "欧文突然从掩护反方向启动，打乱勇士预设的换防路线。", { pts: 5, ast: 1 }),
  defineEvent("kyrie", "defense", .82, -.022, "欧文追防中失去汤普森", "欧文收缩协防后没能及时找到汤普森，骑士付出一记空位三分。", { pts: -3 }),
  defineEvent("kyrie", "clutch", .72, .018, "欧文突破后换手打进", "比赛进入最后一分钟，欧文空中换手避开格林封盖完成终结。", { pts: 4 }, null, "actor_wins"),
  defineEvent("kyrie", "shooting", .72, -.018, "欧文急停中投连续偏长", "勇士退守封住篮下，欧文的两记罚球线急停都砸在后沿。", { pts: -4 }),

  defineEvent("jr", "shooting", .9, .027, "JR借掩护拔起命中", "JR只利用半步空间便直接起跳，三分穿过防守人的指尖落网。", { pts: 6, threes: 2 }),
  defineEvent("jr", "mistake", .9, -.027, "JR救球送到对手手中", "JR在边线附近奋力救球，却把篮球直接送回勇士手里。", { pts: -3 }),
  defineEvent("jr", "defense", .82, .022, "JR提前换防切断传球", "JR读到勇士的无球掩护，提前换位切断汤普森的接球路线。", { stl: 2 }),
  defineEvent("jr", "shooting", .82, -.022, "JR超远三分选择失当", "骑士刚刚控制住节奏，JR却在进攻时间充足时投出超远三分。", { pts: -4, threes: -1 }),
  defineEvent("jr", "tactics", .72, .018, "JR假投真传找到顺下", "JR点起扑防后没有勉强出手，而是把球塞给顺下的特里斯坦。", { ast: 3 }),
  defineEvent("jr", "clutch", .72, -.018, "JR最后一攻停球犹豫", "JR接到回传后短暂犹豫，勇士重新贴近并迫使他仓促出手。", { pts: -3 }, null, "actor_loses"),

  defineEvent("lebron", "tactics", .9, .027, "詹姆斯点名错位连续突破", "詹姆斯连续呼叫掩护寻找小个防守者，两次强突都直达篮下。", { pts: 7, ast: 1 }),
  defineEvent("lebron", "mistake", .9, -.027, "詹姆斯推进中被夹掉篮球", "勇士在边线突然形成包夹，詹姆斯转身时篮球被从身后捅走。", { pts: -3, ast: -1 }),
  defineEvent("lebron", "defense", .82, .022, "詹姆斯协防覆盖整个禁区", "詹姆斯连续从弱侧补位，先改变上篮，再控制住防守篮板。", { blk: 1, reb: 3 }),
  defineEvent("lebron", "shooting", .82, -.022, "詹姆斯罚球手感摇摆", "詹姆斯不断制造身体接触，却在罚球线上丢掉几次得分机会。", { pts: -4 }),
  defineEvent("lebron", "clutch", .72, .018, "詹姆斯强突制造关键二加一", "决胜阶段詹姆斯顶着协防完成上篮，并获得一次加罚机会。", { pts: 5 }, null, "actor_wins"),
  defineEvent("lebron", "hustle", .72, -.018, "詹姆斯回防稍慢漏出侧翼", "詹姆斯向裁判示意后回防晚了一步，勇士快速找到侧翼空位。", { pts: -3 }),

  defineEvent("love", "shooting", .9, .027, "乐福底角连续惩罚收缩", "勇士把防线堆在禁区，乐福在底角连续接到分球并命中。", { pts: 7, threes: 2 }),
  defineEvent("love", "defense", .9, -.027, "乐福护筐时赔上犯规", "乐福补到篮下稍晚一步，不但没能封住上篮，还送给勇士加罚。", { pts: -3, minutes: -2 }),
  defineEvent("love", "hustle", .82, .022, "乐福连续点出进攻篮板", "乐福在格林身后判断落点，两次把球点回骑士球员手中。", { reb: 4 }),
  defineEvent("love", "mistake", .82, -.022, "乐福长传被提前拦截", "乐福抢到篮板后尝试直接发动快攻，伊戈达拉提前截住传球。", { ast: -2 }),
  defineEvent("love", "tactics", .72, .018, "乐福假掩护外弹拉空禁区", "乐福在掩护接触前突然外弹，带走格林后给詹姆斯留下突破通道。", { pts: 3, ast: 1 }),
  defineEvent("love", "shooting", .72, -.018, "乐福近筐终结连续失手", "乐福在篮下获得身体对抗后的机会，但两次近距离出手都没放进。", { pts: -4 }),

  defineEvent("tristan", "hustle", .9, .027, "特里斯坦点抢制造连续二次进攻", "特里斯坦不等篮球落下便连续点拨，最终为骑士争到补篮机会。", { reb: 5, pts: 3 }),
  defineEvent("tristan", "mistake", .9, -.027, "特里斯坦掩护移动过早", "特里斯坦还没站稳就侧身移动，裁判吹罚进攻犯规。", { pts: -2 }),
  defineEvent("tristan", "defense", .82, .022, "特里斯坦垂直起跳守住篮筐", "特里斯坦保持垂直完成干扰，落地后又牢牢控制住篮板。", { blk: 2, reb: 2 }),
  defineEvent("tristan", "defense", .82, -.022, "特里斯坦协防后漏掉格林", "特里斯坦扑向突破路线后没能及时回位，格林在篮下轻松接球。", { pts: -3 }),
  defineEvent("tristan", "tactics", .72, .018, "特里斯坦二次掩护解放欧文", "第一次掩护被绕过后，特里斯坦马上改变角度再次挡住追兵。", { ast: 2 }),
  defineEvent("tristan", "hustle", .72, -.018, "特里斯坦争抢篮板把球拨出界", "特里斯坦抢到最高点却没能控制篮球，球被他碰出底线。", { reb: -2 })
]);

const ALL_PLAYER_IDS = Object.freeze(Object.keys(PLAYERS));
const PERIMETER_IDS = Object.freeze(["curry", "klay", "iguodala", "barnes", "draymond", "kyrie", "jr", "lebron", "love"]);
const SHOOTER_IDS = Object.freeze(["curry", "klay", "iguodala", "barnes", "kyrie", "jr", "lebron", "love"]);
const CREATOR_IDS = Object.freeze(["curry", "iguodala", "draymond", "kyrie", "jr", "lebron", "love"]);
const FRONTCOURT_IDS = Object.freeze(["iguodala", "barnes", "draymond", "lebron", "love", "tristan"]);
const RIM_IDS = Object.freeze(["barnes", "draymond", "lebron", "love", "tristan"]);

const PLAYER_EVENT_AFFINITIES = Object.freeze({
  curry: Object.freeze({ shooting: 1.35, clutch: 1.25, defense: .75, hustle: .72, mistake: .92, tactics: 1.2 }),
  klay: Object.freeze({ shooting: 1.28, clutch: 1.1, defense: 1.15, hustle: .8, mistake: .9, tactics: 1.02 }),
  iguodala: Object.freeze({ shooting: .75, clutch: .82, defense: 1.25, hustle: 1.05, mistake: .85, tactics: 1.16 }),
  barnes: Object.freeze({ shooting: .92, clutch: .85, defense: .95, hustle: .95, mistake: 1.08, tactics: .82 }),
  draymond: Object.freeze({ shooting: .68, clutch: .82, defense: 1.35, hustle: 1.24, mistake: 1.18, tactics: 1.35 }),
  kyrie: Object.freeze({ shooting: 1.25, clutch: 1.35, defense: .76, hustle: .72, mistake: .98, tactics: 1.18 }),
  jr: Object.freeze({ shooting: 1.18, clutch: .98, defense: .9, hustle: .82, mistake: 1.18, tactics: .76 }),
  lebron: Object.freeze({ shooting: .96, clutch: 1.3, defense: 1.32, hustle: 1.24, mistake: .94, tactics: 1.4 }),
  love: Object.freeze({ shooting: 1.12, clutch: .84, defense: .72, hustle: 1.3, mistake: .88, tactics: 1.1 }),
  tristan: Object.freeze({ shooting: .35, clutch: .78, defense: 1.22, hustle: 1.45, mistake: 1.02, tactics: 1.05 })
});

function defineSharedTemplate(
  id,
  category,
  playerIds,
  weight,
  momentum,
  titleSuffix,
  detailSuffix,
  stats = {},
  resultConstraint = null
) {
  return Object.freeze({
    id,
    category,
    playerIds: Object.freeze([...playerIds]),
    weight,
    momentum,
    titleSuffix,
    detailSuffix,
    stats: Object.freeze({ ...stats }),
    resultConstraint
  });
}

export const SHARED_EVENT_TEMPLATES = Object.freeze([
  defineSharedTemplate("key-three-make", "shooting", SHOOTER_IDS, 1.08, .035, "命中关键三分", "在防守扑到面前之前果断出手，关键三分稳稳命中。", { pts: 6, threes: 1 }, "actor_wins"),
  defineSharedTemplate("key-three-miss", "shooting", SHOOTER_IDS, 1.03, -.032, "错失关键三分", "得到一记足以改变局势的三分机会，但篮球最终弹框而出。", { pts: -4, threes: -1 }, "actor_loses"),
  defineSharedTemplate("catch-shoot-run", "shooting", SHOOTER_IDS, .88, .026, "连续接球投进", "利用队友创造的空位连续完成接球投篮，迅速拉高进攻温度。", { pts: 6, threes: 2 }),
  defineSharedTemplate("open-shot-cold", "shooting", PERIMETER_IDS, .84, -.024, "空位投篮失去准星", "连续获得防守放出的投篮机会，却始终没能命中。", { pts: -4, threes: -1 }),
  defineSharedTemplate("midrange-answer", "shooting", SHOOTER_IDS, .72, .019, "用中距离回应防守", "面对退守防线连续急停，在罚球线附近把球投进。", { pts: 4 }),
  defineSharedTemplate("finish-closeout", "shooting", ALL_PLAYER_IDS, .7, .018, "突破扑防完成终结", "抓住对手扑防过猛的瞬间直杀篮下，顶着协防把球放进。", { pts: 4 }),

  defineSharedTemplate("late-layup", "clutch", ALL_PLAYER_IDS, .86, .029, "打进反超上篮", "在最后阶段切入禁区，迎着身体对抗完成反超得分。", { pts: 4 }, "actor_wins"),
  defineSharedTemplate("late-shot-miss", "clutch", ALL_PLAYER_IDS, .82, -.028, "错失反超机会", "获得最后阶段的反超出手，却没能越过防守把球送进篮筐。", { pts: -4 }, "actor_loses"),
  defineSharedTemplate("late-free-throws", "clutch", ALL_PLAYER_IDS, .68, .02, "稳稳罚进关键球", "顶住现场压力站上罚球线，把关键罚球全部命中。", { pts: 3 }, "actor_wins"),
  defineSharedTemplate("late-free-throw-miss", "clutch", ALL_PLAYER_IDS, .64, -.019, "关键罚球偏出", "最后阶段获得罚球机会，但其中一球在篮筐上弹出。", { pts: -2 }, "actor_loses"),
  defineSharedTemplate("late-putback", "clutch", FRONTCOURT_IDS, .72, .025, "补进关键篮板", "从人群中抢到进攻篮板，第一时间补篮得手。", { pts: 4, reb: 3 }, "actor_wins"),

  defineSharedTemplate("chase-block", "defense", RIM_IDS, .76, .027, "送出追身封盖", "从身后追回禁区，在篮球离手后把上篮干扰下来。", { blk: 2 }),
  defineSharedTemplate("passing-lane-steal", "defense", PERIMETER_IDS, .82, .023, "抢断横传发动反击", "提前看穿横向传球，截球后直接带起转换进攻。", { stl: 2, pts: 2 }),
  defineSharedTemplate("switch-stop", "defense", ALL_PLAYER_IDS, .74, .019, "换防后守住单打", "被点名换防后保持位置，迫使对手投出高难度出手。", { reb: 1 }),
  defineSharedTemplate("lost-backdoor", "defense", ALL_PLAYER_IDS, .72, -.02, "漏掉底线反切", "盯球时没能及时跟住反切，对手从身后直接进入篮下。", { pts: -3 }),
  defineSharedTemplate("three-shot-foul", "defense", PERIMETER_IDS, .62, -.025, "扑防时送出三次罚球", "急于干扰外线出手，落地时撞到投篮球员被吹犯规。", { pts: -3 }),

  defineSharedTemplate("long-rebound", "hustle", ALL_PLAYER_IDS, .78, .02, "控制关键长篮板", "准确判断远投落点，在对手之前收下长篮板。", { reb: 3 }),
  defineSharedTemplate("loose-ball", "hustle", ALL_PLAYER_IDS, .7, .018, "倒地争回五五开球", "率先扑向地板球，把原本均等的球权留给本队。", { reb: 1, stl: 1 }),
  defineSharedTemplate("offensive-board", "hustle", FRONTCOURT_IDS, .84, .024, "拼下前场篮板", "从弱侧冲进禁区完成点抢，为球队创造第二次进攻。", { reb: 4, pts: 2 }),
  defineSharedTemplate("boxout-lost", "hustle", ALL_PLAYER_IDS, .72, -.021, "卡位时丢掉篮板", "转身寻找篮球时没能挡住冲抢，让对手得到二次机会。", { reb: -2 }),
  defineSharedTemplate("save-possession", "hustle", ALL_PLAYER_IDS, .62, .016, "飞身救回边线球", "在篮球即将出界时飞身把球拨回，延续了这次进攻。", { ast: 1 }),

  defineSharedTemplate("bad-pass", "mistake", ALL_PLAYER_IDS, .86, -.024, "传球被直接拦截", "没有看清弱侧协防，传球刚离手就被对手抢断。", { ast: -2 }),
  defineSharedTemplate("offensive-foul", "mistake", ALL_PLAYER_IDS, .72, -.021, "被吹进攻犯规", "启动时没有控制好身体，撞倒提前站定的防守人。", { pts: -2 }),
  defineSharedTemplate("shot-clock", "mistake", ALL_PLAYER_IDS, .68, -.019, "没能赶在计时结束前出手", "进攻在连续传导中失去时间，最终让计时器走完。", { pts: -2 }),
  defineSharedTemplate("handle-lost", "mistake", CREATOR_IDS, .78, -.022, "运球中失去控制", "面对突然上抢的防守，运球碰到脚边丢掉球权。", { pts: -2, ast: -1 }),
  defineSharedTemplate("risky-transition", "mistake", PERIMETER_IDS, .64, -.018, "快攻选择过于冒险", "在人数没有优势时强行推进，回合以仓促出手结束。", { pts: -3 }),

  defineSharedTemplate("pick-roll-create", "tactics", CREATOR_IDS, .84, .024, "利用挡拆连续创造机会", "反复改变挡拆方向，迫使防线在换防和夹击之间犹豫。", { pts: 3, ast: 2 }),
  defineSharedTemplate("screen-assist", "tactics", ALL_PLAYER_IDS, .7, .018, "用无球掩护制造空位", "在弱侧连续设置掩护，帮助队友摆脱追防获得出手机会。", { ast: 2 }),
  defineSharedTemplate("mismatch-attack", "tactics", PERIMETER_IDS, .76, .021, "抓住错位完成进攻", "主动寻找换防后的错位，耐心把对手带到最不舒服的位置。", { pts: 4 }),
  defineSharedTemplate("coverage-read-wrong", "tactics", ALL_PLAYER_IDS, .66, -.018, "读错防守站位", "以为对手会继续换防，却把球送进了已经收缩的区域。", { ast: -1, pts: -2 }),
  defineSharedTemplate("short-roll-pass", "tactics", FRONTCOURT_IDS, .72, .02, "短顺下找到弱侧", "接到挡拆回传后没有急于终结，而是把球送到弱侧空位。", { ast: 3 })
]);

const SHARED_EVENTS = SHARED_EVENT_TEMPLATES.flatMap(template => template.playerIds.map(playerId => {
  const player = PLAYERS[playerId];
  const affinity = PLAYER_EVENT_AFFINITIES[playerId][template.category] || 1;
  return defineEvent(
    playerId,
    template.category,
    template.weight * affinity,
    template.momentum,
    `${player.name}${template.titleSuffix}`,
    `${player.name}${template.detailSuffix}`,
    template.stats,
    null,
    template.resultConstraint
  );
}));

export const PLAYER_EVENTS = Object.freeze([...SIGNATURE_EVENTS, ...SHARED_EVENTS]);

export function seedFromEntropy() {
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(4);
    globalThis.crypto.getRandomValues(values);
    return `2016-${Array.from(values, value => value.toString(36)).join("-")}`;
  }
  return `2016-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function hashSeed(input) {
  let hash = 2166136261;
  for (const character of String(input)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRng(seed) {
  let state = hashSeed(seed) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalish(rng) {
  return (rng() + rng() + rng() + rng() - 2) * .92;
}

function weightedPick(items, weightFor, rng) {
  const total = items.reduce((sum, item) => sum + Math.max(0, weightFor(item)), 0);
  if (total <= 0) return items[Math.floor(rng() * items.length)];
  let cursor = rng() * total;
  for (const item of items) {
    cursor -= Math.max(0, weightFor(item));
    if (cursor <= 0) return item;
  }
  return items.at(-1);
}

const SERIES_SPOTLIGHT_OPTIONS = Object.freeze({
  [TEAM_IDS.WARRIORS]: Object.freeze([
    Object.freeze({ playerId: "curry", weight: .38, scoringShare: .34 }),
    Object.freeze({ playerId: "klay", weight: .25, scoringShare: .32 }),
    Object.freeze({ playerId: "draymond", weight: .15, scoringShare: .28 }),
    Object.freeze({ playerId: "iguodala", weight: .1, scoringShare: .3 }),
    Object.freeze({ playerId: "barnes", weight: .12, scoringShare: .31 })
  ]),
  [TEAM_IDS.CAVALIERS]: Object.freeze([
    Object.freeze({ playerId: "lebron", weight: .36, scoringShare: .34 }),
    Object.freeze({ playerId: "kyrie", weight: .27, scoringShare: .33 }),
    Object.freeze({ playerId: "love", weight: .16, scoringShare: .3 }),
    Object.freeze({ playerId: "jr", weight: .11, scoringShare: .31 }),
    Object.freeze({ playerId: "tristan", weight: .1, scoringShare: .32 })
  ])
});

function createSeriesProfiles(rng) {
  const profiles = Object.fromEntries(Object.values(PLAYERS).map(player => [player.id, {
    scoringShare: player.scoringShare
  }]));
  const spotlights = {};
  for (const teamId of Object.values(TEAM_IDS)) {
    const selected = weightedPick(SERIES_SPOTLIGHT_OPTIONS[teamId], option => option.weight, rng);
    profiles[selected.playerId] = { scoringShare: selected.scoringShare };
    spotlights[teamId] = selected.playerId;
  }
  return { profiles, spotlights };
}

function oppositeTeamId(teamId) {
  return teamId === TEAM_IDS.WARRIORS ? TEAM_IDS.CAVALIERS : TEAM_IDS.WARRIORS;
}

function eventWinnerId(event) {
  if (event.resultConstraint === "actor_wins") return event.teamId;
  if (event.resultConstraint === "actor_loses") return oppositeTeamId(event.teamId);
  return null;
}

function selectGameEvents({ gameNumber, scoreA, scoreB, rng }) {
  const eventCount = 2 + (rng() < .44 ? 1 : 0);
  const picked = [];
  const usedPlayers = new Set();
  const usedConflicts = new Set();
  const lateSeries = gameNumber >= 5 || scoreA >= 3 || scoreB >= 3;
  while (picked.length < eventCount) {
    const candidates = PLAYER_EVENTS.filter(event => !usedPlayers.has(event.playerId)
      && (!event.conflictGroup || !usedConflicts.has(event.conflictGroup)));
    const weightedCandidates = candidates.map(event => {
      let weight = event.weight;
      if (lateSeries && event.category === "clutch") weight *= 1.75;
      if (gameNumber >= 3 && event.category === "tactics") weight *= 1.18;
      if (gameNumber === 7 && event.category === "mistake") weight *= .86;
      return { event, weight };
    });
    const decisiveTotals = weightedCandidates.reduce((totals, candidate) => {
      const beneficiaryId = eventWinnerId(candidate.event);
      if (beneficiaryId) totals[beneficiaryId] += candidate.weight;
      return totals;
    }, { [TEAM_IDS.WARRIORS]: 0, [TEAM_IDS.CAVALIERS]: 0 });
    const decisiveAverage = (decisiveTotals[TEAM_IDS.WARRIORS] + decisiveTotals[TEAM_IDS.CAVALIERS]) / 2;
    const selected = weightedPick(weightedCandidates, candidate => {
      const beneficiaryId = eventWinnerId(candidate.event);
      if (!beneficiaryId || decisiveTotals[beneficiaryId] <= 0) return candidate.weight;
      return candidate.weight * decisiveAverage / decisiveTotals[beneficiaryId];
    }, rng).event;
    picked.push(selected);
    usedPlayers.add(selected.playerId);
    if (selected.conflictGroup) usedConflicts.add(selected.conflictGroup);
  }
  return picked;
}

function allocateIntegerTotal(rawValues, total) {
  const safeValues = rawValues.map(value => Math.max(.1, Number(value) || 0));
  const rawTotal = safeValues.reduce((sum, value) => sum + value, 0);
  const projected = safeValues.map(value => value / rawTotal * total);
  const values = projected.map(Math.floor);
  let remaining = total - values.reduce((sum, value) => sum + value, 0);
  const order = projected.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction);
  for (let index = 0; index < remaining; index += 1) values[order[index % order.length].index] += 1;
  return values;
}

function makeBoxScore(teamId, teamScore, events, seriesProfiles, rng) {
  const playerIds = TEAMS[teamId].playerIds;
  const rawPoints = playerIds.map(playerId => {
    const player = PLAYERS[playerId];
    const eventAdjustment = events.filter(event => event.playerId === playerId)
      .reduce((sum, event) => sum + Number(event.stats.pts || 0), 0);
    const scoringShare = seriesProfiles[playerId]?.scoringShare || player.scoringShare;
    return Math.max(2, scoringShare * teamScore * (.84 + rng() * .32) + eventAdjustment);
  });
  const points = allocateIntegerTotal(rawPoints, teamScore);
  const players = playerIds.map((playerId, index) => {
    const player = PLAYERS[playerId];
    const adjustments = events.filter(event => event.playerId === playerId)
      .reduce((result, event) => {
        for (const [key, value] of Object.entries(event.stats)) result[key] = (result[key] || 0) + value;
        return result;
      }, {});
    const rebounds = Math.max(0, Math.round(player.rebounds * (.74 + rng() * .5) + Number(adjustments.reb || 0)));
    const assists = Math.max(0, Math.round(player.assists * (.72 + rng() * .52) + Number(adjustments.ast || 0)));
    const steals = Math.max(0, Math.round(player.steals * (.48 + rng() * .86) + Number(adjustments.stl || 0)));
    const blocks = Math.max(0, Math.round(player.blocks * (.42 + rng() * .95) + Number(adjustments.blk || 0)));
    const threes = clamp(Math.round(player.threes * (.56 + rng() * .76) + Number(adjustments.threes || 0)), 0, Math.floor(points[index] / 3));
    const minutesBase = player.slot === "C" ? 36 : 38;
    const minutes = clamp(Math.round(minutesBase + normalish(rng) * 2 + Number(adjustments.minutes || 0)), 22, 44);
    return {
      playerId,
      name: player.name,
      slot: player.slot,
      points: points[index],
      rebounds,
      assists,
      steals,
      blocks,
      threes,
      minutes
    };
  });
  return {
    teamId,
    teamScore,
    players,
    totals: {
      points: players.reduce((sum, player) => sum + player.points, 0),
      rebounds: players.reduce((sum, player) => sum + player.rebounds, 0),
      assists: players.reduce((sum, player) => sum + player.assists, 0)
    }
  };
}

function simulateGame({ gameNumber, scoreA, scoreB, homeTeamId, seriesProfiles, rng }) {
  const warriors = TEAMS[TEAM_IDS.WARRIORS];
  const cavaliers = TEAMS[TEAM_IDS.CAVALIERS];
  const events = selectGameEvents({ gameNumber, scoreA, scoreB, rng });
  const eventMomentumA = clamp(events.reduce((sum, event) => {
    return sum + (event.teamId === TEAM_IDS.WARRIORS ? event.momentum : -event.momentum);
  }, 0), -.12, .12);
  const teamEdge = (warriors.power - cavaliers.power) * .022;
  const homeEdge = homeTeamId === TEAM_IDS.WARRIORS ? .027 : -.027;
  const baseProbabilityWarriors = clamp(.5 + teamEdge + homeEdge, .32, .68);
  const probabilityWarriors = clamp(baseProbabilityWarriors + eventMomentumA, .18, .82);
  const decisiveEvent = events.find(event => event.resultConstraint);
  const winnerId = decisiveEvent
    ? eventWinnerId(decisiveEvent)
    : (rng() < probabilityWarriors ? TEAM_IDS.WARRIORS : TEAM_IDS.CAVALIERS);
  const baseScore = 103 + normalish(rng) * 5.2;
  const homeScoreEdge = homeTeamId === TEAM_IDS.WARRIORS ? 1.4 : -1.4;
  let warriorsScore = Math.round(baseScore
    + (warriors.offense - cavaliers.defense) * .85
    + eventMomentumA * 70 + homeScoreEdge + normalish(rng) * 4.7);
  let cavaliersScore = Math.round(baseScore
    + (cavaliers.offense - warriors.defense) * .85
    - eventMomentumA * 70 - homeScoreEdge + normalish(rng) * 4.7);
  warriorsScore = clamp(warriorsScore, 84, 132);
  cavaliersScore = clamp(cavaliersScore, 84, 132);
  if (winnerId === TEAM_IDS.WARRIORS && warriorsScore <= cavaliersScore) {
    warriorsScore = clamp(cavaliersScore + 1 + Math.floor(rng() * 7), 85, 136);
  }
  if (winnerId === TEAM_IDS.CAVALIERS && cavaliersScore <= warriorsScore) {
    cavaliersScore = clamp(warriorsScore + 1 + Math.floor(rng() * 7), 85, 136);
  }
  const warriorsBox = makeBoxScore(TEAM_IDS.WARRIORS, warriorsScore, events, seriesProfiles, rng);
  const cavaliersBox = makeBoxScore(TEAM_IDS.CAVALIERS, cavaliersScore, events, seriesProfiles, rng);
  const winnerBox = winnerId === TEAM_IDS.WARRIORS ? warriorsBox : cavaliersBox;
  const loserBox = winnerId === TEAM_IDS.WARRIORS ? cavaliersBox : warriorsBox;
  const winnerTop = [...winnerBox.players].sort((left, right) => right.points - left.points || right.assists - left.assists)[0];
  const loserTop = [...loserBox.players].sort((left, right) => right.points - left.points || right.assists - left.assists)[0];
  const winnerTeam = TEAMS[winnerId];
  const loserTeam = TEAMS[oppositeTeamId(winnerId)];
  const winnerScore = winnerId === TEAM_IDS.WARRIORS ? warriorsScore : cavaliersScore;
  const loserScore = winnerId === TEAM_IDS.WARRIORS ? cavaliersScore : warriorsScore;
  const margin = winnerScore - loserScore;
  const flow = margin <= 3 ? "鏖战到最后一个回合" : margin <= 8 ? "在末节拉开差距" : "凭借更稳定的攻防节奏掌控下半场";
  const closingSentence = decisiveEvent
    ? (decisiveEvent.resultConstraint === "actor_wins"
        ? `最后阶段，${decisiveEvent.title}成为收下比赛的决定性回合。`
        : `${decisiveEvent.title}后，${winnerTeam.name}把握住机会守住胜果。`)
    : `${loserTop.name}为${loserTeam.name}拿到 ${loserTop.points} 分，但没能扭转比赛。`;
  const summary = `${winnerTeam.name}${flow}，以 ${winnerScore}-${loserScore} 击败${loserTeam.name}。${winnerTop.name}贡献全队最高的 ${winnerTop.points} 分；${closingSentence}`;
  return {
    number: gameNumber,
    homeTeamId,
    winnerId,
    warriorsScore,
    cavaliersScore,
    baseProbabilityWarriors,
    probabilityWarriors,
    eventMomentumWarriors: eventMomentumA,
    summary,
    events: events.map(event => ({
      id: event.id,
      playerId: event.playerId,
      teamId: event.teamId,
      category: event.category,
      categoryLabel: EVENT_CATEGORIES[event.category],
      momentum: event.momentum,
      resultConstraint: event.resultConstraint,
      title: event.title,
      detail: event.detail
    })),
    warriorsBox,
    cavaliersBox
  };
}

function aggregateStats(games) {
  const totals = Object.fromEntries(Object.keys(PLAYERS).map(playerId => [playerId, {
    playerId, games: 0, points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, threes: 0,
    positiveEvents: 0, clutchEvents: 0
  }]));
  for (const game of games) {
    for (const box of [game.warriorsBox, game.cavaliersBox]) {
      for (const line of box.players) {
        const total = totals[line.playerId];
        total.games += 1;
        total.points += line.points;
        total.rebounds += line.rebounds;
        total.assists += line.assists;
        total.steals += line.steals;
        total.blocks += line.blocks;
        total.threes += line.threes;
      }
    }
    for (const event of game.events) {
      if (event.momentum > 0) totals[event.playerId].positiveEvents += 1;
      if (event.category === "clutch" && event.momentum > 0) totals[event.playerId].clutchEvents += 1;
    }
  }
  return Object.values(totals).map(total => ({
    ...total,
    ppg: total.points / total.games,
    rpg: total.rebounds / total.games,
    apg: total.assists / total.games,
    spg: total.steals / total.games,
    bpg: total.blocks / total.games,
    threesPerGame: total.threes / total.games
  }));
}

function selectSeriesMvp(stats, winnerId) {
  return stats.filter(row => PLAYERS[row.playerId].teamId === winnerId)
    .map(row => ({
      ...row,
      mvpScore: row.ppg + row.rpg * .52 + row.apg * .68 + row.spg * 1.45 + row.bpg * 1.45
        + row.threesPerGame * .28 + row.positiveEvents * .34 + row.clutchEvents * 1.3
    }))
    .sort((left, right) => right.mvpScore - left.mvpScore)[0];
}

function buildHeadline({ winnerId, scoreA, scoreB, mvp, games }) {
  const winner = TEAMS[winnerId];
  const player = PLAYERS[mvp.playerId];
  const topPositiveEvent = games.flatMap(game => game.events.map(event => ({ ...event, gameNumber: game.number })))
    .filter(event => event.teamId === winnerId && event.momentum > 0)
    .sort((left, right) => right.momentum - left.momentum)[0];
  const finalScore = winnerId === TEAM_IDS.WARRIORS ? `4-${scoreB}` : `4-${scoreA}`;
  return {
    eyebrow: `${winner.name} · ${finalScore}`, 
    title: `${player.name}带走系列赛 MVP`,
    summary: topPositiveEvent
      ? `${player.name}场均 ${mvp.ppg.toFixed(1)} 分，${winner.name}凭借“${topPositiveEvent.title}”等关键回合拿下这轮对决。`
      : `${player.name}场均 ${mvp.ppg.toFixed(1)} 分，帮助${winner.name}赢下这轮对决。`
  };
}

export function simulateSeries({ seed = seedFromEntropy() } = {}) {
  const rng = createRng(seed);
  const { profiles: seriesProfiles, spotlights: seriesSpotlights } = createSeriesProfiles(rng);
  const homeCourtTeamId = rng() < .5 ? TEAM_IDS.WARRIORS : TEAM_IDS.CAVALIERS;
  const homePattern = [homeCourtTeamId, homeCourtTeamId,
    homeCourtTeamId === TEAM_IDS.WARRIORS ? TEAM_IDS.CAVALIERS : TEAM_IDS.WARRIORS,
    homeCourtTeamId === TEAM_IDS.WARRIORS ? TEAM_IDS.CAVALIERS : TEAM_IDS.WARRIORS,
    homeCourtTeamId,
    homeCourtTeamId === TEAM_IDS.WARRIORS ? TEAM_IDS.CAVALIERS : TEAM_IDS.WARRIORS,
    homeCourtTeamId];
  let scoreA = 0;
  let scoreB = 0;
  const games = [];
  for (let gameNumber = 1; gameNumber <= 7 && scoreA < 4 && scoreB < 4; gameNumber += 1) {
    const game = simulateGame({
      gameNumber,
      scoreA,
      scoreB,
      homeTeamId: homePattern[gameNumber - 1],
      seriesProfiles,
      rng
    });
    if (game.winnerId === TEAM_IDS.WARRIORS) scoreA += 1;
    else scoreB += 1;
    games.push({ ...game, seriesScoreAfter: { warriors: scoreA, cavaliers: scoreB } });
  }
  const winnerId = scoreA === 4 ? TEAM_IDS.WARRIORS : TEAM_IDS.CAVALIERS;
  const stats = aggregateStats(games);
  const mvp = selectSeriesMvp(stats, winnerId);
  const result = {
    schemaVersion: 1,
    engineVersion: ENGINE_VERSION,
    seed,
    generatedAt: new Date().toISOString(),
    homeCourtTeamId,
    winnerId,
    scoreA,
    scoreB,
    games,
    stats,
    mvp,
    seriesSpotlights
  };
  result.headline = buildHeadline(result);
  return result;
}
