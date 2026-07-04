// ==========================================================================
// 飘流幻境新世界 - 智能炼金核心共享逻辑 (alchemy_core.js)
// ==========================================================================

// Filtered list of relevant WLO materials used in equipment compounding
const ALL_EQUIPMENT_MATERIALS = [
    "花类纤维", "草类纤维", "叶类纤维", "羽毛", "羽麻", "尼龙", "兽皮", "兽毛", "兽骨", 
    "金", "银", "白银", "铜", "铁", "钢", "赤铁", "锡", "铅", "铝", "钛", "星耀",
    "水晶", "钻石", "宝石", "玉", "石头", "磁石", "魔性物质", "白色黏土", "结晶体", "胶质", "甲壳", "木材"
].sort();

// Material compatibility table (主属性相容副属性)
// If slot 1 has material K, and slot 2 has material V, the result keeps material K.
const COMPATIBILITY = {
    "星耀": ["星耀", "花类纤维", "草类纤维", "叶类纤维", "木材", "金", "银", "白银", "铜", "铁", "钢", "赤铁", "锡", "铅", "铝", "钛", "水晶", "钻石", "宝石", "玉", "石头", "磁石", "魔性物质", "结晶体", "兽皮", "羽毛", "甲壳", "兽骨", "尼龙"],
    "宝石": ["宝石", "白银", "玉", "金", "银", "铜", "铁", "钢", "水晶", "钻石", "钛", "木材", "兽骨"],
    "白银": ["白银", "玉", "赤铁", "木材", "兽皮", "铜", "铁", "钢", "锡"],
    "银": ["银", "金", "玉", "魔性物质", "水晶", "兽皮", "铜", "铁"],
    "金": ["金", "木材", "铁", "钢", "玉", "白银", "银"],
    "钛": ["钛", "钢", "金", "铁", "白银", "铝"],
    "玉": ["玉", "木材", "兽皮", "铁", "钢", "白银", "铜"],
    "水晶": ["水晶", "木材", "兽皮", "铁", "钢", "白银", "铜"],
    "钻石": ["钻石", "金", "银", "铜", "铁", "钢", "白银", "钛", "水晶"],
    "钢": ["钢", "铁", "赤铁", "木材", "兽皮", "铜", "金", "银"],
    "铁": ["铁", "赤铁", "木材", "兽皮", "铜", "银"],
    "赤铁": ["赤铁", "木材", "兽皮", "铜", "铁", "银"],
    "铜": ["铜", "铁", "木材", "兽皮", "银"],
    "草类纤维": ["花类纤维", "叶类纤维", "兽皮", "木材", "草类纤维"],
    "花类纤维": ["草类纤维", "叶类纤维", "兽皮", "木材", "花类纤维"],
    "兽皮": ["木材", "羽麻", "羽毛", "草类纤维", "花类纤维", "叶类纤维", "兽皮"],
    "羽毛": ["兽皮", "草类纤维", "花类纤维", "叶类纤维", "木材", "羽毛"],
    "兽骨": ["木材", "兽皮", "铁", "钢", "白银", "玉", "兽骨"],
    "木材": ["兽皮", "草类纤维", "叶类纤维", "木材"],
    "魔性物质": ["魔性物质", "木材"]
};

// Costs for books (炼金百科)
const BOOK_COSTS = {
    0: 0,
    1: 10,
    2: 50,
    3: 200,
    4: 800
};

const BOOK_SOURCES = {
    2: ["商城 8绑定钻石", "商城 75紫钻"],
    4: ["商城 125紫钻"]
};

// Penalties for jumping levels (跳级几率惩罚)
const JUMP_PENALTIES = {
    0: 0,       // +0 jump (平合, success rate is ~95%)
    1: 1500,    // +1 jump (moderate risk, success rate is ~50%)
    2: 8000,    // +2 jump (high risk, success rate is ~10-15%)
    3: 50000    // +3 jump (extreme risk, success rate is ~2%)
};

const ADVANCED_ALCHEMY_BASE_BONUS = 4;

const CRAFT_NAME_ALIASES = {
    "魔法牙隋粉": "魔法牙髓粉",
    "龙鳞魔随": "龙鳞魔髓"
};

function getBookSourceText(book) {
    const sources = BOOK_SOURCES[book] || [];
    return sources.length > 0 ? `来源: ${sources.join(" / ")}` : "来源: 暂未收录";
}

function formatBookUsage(book) {
    return book > 0 ? `百科书${book} (+${book}级)` : "不使用百科";
}

function getItemMaterialSlots(item) {
    if (!item) return [];
    return [
        item.material,
        item.sub_material1,
        item.sub_material2,
        item.sub_material3,
        item.sub_material4
    ].map(value => String(value || "").trim()).filter(Boolean);
}

function getItemSubMaterials(item) {
    return getItemMaterialSlots(item).slice(1);
}

function getItemSearchAliases(item) {
    return [
        item && item.name,
        item && item.query_tool_name,
        item && item.legacy_name
    ].filter(Boolean);
}

function hasDisabledMaterialSlot(item) {
    // If enabledMaterials is not defined globally, fallback to allowing all
    const activeMaterials = typeof enabledMaterials !== 'undefined' ? enabledMaterials : new Set(ALL_EQUIPMENT_MATERIALS);
    return getItemMaterialSlots(item).some(material => !activeMaterials.has(material));
}

function isSelfProvidedUnknownSourceItem(item) {
    return Boolean(
        item &&
        !item.source &&
        !item.crafted_from &&
        item.material === "星耀" &&
        String(item.name || "").startsWith("星耀之尘‧") &&
        getItemMaterialSlots(item).length === 1
    );
}

function getBookLevelFromName(name) {
    const match = String(name || "").match(/^炼金百科([一二三四])$/);
    if (!match) return 0;
    return "一二三四".indexOf(match[1]) + 1;
}

function normalizeCraftItemName(name) {
    return CRAFT_NAME_ALIASES[name] || name;
}

function getAdvancedAlchemyLevelRange(level1, level2, book = 0) {
    const baseLevel = Math.min(level1, level2);
    // L_base >= 8: downgrade up to 7 levels
    // L_base < 8:  downgrade up to 3 levels (game-verified, e.g. 5+5 → range 2-9)
    const downgradeRange = baseLevel >= 8 ? 7 : 3;
    return {
        min: Math.max(1, baseLevel - downgradeRange),
        max: baseLevel + ADVANCED_ALCHEMY_BASE_BONUS + book
    };
}

