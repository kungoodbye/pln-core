## 炼金核心逻辑分层

### 第一层：常量 & 配置表（纯数据，极少变动）
```
COMPATIBILITY          ← 材质相容表（主属性→相容副属性列表）
UNIVERSAL_SAFE_JUNK   ← 安全杂物（不会产生意外装备）
LEVE_DOWN_SOURCE_NAMES ← 降等源物品（NPC商店→材质）
LEVEL_UP_SOURCE_NAMES  ← 升等源物品
BOOK_COSTS / BOOK_SOURCES  ← 百科书成本与来源
NON_ALCHEMY_METHODS    ← 不可合成获取方式
CRAFT_NAME_ALIASES     ← 制作物品别名映射
MATERIAL_GROUPS        ← 材质分组（纤维/皮革/金属/宝石）
ALL_EQUIPMENT_MATERIALS ← 全部装备材质列表
EQUIPMENT_TYPES        ← 装备部位类型集合
```

### 第二层：纯函数工具（无状态，输入→输出）
```
getItemMaterialSlots(item)         ← 获取全部材质槽
getItemSubMaterials(item)          ← 获取副属性
getItemSearchAliases(item)         ← 搜索别名（拼音等）
getBookSourceText(book)            ← 百科书来源文本
formatBookUsage(book)              ← 百科书格式化
getBookLevelFromName(name)         ← 书名→等级
hasDisabledMaterialSlot(item)      ← 材料是否被禁用
isEquipmentCandidate(item)         ← 是否为装备
isStrictlyCraftOnly(item)          ← 是否纯制造物品
getSafeJunkMaterials(mat)          ← 安全杂物列表
getSafeJunkDescription(mat, lv)    ← 杂物描述文本
normalizeCraftItemName(name)       ← 制作名标准化
getSingleAttribute(statsStr)       ← 单属性类型判断
parseRecommendedFormula(formula)   ← 配方文本解析
```

### 第三层：炼金引擎（核心算法）
```
solveAlchemyPath(target, book, jump, sources)  ← Dijkstra 寻路
getRepresentatives(sources)                     ← 代表物品计算
buildOutputTree(node, reps, sources)            ← 构建输出树
getAlchemyResultCandidates(p, s, book, target)  ← 候选结果列表
getAdvancedAlchemyLevelRange(L1, L2, book)      ← 高级炼金范围
getRecipeCertainty(primary, secondary, book)    ← 配方确定性
getRecipeTargetSuccessRate(recipe, target)      ← 目标成功率
getRecipeOutcomeBreakdown(recipe, target)       ← 产物分解
getSuccessRate(book, jump, recipe)              ← 成功率计算
getJumpPenalty(jump)                            ← 跳级惩罚
getAlchemyBaseBonus()                           ← 基础加成
isTargetInAdvancedAlchemyRange(...)             ← 是否在高炼范围
isBetterRecipe / isBetterPathNode              ← 路径比较
buildLevelToCandidatesMapping(...)             ← 等级候选映射
getDeltaProb(climb, downgradeRange)            ← Δ概率
```

### 第四层：UI 层（留在 app.js，不进入 core）
```
initUI / loadDatabase / renderEquipmentResults
selectItem / recalculatePath / renderCraftSection
renderRecipesList / selectRecipe
renderTreeNode / toggleAllTreeNodes / summarizeMaterials
initMaterialFilterUI / initEquipmentFilterUI
initThemeToggle / toggleTheme
queryEquipmentItems  ← 搜索过滤（UI逻辑，依赖 DOM）
getAlternativeRecipes ← 配方生成（UI辅助）
buildReferenceTree / buildNonSynthSourceTree  ← 展示树
generateTextPathText / generateMaterialListText  ← 文案生成
```

---

## pln-core 目录结构

```
pln-core/                          ← git@github.com:kungoodbye/pln-core.git
├── alchemy_core.js                ← ★ 唯一炼金逻辑源（第一~三层）
├── alchemy_db.json                ← 数据库（构建产物，定期更新）
├── cmd/server/main.go             ← Go API 入口
├── internal/
│   ├── handler/api.go             ← /api/data /api/version
│   └── service/cache.go           ← ETag / 304 / gzip
├── scripts/
│   ├── prepare_data.py            ← 数据构建
│   └── parse_itemdata.py          ← ItemData 解析
├── go.mod
└── README.md
```

## 消费方

| 项目 | 引入方式 |
|------|---------|
| 炼金项目归档/web | `<script src="alchemy_core.js">` + `fetch("/api/alchemy/data")` |
| alchemy_simulator | `<script src="alchemy_core.js">` + `fetch("/api/alchemy/data")` |

## 离线策略

- `alchemy_core.js`（~55KB）→ Service Worker Cache-First，版本号控制更新
- `alchemy_db.json`（~7MB gzip→650KB）→ Stale-While-Revalidate，ETag 304
- Go API 设置 `Cache-Control: max-age=3600` + `ETag`
