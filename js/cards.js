// AURORA DUEL — card database. No card artwork: every visual is generated from SVG + CSS.

export const ATTR = {
  ice:   { label: 'ICE',   hue: 190, hue2: 220 },
  light: { label: 'LIGHT', hue: 46,  hue2: 22  },
  storm: { label: 'STORM', hue: 264, hue2: 292 },
  earth: { label: 'EARTH', hue: 148, hue2: 170 },
  water: { label: 'WATER', hue: 208, hue2: 230 },
  fire:  { label: 'FIRE',  hue: 14,  hue2: 340 },
  shadow:{ label: 'SHADOW',hue: 318, hue2: 286 }
};

export const GLYPH = {
  ice: `<svg viewBox="0 0 64 64" fill="none"><path d="M32 5v54M8 18l48 28M56 18L8 46M32 14l-7 6 7 6 7-6zM32 38l-7 6 7 6 7-6zM12 28l-3 8 8 3M52 28l3 8-8 3M12 36l-3-8 8-3M52 36l3-8-8-3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="32" cy="32" r="4" fill="currentColor"/></svg>`,
  light: `<svg viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="10" stroke="currentColor" stroke-width="1.8"/><path d="M32 4v9M32 51v9M4 32h9M51 32h9M12 12l6 6M46 46l6 6M52 12l-6 6M18 46l-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M32 19l3.6 9.4L45 32l-9.4 3.6L32 45l-3.6-9.4L19 32l9.4-3.6z" fill="currentColor" opacity=".55"/></svg>`,
  storm: `<svg viewBox="0 0 64 64" fill="none"><path d="M35 4L15 35h14l-3 25 23-34H34l1-22z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 45h10M48 12h8M46 51h10M6 18h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".65"/></svg>`,
  earth: `<svg viewBox="0 0 64 64" fill="none"><path d="M4 50l15-24 9 12 7-16 25 28H4z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M4 50h56M20 50l10-14 7 9" stroke="currentColor" stroke-width="1.2" opacity=".6"/><path d="M32 10l2.5 5.5L40 18l-5.5 2.5L32 26l-2.5-5.5L24 18l5.5-2.5z" fill="currentColor" opacity=".6"/></svg>`,
  water: `<svg viewBox="0 0 64 64" fill="none"><path d="M8 25c7-7 14 7 21 0s14 7 21 0M8 36c7-7 14 7 21 0s14 7 21 0M8 47c7-7 14 7 21 0s14 7 21 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M32 5c5 8 9 13 9 18a9 9 0 11-18 0c0-5 4-10 9-18z" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity=".18"/></svg>`,
  fire: `<svg viewBox="0 0 64 64" fill="none"><path d="M33 5c3 11 14 15 14 29a15 15 0 11-30 0c0-8 4-13 8-18 1 5 4 8 7 9 1-8 0-14 1-20z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M33 30c2 5 6 7 6 13a6 6 0 11-12 0c0-4 2-7 4-10 0 3 1 5 2 6 .5-4 0-7 0-9z" fill="currentColor" opacity=".6"/></svg>`,
  shadow: `<svg viewBox="0 0 64 64" fill="none"><path d="M40 7a22 22 0 100 50 25 25 0 010-50z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M48 18l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM16 10l1.4 3.6L21 15l-3.6 1.4L16 20l-1.4-3.6L11 15l3.6-1.4z" fill="currentColor" opacity=".65"/></svg>`,
  spell: `<svg viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="18" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 4"/><circle cx="32" cy="32" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M32 4v10M32 50v10M4 32h10M50 32h10M12 12l7 7M45 45l7 7M52 12l-7 7M19 45l-7 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="32" cy="32" r="3" fill="currentColor"/></svg>`,
  trap: `<svg viewBox="0 0 64 64" fill="none"><path d="M32 6l22 8v16c0 13-9 22-22 28C19 52 10 43 10 30V14l22-8z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M18 31c8-9 20-9 28 0-8 9-20 9-28 0z" stroke="currentColor" stroke-width="1.5"/><circle cx="32" cy="31" r="4" fill="currentColor"/><path d="M32 15v5M32 43v5M16 31h5M43 31h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity=".6"/></svg>`
};