function isEquipmentCandidate(item) {
    return Boolean(item && item.type && item.category);
}

function queryEquipmentItems(filters = {}) {
    const query = String(filters.query || "").trim().toLowerCase();
    const category = String(filters.category || "").trim();
    const primaryMaterial = String(filters.primaryMaterial || "").trim();
    const attributeMode = String(filters.attributeMode || "").trim();
    
    // Fallback if db is not loaded globally
    const itemsDb = typeof db !== 'undefined' ? db : (window.alchemy_db || []);
    
    return itemsDb
        .filter(item => {
            if (!isEquipmentCandidate(item)) return false;
            if (query) {
                const searchable = [
                    ...getItemSearchAliases(item),
                    item.id,
                    item.level,
                    item.req_level
                ].map(value => String(value || "").toLowerCase());
                if (!searchable.some(value => value.includes(query))) return false;
            }
            if (category && item.category !== category) return false;
            if (primaryMaterial && item.material !== primaryMaterial) return false;
            
            const slotCount = getItemMaterialSlots(item).length;
            if (attributeMode === "single" && slotCount !== 1) return false;
            if (attributeMode === "multi" && slotCount <= 1) return false;
            return true;
        })
        .sort((a, b) => {
            if (a.level !== b.level) return a.level - b.level;
            if ((a.req_level || 0) !== (b.req_level || 0)) return (a.req_level || 0) - (b.req_level || 0);
            return String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans-CN");
        });
}

function getAlchemyResultCandidates(primaryItem, secondaryItem, book = 0, targetItem = null) {
    if (!primaryItem || !secondaryItem) return [];
    
    const range = getAdvancedAlchemyLevelRange(primaryItem.level, secondaryItem.level, book);
    
    const activeMaterials = typeof enabledMaterials !== 'undefined' ? enabledMaterials : new Set(ALL_EQUIPMENT_MATERIALS);
    const itemsDb = typeof db !== 'undefined' ? db : (window.alchemy_db || []);

    const secondaryMaterial = String(secondaryItem.material || "").trim();

    // Step 1: filter by type, material, level range, active materials
    let candidates = itemsDb.filter(item => {
        const isCompoundingCandidate = (item.req_level > 0) || (item.category === "矿物类");
        if (!isCompoundingCandidate) return false;
        if (item.material !== primaryItem.material) return false;
        if (item.level < range.min || item.level > range.max) return false;
        if (!activeMaterials.has(item.material)) return false;

        const itemSlots = getItemMaterialSlots(item);
        if (itemSlots.some(material => !activeMaterials.has(material))) return false;

        return true;
    });

    // Step 2: key rule — if secondary material matches any candidate's sub-material,
    // it's a "key" that locks candidates to only those requiring that sub-material.
    // If it matches none, it's "trash" (杂物) with no filtering effect.
    const hasMatchingSub = candidates.some(item => {
        const subs = getItemMaterialSlots(item).slice(1);
        return subs.includes(secondaryMaterial);
    });
    if (hasMatchingSub) {
        candidates = candidates.filter(item => {
            const subs = getItemMaterialSlots(item).slice(1);
            return subs.includes(secondaryMaterial);
        });
    }

    // Step 3: all item sub-materials must be covered by input materials
    const inputMaterials = [primaryItem.material, secondaryItem.material].map(x => String(x || "").trim()).filter(Boolean);
    if (targetItem) {
        const targetSlots = getItemMaterialSlots(targetItem);
        if (targetSlots.length > 2) {
            for (let i = 2; i < targetSlots.length; i++) {
                inputMaterials.push(targetSlots[i]);
            }
        }
    }

    return candidates.filter(item => {
        const itemSlots = getItemMaterialSlots(item);
        return itemSlots.every(mat => inputMaterials.includes(mat));
    }).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, "zh-Hans-CN"));
}

function getRecipeCertainty(primaryItem, secondaryItem, book = 0, targetItem = null) {
    const candidates = getAlchemyResultCandidates(primaryItem, secondaryItem, book, targetItem);
    const hits = targetItem ? candidates.filter(item => item.name === targetItem.name) : [];
    
    if (targetItem && hits.length === 0) {
        return { rate: 0, candidates };
    }
    
    const candidatesAtTargetLevel = targetItem 
        ? candidates.filter(item => item.level === targetItem.level) 
        : candidates;
        
    const rate = candidatesAtTargetLevel.length > 0 ? Math.round(100 / candidatesAtTargetLevel.length) : 0;
    return { rate, candidates };
}

function isTargetInAdvancedAlchemyRange(primaryItem, secondaryItem, book, targetItem) {
    if (!primaryItem || !secondaryItem || !targetItem) return false;
    if (primaryItem.material !== targetItem.material) return false;
    
    const range = getAdvancedAlchemyLevelRange(primaryItem.level, secondaryItem.level, book);
    return targetItem.level >= range.min && targetItem.level <= range.max;
}

function isBetterRecipe(existing, nextCost, nextRate, nextBook) {
    if (!existing) return true;
    if (nextRate !== existing.certaintyRate) return nextRate > existing.certaintyRate;
    if (nextBook !== existing.book) return nextBook < existing.book;
    return nextCost < existing.cost;
}

function isBetterPathNode(existingNode, nextCost, nextBook, nextJump) {
    if (!existingNode || existingNode.cost === Infinity) return true;
    if (existingNode.method !== "compound") return nextCost < existingNode.cost;
    if (nextBook !== existingNode.book) return nextBook < existingNode.book;
    if (nextJump !== existingNode.jump) return nextJump < existingNode.jump;
    return nextCost < existingNode.cost;
}

function parseRecommendedFormula(formula) {
    if (!formula) return [];
    const itemsDb = typeof db !== 'undefined' ? db : (window.alchemy_db || []);
    
    return formula
        .split(/[+＋]/)
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => {
            const bookMatch = part.match(/^炼金百科([一二三四1-4])$/);
            if (bookMatch) {
                const rawLevel = bookMatch[1];
                const bookLevel = "一二三四".includes(rawLevel)
                    ? "一二三四".indexOf(rawLevel) + 1
                    : parseInt(rawLevel, 10);
                return {
                    name: `炼金百科${"一二三四"[bookLevel - 1]}`,
                    count: 1,
                    method: "referenceIngredient",
                    role: "参考材料",
                    source: getBookSourceText(bookLevel)
                };
            }
            
            const itemMatch = part.match(/^(?:(\d+)\s*)?(.+)$/);
            const refName = itemMatch ? itemMatch[2].trim() : part;
            const item = itemsDb.find(x => getItemSearchAliases(x).includes(refName));
            return {
                name: refName,
                level: item ? item.level : null,
                material: item ? item.material : "",
                count: 1,
                method: "referenceIngredient",
                role: "参考材料"
            };
        });
}

