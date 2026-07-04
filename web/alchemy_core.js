// ==========================================================================
// 飘流幻境新世界 - 智能炼金核心共享逻辑 (alchemy_core.js)
// ==========================================================================

// Filtered list of relevant WLO materials used in equipment compounding

// Material compatibility table (主属性相容副属性)
// If slot 1 has material K, and slot 2 has material V, the result keeps material K.

// Costs for books (炼金百科)

// Penalties for jumping levels (跳级几率惩罚)
const JUMP_PENALTIES = {
    0: 0,       // +0 jump (平合, success rate is ~95%)
    1: 1500,    // +1 jump (moderate risk, success rate is ~50%)
    2: 8000,    // +2 jump (high risk, success rate is ~10-15%)
    3: 50000    // +3 jump (extreme risk, success rate is ~2%)
};

const ADVANCED_ALCHEMY_BASE_BONUS = 4;

// Calculate single recipe exact probability of getting targetItem using fallback mapping

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

// Core Dijkstra / DAG Pathfinding solver

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

    // Step 1: filter by material + level range
    // Use binary alchemy_flag (fields_offset+109): 0x03 = can be alchemy output
    let candidates = itemsDb.filter(item => {
        if (!item.material || item.material !== primaryMaterial) return false;
        if (item.level < minLevel || item.level > maxLevel) return false;
        if (item.alchemy_flag !== 0x03) return false;
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
        const prob = getDeltaProb(climb, downgradeRange);
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

// ===== Added from app.js v1.2 =====