export const CARDS = {
  // ---------------- monsters ----------------
  frostWyrm: {
    id:'frostWyrm', name:'フロスト・ワイアーム', en:'FROST WYRM', type:'monster', attr:'ice', level:4, atk:1800, def:1200, rarity:'SR',
    text:'氷河の底で眠る古龍。その吐息は戦場を永遠の冬に変える。'
  },
  auroraSaber: {
    id:'auroraSaber', name:'オーロラ・セイバー', en:'AURORA SABER', type:'monster', attr:'light', level:4, atk:1700, def:1500, rarity:'R',
    text:'極光を刃に変えて戦う騎士。夜空を裂く一閃が敵を貫く。'
  },
  polarBear: {
    id:'polarBear', name:'ポーラー・ベア', en:'POLAR BEAR', type:'monster', attr:'ice', level:3, atk:1600, def:1800, rarity:'N',
    text:'北極圏最強の白熊。守りに入ったその巨体は氷の城壁となる。'
  },
  glacialGolem: {
    id:'glacialGolem', name:'グレイシャル・ゴーレム', en:'GLACIAL GOLEM', type:'monster', attr:'earth', level:4, atk:1500, def:2000, rarity:'R',
    text:'万年氷から生まれた巨人。その拳は大地ごと凍りつかせる。'
  },
  blizzardFenrir: {
    id:'blizzardFenrir', name:'ブリザード・フェンリル', en:'BLIZZARD FENRIR', type:'monster', attr:'ice', level:4, atk:1900, def:1000, rarity:'SR',
    text:'吹雪と共に現れる氷狼。獲物を見つけると嵐のように駆け抜ける。'
  },
  snowHarier: {
    id:'snowHarier', name:'スノー・ハリアー', en:'SNOW HARRIER', type:'monster', attr:'storm', level:3, atk:1400, def:1200, rarity:'N',
    text:'雪原を滑空する偵察兵。羽ばたき一つで視界を白く閉ざす。'
  },
  icePhoenix: {
    id:'icePhoenix', name:'アイス・フェニックス', en:'ICE PHOENIX', type:'monster', attr:'ice', level:4, atk:1700, def:900, rarity:'R',
    text:'氷の羽を持つ不死鳥。砕け散っても極光の中で蘇る。'
  },
  northWind: {
    id:'northWind', name:'ノース・ウィンド', en:'NORTH WIND', type:'monster', attr:'storm', level:2, atk:1000, def:1000, rarity:'N',
    text:'北から吹く小さな精霊。集まれば巨大な吹雪となる。'
  },
  crystalSerpent: {
    id:'crystalSerpent', name:'クリスタル・サーペント', en:'CRYSTAL SERPENT', type:'monster', attr:'water', level:4, atk:1600, def:1400, rarity:'R',
    text:'氷晶の鱗を持つ海蛇。凍てつく海溝から静かに狙いを定める。'
  },
  tundraKnight: {
    id:'tundraKnight', name:'ツンドラ・ナイト', en:'TUNDRA KNIGHT', type:'monster', attr:'earth', level:4, atk:1800, def:1600, rarity:'SR',
    text:'凍土を守る重騎士。その盾には幾千の星が刻まれている。'
  },
  frostBeast: {
    id:'frostBeast', name:'フロスト・ビースト', en:'FROST BEAST', type:'monster', attr:'ice', level:3, atk:1300, def:1500, rarity:'N',
    text:'氷の毛皮に包まれた獣。群れで獲物を追い詰める。'
  },
  icicleMage: {
    id:'icicleMage', name:'アイシクル・メイジ', en:'ICICLE MAGE', type:'monster', attr:'water', level:3, atk:1200, def:1800, rarity:'R',
    text:'つららを操る氷の魔術師。その杖は絶対零度を宿す。'
  },
  polarisGuardian: {
    id:'polarisGuardian', name:'ポラリス・ガーディアン', en:'POLARIS GUARDIAN', type:'monster', attr:'light', level:4, atk:1500, def:1900, rarity:'SR',
    text:'北極星に仕える守護者。迷える魂を正しき道へ導く。'
  },
  auroraDragon: {
    id:'auroraDragon', name:'オーロラ・ドラゴン', en:'AURORA DRAGON', type:'monster', attr:'light', level:4, atk:2000, def:1500, rarity:'UR',
    text:'極光の娘と呼ばれる伝説の龍。その翼は夜空そのものを描く。'
  },
  shadowFrost: {
    id:'shadowFrost', name:'シャドウ・フロスト', en:'SHADOW FROST', type:'monster', attr:'shadow', level:4, atk:1750, def:1300, rarity:'R',
    text:'光の届かない氷の影に潜む。その爪は音もなく魂を凍らせる。'
  },

  // ---------------- spells ----------------
  frostNova: {
    id:'frostNova', name:'フロスト・ノヴァ', en:'FROST NOVA', type:'spell', effect:'burn', attr:'ice', rarity:'R',
    text:'相手に800ポイントのダメージを与える。大気中の水分が一瞬で凍りつく。'
  },
  auroraVeil: {
    id:'auroraVeil', name:'オーロラ・ヴェール', en:'AURORA VEIL', type:'spell', effect:'heal', attr:'light', rarity:'N',
    text:'自分のライフポイントを1200回復する。極光の幕が傷を包み込む。'
  },
  glacialDraw: {
    id:'glacialDraw', name:'グレイシャル・ドロー', en:'GLACIAL DRAW', type:'spell', effect:'draw2', attr:'water', rarity:'R',
    text:'デッキからカードを2枚ドローする。氷河の記憶が手札に流れ込む。'
  },
  permafrost: {
    id:'permafrost', name:'パーミアフロスト', en:'PERMAFROST', type:'spell', effect:'buff', attr:'earth', rarity:'SR',
    text:'自分フィールドの表側モンスター全てのATK/DEFを500アップする。'
  },
  meteorShard: {
    id:'meteorShard', name:'メテオ・シャード', en:'METEOR SHARD', type:'spell', effect:'destroy', attr:'storm', rarity:'SR',
    text:'相手フィールドのモンスター1体をランダムに破壊する。'
  },
  polarisGuide: {
    id:'polarisGuide', name:'北極星の導き', en:'POLARIS GUIDE', type:'spell', effect:'search', attr:'light', rarity:'R',
    text:'デッキからモンスター1体をランダムに手札に加える。星が最良の一手を示す。'
  },

  // ---------------- traps ----------------
  iceMirror: {
    id:'iceMirror', name:'アイス・ミラー', en:'ICE MIRROR', type:'trap', effect:'negate500', attr:'ice', rarity:'R',
    text:'相手の攻撃を無効にし、相手に500ダメージを与える。'
  },
  snowTrap: {
    id:'snowTrap', name:'スノー・トラップ', en:'SNOW TRAP', type:'trap', effect:'destroyAttacker', attr:'ice', rarity:'R',
    text:'攻撃してきたモンスターを破壊する。雪原が敵を飲み込む。'
  },
  frostbite: {
    id:'frostbite', name:'フロストバイト', en:'FROSTBITE', type:'trap', effect:'weaken', attr:'water', rarity:'N',
    text:'攻撃してきたモンスターのATKを800ダウンする。'
  },
  auroraBarrier: {
    id:'auroraBarrier', name:'オーロラ・バリア', en:'AURORA BARRIER', type:'trap', effect:'negate', attr:'light', rarity:'N',
    text:'相手の攻撃を無効にする。極光の壁がすべてを遮る。'
  },
  blizzardCounter: {
    id:'blizzardCounter', name:'ブリザード・カウンター', en:'BLIZZARD COUNTER', type:'trap', effect:'destroy300', attr:'storm', rarity:'SR',
    text:'攻撃してきたモンスターを破壊し、相手に300ダメージを与える。'
  }
};

export const DECK_LIST = [
  ['frostWyrm', 2], ['auroraSaber', 2], ['polarBear', 2], ['glacialGolem', 2],
  ['blizzardFenrir', 2], ['snowHarier', 1], ['icePhoenix', 1], ['northWind', 1],
  ['crystalSerpent', 1], ['tundraKnight', 2], ['frostBeast', 1], ['icicleMage', 1],
  ['polarisGuardian', 1], ['auroraDragon', 1], ['shadowFrost', 1],
  ['frostNova', 2], ['auroraVeil', 1], ['glacialDraw', 1], ['permafrost', 1],
  ['meteorShard', 1], ['polarisGuide', 1],
  ['iceMirror', 1], ['snowTrap', 1], ['frostbite', 1], ['auroraBarrier', 1], ['blizzardCounter', 1]
];

export const DECK_SIZE = DECK_LIST.reduce((n, [, c]) => n + c, 0);