function buildItemDataMaterialReferenceTree(targetItem) {
    const slots = getItemMaterialSlots(targetItem);
    if (!targetItem || targetItem.material_source !== "ItemData_C.bin" || slots.length < 2) return null;
    
    return {
        name: targetItem.name,
        material: targetItem.material,
        level: targetItem.level,
        cost: 0,
        method: "reference",
        sourceNote: "来源: ItemData_C.bin 已确认材料槽；原料来源/完整路径未收录，不能视为100%配方",
        formula: slots.join(" + "),
        children: slots.map((material, index) => ({
            name: `${index === 0 ? "主属性" : `副属性${index}`}: ${material}`,
            material,
            count: 1,
            method: "referenceIngredient",
            role: "ItemData材料槽"
        }))
    };
}

function buildReferenceTree(targetItem) {
    if (!targetItem) return null;
    if (!targetItem.recommended_formula) {
        return buildItemDataMaterialReferenceTree(targetItem);
    }
    const children = parseRecommendedFormula(targetItem.recommended_formula);
    if (children.length === 0) return buildItemDataMaterialReferenceTree(targetItem);
    
    return {
        name: targetItem.name,
        material: targetItem.material,
        level: targetItem.level,
        cost: 0,
        method: "reference",
        sourceNote: "来源: 飘流查询器建议配方（未按反编译公式校验）",
        formula: targetItem.recommended_formula,
        children
    };
}

// Calculate single recipe exact probability of getting targetItem using fallback mapping
function getRecipeTargetSuccessRate(recipe, targetItem = null) {
    if (!recipe || !recipe.node1 || !recipe.node2) return 0;
    const primaryItem = recipe.node1.item;
    const secondaryItem = recipe.node2.item;
    const book = recipe.book;
    
    const fallbackTarget = typeof selectedItem !== 'undefined' ? selectedItem : null;
    const target = targetItem || recipe.targetItem || fallbackTarget;
    if (!primaryItem || !secondaryItem || !target) return 0;
    
    const L_min = Math.min(primaryItem.level, secondaryItem.level);
    const B = book;
    
    const candidates = getAlchemyResultCandidates(primaryItem, secondaryItem, B, target);
    if (candidates.length === 0) return 0;
    
    const downgradeRange = L_min >= 8 ? 7 : 3;
    const minLevel = Math.max(1, L_min + B - downgradeRange);  // output range includes百科 shift
    const maxLevel = L_min + B + 4;
    
    const levelToCandidates = buildLevelToCandidatesMapping(candidates, minLevel, maxLevel);
    
    let targetProb = 0;
    for (let L = minLevel; L <= maxLevel; L++) {
        const climb = L - (L_min + B);  // alchemy jump (百科 bonus added separately)
        const prob = getDeltaProb(delta, downgradeRange);
        if (prob <= 0) continue;
        
        const validCandidates = levelToCandidates[L];
        if (validCandidates && validCandidates.length > 0) {
            const splitProb = prob / validCandidates.length;
            const hasTarget = validCandidates.some(item => item.name === target.name);
            if (hasTarget) {
                targetProb += splitProb;
            }
        }
    }
    
    return Math.round(targetProb * 100);
}

// Jump probabilities table:
// climb = levels jumped by alchemy RNG (not including encyclopedia bonus)
// Advanced Alchemy: max climb +5 (official FAQ confirmed)
// Encyclopedia adds B as flat bonus: final_level = L_min + climb + B
function getDeltaProb(climb, downgradeRange = 7) {
    if (climb === 5) return 0.01;  // +5: extremely rare (official: 非常渺茫)
    if (climb === 4) return 0.09;
    if (climb === 3) return 0.25;
    if (climb === 2) return 0.30;
    if (climb === 1) return 0.15;
    if (climb === 0) return 0.15;
    if (climb < 0) {
        return 0.05 / downgradeRange; // 5% total spread across downgrade levels
    }
    return 0; // climb > 5: not possible (even with encyclopedia, climb max is 5)
}

// Map output level to candidates with fallback handling
function buildLevelToCandidatesMapping(candidates, minLevel, maxLevel) {
    const levelToCandidates = {};
    for (let L = maxLevel; L >= minLevel; L--) {
        const atLevel = candidates.filter(item => item.level === L);
        if (atLevel.length > 0) {
            levelToCandidates[L] = atLevel;
        } else {
            let fallbackLevel = -1;
            for (let L_prev = L - 1; L_prev >= minLevel; L_prev--) {
                const atLevelPrev = candidates.filter(item => item.level === L_prev);
                if (atLevelPrev.length > 0) {
                    fallbackLevel = L_prev;
                    break;
                }
            }
            if (fallbackLevel === -1) {
                for (let L_next = L + 1; L_next <= maxLevel; L_next++) {
                    const atLevelNext = candidates.filter(item => item.level === L_next);
                    if (atLevelNext.length > 0) {
                        fallbackLevel = L_next;
                        break;
                    }
                }
            }
            if (fallbackLevel !== -1) {
                levelToCandidates[L] = candidates.filter(item => item.level === fallbackLevel);
            }
        }
    }
    return levelToCandidates;
}

