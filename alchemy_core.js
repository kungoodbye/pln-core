// ==========================================================================
// 飘流幻境新世界 - 智能炼金核心共享逻辑 (统一 Isomorphic 版本)
// 同时支持浏览器 (<script>) 和 CommonJS (require) 环境
// 源码位置: pln-core/alchemy_core.js
// ==========================================================================

(function(root, factory) {
    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        module.exports = factory();
    } else {
        factory();
    }
})(typeof self !== 'undefined' ? self : this, function() {
    'use strict';

    // === 环境适配: 数据源 ===
    var db = null;
    function setDB(d) { db = d; }
    function getDB() {
    if (db) return db;
    if (typeof window !== 'undefined' && window.alchemy_db) {
        db = window.alchemy_db;
        return db;
    }
    return null;
    }

    // === 环境适配: 配置 ===
    var alchemy_config = typeof window !== 'undefined' && window.alchemy_config
        ? window.alchemy_config
        : (typeof require === 'function' ? require('./alchemy_config.js') : {});

    // 从 alchemy_config 提取在代码中作为裸变量使用的属性
    var LEVEL_DOWN_SOURCE_NAMES = alchemy_config.LEVEL_DOWN_SOURCE_NAMES || {};
    var LEVEL_UP_SOURCE_NAMES = alchemy_config.LEVEL_UP_SOURCE_NAMES || {};
    var MATERIAL_GROUPS = alchemy_config.MATERIAL_GROUPS || {};

var NO_OBTAIN_PATH_METHODS = new Set([
    "dungeon", "gacha", "event", "mystery_box",
    "shop", "simple_combine", "mall"
]);

// 非炼金方式
var NON_ALCHEMY_METHODS = new Set([
    "shop", "simple_combine", "craft", "unknown", "mall"
]);

// 装备类型
var EQUIPMENT_TYPES = new Set([
    "武器", "衣服", "头饰", "护手", "靴鞋", "特殊装备"
]);

// 通用安全杂物
var UNIVERSAL_SAFE_JUNK = ["草类纤维", "花类纤维", "叶类纤维", "石头", "兽骨", "羽毛"];

function getSafeJunkMaterials(primaryMaterial) {
    var compat = COMPATIBILITY[primaryMaterial] || [];
    return UNIVERSAL_SAFE_JUNK.filter(function(m) { return compat.indexOf(m) === -1; });
}

function getSafeJunkDescription(primaryMaterial, junkLevel) {
    var compat = COMPATIBILITY[primaryMaterial] || [];
    if (compat.indexOf("木材") === -1) return junkLevel + "等任意杂物";
    return junkLevel + "等非木杂物";
}

// 高阶/中阶炼金的基础加成（小程序默认高阶）
function getAlchemyBaseBonus() {
    return 4;
}

// 跳级惩罚（高阶炼金）
function getJumpPenalty(jump) {
    var penalties = {
        0: 0,
        1: 50,
        2: 100,
        3: 1500,
        4: 8000,
        5: 50000
    };
    return penalties[jump] !== undefined ? penalties[jump] : 999999;
}

// 判断是否纯器具制作（无其他来源）
function isStrictlyCraftOnly(item) {
    if (!item) return false;
    var method = item.obtain_method;
    var source = item.source || "";
    var formula = item.recommended_formula || "";
    return method === "craft" && !source.trim() && !formula.trim();
}

// 从 stats 字符串提取单一属性
function getSingleAttribute(statsStr) {
    var s = String(statsStr || "").trim();
    if (!s || s === "无" || s === "无属性") return null;
    var parts = s.split(/\s+/).filter(Boolean);
    if (parts.length !== 1) return null;
    var part = parts[0];
    var match = part.match(/^([a-zA-Z]+)([-+]\d+)/);
    if (!match) return "特殊";
    var attrName = match[1].toUpperCase();
    var sign = match[2][0];
    if (attrName === "SPD" && sign === "-") return "-SPD";
    if (["ATK", "DEF", "MATK", "MDEF", "SPD"].indexOf(attrName) !== -1) return attrName;
    return "特殊";
}

// 非合成来源树
function buildNonSynthSourceTree(targetItem) {
    if (!targetItem) return null;
    var sourceText = targetItem.source_display || targetItem.recommended_formula || "";
    var methodIcons = {
        gacha: "扭蛋", mystery_box: "礼盒", dungeon: "副本",
        event: "活动", shop: "商店", simple_combine: "对合",
        craft: "制作", unknown: "未知", mall: "商城"
    };
    var methodLabels = {
        gacha: "扭蛋/点数抽取",
        mystery_box: "神秘套装盒开出",
        dungeon: "副本获取",
        event: "活动/宝箱获取",
        shop: "商店购买",
        simple_combine: "低级对合",
        craft: "器具制作获取",
        unknown: "来源未收录",
        mall: "商城购买（无法合成）"
    };
    var method = targetItem.obtain_method || "unknown";
    var icon = methodIcons[method] || "来源";
    var label = methodLabels[method] || "来源";
    return {
        name: targetItem.name,
        material: targetItem.material,
        level: targetItem.level,
        cost: 0,
        method: "nonSynthSource",
        sourceNote: icon + " " + label + ": " + (sourceText || "暂未收录"),
        children: []
    };
}

// 配方描述生成
function getRecipeDesc(name1, L1, count1, name2, L2, count2, book, J, isLevelDown, targetItem, isLevelUp) {
    var isProp = targetItem && !isEquipmentCandidate(targetItem);
    var alt1 = getAlternativeNames(targetItem ? targetItem.material : null, L1, name1) || '';
    var alt2 = getAlternativeNames(targetItem ? targetItem.material : null, L2, name2) || '';
    var displayName1 = name1 + alt1;
    var displayName2 = name2 + alt2;
    var countText1 = count1 > 1 ? ' x' + count1 : '';
    var countText2 = count2 > 1 ? ' x' + count2 : '';

    if (isProp) {
        if (isLevelUp) return '主材: ' + name1 + ' [物等' + L1 + ']' + countText1 + ' + 辅料: ' + name2 + ' [物等' + L2 + ']' + countText2 + ' (升等合成)';
        if (isLevelDown) return '主材: ' + name1 + ' [物等' + L1 + ']' + countText1 + ' + 辅料: ' + name2 + ' [物等' + L2 + ']' + countText2 + ' (降等合成)';
        return '主材: ' + displayName1 + ' [物等' + L1 + ']' + countText1 + ' + 副材: ' + displayName2 + ' [物等' + L2 + ']' + countText2 + (J > 0 ? ' 且额外跳' + J + '级' : '');
    } else {
        var bookText = book > 0 ? ' + 使用百科' + book + ' (+' + book + '级)' : ' + 不使用百科';
        if (isLevelUp) return '主材: ' + name1 + ' [等' + L1 + ']' + countText1 + ' + 辅料: ' + name2 + ' [等' + L2 + ']' + countText2 + ' + 无百科书 (升等合成)';
        if (isLevelDown) return '主材: ' + name1 + ' [等' + L1 + ']' + countText1 + ' + 辅料: ' + name2 + ' [等' + L2 + ']' + countText2 + ' + 无百科书 (降等合成)';
        if (J === 0 && book === 0) return '主材: ' + displayName1 + ' [物等' + L1 + ']' + countText1 + ' + 副材: ' + displayName2 + ' [物等' + L2 + ']' + countText2 + ' + 不使用百科 (高级炼金范围命中)';
        return '主材: ' + displayName1 + ' [物等' + L1 + ']' + countText1 + ' + 副材: ' + displayName2 + ' [物等' + L2 + ']' + countText2 + bookText + (J > 0 ? ' 且额外跳' + J + '级' : ' (无额外跳级)');
    }
}

// 简化配方副材（判断是否可用杂物替代）
function simplifyRecipeSlot2(node_slot1, node_slot2, B, targetItem) {
    if (!node_slot1.item || !node_slot2.item) {
        return {
            name2: node_slot2.item ? node_slot2.item.name : (node_slot2.name || ''),
            cost2: node_slot2.cost,
            node2: node_slot2
        };
    }
    var L = targetItem ? targetItem.level : 0;
    var name1 = node_slot1.item.name;
    var name2 = node_slot2.item.name;
    var M1 = node_slot1.item.material;
    var M2 = node_slot2.item.material;
    var L1 = node_slot1.item.level;
    var L2 = node_slot2.item.level;
    var L_low = Math.min(L1, L2);
    var useJunk = false;

    if (M2 !== M1) {
        var baseBonus = getAlchemyBaseBonus();
        var bookBonus = B === 0 ? 0 : B + 1;
        var maxL_mixed = L_low + baseBonus - 1 + bookBonus;
        var minL_mixed = Math.max(1, L_low + B - 7);

        var hasM2Outputs = false;
        for (var i = 0; i < getDB().length; i++) {
            var item = getDB()[i];
            if (item.material !== M2) continue;
            if (item.level < minL_mixed || item.level > maxL_mixed) continue;
            if ((item.req_level > 0) || (item.category === '矿物类') || (item.material && item.level > 0 && item.req_level === 0)) {
                hasM2Outputs = true;
                break;
            }
        }
        if (!hasM2Outputs) useJunk = true;
    } else {
        var baseBonus2 = getAlchemyBaseBonus();
        var bookBonus2 = B === 0 ? 0 : B + 1;
        var maxL_mixed2 = L_low + baseBonus2 - 1 + bookBonus2;
        if (L <= maxL_mixed2) useJunk = true;
    }

    if (useJunk) {
        var junkCost = Math.max(10, L2 * 5);
        return {
            name2: L2 + '等属性杂物',
            cost2: junkCost,
            node2: {
                item: { name: L2 + '等属性杂物', level: L2, material: '任意' },
                cost: junkCost,
                method: 'base',
                exactName: true
            }
        };
    }

    return {
        name2: name2,
        cost2: node_slot2.cost,
        node2: node_slot2
    };
}

var ALL_EQUIPMENT_MATERIALS = (alchemy_config && alchemy_config.ALL_EQUIPMENT_MATERIALS) || [
    "花类纤维", "草类纤维", "叶类纤维", "羽毛", "羽麻", "尼龙", "兽皮", "兽毛", "兽骨",
    "金", "银", "白银", "铜", "铁", "钢", "赤铁", "锡", "铅", "铝", "钛", "星耀",
    "水晶", "钻石", "宝石", "玉", "石头", "磁石", "魔性物质", "白色黏土", "结晶体", "胶质", "甲壳", "木材"
].sort();

// 全局材质启用集合（默认全部启用）
var enabledMaterials = new Set(ALL_EQUIPMENT_MATERIALS);

// Material compatibility table (主属性相容副属性)
// If slot 1 has material K, and slot 2 has material V, the result keeps material K.
var COMPATIBILITY = (alchemy_config && alchemy_config.COMPATIBILITY) || {
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
var BOOK_COSTS = (alchemy_config && alchemy_config.BOOK_COSTS) || {
    0: 0,
    1: 10,
    2: 50,
    3: 200,
    4: 800
};

var BOOK_SOURCES = (alchemy_config && alchemy_config.BOOK_SOURCES) || {
    2: ["商城 8绑定钻石", "商城 75紫钻"],
    4: ["商城 125紫钻"]
};

// Penalties for jumping levels (跳级几率惩罚)
var JUMP_PENALTIES = (alchemy_config && alchemy_config.JUMP_PENALTIES) || {
    0: 0,       // +0 jump (平合, success rate is ~95%)
    1: 1500,    // +1 jump (moderate risk, success rate is ~50%)
    2: 8000,    // +2 jump (high risk, success rate is ~10-15%)
    3: 50000    // +3 jump (extreme risk, success rate is ~2%)
};

var ADVANCED_ALCHEMY_BASE_BONUS = (alchemy_config && alchemy_config.ADVANCED_ALCHEMY_BASE_BONUS) || 4;

var CRAFT_NAME_ALIASES = (alchemy_config && alchemy_config.CRAFT_NAME_ALIASES) || {
    "魔法牙隋粉": "魔法牙髓粉",
    "龙鳞魔随": "龙鳞魔髓"
};

function getBookSourceText(book) {
    var sources = BOOK_SOURCES[book] || [];
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
        item && item.legacy_name,
        item && item.pinyin,
        item && item.pinyin_initials
    ].filter(Boolean);
}

function hasDisabledMaterialSlot(item) {
    // Only block equipment materials that are explicitly disabled; allow道具/材料
    var activeMaterials = typeof enabledMaterials !== 'undefined' ? enabledMaterials : new Set(ALL_EQUIPMENT_MATERIALS);
    return getItemMaterialSlots(item).some(function(material) {
        return ALL_EQUIPMENT_MATERIALS.indexOf(material) !== -1 && !activeMaterials.has(material);
    });
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
    var match = String(name || "").match(/^炼金百科([一二三四])$/);
    if (!match) return 0;
    return "一二三四".indexOf(match[1]) + 1;
}

function normalizeCraftItemName(name) {
    return CRAFT_NAME_ALIASES[name] || name;
}

function getAdvancedAlchemyLevelRange(level1, level2, book = 0, secondaryItem = null) {
    // Level-down with 属性杂物: narrow range to avoid unwanted equipment
    if (secondaryItem && secondaryItem.name && secondaryItem.name.includes("属性杂物")) {
        var baseLevel = Math.min(level1, level2);
        var bookBonus = book === 0 ? 0 : book + 1;
        return {
            min: 2,
            max: baseLevel + ADVANCED_ALCHEMY_BASE_BONUS - 1 + bookBonus
        };
    }
    // Normal alchemy range
    var baseLevel = Math.min(level1, level2);
    var downgradeRange = baseLevel >= 8 ? 7 : 3;
    return {
        min: Math.max(2, baseLevel - downgradeRange),
        max: baseLevel + ADVANCED_ALCHEMY_BASE_BONUS + book
    };
}

function isEquipmentCandidate(item) {
    // Must be marked as alchemy output (flag 1 or 3), have valid type/category.
    // req_level>0 for equipment, or (material && level>0) for道具/材料 with alchemy_flag=3
    return Boolean(item && item.type && item.category
        && (item.alchemy_flag === 3 || item.alchemy_flag === 1)
        && (item.req_level > 0 || (item.material && item.level > 0)));
}



function getAlchemyResultCandidates(primaryItem, secondaryItem, book = 0, targetItem = null) {
    if (!primaryItem || !secondaryItem) return [];
    
    var range = getAdvancedAlchemyLevelRange(primaryItem.level, secondaryItem.level, book);
    
    var itemsDb = getDB();

    var secondaryMaterial = String(secondaryItem.material || "").trim();

    // Step 1: filter by type, material, level range
    var candidates = itemsDb.filter(item => {
        if (!isEquipmentCandidate(item)) return false;
        if (item.material !== primaryItem.material) return false;
        if (item.level < range.min || item.level > range.max) return false;
        return true;
    });

    // Step 2: build input materials, then check sub-material coverage first
    var inputMaterials = [primaryItem.material, secondaryItem.material].map(x => String(x || "").trim()).filter(Boolean);
    if (targetItem) {
        var targetSlots = getItemMaterialSlots(targetItem);
        if (targetSlots.length > 2) {
            for (var i = 2; i < targetSlots.length; i++) {
                inputMaterials.push(targetSlots[i]);
            }
        }
    }

    candidates = candidates.filter(item => {
        var itemSlots = getItemMaterialSlots(item);
        return itemSlots.every(mat => inputMaterials.includes(mat));
    });

    // Step 3: key rule — among surviving candidates, if secondary material
    // matches any candidate's sub-material, lock to only those matching.
    // If it matches none, all survivors pass through (single-material fallback).
    var hasMatchingSub = candidates.some(item => {
        var subs = getItemMaterialSlots(item).slice(1);
        return subs.includes(secondaryMaterial);
    });
    if (hasMatchingSub) {
        candidates = candidates.filter(item => {
            var subs = getItemMaterialSlots(item).slice(1);
            return subs.includes(secondaryMaterial);
        });
    }

    return candidates.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, "zh-Hans-CN"));
}