function getRecipeOutcomeBreakdown(recipe, targetItem = null) {
    if (!recipe || !recipe.node1 || !recipe.node2) return "";
    const primaryItem = recipe.node1.item;
    const secondaryItem = recipe.node2.item;
    const book = recipe.book;
    
    const fallbackTarget = typeof selectedItem !== 'undefined' ? selectedItem : null;
    const target = targetItem || recipe.targetItem || fallbackTarget;
    if (!primaryItem || !secondaryItem || !target) return "";
    
    const L_min = Math.min(primaryItem.level, secondaryItem.level);
    const B = book;
    
    const candidates = getAlchemyResultCandidates(primaryItem, secondaryItem, B, target);
    if (candidates.length === 0) return "";
    
    const downgradeRange = L_min >= 8 ? 7 : 3;
    const minLevel = Math.max(1, L_min + B - downgradeRange);  // output range includes百科 shift
    const maxLevel = L_min + B + 4;
    
    const levelToCandidates = buildLevelToCandidatesMapping(candidates, minLevel, maxLevel);
    
    const itemProbabilities = {};
    for (let L = minLevel; L <= maxLevel; L++) {
        const climb = L - (L_min + B);  // alchemy jump (百科 bonus added separately)
        const prob = getDeltaProb(delta, downgradeRange);
        if (prob <= 0) continue;
        
        const validCandidates = levelToCandidates[L];
        if (validCandidates && validCandidates.length > 0) {
            const splitProb = prob / validCandidates.length;
            validCandidates.forEach(item => {
                itemProbabilities[item.name] = (itemProbabilities[item.name] || 0) + splitProb;
            });
        }
    }
    
    const sortedItems = Object.entries(itemProbabilities)
        .map(([name, prob]) => ({ name, rate: Math.round(prob * 100) }))
        .filter(item => item.rate > 0)
        .sort((a, b) => b.rate - a.rate);
        
    if (sortedItems.length === 0) return "";
    
    return "预测产物: " + sortedItems.map(x => `${x.name} (${x.rate}%)`).join(", ");
}

function getSuccessRate(book, jump, recipe = null) {
    if (recipe && recipe.node1 && recipe.node2) {
        return getRecipeTargetSuccessRate(recipe);
    }
    
    let synthRate = 100;
    
    if (jump <= 0) {
        synthRate = 35;
    } else if (jump === 1) {
        synthRate = 45;
    } else if (jump === 2) {
        synthRate = 50;
    } else if (jump === 3) {
        synthRate = 30;
    } else if (jump === 4) {
        synthRate = 15;
    } else {
        synthRate = 2;
    }
    
    if (recipe && typeof recipe.certaintyRate === "number") {
        return Math.round(synthRate * (recipe.certaintyRate / 100));
    }
    
    return synthRate;
}

function getRepresentatives(enabledSources = { convenience: false }) {
    const reps = {};
    const itemsDb = typeof db !== 'undefined' ? db : (window.alchemy_db || []);
    
    itemsDb.forEach(item => {
        if (!item.material || item.level <= 0) return;
        const key = `${item.material}_${item.level}`;
        
        const isStore = item.source && (item.source.includes("8-12") || item.source.includes("便利店"));
        if (isStore && !enabledSources.convenience) {
            return;
        }
        
        if (hasDisabledMaterialSlot(item)) {
            return;
        }
        
        const currentBest = reps[key];
        if (!currentBest) {
            reps[key] = item;
        } else {
            const hasSource = (s) => s && s.length > 0;
            if (hasSource(item.source) && !hasSource(currentBest.source)) {
                reps[key] = item;
            } else if (item.name.length < currentBest.name.length) {
                reps[key] = item;
            }
        }
    });
    return reps;
}

// Core Dijkstra / DAG Pathfinding solver
function solveAlchemyPath(targetItem, maxBook, maxJump, enabledSources, returnAll = false) {
    const representatives = getRepresentatives(enabledSources);
    const dp = {};
    const itemsDb = typeof db !== 'undefined' ? db : (window.alchemy_db || []);
    const activeMaterials = typeof enabledMaterials !== 'undefined' ? enabledMaterials : new Set(ALL_EQUIPMENT_MATERIALS);
    
    const states = [];
    const stateKeys = new Set();
    itemsDb.forEach(item => {
        if (item.material && item.level > 0) {
            const key = `${item.material}_${item.level}`;
            if (!stateKeys.has(key)) {
                stateKeys.add(key);
                states.push({ material: item.material, level: item.level });
            }
        }
    });
    
    states.sort((a, b) => a.level - b.level);
    
    const getBaseCost = (item) => {
        if (!item.source) {
            return isSelfProvidedUnknownSourceItem(item) ? Math.max(10, (item.level || 1) * 10) : Infinity;
        }
        
        if (item.source.includes("8-12") || item.source.includes("便利店")) {
            if (!enabledSources.convenience) {
                return Infinity;
            }
        }
        
        const isShop = item.source.includes("商店:") || item.source.includes("商店：") || 
                       item.source.includes("购买:") || item.source.includes("购买：");
        const isMine = item.source.includes("采集:") || item.source.includes("采集：");
        const isDrop = item.source.includes("掉落:") || item.source.includes("掉落：");
        
        if (isShop && !enabledSources.shop) return Infinity;
        if (isMine && !enabledSources.mine) return Infinity;
        if (isDrop && !enabledSources.drop) return Infinity;
        
        if (isShop) {
            const goldMatch = item.source.match(/(\d+)金币/);
            return goldMatch ? parseInt(goldMatch[1]) : 100;
        }
        if (isMine) {
            return item.level * 10;
        }
        if (isDrop) {
            return item.level * 15;
        }
        return Infinity;
    };
    
    states.forEach(st => {
        const key = `${st.material}_${st.level}`;
        const rep = representatives[key];
        let minCost = Infinity;
        let method = "none";
        
        if (activeMaterials.has(st.material)) {
            if (rep) {
                minCost = getBaseCost(rep);
                if (minCost !== Infinity) {
                    method = "base";
                }
            }
        }
        
        dp[key] = {
            material: st.material,
            level: st.level,
            cost: minCost,
            method: method,
            item: rep,
            source: rep ? rep.source : ""
        };
    });
    
    if (enabledSources.craft) {
        const resolvedCraft = {};
        
        const calcCraftCost = (itemName, depth = 0) => {
            if (depth > 6) return Infinity;
            const normalizedItemName = normalizeCraftItemName(itemName);
            if (resolvedCraft[normalizedItemName] !== undefined) return resolvedCraft[normalizedItemName];
            
            const item = itemsDb.find(x => x.name === normalizedItemName);
            if (!item) return Infinity;
            
            if (item.material && !activeMaterials.has(item.material)) return Infinity;
            
            const baseCost = getBaseCost(item);
            if (baseCost !== Infinity) {
                resolvedCraft[normalizedItemName] = baseCost;
                return baseCost;
            }
            if (!item.material && !item.crafted_from) {
                resolvedCraft[normalizedItemName] = Math.max(10, (item.level || 1) * 10);
                return resolvedCraft[normalizedItemName];
            }
            
            if (item.crafted_from) {
                let cost = 30;
                let ok = true;
                for (let ing of item.crafted_from.ingredients) {
                    const ingCost = calcCraftCost(ing.name, depth + 1);
                    if (ingCost === Infinity) {
                        ok = false;
                        break;
                    }
                    cost += ing.count * ingCost;
                }
                if (ok) {
                    resolvedCraft[normalizedItemName] = cost;
                    return cost;
                }
            }
            
            resolvedCraft[normalizedItemName] = Infinity;
            return Infinity;
        };
        
        states.forEach(st => {
            if (!activeMaterials.has(st.material)) return;
            const key = `${st.material}_${st.level}`;
            const rep = representatives[key];
            if (rep && rep.crafted_from) {
                const craftCost = calcCraftCost(rep.name);
                if (craftCost < dp[key].cost || dp[key].cost === Infinity) {
                    dp[key].cost = craftCost;
                    dp[key].method = "craft";
                    dp[key].item = rep;
                    dp[key].crafted_from = rep.crafted_from;
                }
            }
        });

        if (targetItem.crafted_from && targetItem.material && activeMaterials.has(targetItem.material)) {
            const key = `${targetItem.material}_${targetItem.level}`;
            const craftCost = calcCraftCost(targetItem.name);
            if (dp[key] && craftCost !== Infinity) {
                dp[key].cost = craftCost;
                dp[key].method = "craft";
                dp[key].item = targetItem;
                dp[key].crafted_from = targetItem.crafted_from;
            }
        }
    }

    const targetKey = `${targetItem.material}_${targetItem.level}`;

    for (let i = 0; i < states.length; i++) {
        const u = states[i];
        if (!activeMaterials.has(u.material)) continue;
        
        const key_u = `${u.material}_${u.level}`;
        const node_u = dp[key_u];
        const outputItem = (key_u === targetKey) ? targetItem : representatives[key_u];
        if (outputItem && !isEquipmentCandidate(outputItem)) {
            continue;
        }
        
        const L = u.level;
        let m2List = COMPATIBILITY[u.material] || [u.material];
        const rep = (key_u === targetKey) ? targetItem : representatives[key_u];
        const materialSlotCount = getItemMaterialSlots(rep).length;
        const requiresThirdMaterial = materialSlotCount === 3;
        const hasUnsupportedMaterialCount = materialSlotCount > 3;
        if (hasUnsupportedMaterialCount) continue;
        if (rep && rep.sub_material1) {
            const sub_m = rep.sub_material1.trim();
            if (sub_m) {
                m2List = [sub_m];
            }
        }
        
        for (let B = 0; B <= maxBook; B++) {
            if (!requiresThirdMaterial) {
                const minBaseLevel = Math.max(1, L - ADVANCED_ALCHEMY_BASE_BONUS - B);
                const maxBaseLevel = L - 1;
                for (let L1 = minBaseLevel; L1 < L; L1++) {
                    const key_slot1_adv = `${u.material}_${L1}`;
                    const node_slot1_adv = dp[key_slot1_adv];
                    if (!node_slot1_adv || node_slot1_adv.cost === Infinity || !node_slot1_adv.item) continue;
                    
                    m2List.forEach(m2 => {
                        if (!activeMaterials.has(m2)) return;
                        for (let L2 = minBaseLevel; L2 <= Math.min(L1, maxBaseLevel); L2++) {
                            const key_slot2_adv = `${m2}_${L2}`;
                            const node_slot2_adv = dp[key_slot2_adv];
                            if (!node_slot2_adv || node_slot2_adv.cost === Infinity || !node_slot2_adv.item) continue;
                            
                            if (!isTargetInAdvancedAlchemyRange(node_slot1_adv.item, node_slot2_adv.item, B, outputItem)) continue;
                            
                            const compoundCost = node_slot1_adv.cost + node_slot2_adv.cost + BOOK_COSTS[B];
                            if (isBetterPathNode(node_u, compoundCost, B, 0)) {
                                node_u.cost = compoundCost;
                                node_u.method = "compound";
                                node_u.item1 = node_slot1_adv;
                                node_u.item2 = node_slot2_adv;
                                node_u.book = B;
                                node_u.jump = 0;
                            }
                        }
                    });
                }
            }
            
            for (let J = 0; J <= maxJump; J++) {
                const L_min = L - B - J;
                if (L_min < 1) continue;
                
                const minL = L_min;
                for (let L1 = minL; L1 <= minL + 2; L1++) {
                    if (L1 >= L) continue;
                    const key_slot1 = `${u.material}_${L1}`;
                    const node_slot1 = dp[key_slot1];
                    if (!node_slot1 || node_slot1.cost === Infinity) continue;
                    
                    m2List.forEach(m2 => {
                        if (!activeMaterials.has(m2)) return;
                        for (let L2 = minL; L2 <= minL + 2; L2++) {
                            if (L2 >= L) continue;
                            if (L1 < L2) continue;
                            if (Math.min(L1, L2) !== minL) continue;
                            
                            const key_slot2 = `${m2}_${L2}`;
                            const node_slot2 = dp[key_slot2];
                            if (!node_slot2 || node_slot2.cost === Infinity) continue;
                            
                            const compoundCost = node_slot1.cost + 
                                                 node_slot2.cost + 
                                                 BOOK_COSTS[B] + 
                                                 JUMP_PENALTIES[J];
                            
                            if (isBetterPathNode(node_u, compoundCost, B, J)) {
                                node_u.cost = compoundCost;
                                node_u.method = "compound";
                                node_u.item1 = node_slot1;
                                node_u.item2 = node_slot2;
                                node_u.book = B;
                                node_u.jump = J;
                            }
                        }
                    });
                }
            }
        }
    }
    
    const targetNode = dp[targetKey];
    const is3Mat = getItemMaterialSlots(targetItem).length === 3;
    
    if (!is3Mat && (!targetNode || (targetNode.cost === Infinity && targetNode.method !== "craft"))) {
        const referenceTree = buildReferenceTree(targetItem);
        if (returnAll) {
            return { tree: referenceTree, recipes: [] };
        }
        return referenceTree;
    }
    
    let tree = null;
    if (targetNode && (targetNode.cost !== Infinity || targetNode.method === "craft")) {
        tree = buildOutputTree(targetNode, representatives, enabledSources);
    }
    
    if (returnAll) {
        const recipes = getAlternativeRecipes(targetItem, maxBook, maxJump, enabledSources, dp, representatives);
        if (!tree) {
            tree = buildReferenceTree(targetItem);
        }
        return { tree, recipes };
    }
    
    return tree || buildReferenceTree(targetItem);
}