function getRecipeCertainty(primaryItem, secondaryItem, book = 0, targetItem = null) {
    var candidates = getAlchemyResultCandidates(primaryItem, secondaryItem, book, targetItem);
    var hits = targetItem ? candidates.filter(item => item.name === targetItem.name) : [];
    
    if (targetItem && hits.length === 0) {
        return { rate: 0, candidates };
    }
    
    var candidatesAtTargetLevel = targetItem 
        ? candidates.filter(item => item.level === targetItem.level) 
        : candidates;
        
    var rate = candidatesAtTargetLevel.length > 0 ? Math.round(100 / candidatesAtTargetLevel.length) : 0;
    return { rate, candidates };
}

function isTargetInAdvancedAlchemyRange(primaryItem, secondaryItem, book, targetItem) {
    if (!primaryItem || !secondaryItem || !targetItem) return false;
    if (primaryItem.material !== targetItem.material) return false;
    
    var range = getAdvancedAlchemyLevelRange(primaryItem.level, secondaryItem.level, book);
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
    var itemsDb = getDB();
    
    return formula
        .split(/[+＋]/)
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => {
            var bookMatch = part.match(/^炼金百科([一二三四1-4])$/);
            if (bookMatch) {
                var rawLevel = bookMatch[1];
                var bookLevel = "一二三四".includes(rawLevel)
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
            
            var itemMatch = part.match(/^(?:(\d+)\s*)?(.+)$/);
            var refName = itemMatch ? itemMatch[2].trim() : part;
            var item = itemsDb.find(x => getItemSearchAliases(x).includes(refName));
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
    var slots = getItemMaterialSlots(targetItem);
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

// 非合成来源树（dungeon/gacha/mall 等无法合成的物品）- 已在文件顶部定义
// function buildNonSynthSourceTree(targetItem) { ... }

function buildReferenceTree(targetItem) {
    if (!targetItem) return null;
    if (!targetItem.recommended_formula) {
        return buildItemDataMaterialReferenceTree(targetItem);
    }
    var children = parseRecommendedFormula(targetItem.recommended_formula);
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
    var primaryItem = recipe.node1.item;
    var secondaryItem = recipe.node2.item;
    var book = recipe.book;
    
    var fallbackTarget = typeof selectedItem !== 'undefined' ? selectedItem : null;
    var target = targetItem || recipe.targetItem || fallbackTarget;
    if (!primaryItem || !secondaryItem || !target) return 0;
    
    var L_min = Math.min(primaryItem.level, secondaryItem.level);
    var B = book;
    
    var candidates = getAlchemyResultCandidates(primaryItem, secondaryItem, B, target);
    if (candidates.length === 0) return 0;
    
    var downgradeRange = L_min >= 8 ? 7 : 3;
    var minLevel = Math.max(1, L_min + B - downgradeRange);  // output range includes百科 shift
    var maxLevel = L_min + B + 4;
    
    var levelToCandidates = buildLevelToCandidatesMapping(candidates, minLevel, maxLevel);
    
    var targetProb = 0;
    for (var L = minLevel; L <= maxLevel; L++) {
        var climb = L - (L_min + B);  // alchemy jump (百科 bonus added separately)
        var prob = getDeltaProb(climb, downgradeRange);
        if (prob <= 0) continue;
        
        var validCandidates = levelToCandidates[L];
        if (validCandidates && validCandidates.length > 0) {
            var splitProb = prob / validCandidates.length;
            var hasTarget = validCandidates.some(item => item.name === target.name);
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

// Map output level to candidates (no fallback — empty levels stay empty)
function buildLevelToCandidatesMapping(candidates, minLevel, maxLevel) {
    var levelToCandidates = {};
    for (var L = maxLevel; L >= minLevel; L--) {
        var atLevel = candidates.filter(item => item.level === L);
        if (atLevel.length > 0) {
            levelToCandidates[L] = atLevel;
        }
        // Empty levels remain undefined in the map.
        // Callers already handle this: getRecipeTargetSuccessRate,
        // getRecipeOutcomeBreakdown, getRecipeOutcomeBreakdownMulti
        // all skip empty levels via "if (validCandidates && validCandidates.length > 0)".
        // The probability from empty levels is treated as 退回/暴掉.
    }
    return levelToCandidates;
}

// Find the lowest-level alchemy_flag=3 item for a given material.
// Used for "暴掉" fallback display when no valid candidates exist.
function findLowestAlchemyFlag3Item(material) {
    var itemsDb = getDB();
    if (!itemsDb) return null;
    var matches = itemsDb.filter(function(item) {
        return item.material === material && (item.alchemy_flag === 3 || item.alchemy_flag === "3");
    });
    if (matches.length === 0) return null;
    matches.sort(function(a, b) { return a.level - b.level; });
    return matches[0];
}

function getRecipeOutcomeBreakdown(recipe, targetItem = null) {
    if (!recipe || !recipe.node1 || !recipe.node2) return "";
    var primaryItem = recipe.node1.item;
    var secondaryItem = recipe.node2.item;
    var book = recipe.book;
    
    var fallbackTarget = typeof selectedItem !== 'undefined' ? selectedItem : null;
    var target = targetItem || recipe.targetItem || fallbackTarget;
    if (!primaryItem || !secondaryItem || !target) return "";
    
    var L_min = Math.min(primaryItem.level, secondaryItem.level);
    var B = book;
    
    var candidates = getAlchemyResultCandidates(primaryItem, secondaryItem, B, target);
    
    var downgradeRange = L_min >= 8 ? 7 : 3;
    var minLevel = Math.max(1, L_min + B - downgradeRange);
    var maxLevel = L_min + B + 4;
    
    var levelToCandidates = buildLevelToCandidatesMapping(candidates, minLevel, maxLevel);
    
    var itemProbabilities = {};
    var coveredProb = 0;
    for (var L = minLevel; L <= maxLevel; L++) {
        var climb = L - (L_min + B);
        var prob = getDeltaProb(climb, downgradeRange);
        if (prob <= 0) continue;
        
        var validCandidates = levelToCandidates[L];
        if (validCandidates && validCandidates.length > 0) {
            var splitProb = prob / validCandidates.length;
            coveredProb += prob;
            validCandidates.forEach(function(item) {
                itemProbabilities[item.name] = (itemProbabilities[item.name] || 0) + splitProb;
            });
        }
    }
    
    var leftoverProb = Math.max(0, 1 - coveredProb);
    var parts = [];
    
    // Regular candidates
    var sortedItems = Object.entries(itemProbabilities)
        .map(function(e) { return { name: e[0], rate: Math.round(e[1] * 100) }; })
        .filter(function(x) { return x.rate > 0; })
        .sort(function(a, b) { return b.rate - a.rate; });
        
    if (sortedItems.length > 0) {
        parts.push("预测产物: " + sortedItems.map(function(x) { return x.name + " (" + x.rate + "%)"; }).join(", "));
    }
    
    // Fallback (退回/暴掉) for leftover probability
    if (leftoverProb > 0.005) {
        var leftoverRate = Math.round(leftoverProb * 100);
        if (B > 0) {
            // Encyclopedia protection: return primary material
            parts.push("退回 " + primaryItem.name + " (" + leftoverRate + "%)");
        } else {
            // No encyclopedia: destroy → lowest flag=3 item of same material
            var fallbackItem = findLowestAlchemyFlag3Item(primaryItem.material);
            if (fallbackItem) {
                parts.push("暴掉 → " + fallbackItem.name + " (" + leftoverRate + "%)");
            }
        }
    }
    
    if (parts.length === 0) return "";
    return parts.join("; ");
}





// Core Dijkstra / DAG Pathfinding solver






function getAlternativeNames(material, level, currentName, enabledSources = { convenience: false }) {
    if (!currentName) return "";
    var itemsDb = getDB();
    
    var matches = itemsDb.filter(item => {
        if (item.material !== material || item.level !== level || item.name === currentName) return false;
        
        var isStore = item.source && (item.source.includes("8-12") || item.source.includes("便利店"));
        if (isStore && !enabledSources.convenience) {
            return false;
        }
        
        if (hasDisabledMaterialSlot(item)) {
            return false;
        }
        
        return true;
    });
    if (matches.length > 0) {
        var names = matches.slice(0, 2).map(item => item.name);
        return `(或${names.join('/')})`;
    }
    return "";
}

// ==========================================================================
// 模拟器特有泛用多材料 (2-5个材料) 合成算法
// ==========================================================================

function getAlchemyResultCandidatesMulti(ingredients, book = 0) {
    if (!ingredients || ingredients.length < 2) return [];
    
    var primaryItem = ingredients[0];
    var primaryMaterial = primaryItem.material;
    
    var levels = ingredients.map(item => item.level);
    var L_min = Math.min(...levels);
    var range = getAdvancedAlchemyLevelRange(primaryItem.level, L_min, book);
    var minLevel = range.min;
    var maxLevel = range.max;

    var inputMaterials = ingredients.map(item => String(item.material || "").trim()).filter(Boolean);
    var secondaryMaterials = inputMaterials.slice(1); // Non-primary materials

    var itemsDb = getDB();

    // Step 1: filter by material + level range
    // Use binary alchemy_flag (fields_offset+109): 0x03 = can be alchemy output
    var candidates = itemsDb.filter(item => {
        if (!item.material || item.material !== primaryMaterial) return false;
        if (item.level < minLevel || item.level > maxLevel) return false;
        if (!isEquipmentCandidate(item)) return false;
        return true;
    });

    // Step 2: filter by sub-material coverage first — all item sub-materials
    // must be covered by input materials before checking key rule
    candidates = candidates.filter(item => {
        var itemSlots = getItemMaterialSlots(item);
        return itemSlots.every(mat => inputMaterials.includes(mat));
    });

    // Step 3: key rule — among surviving candidates, if a secondary material
    // matches any candidate's sub-material, lock to only those matching.
    // If it matches none, all survivors pass through (single-material fallback).
    for (var secMat of secondaryMaterials) {
        var hasMatch = candidates.some(item => {
            var subs = getItemMaterialSlots(item).slice(1);
            return subs.includes(secMat);
        });
        if (hasMatch) {
            candidates = candidates.filter(item => {
                var subs = getItemMaterialSlots(item).slice(1);
                return subs.includes(secMat);
            });
        }
    }

    return candidates.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, "zh-Hans-CN"));
}

function getRecipeOutcomeBreakdownMulti(ingredients, book = 0) {
    if (!ingredients || ingredients.length < 2) return [];
    
    var primaryItem = ingredients[0];
    var levels = ingredients.map(function(item) { return item.level; });
    var L_min = Math.min.apply(null, levels);
    var B = book;
    
    var candidates = getAlchemyResultCandidatesMulti(ingredients, B);

    var range = getAdvancedAlchemyLevelRange(primaryItem.level, L_min, B);
    var minLevel = range.min;
    var maxLevel = range.max;
    var downgradeRange = L_min >= 8 ? 7 : 3;

    var levelToCandidates = buildLevelToCandidatesMapping(candidates, minLevel, maxLevel);

    var itemProbabilities = {};
    var coveredProb = 0;
    for (var L = minLevel; L <= maxLevel; L++) {
        var climb = L - (L_min + B);
        var prob = getDeltaProb(climb, downgradeRange);
        if (prob <= 0) continue;
        
        var validCandidates = levelToCandidates[L];
        if (validCandidates && validCandidates.length > 0) {
            var splitProb = prob / validCandidates.length;
            coveredProb += prob;
            validCandidates.forEach(function(item) {
                itemProbabilities[item.name] = (itemProbabilities[item.name] || 0) + splitProb;
            });
        }
    }
    
    var results = Object.entries(itemProbabilities)
        .map(function(e) {
            var name = e[0], prob = e[1];
            var candidateItem = candidates.find(function(item) { return item.name === name; });
            return {
                name: name,
                rate: Math.round(prob * 100),
                level: candidateItem ? candidateItem.level : 0,
                material: candidateItem ? candidateItem.material : "",
                category: candidateItem ? (candidateItem.category || candidateItem.type || "") : "",
                stats: candidateItem ? (candidateItem.stats || "无属性") : "",
                req_level: candidateItem ? (candidateItem.req_level || 0) : 0,
                item: candidateItem
            };
        })
        .filter(function(item) { return item.rate > 0; });
    
    // Fallback (退回/暴掉) for leftover probability
    var leftoverProb = Math.max(0, 1 - coveredProb);
    if (leftoverProb > 0.005) {
        var leftoverRate = Math.round(leftoverProb * 100);
        if (B > 0) {
            results.push({
                name: "退回 " + primaryItem.name,
                rate: leftoverRate,
                level: primaryItem.level,
                material: primaryItem.material,
                category: "退回",
                stats: "无属性",
                req_level: 0,
                item: primaryItem,
                fallback: "return"
            });
        } else {
            var fallbackItem = findLowestAlchemyFlag3Item(primaryItem.material);
            if (fallbackItem) {
                results.push({
                    name: fallbackItem.name,
                    rate: leftoverRate,
                    level: fallbackItem.level,
                    material: fallbackItem.material,
                    category: "暴掉",
                    stats: fallbackItem.stats || "无属性",
                    req_level: fallbackItem.req_level || 0,
                    item: fallbackItem,
                    fallback: "destroy"
                });
            }
        }
    }
    
    return results.sort(function(a, b) {
        // Regular items first, fallback items last
        if (!a.fallback && b.fallback) return -1;
        if (a.fallback && !b.fallback) return 1;
        return b.rate - a.rate || a.level - b.level;
    });
}


// Merged from app.js (production, incl. level-up/down)
function solveAlchemyPath(targetItem, maxBook, maxJump, enabledSources, returnAll = false) {
    if (targetItem && !isEquipmentCandidate(targetItem)) {
        // Can't be alchemy output; only show path if it has a craft recipe
        if (!targetItem.crafted_from) {
            var sourceTree = buildNonSynthSourceTree(targetItem);
            return returnAll ? { tree: sourceTree, recipes: [] } : sourceTree;
        }
        maxBook = 0;
    }
    // Items without any verified synthesis/craft path: show source-info tree
    // BUT: if alchemy_flag=3, the item can still be alchemy output
    if (targetItem && targetItem.obtain_method && NO_OBTAIN_PATH_METHODS.has(targetItem.obtain_method) && targetItem.alchemy_flag !== 3) {
        var sourceTree = buildNonSynthSourceTree(targetItem);
        if (returnAll) {
            return { tree: sourceTree, recipes: [] };
        }
        return sourceTree;
    }

    var representatives = getRepresentatives(enabledSources);
    var dp = {}; // Key: `${material}_${level}`, Value: StateNode
    
    // Step 1: Extract all valid existing states in the database
    var states = [];
    var stateKeys = new Set();
    getDB().forEach(item => {
        if (item.material && item.level > 0) {
            var key = `${item.material}_${item.level}`;
            if (!stateKeys.has(key)) {
                stateKeys.add(key);
                states.push({ material: item.material, level: item.level });
            }
        }
    });
    
    // Sort states by level to solve them in DAG order (lowest to highest level)
    states.sort((a, b) => a.level - b.level);
    
    // Helper to get base/obtaining cost of a specific item
    var getBaseCost = (item) => {
        // If source is empty, try source_display and recommended_formula as fallback
        var effectiveSource = item.source || item.source_display || item.recommended_formula || "";
        if (!effectiveSource) {
            return isSelfProvidedUnknownSourceItem(item) ? Math.max(10, (item.level || 1) * 10) : Infinity;
        }

        // Handle 8-12 convenience store option
        if (effectiveSource.includes("8-12") || effectiveSource.includes("便利店")) {
            if (!enabledSources.convenience) {
                return Infinity;
            }
        }

        // Match both English colons (:) and Chinese colons (：), as well as both "商店" and "购买" keywords
        var isShop = effectiveSource.includes("商店:") || effectiveSource.includes("商店：") ||
                       effectiveSource.includes("购买:") || effectiveSource.includes("购买：") ||
                       effectiveSource.includes("购买") && !effectiveSource.includes("8-12");
        var isMine = effectiveSource.includes("采集:") || effectiveSource.includes("采集：");
        var isDrop = effectiveSource.includes("掉落:") || effectiveSource.includes("掉落：");
        
        if (isShop && !enabledSources.shop) return Infinity;
        if (isMine && !enabledSources.mine) return Infinity;
        if (isDrop && !enabledSources.drop) return Infinity;
        
        // Cost estimation:
        if (isShop) {
            var goldMatch = effectiveSource.match(/(\d+)金币/);
            return goldMatch ? parseInt(goldMatch[1]) : (item.level || 1) * 10 + 60;
        }
        if (isMine) {
            return item.level * 10; // mine time cost
        }
        if (isDrop) {
            return item.level * 15; // drop grinding cost
        }
        return Infinity;
    };
    
    // Initialize base costs
    states.forEach(st => {
        var key = `${st.material}_${st.level}`;
        var rep = representatives[key];
        var minCost = Infinity;
        var method = "none";
        
        // Load base cost even for non-equipment materials (道具/材料)
        if (enabledMaterials.has(st.material) || ALL_EQUIPMENT_MATERIALS.indexOf(st.material) === -1) {
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
    
    // Resolve crafting recipes recursively (Make.dat)
    var calcCraftCost = null;
    if (enabledSources.craft) {
        var resolvedCraft = {};
        
        calcCraftCost = (itemName, depth = 0) => {
            if (depth > 6) return Infinity;
            var normalizedItemName = normalizeCraftItemName(itemName);
            if (resolvedCraft[normalizedItemName] !== undefined) return resolvedCraft[normalizedItemName];
            
            // Find item object
            var item = getDB().find(x => x.name === normalizedItemName);
            if (!item) return Infinity;
            
            // Skip if material is blacklisted
            if (ALL_EQUIPMENT_MATERIALS.indexOf(item.material) !== -1 && !enabledMaterials.has(item.material)) return Infinity;
            
            // If it is directly obtainable base item
            var baseCost = getBaseCost(item);
            if (baseCost !== Infinity) {
                resolvedCraft[normalizedItemName] = baseCost;
                return baseCost;
            }
            if (!item.material && !item.crafted_from) {
                resolvedCraft[normalizedItemName] = Math.max(10, (item.level || 1) * 10);
                return resolvedCraft[normalizedItemName];
            }
            
            // If it has a recipe
            if (item.crafted_from) {
                var cost = 30; // tool/furnace fee
                var ok = true;
                for (var ing of item.crafted_from.ingredients) {
                    var ingCost = calcCraftCost(ing.name, depth + 1);
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
        
        // Update states that can be crafted
        states.forEach(st => {
            // Only skip equipment materials that are explicitly disabled
            if (ALL_EQUIPMENT_MATERIALS.indexOf(st.material) !== -1 && !enabledMaterials.has(st.material)) return;
            var key = `${st.material}_${st.level}`;
            var rep = representatives[key];
            if (rep && rep.crafted_from) {
                var craftCost = calcCraftCost(rep.name);
                if (craftCost < dp[key].cost || dp[key].cost === Infinity) {
                    dp[key].cost = craftCost;
                    dp[key].method = "craft";
                    dp[key].item = rep;
                    dp[key].crafted_from = rep.crafted_from;
                }
            }
        });

        if (targetItem.crafted_from && targetItem.material 
            && (ALL_EQUIPMENT_MATERIALS.indexOf(targetItem.material) === -1 || enabledMaterials.has(targetItem.material))) {
            var key = `${targetItem.material}_${targetItem.level}`;
            var craftCost = calcCraftCost(targetItem.name);
            if (dp[key] && craftCost !== Infinity) {
                dp[key].cost = craftCost;
                dp[key].method = "craft";
                dp[key].item = targetItem;
                dp[key].crafted_from = targetItem.crafted_from;
            }
        }
    }

    var targetKey = `${targetItem.material}_${targetItem.level}`;

    // Step 2: Run DAG DP (solving in increasing order of level)
    for (var i = 0; i < states.length; i++) {
        var u = states[i];
        // Only skip equipment materials that are explicitly disabled
        if (ALL_EQUIPMENT_MATERIALS.indexOf(u.material) !== -1 && !enabledMaterials.has(u.material)) continue;
        
        var key_u = `${u.material}_${u.level}`;
        var node_u = dp[key_u];
        
        // If the current state is the target and the target cannot be compounded, do not relax it via compounding
        if (key_u === targetKey && targetItem && isStrictlyCraftOnly(targetItem)) {
            continue;
        }
        
        var outputItem = (key_u === targetKey) ? targetItem : representatives[key_u];
        if (outputItem && !isEquipmentCandidate(outputItem)) {
            if (key_u !== targetKey) {
                continue;
            }
            if (node_u.method === "craft" && node_u.cost !== Infinity) {
                continue;
            }
        }
        
        // Try to compound node_u from lower level states.
        // Advanced alchemy range: min(input levels)-7 through min(input levels)+4+book.
        var L = u.level;
        var m2List = COMPATIBILITY[u.material] || [u.material];
        var rep = (key_u === targetKey) ? targetItem : representatives[key_u];
        var materialSlotCount = getItemMaterialSlots(rep).length;
        var requiresThirdMaterial = materialSlotCount === 3;
        var hasUnsupportedMaterialCount = materialSlotCount > 3;
        if (hasUnsupportedMaterialCount) continue;
        if (rep && rep.sub_material1) {
            var sub_m = rep.sub_material1.trim();
            if (sub_m) {
                m2List = [sub_m];
            }
        }
        
        for (var B = 0; B <= maxBook; B++) {
            if (!requiresThirdMaterial) {
            var minBaseLevel = Math.max(1, L - getAlchemyBaseBonus() - B);
            var maxBaseLevel = L - 1;
            for (var L1 = minBaseLevel; L1 < L; L1++) {
                var key_slot1_adv = `${u.material}_${L1}`;
                var node_slot1_adv = dp[key_slot1_adv];
                if (!node_slot1_adv || node_slot1_adv.cost === Infinity || !node_slot1_adv.item) continue;
                
                m2List.forEach(m2 => {
                    if (ALL_EQUIPMENT_MATERIALS.indexOf(m2) !== -1 && !enabledMaterials.has(m2)) return;
                    for (var L2 = minBaseLevel; L2 <= Math.min(L1, maxBaseLevel); L2++) {
                        var key_slot2_adv = `${m2}_${L2}`;
                        var node_slot2_adv = dp[key_slot2_adv];
                        if (!node_slot2_adv || node_slot2_adv.cost === Infinity || !node_slot2_adv.item) continue;
                        
                        if (!isTargetInAdvancedAlchemyRange(node_slot1_adv.item, node_slot2_adv.item, B, outputItem)) continue;
                        
                        var compoundCost = node_slot1_adv.cost + node_slot2_adv.cost + BOOK_COSTS[B];
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
            
            for (var J = 0; J <= maxJump; J++) {
                var L_min = L - B - J;
                if (L_min < 1) continue;
                
                var minL = L_min;
                for (var L1 = minL; L1 <= minL + 2; L1++) {
                    if (L1 >= L) continue;
                    var key_slot1 = `${u.material}_${L1}`;
                    var node_slot1 = dp[key_slot1];
                    if (!node_slot1 || node_slot1.cost === Infinity) continue;
                    
                    m2List.forEach(m2 => {
                        if (ALL_EQUIPMENT_MATERIALS.indexOf(m2) !== -1 && !enabledMaterials.has(m2)) return; // Skip if secondary material is disabled
                        for (var L2 = minL; L2 <= minL + 2; L2++) {
                            if (L2 >= L) continue;
                            if (L1 < L2) continue; // Prevent primary attribute shift (吃属)
                            if (Math.min(L1, L2) !== minL) continue;
                            
                            var key_slot2 = `${m2}_${L2}`;
                            var node_slot2 = dp[key_slot2];
                            if (!node_slot2 || node_slot2.cost === Infinity) continue;
                            
                            // Calculate compounding cost
                            var compoundCost = node_slot1.cost + 
                                                 node_slot2.cost + 
                                                 BOOK_COSTS[B] + 
                                                 getJumpPenalty(J);
                            
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

        // Level-down compounding logic: check easily obtainable high-level items of the same material
        var sourceNames = LEVEL_DOWN_SOURCE_NAMES[u.material] || [];
        sourceNames.forEach(name => {
            var S = getDB().find(x => x.name === name);
            if (S && S.level > u.level) {
                var S_key = `${u.material}_${S.level}`;
                var node_S = dp[S_key];
                if (node_S && node_S.cost !== Infinity) {
                    // Level-down compounding does not use books (B = 0)
                    var B = 0;
                    var X = getAlchemyBaseBonus() - 1;
                    var L_sub_min = Math.max(1, u.level - X);
                    if (L_sub_min <= u.level - 2) {
                        var junkCost = Math.max(10, L_sub_min * 5);
                        var compoundCost = node_S.cost + junkCost + BOOK_COSTS[B];
                        if (isBetterPathNode(node_u, compoundCost, B, 0)) {
                            var node_junk = {
                                material: "任意",
                                level: L_sub_min,
                                cost: junkCost,
                                method: "base",
                                source: "可用 " + getSafeJunkDescription(u.material, L_sub_min),
                                exactName: true,
                                item: { name: `${L_sub_min}等属性杂物`, level: L_sub_min, material: "任意" }
                            };
                            node_u.cost = compoundCost;
                            node_u.method = "compound";
                            node_u.item1 = node_S;
                            node_u.item2 = node_junk;
                            node_u.book = B;
                            node_u.jump = 0;
                            node_u.targetItem = targetItem;
                        }
                    }
                }
            }
        });
        // Level-up compounding logic: check low-level base items that can be upgraded with safe junk
        var levelUpSources = LEVEL_UP_SOURCE_NAMES[u.material] || [];
        levelUpSources.forEach(src => {
            if (src.level < u.level) {
                var S_key = `${u.material}_${src.level}`;
                var node_S = dp[S_key];
                if (node_S && node_S.cost !== Infinity) {
                    var baseBonus = getAlchemyBaseBonus();
                    var B = 0;
                    // For level-up with junk: max output = min(src.level, junkLevel) + baseBonus - 1
                    // Using junk at src.level gives max = src.level + baseBonus - 1
                    var maxReachable = src.level + baseBonus - 1;
                    if (maxReachable >= u.level) {
                        var junkLevel = src.level;
                        var junkCost = Math.max(10, junkLevel * 5);
                        var compoundCost = node_S.cost + junkCost + BOOK_COSTS[B];
                        if (isBetterPathNode(node_u, compoundCost, B, 0)) {
                            var node_junk = {
                                material: "任意",
                                level: junkLevel,
                                cost: junkCost,
                                method: "base",
                                source: "可用 " + getSafeJunkDescription(u.material, junkLevel),
                                exactName: true,
                                item: { name: `${junkLevel}等属性杂物`, level: junkLevel, material: "任意" }
                            };
                            node_u.cost = compoundCost;
                            node_u.method = "compound";
                            node_u.item1 = node_S;
                            node_u.item2 = node_junk;
                            node_u.book = B;
                            node_u.jump = 0;
                            node_u.levelUp = true;
                            node_u.targetItem = targetItem;
                        }
                    }
                }
            }
        });
            }
        }
    }

    // Reconstruct the recipe tree for the target item
    var targetNode = dp[targetKey];
    if (targetItem && isStrictlyCraftOnly(targetItem)) {
        var costVal = (calcCraftCost && enabledSources.craft) ? calcCraftCost(targetItem.name) : Infinity;
        targetNode = {
            cost: costVal,
            method: "craft",
            source: targetItem.crafted_from ? `器具制作 (${targetItem.crafted_from.tool})` : "未知途径",
            book: 0,
            jump: 0,
            node1: null,
            node2: null,
            item: targetItem,
            crafted_from: targetItem.crafted_from,
            level: targetItem.level,
            material: targetItem.material
        };
    } else if (targetItem && targetNode) {
        targetNode = {
            ...targetNode,
            item: targetItem,
            level: targetItem.level,
            material: targetItem.material
        };
    }
    var is3Mat = getItemMaterialSlots(targetItem).length === 3;
    
    if (!is3Mat && (!targetNode || (targetNode.cost === Infinity && targetNode.method !== "craft"))) {
        var referenceTree = buildReferenceTree(targetItem);
        if (returnAll) {
            return { tree: referenceTree, recipes: [] };
        }
        return referenceTree;
    }
    
    var tree = null;
    if (targetNode && (targetNode.cost !== Infinity || targetNode.method === "craft")) {
        tree = buildOutputTree(targetNode, representatives, enabledSources);
    }
    
    if (returnAll) {
        var recipes = getAlternativeRecipes(targetItem, maxBook, maxJump, enabledSources, dp, representatives);
        if (!tree) {
            tree = buildReferenceTree(targetItem);
        }
        return { tree, recipes };
    }
    
    return tree || buildReferenceTree(targetItem);
}


// Merged from app.js (production, incl. level-up/down)
function getRepresentatives(enabledSources) {
    var reps = {};
    var sources = enabledSources || { convenience: true, shop: true, mine: true, drop: true, craft: true };
    
    getDB().forEach(item => {
        if (!item.material || item.level <= 0) return;
        var key = `${item.material}_${item.level}`;
        
        // Skip convenience store items if the option is disabled
        var effectiveSrc = item.source || item.source_display || item.recommended_formula || "";
        var isStore = effectiveSrc.includes("8-12") || effectiveSrc.includes("便利店");
        if (isStore && !sources.convenience) {
            return;
        }
        
        // Skip if this item requires any blacklisted material slot
        if (hasDisabledMaterialSlot(item)) {
            return;
        }
        
        var currentBest = reps[key];
        if (!currentBest) {
            reps[key] = item;
        } else {
            var hasSrc = (x) => (x.source && x.source.length > 0) || (x.source_display && x.source_display.length > 0) || (x.recommended_formula && x.recommended_formula.length > 0);
            var isNonAlchemy = (x) => x.crafted_from || hasSrc(x);
            var itemNonAlc = isNonAlchemy(item);
            var bestNonAlc = isNonAlchemy(currentBest);
            
            if (itemNonAlc && !bestNonAlc) {
                reps[key] = item;
            } else if (!itemNonAlc && bestNonAlc) {
                // keep current best
            } else {
                if (hasSrc(item) && !hasSrc(currentBest)) {
                    reps[key] = item;
                } else if (item.name.length < currentBest.name.length) {
                    // simple name heuristic
                    reps[key] = item;
                }
            }
        }
    });
    return reps;
}


// Merged from app.js (production, incl. level-up/down)
function buildOutputTree(node, representatives, enabledSources) {
    var displayName = node.item ? node.item.name : `${node.material}(${node.level}级)`;
    if (node.item && node.material && node.level > 0 && !node.exactName) {
        var alt = getAlternativeNames(node.material, node.level, node.item.name);
        if (alt) {
            displayName += ` ${alt}`;
        }
    }
    
    var tree = {
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
        node.crafted_from.ingredients.forEach(ing => {
            // Find item properties for ingredient
            var ingName = normalizeCraftItemName(ing.name);
            var ingItem = getDB().find(x => x.name === ingName);
            if (ingItem) {
                var repNode = {
                    item: ingItem,
                    material: ingItem.material,
                    level: ingItem.level,
                    cost: ingItem.level * 10, // dummy
                    method: ingItem.crafted_from ? "craft" : "base",
                    source: ingItem.source,
                    crafted_from: ingItem.crafted_from,
                    exactName: true
                };
                
                var subTree = buildOutputTree(repNode, representatives, enabledSources);
                subTree.count = ing.count;
                tree.children.push(subTree);
            } else {
                // item not in DB, fallback
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
        // Mark primary/secondary
        tree.children[0].role = "主材 (Slot 1)";
        tree.children[1].role = "副材 (Slot 2)";
    } else if (node.method === "reference") {
        tree.sourceNote = node.sourceNote;
        tree.formula = node.formula;
        tree.children = node.children || [];
    }
    
    return tree;
}


// Merged from app.js (production, incl. level-up/down)
function getSuccessRate(book, jump, recipe = null) {
    if (recipe && recipe.node1 && recipe.node2) {
        return getRecipeTargetSuccessRate(recipe);
    }

    // 小程序环境无 DOM，默认高阶炼金
    var rank = (typeof getAlchemyRank === 'function') ? getAlchemyRank() : "advanced";
    var synthRate = 100;
    
    if (rank === "intermediate") {
        if (jump <= -1) {
            synthRate = 35;
        } else if (jump === 0) {
            synthRate = 45;
        } else if (jump === 1) {
            synthRate = 50; // Peak probability for +1 jumps
        } else if (jump === 2) {
            synthRate = 30;
        } else if (jump === 3) {
            synthRate = 10;
        } else {
            synthRate = 2;
        }
    } else {
        if (jump <= 0) {
            synthRate = 35;
        } else if (jump === 1) {
            synthRate = 45;
        } else if (jump === 2) {
            synthRate = 50; // Peak probability for +2 jumps
        } else if (jump === 3) {
            synthRate = 30;
        } else if (jump === 4) {
            synthRate = 15; // Low probability for +4 jumps
        } else {
            synthRate = 2;
        }
    }
    
    // Combine with candidate certainty rate if recipe is provided
    if (recipe && typeof recipe.certaintyRate === "number") {
        return Math.round(synthRate * (recipe.certaintyRate / 100));
    }
    
    return synthRate;
}


// Merged from app.js (production, incl. level-up/down)
function getAlternativeRecipes(targetItem, maxBook, maxJump, enabledSources, dp, representatives) {
    if (targetItem && isStrictlyCraftOnly(targetItem)) {
        return [];
    }
    if (targetItem && !isEquipmentCandidate(targetItem)) {
        maxBook = 0;
    }
    var recipeGroups = new Map();
    var L = targetItem.level;
    var M = targetItem.material;
    
    // If the target item's material is blacklisted, return no recipes
    // Only skip equipment materials that are explicitly disabled
    if (ALL_EQUIPMENT_MATERIALS.indexOf(M) !== -1 && !enabledMaterials.has(M)) return [];
    
    var targetMaterialSlots = getItemMaterialSlots(targetItem);
    if (targetMaterialSlots.length > 3) return [];
    
    var sub2_m = targetItem.sub_material2 ? targetItem.sub_material2.trim() : "";
    var is3Mat = targetMaterialSlots.length === 3;
    
    for (var B = 0; B <= maxBook; B++) {
        for (var J = 0; J <= maxJump; J++) {
            var L_min = L - B - J;
            if (L_min < 1) continue;
            
            if (is3Mat) {
                // 3-material logic
                var m2 = targetItem.sub_material1 ? targetItem.sub_material1.trim() : M;
                var m3 = sub2_m;
                
                // Skip if sub-materials are blacklisted equipment materials
                if ((ALL_EQUIPMENT_MATERIALS.indexOf(m2) !== -1 && !enabledMaterials.has(m2))
                    || (ALL_EQUIPMENT_MATERIALS.indexOf(m3) !== -1 && !enabledMaterials.has(m3))) continue;
                
                var minL = L_min;
                for (var L1 = minL; L1 <= minL + 2; L1++) {
                    if (L1 >= L) continue;
                    var key_slot1 = `${M}_${L1}`;
                    var node_slot1 = dp[key_slot1];
                    if (!node_slot1 || node_slot1.cost === Infinity) continue;
                    
                    for (var L2 = minL; L2 <= minL + 2; L2++) {
                        if (L2 >= L) continue;
                        if (L1 < L2) continue; // Prevent primary attribute shift (吃属)
                        var key_slot2 = `${m2}_${L2}`;
                        var node_slot2 = dp[key_slot2];
                        if (!node_slot2 || node_slot2.cost === Infinity) continue;
                        
                        for (var L3 = minL; L3 <= minL + 2; L3++) {
                            if (L3 >= L) continue;
                            if (L1 < L3) continue; // Prevent primary attribute shift (吃属)
                            if (Math.min(L1, L2, L3) !== minL) continue;
                            
                            var key_slot3 = `${m3}_${L3}`;
                            var node_slot3 = dp[key_slot3];
                            if (!node_slot3 || node_slot3.cost === Infinity) continue;
                            
                            var cost = node_slot1.cost + node_slot2.cost + node_slot3.cost + BOOK_COSTS[B] + getJumpPenalty(J);
                            var name1 = node_slot1.item ? node_slot1.item.name : `${M}(物等${L1})`;
                            var name2 = node_slot2.item ? node_slot2.item.name : `${m2}(物等${L2})`;
                            var name3 = node_slot3.item ? node_slot3.item.name : `${m3}(物等${L3})`;
                            
                            var displayName1 = name1 + getAlternativeNames(M, L1, name1);
                            var displayName2 = name2 + getAlternativeNames(m2, L2, name2);
                            var displayName3 = name3 + getAlternativeNames(m3, L3, name3);
                            var certainty = getRecipeCertainty(node_slot1.item, node_slot2.item, B, targetItem);
                            if (certainty.rate <= 0) continue;
                            
                            var groupKey = `${name1}_1_${name2}_1_${name3}`;
                            var existing = recipeGroups.get(groupKey);
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
                // 2-material logic
                var m2List = COMPATIBILITY[M] || [M];
                if (targetItem.sub_material1) {
                    var sub_m = targetItem.sub_material1.trim();
                    if (sub_m) {
                        m2List = [sub_m];
                    }
                }
                
                var minL = L_min;
                
                // Case 0: Advanced alchemy range model.
                // Example: level 21 + level 21 has base range 14-25; book 2 extends it to 14-27.
                if (J === 0) {
                    for (var L1 = 1; L1 < L; L1++) {
                        var key_slot1_adv = `${M}_${L1}`;
                        var node_slot1_adv = dp[key_slot1_adv];
                        if (!node_slot1_adv || node_slot1_adv.cost === Infinity || !node_slot1_adv.item) continue;
                        
                        m2List.forEach(m2 => {
                            if (ALL_EQUIPMENT_MATERIALS.indexOf(m2) !== -1 && !enabledMaterials.has(m2)) return;
                            for (var L2 = 1; L2 <= L1; L2++) {
                                var key_slot2_adv = `${m2}_${L2}`;
                                var node_slot2_adv = dp[key_slot2_adv];
                                if (!node_slot2_adv || node_slot2_adv.cost === Infinity || !node_slot2_adv.item) continue;
                                
                                var certainty = getRecipeCertainty(node_slot1_adv.item, node_slot2_adv.item, B, targetItem);
                                if (certainty.rate <= 0) continue;
                                
                                var simp = simplifyRecipeSlot2(node_slot1_adv, node_slot2_adv, B, targetItem);
                                var cost = node_slot1_adv.cost + simp.cost2 + BOOK_COSTS[B];
                                var name1 = node_slot1_adv.item.name;
                                var groupKey = `${name1}_1_${simp.name2}`;
                                var existing = recipeGroups.get(groupKey);
                                
                                if (isBetterRecipe(existing, cost, certainty.rate, B)) {
                                    recipeGroups.set(groupKey, {
                                        name1: name1,
                                        name2: simp.name2,
                                        count1: 1,
                                        count2: 1,
                                        node1: node_slot1_adv,
                                        node2: simp.node2,
                                        book: B,
                                        jump: 0,
                                        certaintyRate: certainty.rate,
                                        candidates: certainty.candidates,
                                        cost: cost,
                                        desc: getRecipeDesc(name1, L1, 1, simp.name2, L2, 1, B, 0, false, targetItem)
                                    });
                                }
                            }
                        });
                    }
                }
                
                // Case 1: Standard (L1 >= minL, L2 >= minL, min(L1, L2) = minL)
                for (var L1 = minL; L1 <= minL + 2; L1++) {
                    if (L1 >= L) continue;
                    var key_slot1_std = `${M}_${L1}`;
                    var node_slot1_std = dp[key_slot1_std];
                    if (!node_slot1_std || node_slot1_std.cost === Infinity) continue;
                    
                    m2List.forEach(m2 => {
                        if (ALL_EQUIPMENT_MATERIALS.indexOf(m2) !== -1 && !enabledMaterials.has(m2)) return; // Skip if secondary material is disabled
                        for (var L2 = minL; L2 <= minL + 2; L2++) {
                            if (L2 >= L) continue;
                            if (L1 < L2) continue; // Prevent primary attribute shift (吃属)
                            if (Math.min(L1, L2) !== minL) continue;
                            
                            var key_slot2 = `${m2}_${L2}`;
                            var node_slot2 = dp[key_slot2];
                            if (!node_slot2 || node_slot2.cost === Infinity) continue;
                            
                            var certainty = getRecipeCertainty(node_slot1_std.item, node_slot2.item, B, targetItem);
                            if (certainty.rate <= 0) continue;
                            
                            var simp = simplifyRecipeSlot2(node_slot1_std, node_slot2, B, targetItem);
                            var cost = node_slot1_std.cost + simp.cost2 + BOOK_COSTS[B] + getJumpPenalty(J);
                            var name1 = node_slot1_std.item ? node_slot1_std.item.name : `${M}(物等${L1})`;
                            
                            var groupKey = `${name1}_1_${simp.name2}`;
                            var existing = recipeGroups.get(groupKey);
                            if (isBetterRecipe(existing, cost, certainty.rate, B)) {
                                recipeGroups.set(groupKey, {
                                    name1: name1,
                                    name2: simp.name2,
                                    count1: 1,
                                    count2: 1,
                                    node1: node_slot1_std,
                                    node2: simp.node2,
                                    book: B,
                                    jump: J,
                                    certaintyRate: certainty.rate,
                                    candidates: certainty.candidates,
                                    cost: cost,
                                    desc: getRecipeDesc(name1, L1, 1, simp.name2, L2, 1, B, J, false, targetItem)
                                });
                            }
                        }
                    });
                }
                
                // Case 2: Double Slot 1 attribute-preservation recipe (L2 = L_min + 1, L1 = L_min)
                var L1_dbl = L_min;
                var L2_dbl = L_min + 1;
                if (L2_dbl < L) {
                    var key_slot1_dbl = `${M}_${L1_dbl}`;
                    var node_slot1_dbl = dp[key_slot1_dbl];
                    if (node_slot1_dbl && node_slot1_dbl.cost !== Infinity) {
                        m2List.forEach(m2 => {
                            if (ALL_EQUIPMENT_MATERIALS.indexOf(m2) !== -1 && !enabledMaterials.has(m2)) return; // Skip if secondary material is disabled
                            var key_slot2 = `${m2}_${L2_dbl}`;
                            var node_slot2 = dp[key_slot2];
                            if (node_slot2 && node_slot2.cost !== Infinity) {
                                var certainty = getRecipeCertainty(node_slot1_dbl.item, node_slot2.item, B, targetItem);
                                if (certainty.rate <= 0) return;
                                
                                var simp = simplifyRecipeSlot2(node_slot1_dbl, node_slot2, B, targetItem);
                                var cost = node_slot1_dbl.cost * 2 + simp.cost2 + BOOK_COSTS[B] + getJumpPenalty(J);
                                var name1 = node_slot1_dbl.item ? node_slot1_dbl.item.name : `${M}(物等${L1_dbl})`;
                                
                                var groupKey = `${name1}_2_${simp.name2}`;
                                var existing = recipeGroups.get(groupKey);
                                if (isBetterRecipe(existing, cost, certainty.rate, B)) {
                                    recipeGroups.set(groupKey, {
                                        name1: name1,
                                        name2: simp.name2,
                                        count1: 2,
                                        count2: 1,
                                        node1: node_slot1_dbl,
                                        node2: simp.node2,
                                        book: B,
                                        jump: J,
                                        certaintyRate: certainty.rate,
                                        candidates: certainty.candidates,
                                        cost: cost,
                                        desc: getRecipeDesc(name1, L1_dbl, 2, simp.name2, L2_dbl, 1, B, J, false, targetItem)
                                    });
                                }
                            }
                        });
                    }
                }
            }
        }
    }
    

    // Add level-down alternative recipe suggestions
    var sourceNames = LEVEL_DOWN_SOURCE_NAMES[M] || [];
    sourceNames.forEach(name => {
        var item = getDB().find(x => x.name === name);
        if (item && item.level > L) {
            // Level-down compounding does not use books (B = 0)
            var B = 0;
            var X = getAlchemyBaseBonus() - 1;
            var L_sub_val = Math.max(1, L - X);
            if (L_sub_val <= L - 2) {
                var primaryKey = `${M}_${item.level}`;
                var primaryNode = dp[primaryKey];
                if (primaryNode && primaryNode.cost !== Infinity) {
                    var junkCost = Math.max(10, L_sub_val * 5);
                    var cost = primaryNode.cost + junkCost + BOOK_COSTS[B];
                    var groupKey = `${item.name}_1_${L_sub_val}等属性杂物`;
                    
                    var junkItem = { name: `${L_sub_val}等属性杂物`, level: L_sub_val, material: "任意" };
                    var certainty = getRecipeCertainty(item, junkItem, B, targetItem);
                    
                    recipeGroups.set(groupKey, {
                        name1: item.name,
                        name2: `${L_sub_val}等属性杂物`,
                        count1: 1,
                        count2: 1,
                        node1: primaryNode,
                        node2: {
                            item: junkItem,
                            cost: junkCost,
                            method: "base",
                            exactName: true
                        },
                        book: B,
                        jump: 0,
                        certaintyRate: certainty.rate,
                        candidates: certainty.candidates,
                        targetItem: targetItem,
                        cost: cost,
                        desc: getRecipeDesc(item.name, item.level, 1, `${L_sub_val}等属性杂物`, L_sub_val, 1, B, 0, true, targetItem)
                    });
                }
            }
        }
    });

    // Add level-up alternative recipe suggestions
    var levelUpSrcs = LEVEL_UP_SOURCE_NAMES[M] || [];
    levelUpSrcs.forEach(src => {
        if (src.level < L) {
            var S_key = `${M}_${src.level}`;
            var node_S = dp[S_key];
            if (node_S && node_S.cost !== Infinity) {
                var baseBonus = getAlchemyBaseBonus();
                var B = 0;
                var maxReachable = src.level + baseBonus - 1;
                if (maxReachable >= L) {
                    var junkLevel = src.level;
                    var junkCost = Math.max(10, junkLevel * 5);
                    var cost = node_S.cost + junkCost + BOOK_COSTS[B];
                    var groupKey = `${src.name}_1_${junkLevel}等属性杂物`;
                    var junkItem = { name: `${junkLevel}等属性杂物`, level: junkLevel, material: "任意" };
                    var certainty = getRecipeCertainty({ name: src.name, level: src.level, material: M }, junkItem, B, targetItem);
                    recipeGroups.set(groupKey, {
                        name1: src.name,
                        name2: `${junkLevel}等属性杂物`,
                        count1: 1,
                        count2: 1,
                        node1: node_S,
                        node2: {
                            item: junkItem,
                            cost: junkCost,
                            method: "base",
                            exactName: true
                        },
                        book: B,
                        jump: 0,
                        certaintyRate: certainty.rate,
                        candidates: certainty.candidates,
                        targetItem: targetItem,
                        cost: cost,
                        desc: getRecipeDesc(src.name, src.level, 1, `${junkLevel}等属性杂物`, junkLevel, 1, B, 0, true, targetItem, true)
                    });
                }
            }
        }
    });

    // Sort alternative recipes by cost
    var recipes = Array.from(recipeGroups.values());
    recipes.sort((a, b) => a.cost - b.cost);

    // For prop (non-equipment) targets, generate a simplified NPC shop recommendation
    var isPropTarget = targetItem && !isEquipmentCandidate(targetItem) && targetItem.material;
    if (isPropTarget && recipes.length > 0) {
        // Helper: extract shop location from source_display
        function extractShopLoc(item) {
            var sd = item.source_display || "";
            // Try "购买：XXX。" or "购买：XXX" pattern first
            var m = sd.match(/购买[：:]\s*([^。；;]+)/);
            if (m) return m[1].trim();
            // Try "XXX购买" pattern
            m = sd.match(/(\S+?)购买/);
            if (m && m[1].indexOf("8-12") === -1) return m[1].trim();
            // Fallback
            return sd.replace("购买", "").replace("8-12便利店", "").replace(/[：:。；;]/g, "").trim();
        }
        var shopRecipes = recipes.filter(function(r) {
            var isLevelPath = r.desc.indexOf("降等合成") !== -1 || r.desc.indexOf("升等合成") !== -1;
            if (!isLevelPath) return false;
            var primaryItem = getDB().find(function(x) { return x.name === r.name1; });
            if (!primaryItem) return false;
            var sd = primaryItem.source_display || "";
            return sd.indexOf("购买") !== -1 && sd.indexOf("8-12便利店") === -1;
        });
        if (shopRecipes.length > 0) {
            // Reformat all shop recipes with clean NPC description
            shopRecipes.forEach(function(r) {
                var primaryItem = getDB().find(function(x) { return x.name === r.name1; });
                var shopLoc = extractShopLoc(primaryItem);
                var isUp = r.desc.indexOf("升等合成") !== -1;
                var tag = isUp ? "升等" : "降等";
                var junkAdv = Math.max(1, L - 3);
                var junkInt = Math.max(1, L - 2);
                var junkRange = junkAdv === junkInt ? junkAdv + "等" : junkAdv + "~" + junkInt + "等";
                var junkLabel = getSafeJunkDescription(M, 1).replace(/^\d+等/, "");
                r.desc = shopLoc + "出售 " + r.name1 + " + " + junkRange + junkLabel + " (" + tag + ")";
                r.isShopRecommendation = true;
            });
            return shopRecipes;
        }
    }

    return recipes;
}


// Merged from app.js (production, incl. level-up/down)
function queryEquipmentItems(filters = {}) {
    var query = String(filters.query || "").trim().toLowerCase();
    var category = String(filters.category || "").trim();
    var primaryMaterial = String(filters.primaryMaterial || "").trim();
    var attributeMode = String(filters.attributeMode || "").trim();
    var showNoStats = filters.showNoStats !== undefined ? Boolean(filters.showNoStats) : true;
    var showEquip = filters.showEquip !== undefined ? Boolean(filters.showEquip) : true;
    var showProps = filters.showProps !== undefined ? Boolean(filters.showProps) : false;
    var showCraft = filters.showCraft !== undefined ? Boolean(filters.showCraft) : false;
    var showMall = filters.showMall !== undefined ? Boolean(filters.showMall) : false;
    
            // Helper to identify system dummy items, starting quest items, and pet-exclusive gear by ID range
    var isSystemOrStartingOrExclusive = function(item) {
        if (!item) return true;
        // 0. General level 1 starting/quest equipment (white boots, leather shoes, Bastet's necklace, etc.)
        if (item.level === 1 && item.req_level === 0) return true;
        var idNum = parseInt(item.id, 10);
        // 1. Character starting weapons (10001-10020)
        if (idNum >= 10001 && idNum <= 10020) return true;
        // 2. Pet starting equipment (10050-10099)
        if (idNum >= 10050 && idNum <= 10099) return true;
        // 3. System dummy stat items (10985-10999)
        if (idNum >= 10985 && idNum <= 10999) return true;
        // 4. Character starting clothes (21001-21020)
        if (idNum >= 21001 && idNum <= 21020) return true;
        // 5. Character starting headgear (22001-22010)
        if (idNum >= 22001 && idNum <= 22010) return true;
        // 6. Human pet exclusive armlets (25150-25165)
        if (idNum >= 25150 && idNum <= 25165) return true;
        // 7. Defensive Bow Evasion dummy (25926)
        if (idNum === 25926) return true;
        return false;
    };

    // Helper for system dummy items that should be hidden from all lists
    var isSystemDummyItem = function(item) {
        if (!item) return true;
        var idNum = parseInt(item.id, 10);
        return (idNum >= 10985 && idNum <= 10999) || idNum === 25926;
    };

    var MALL_EQUIPMENT_IDS = new Set(alchemy_config.MALL_EQUIPMENT_IDS || []);

    return getDB()
        .filter(item => {
            var isEquip = item && item.type && item.category && ((item.alchemy_flag & 1) === 1) && EQUIPMENT_TYPES.has(item.type) && !isSystemDummyItem(item);
            var isProp = item && !isEquip && item.material && item.level > 0
                && !EQUIPMENT_TYPES.has(item.type);
            // Craft items (e.g. fridge, tools) may have no material/req_level but should be searchable
            var hasCraft = item && item.crafted_from && item.crafted_from.tool;

            // Mall/special equipment: must be in the parsed mall/gacha IDs list or req_level === 0 fallback
            var isMall = item && (MALL_EQUIPMENT_IDS.has(item.id) || (item.req_level === 0 && (item.alchemy_flag === 11 || item.alchemy_flag === 15 || item.alchemy_flag === 31) && item.stats && !hasCraft && EQUIPMENT_TYPES.has(item.type))) && !isSystemOrStartingOrExclusive(item);

            var keep = false;
            if (showEquip && isEquip) keep = true;
            if (showProps && isProp) keep = true;
            if (showCraft && hasCraft) keep = true;
            if (showMall && isMall) keep = true;
            if (!keep) return false;

            // When mall filter is off, hide mall-exclusive equipment from normal lists
            if (!showMall && isMall) return false;
            
            var stats = String(item.stats || "").trim();
            var hasNoStats = !stats || stats === "无" || stats === "无属性";
            if (!showNoStats && hasNoStats && !isProp && item.material !== "星耀" && !hasCraft) return false;
            
            if (query) {
                // Parse combo format: "21木", "木21", "21 木材"
                var comboLevel = null, comboMaterial = null, comboQuery = query;
                var patterns = [
                    { regex: /^(\d+)\s+(\S+)$/, n:1, m:2 },
                    { regex: /^(\S+)\s+(\d+)$/, n:2, m:1 },
                    { regex: /^(\d+)(\S+)$/,    n:1, m:2 },
                    { regex: /^(\S+)(\d+)$/,    n:2, m:1 }
                ];
                for (var pi = 0; pi < patterns.length; pi++) {
                    var match = comboQuery.match(patterns[pi].regex);
                    if (match) {
                        var resolved = resolveMaterialAbbreviation(match[patterns[pi].m]);
                        if (resolved) { comboLevel = parseInt(match[patterns[pi].n],10); comboMaterial = resolved; comboQuery = ""; }
                        break;
                    }
                }
                if (comboLevel !== null && item.level !== comboLevel) return false;
                if (comboMaterial && item.material !== comboMaterial) return false;
                if (comboQuery) {
                    var searchable = [...getItemSearchAliases(item), item.id, item.level, item.req_level]
                        .map(function(v){return String(v||"").toLowerCase();});
                    var tokens = comboQuery.split(/(\d+)/).filter(Boolean).map(function(t){return t.trim().toLowerCase();}).filter(Boolean);
                    if (tokens.length===0) tokens.push(comboQuery);
                    if (!tokens.every(function(t){return searchable.some(function(v){return v.includes(t);});})) return false;
                }
            }
            if (category && item.category !== category) return false;
            if (primaryMaterial && item.material !== primaryMaterial) return false;
            
            if (attributeMode) {
                if (attributeMode === "single") {
                    var slotCount = getItemMaterialSlots(item).length;
                    if (slotCount !== 1) return false;
                } else if (attributeMode === "multi") {
                    var slotCount = getItemMaterialSlots(item).length;
                    if (slotCount <= 1) return false;
                } else {
                    var parts = stats.split(/\s+/).filter(Boolean);
                    var positiveAttrs = [];
                    var hasNegSpd = false;
                    
                    parts.forEach(part => {
                        var match = part.match(/^([a-zA-Z\u4e00-\u9fa5]+)([-+]\d+)/);
                        if (match) {
                            var attrName = match[1].toUpperCase();
                            var valStr = match[2];
                            var isNegative = valStr.startsWith("-");
                            
                            if (attrName === "SPD" && isNegative) {
                                hasNegSpd = true;
                            } else if (!isNegative) {
                                if (["ATK", "DEF", "MATK", "MDEF", "SPD"].includes(attrName)) {
                                    positiveAttrs.push(attrName);
                                } else {
                                    positiveAttrs.push("特殊");
                                }
                            }
                        } else if (part !== "无" && part !== "无属性") {
                            positiveAttrs.push("特殊");
                        }
                    });
                    
                    if (attributeMode === "-SPD") {
                        if (!hasNegSpd) return false;
                    } else if (attributeMode === "特殊") {
                        if (positiveAttrs.length !== 1 || positiveAttrs[0] !== "特殊") return false;
                    } else {
                        if (positiveAttrs.length !== 1 || positiveAttrs[0] !== attributeMode) return false;
                    }
                }
            }
            return true;
        })
        .sort((a, b) => {
            if (a.level !== b.level) return a.level - b.level;
            if ((a.req_level || 0) !== (b.req_level || 0)) return (a.req_level || 0) - (b.req_level || 0);
            return String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans-CN");
        });
}

// Material abbreviation mapping for search (22 entries)
var MATERIAL_ABBREVIATIONS = (alchemy_config && alchemy_config.MATERIAL_ABBREVIATIONS) || {
    "木":"木材","皮":"兽皮","骨":"兽骨","毛":"兽毛","羽":"羽毛",
    "壳":"甲壳","赤":"赤铁","魔":"魔性物质","白":"白银","钻":"钻石",
    "宝":"宝石","水":"水晶","黏":"白色黏土","泥":"普通黏土",
    "草":"草类纤维","花":"花类纤维","叶":"叶类纤维",
    "米":"米","麦":"麦","肉":"肉","蛋":"蛋","豆":"豆"
};

function resolveMaterialAbbreviation(input) {
    if (!input) return null;
    if (MATERIAL_ABBREVIATIONS[input]) return MATERIAL_ABBREVIATIONS[input];
    if (ALL_EQUIPMENT_MATERIALS && ALL_EQUIPMENT_MATERIALS.includes(input)) return input;
    return null;
}


// ========== Mini Program 导出 ==========
var alchemy_core = {
  setDB: setDB,
  getDB: getDB,
  getBookSourceText: getBookSourceText,
  formatBookUsage: formatBookUsage,
  getItemMaterialSlots: getItemMaterialSlots,
  getItemSubMaterials: getItemSubMaterials,
  getItemSearchAliases: getItemSearchAliases,
  hasDisabledMaterialSlot: hasDisabledMaterialSlot,
  isSelfProvidedUnknownSourceItem: isSelfProvidedUnknownSourceItem,
  getBookLevelFromName: getBookLevelFromName,
  normalizeCraftItemName: normalizeCraftItemName,
  getAdvancedAlchemyLevelRange: getAdvancedAlchemyLevelRange,
  isEquipmentCandidate: isEquipmentCandidate,
  getAlchemyResultCandidates: getAlchemyResultCandidates,
  getRecipeCertainty: getRecipeCertainty,
  isTargetInAdvancedAlchemyRange: isTargetInAdvancedAlchemyRange,
  isBetterRecipe: isBetterRecipe,
  isBetterPathNode: isBetterPathNode,
  parseRecommendedFormula: parseRecommendedFormula,
  buildItemDataMaterialReferenceTree: buildItemDataMaterialReferenceTree,
  buildReferenceTree: buildReferenceTree,
  buildNonSynthSourceTree: buildNonSynthSourceTree,
  getRecipeTargetSuccessRate: getRecipeTargetSuccessRate,
  getDeltaProb: getDeltaProb,
  buildLevelToCandidatesMapping: buildLevelToCandidatesMapping,
  getRecipeOutcomeBreakdown: getRecipeOutcomeBreakdown,
  getAlternativeNames: getAlternativeNames,
  getAlchemyResultCandidatesMulti: getAlchemyResultCandidatesMulti,
  getRecipeOutcomeBreakdownMulti: getRecipeOutcomeBreakdownMulti,
  solveAlchemyPath: solveAlchemyPath,
  getRepresentatives: getRepresentatives,
  buildOutputTree: buildOutputTree,
  getSuccessRate: getSuccessRate,
  getAlternativeRecipes: getAlternativeRecipes,
  queryEquipmentItems: queryEquipmentItems,
  resolveMaterialAbbreviation: resolveMaterialAbbreviation,
};

    // === 统一导出 ===
    var _exports = {
        setDB: setDB,
        getDB: getDB
    };

    // 导出所有公共函数和常量
    var _exportNames = [
        'ALL_EQUIPMENT_MATERIALS', 'COMPATIBILITY', 'BOOK_COSTS', 'BOOK_SOURCES',
        'JUMP_PENALTIES', 'ADVANCED_ALCHEMY_BASE_BONUS', 'CRAFT_NAME_ALIASES',
        'LEVEL_DOWN_SOURCE_NAMES', 'LEVEL_UP_SOURCE_NAMES', 'MATERIAL_ABBREVIATIONS',
        'EQUIPMENT_TYPES', 'NON_ALCHEMY_METHODS', 'NO_OBTAIN_PATH_METHODS',
        'UNIVERSAL_SAFE_JUNK',
        'getBookSourceText', 'formatBookUsage', 'getItemMaterialSlots',
        'getItemSubMaterials', 'getItemSearchAliases', 'hasDisabledMaterialSlot',
        'isSelfProvidedUnknownSourceItem', 'getBookLevelFromName',
        'normalizeCraftItemName', 'getAdvancedAlchemyLevelRange',
        'isEquipmentCandidate', 'getAlchemyResultCandidates', 'getRecipeCertainty',
        'isTargetInAdvancedAlchemyRange', 'isBetterRecipe', 'isBetterPathNode',
        'parseRecommendedFormula', 'buildItemDataMaterialReferenceTree',
        'buildReferenceTree', 'buildNonSynthSourceTree',
        'getRecipeTargetSuccessRate', 'getDeltaProb',
        'buildLevelToCandidatesMapping', 'getRecipeOutcomeBreakdown',
        'getAlternativeNames', 'getAlchemyResultCandidatesMulti',
        'getRecipeOutcomeBreakdownMulti', 'solveAlchemyPath', 'getRepresentatives',
        'buildOutputTree', 'getSuccessRate', 'getAlternativeRecipes',
        'queryEquipmentItems', 'resolveMaterialAbbreviation',
        'getSingleAttribute', 'getSafeJunkMaterials', 'getSafeJunkDescription',
        'findLowestAlchemyFlag3Item',
        'simplifyRecipeSlot2', 'getRecipeDesc', 'isStrictlyCraftOnly',
        'getAlchemyBaseBonus', 'getJumpPenalty'
    ];

    for (var i = 0; i < _exportNames.length; i++) {
        var name = _exportNames[i];
        try {
            var val = eval(name);
            if (typeof val !== 'undefined') {
                _exports[name] = val;
            }
        } catch(e) {
            // 变量未定义，跳过
        }
    }

    // 浏览器模式: 挂到 window
    if (typeof window !== 'undefined') {
        for (var key in _exports) {
            if (_exports.hasOwnProperty(key)) {
                window[key] = _exports[key];
            }
        }
    }

    return _exports;
});