function buildOutputTree(node, representatives, enabledSources) {
    let displayName = node.item ? node.item.name : `${node.material}(${node.level}级)`;
    if (node.item && node.material && node.level > 0 && !node.exactName) {
        const alt = getAlternativeNames(node.material, node.level, node.item.name, enabledSources);
        if (alt) {
            displayName += ` ${alt}`;
        }
    }
    
    const tree = {
        name: displayName,
        material: node.material,
        level: node.level,
        cost: node.cost,
        method: node.method
    };
    
    if (node.method === "base") {
        tree.source = node.source || (isSelfProvidedUnknownSourceItem(node.item) ? "自备（来源未收录）" : "");
    } else if (node.method === "craft") {
        tree.tool = node.crafted_from.tool;
        tree.children = [];
        const itemsDb = typeof db !== 'undefined' ? db : (window.alchemy_db || []);
        
        node.crafted_from.ingredients.forEach(ing => {
            const ingName = normalizeCraftItemName(ing.name);
            const ingItem = itemsDb.find(x => x.name === ingName);
            if (ingItem) {
                const repNode = {
                    item: ingItem,
                    material: ingItem.material,
                    level: ingItem.level,
                    cost: ingItem.level * 10,
                    method: ingItem.crafted_from ? "craft" : "base",
                    source: ingItem.source,
                    crafted_from: ingItem.crafted_from,
                    exactName: true
                };
                
                const subTree = buildOutputTree(repNode, representatives, enabledSources);
                subTree.count = ing.count;
                tree.children.push(subTree);
            } else {
                tree.children.push({
                    name: ingName,
                    count: ing.count,
                    method: "base",
                    source: "未知来源"
                });
            }
        });
    } else if (node.method === "compound") {
        tree.book = node.book;
        tree.jump = node.jump;
        tree.node1 = node.item1;
        tree.node2 = node.item2;
        tree.targetItem = node.item;
        tree.children = [
            buildOutputTree(node.item1, representatives, enabledSources),
            buildOutputTree(node.item2, representatives, enabledSources)
        ];
        tree.children[0].role = "主材 (Slot 1)";
        tree.children[1].role = "副材 (Slot 2)";
    } else if (node.method === "reference") {
        tree.sourceNote = node.sourceNote;
        tree.formula = node.formula;
        tree.children = node.children || [];
    }
    
    return tree;
}

function getAlternativeRecipes(targetItem, maxBook, maxJump, enabledSources, dp, representatives) {
    const recipeGroups = new Map();
    const L = targetItem.level;
    const M = targetItem.material;
    const activeMaterials = typeof enabledMaterials !== 'undefined' ? enabledMaterials : new Set(ALL_EQUIPMENT_MATERIALS);
    
    if (!activeMaterials.has(M)) return [];
    
    const targetMaterialSlots = getItemMaterialSlots(targetItem);
    if (targetMaterialSlots.length > 3) return [];
    
    const sub2_m = targetItem.sub_material2 ? targetItem.sub_material2.trim() : "";
    const is3Mat = targetMaterialSlots.length === 3;
    
    for (let B = 0; B <= maxBook; B++) {
        for (let J = 0; J <= maxJump; J++) {
            const L_min = L - B - J;
            if (L_min < 1) continue;
            
            if (is3Mat) {
                const m2 = targetItem.sub_material1 ? targetItem.sub_material1.trim() : M;
                const m3 = sub2_m;
                
                if (!activeMaterials.has(m2) || !activeMaterials.has(m3)) continue;
                
                const minL = L_min;
                for (let L1 = minL; L1 <= minL + 2; L1++) {
                    if (L1 >= L) continue;
                    const key_slot1 = `${M}_${L1}`;
                    const node_slot1 = dp[key_slot1];
                    if (!node_slot1 || node_slot1.cost === Infinity) continue;
                    
                    for (let L2 = minL; L2 <= minL + 2; L2++) {
                        if (L2 >= L) continue;
                        if (L1 < L2) continue;
                        const key_slot2 = `${m2}_${L2}`;
                        const node_slot2 = dp[key_slot2];
                        if (!node_slot2 || node_slot2.cost === Infinity) continue;
                        
                        for (let L3 = minL; L3 <= minL + 2; L3++) {
                            if (L3 >= L) continue;
                            if (L1 < L3) continue;
                            if (Math.min(L1, L2, L3) !== minL) continue;
                            
                            const key_slot3 = `${m3}_${L3}`;
                            const node_slot3 = dp[key_slot3];
                            if (!node_slot3 || node_slot3.cost === Infinity) continue;
                            
                            const cost = node_slot1.cost + node_slot2.cost + node_slot3.cost + BOOK_COSTS[B] + JUMP_PENALTIES[J];
                            const name1 = node_slot1.item ? node_slot1.item.name : `${M}(物等${L1})`;
                            const name2 = node_slot2.item ? node_slot2.item.name : `${m2}(物等${L2})`;
                            const name3 = node_slot3.item ? node_slot3.item.name : `${m3}(物等${L3})`;
                            
                            const displayName1 = name1 + getAlternativeNames(M, L1, name1, enabledSources);
                            const displayName2 = name2 + getAlternativeNames(m2, L2, name2, enabledSources);
                            const displayName3 = name3 + getAlternativeNames(m3, L3, name3, enabledSources);
                            const certainty = getRecipeCertainty(node_slot1.item, node_slot2.item, B, targetItem);
                            if (certainty.rate <= 0) continue;
                            
                            const groupKey = `${name1}_1_${name2}_1_${name3}`;
                            const existing = recipeGroups.get(groupKey);
                            if (isBetterRecipe(existing, cost, certainty.rate, B)) {
                                recipeGroups.set(groupKey, {
                                    is3Material: true,
                                    name1: name1,
                                    name2: name2,
                                    name3: name3,
                                    count1: 1,
                                    count2: 1,
                                    count3: 1,
                                    node1: node_slot1,
                                    node2: node_slot2,
                                    node3: node_slot3,
                                    book: B,
                                    jump: J,
                                    certaintyRate: certainty.rate,
                                    candidates: certainty.candidates,
                                    cost: cost,
                                    desc: `主材: ${displayName1} [等${L1}] + 副1: ${displayName2} [等${L2}] + 副2: ${displayName3} [等${L3}] + ${formatBookUsage(B)}${J > 0 ? ' 且额外跳' + J + '级' : ' (无额外跳级)'}`
                                });
                            }
                        }
                    }
                }
            } else {
                let m2List = COMPATIBILITY[M] || [M];
                if (targetItem.sub_material1) {
                    const sub_m = targetItem.sub_material1.trim();
                    if (sub_m) {
                        m2List = [sub_m];
                    }
                }
                
                const minL = L_min;
                
                for (let L1 = 1; L1 < L; L1++) {
                    const key_slot1_adv = `${M}_${L1}`;
                    const node_slot1_adv = dp[key_slot1_adv];
                    if (!node_slot1_adv || node_slot1_adv.cost === Infinity || !node_slot1_adv.item) continue;
                    
                    m2List.forEach(m2 => {
                        if (!activeMaterials.has(m2)) return;
                        for (let L2 = 1; L2 <= L1; L2++) {
                            const key_slot2_adv = `${m2}_${L2}`;
                            const node_slot2_adv = dp[key_slot2_adv];
                            if (!node_slot2_adv || node_slot2_adv.cost === Infinity || !node_slot2_adv.item) continue;
                            
                            const certainty = getRecipeCertainty(node_slot1_adv.item, node_slot2_adv.item, B, targetItem);
                            if (certainty.rate <= 0) continue;
                            
                            const cost = node_slot1_adv.cost + node_slot2_adv.cost + BOOK_COSTS[B];
                            const name1 = node_slot1_adv.item.name;
                            const name2 = node_slot2_adv.item.name;
                            const displayName1 = name1 + getAlternativeNames(M, L1, name1, enabledSources);
                            const displayName2 = name2 + getAlternativeNames(m2, L2, name2, enabledSources);
                            const groupKey = `${name1}_1_${name2}`;
                            const existing = recipeGroups.get(groupKey);
                            
                            if (isBetterRecipe(existing, cost, certainty.rate, B)) {
                                recipeGroups.set(groupKey, {
                                    name1: name1,
                                    name2: name2,
                                    count1: 1,
                                    count2: 1,
                                    node1: node_slot1_adv,
                                    node2: node_slot2_adv,
                                    book: B,
                                    jump: 0,
                                    certaintyRate: certainty.rate,
                                    candidates: certainty.candidates,
                                    cost: cost,
                                    desc: `主材: ${displayName1} [物等${L1}] + 副材: ${displayName2} [物等${L2}] + ${formatBookUsage(B)} (高级炼金范围命中)`
                                });
                            }
                        }
                    });
                }
                
                for (let L1 = minL; L1 <= minL + 2; L1++) {
                    if (L1 >= L) continue;
                    const key_slot1_std = `${M}_${L1}`;
                    const node_slot1_std = dp[key_slot1_std];
                    if (!node_slot1_std || node_slot1_std.cost === Infinity) continue;
                    
                    m2List.forEach(m2 => {
                        if (!activeMaterials.has(m2)) return;
                        for (let L2 = minL; L2 <= minL + 2; L2++) {
                            if (L2 >= L) continue;
                            if (L1 < L2) continue;
                            if (Math.min(L1, L2) !== minL) continue;
                            
                            const key_slot2 = `${m2}_${L2}`;
                            const node_slot2 = dp[key_slot2];
                            if (!node_slot2 || node_slot2.cost === Infinity) continue;
                            
                            const cost = node_slot1_std.cost + node_slot2.cost + BOOK_COSTS[B] + JUMP_PENALTIES[J];
                            const name1 = node_slot1_std.item ? node_slot1_std.item.name : `${M}(物等${L1})`;
                            const name2 = node_slot2.item ? node_slot2.item.name : `${m2}(物等${L2})`;
                            
                            const displayName1 = name1 + getAlternativeNames(M, L1, name1, enabledSources);
                            const displayName2 = name2 + getAlternativeNames(m2, L2, name2, enabledSources);
                            const certainty = getRecipeCertainty(node_slot1_std.item, node_slot2.item, B, targetItem);
                            if (certainty.rate <= 0) continue;
                            
                            const groupKey = `${name1}_1_${name2}`;
                            const existing = recipeGroups.get(groupKey);
                            if (isBetterRecipe(existing, cost, certainty.rate, B)) {
                                recipeGroups.set(groupKey, {
                                    name1: name1,
                                    name2: name2,
                                    count1: 1,
                                    count2: 1,
                                    node1: node_slot1_std,
                                    node2: node_slot2,
                                    book: B,
                                    jump: J,
                                    certaintyRate: certainty.rate,
                                    candidates: certainty.candidates,
                                    cost: cost,
                                    desc: `主材: ${displayName1} [物等${L1}] + 副材: ${displayName2} [物等${L2}] + ${formatBookUsage(B)}${J > 0 ? ' 且额外跳' + J + '级' : ' (无额外跳级)'}`
                                });
                            }
                        }
                    });
                }
                
                const L1_dbl = L_min;
                const L2_dbl = L_min + 1;
                if (L2_dbl < L) {
                    const key_slot1_dbl = `${M}_${L1_dbl}`;
                    const node_slot1_dbl = dp[key_slot1_dbl];
                    if (node_slot1_dbl && node_slot1_dbl.cost !== Infinity) {
                        m2List.forEach(m2 => {
                            if (!activeMaterials.has(m2)) return;
                            const key_slot2 = `${m2}_${L2_dbl}`;
                            const node_slot2 = dp[key_slot2];
                            if (node_slot2 && node_slot2.cost !== Infinity) {
                                const cost = node_slot1_dbl.cost * 2 + node_slot2.cost + BOOK_COSTS[B] + JUMP_PENALTIES[J];
                                const name1 = node_slot1_dbl.item ? node_slot1_dbl.item.name : `${M}(物等${L1_dbl})`;
                                const name2 = node_slot2.item ? node_slot2.item.name : `${m2}(物等${L2_dbl})`;
                                
                                const displayName1 = name1 + getAlternativeNames(M, L1_dbl, name1, enabledSources);
                                const displayName2 = name2 + getAlternativeNames(m2, L2_dbl, name2, enabledSources);
                                const certainty = getRecipeCertainty(node_slot1_dbl.item, node_slot2.item, B, targetItem);
                                if (certainty.rate <= 0) return;
                                
                                const groupKey = `${name1}_2_${name2}`;
                                const existing = recipeGroups.get(groupKey);
                                if (isBetterRecipe(existing, cost, certainty.rate, B)) {
                                    recipeGroups.set(groupKey, {
                                        name1: name1,
                                        name2: name2,
                                        count1: 2,
                                        count2: 1,
                                        node1: node_slot1_dbl,
                                        node2: node_slot2,
                                        book: B,
                                        jump: J,
                                        certaintyRate: certainty.rate,
                                        candidates: certainty.candidates,
                                        cost: cost,
                                        desc: `主材: ${displayName1} [物等${L1_dbl}] x2 + 副材: ${displayName2} [物等${L2_dbl}] + ${formatBookUsage(B)}${J > 0 ? ' 且额外跳' + J + '级' : ' (无额外跳级)'}`
                                    });
                                }
                            }
                        });
                    }
                }
            }
        }
    }
    
    const recipes = Array.from(recipeGroups.values());
    recipes.sort((a, b) => a.cost - b.cost);
    return recipes;
}

function getAlternativeNames(material, level, currentName, enabledSources = { convenience: false }) {
    if (!currentName) return "";
    const itemsDb = typeof db !== 'undefined' ? db : (window.alchemy_db || []);
    
    const matches = itemsDb.filter(item => {
        if (item.material !== material || item.level !== level || item.name === currentName) return false;
        
        const isStore = item.source && (item.source.includes("8-12") || item.source.includes("便利店"));
        if (isStore && !enabledSources.convenience) {
            return false;
        }
        
        if (hasDisabledMaterialSlot(item)) {
            return false;
        }
        
        return true;
    });
    if (matches.length > 0) {
        const names = matches.slice(0, 2).map(item => item.name);
        return `(或${names.join('/')})`;
    }
    return "";
}

// ==========================================================================
// 模拟器特有泛用多材料 (2-5个材料) 合成算法
// ==========================================================================

function getAlchemyResultCandidatesMulti(ingredients, book = 0) {
    if (!ingredients || ingredients.length < 2) return [];
    
    const primaryItem = ingredients[0];
    const primaryMaterial = primaryItem.material;
    
    const levels = ingredients.map(item => item.level);
    const L_min = Math.min(...levels);
    
    const downgradeRange = L_min >= 8 ? 7 : 3;
    const minLevel = Math.max(1, L_min - downgradeRange);
    const maxLevel = L_min + 4 + book;
    
    const inputMaterials = ingredients.map(item => String(item.material || "").trim()).filter(Boolean);
    const secondaryMaterials = inputMaterials.slice(1); // Non-primary materials

    const itemsDb = typeof db !== 'undefined' ? db : (window.alchemy_db || []);

    // Step 1: filter by type, material, level range
    let candidates = itemsDb.filter(item => {
        const isCompoundingCandidate = (item.req_level > 0) || (item.category === "矿物类");
        if (!isCompoundingCandidate) return false;
        if (item.material !== primaryMaterial) return false;
        if (item.level < minLevel || item.level > maxLevel) return false;
        return true;
    });

    // Step 2: key rule — if a secondary material matches any candidate's sub-material,
    // it's a "key" that locks candidates to only those requiring that sub-material.
    // If it matches none, it's "trash" (杂物) with no filtering effect.
    for (const secMat of secondaryMaterials) {
        const hasMatch = candidates.some(item => {
            const subs = getItemMaterialSlots(item).slice(1);
            return subs.includes(secMat);
        });
        if (hasMatch) {
            candidates = candidates.filter(item => {
                const subs = getItemMaterialSlots(item).slice(1);
                return subs.includes(secMat);
            });
        }
    }

    // Step 3: all item sub-materials must be covered by input materials
    candidates = candidates.filter(item => {
        const itemSlots = getItemMaterialSlots(item);
        return itemSlots.every(mat => inputMaterials.includes(mat));
    });

    return candidates.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, "zh-Hans-CN"));
}

function getRecipeOutcomeBreakdownMulti(ingredients, book = 0) {
    if (!ingredients || ingredients.length < 2) return [];
    
    const primaryItem = ingredients[0];
    const levels = ingredients.map(item => item.level);
    const L_min = Math.min(...levels);
    const B = book;
    
    const candidates = getAlchemyResultCandidatesMulti(ingredients, B);
    if (candidates.length === 0) return [];
    
    const downgradeRange = L_min >= 8 ? 7 : 3;
    const minLevel = Math.max(1, L_min + B - downgradeRange);  // output range includes百科 shift
    const maxLevel = L_min + B + 4;
    
    const levelToCandidates = buildLevelToCandidatesMapping(candidates, minLevel, maxLevel);
    
    const itemProbabilities = {};
    for (let L = minLevel; L <= maxLevel; L++) {
        const climb = L - (L_min + B);  // alchemy jump (百科 bonus added separately)
        const prob = getDeltaProb(delta, downgradeRange);
        if (prob <= 0) continue;
        
        const validCandidates = levelToCandidates[L];
        if (validCandidates && validCandidates.length > 0) {
            const splitProb = prob / validCandidates.length;
            validCandidates.forEach(item => {
                itemProbabilities[item.name] = (itemProbabilities[item.name] || 0) + splitProb;
            });
        }
    }
    
    return Object.entries(itemProbabilities)
        .map(([name, prob]) => {
            const candidateItem = candidates.find(item => item.name === name);
            return {
                name,
                rate: Math.round(prob * 100),
                level: candidateItem ? candidateItem.level : 0,
                material: candidateItem ? candidateItem.material : "",
                category: candidateItem ? (candidateItem.category || candidateItem.type || "") : "",
                stats: candidateItem ? (candidateItem.stats || "无属性") : "",
                req_level: candidateItem ? (candidateItem.req_level || 0) : 0,
                item: candidateItem
            };
        })
        .filter(item => item.rate > 0)
        .sort((a, b) => b.rate - a.rate || a.level - b.level || a.name.localeCompare(b.name, "zh-Hans-CN"));
}
