"use strict";
/**
 * Warehouse purpose rules — which warehouse types may take part in which
 * inventory operation, and which parent (farm / production site) a purpose
 * warehouse must belong to.
 *
 * Kept as plain string unions (not the Prisma enum) so the mobile app can
 * import this module too. `GENERAL` is always allowed — it stays the
 * unrestricted catch-all.
 *
 * Enforcement is gated per company by the `enforceWarehousePurpose` flag in
 * the `user-access.settings` system setting (default OFF). When OFF, none of
 * this is applied and every accessible warehouse is offered, as before.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WAREHOUSE_OPERATION_LABELS = exports.WAREHOUSE_OPERATION_RULES = exports.WAREHOUSE_TYPE_LABELS = void 0;
exports.warehouseTypeAllowedForOperation = warehouseTypeAllowedForOperation;
exports.allowedTypeLabelsForOperation = allowedTypeLabelsForOperation;
exports.requiredParentForWarehouseType = requiredParentForWarehouseType;
exports.WAREHOUSE_TYPE_LABELS = {
    GENERAL: "General",
    COLD_STORAGE: "Cold storage",
    FARM_STORE: "Farm store",
    FEED_STORE: "Feed store",
    SOYA_STORE: "Soya store",
    EGG_STORE: "Egg store",
};
const G = "GENERAL";
/** Allowed warehouse types per operation. GENERAL is always included. */
exports.WAREHOUSE_OPERATION_RULES = {
    "feed-production.raw-materials": ["FEED_STORE", G],
    "feed-production.finished": ["FEED_STORE", G],
    "feed.consumption": ["FARM_STORE", "FEED_STORE", G],
    "feed.receipt": ["FEED_STORE", G],
    "feed.internal-transfer-source": ["FEED_STORE", G],
    "soya.bean-intake": ["SOYA_STORE", G],
    "soya.output": ["SOYA_STORE", G],
    "egg.collection": ["EGG_STORE", G],
    "egg.dispatch": ["EGG_STORE", G],
    "poultry.health-supplies": ["FARM_STORE", G],
};
exports.WAREHOUSE_OPERATION_LABELS = {
    "feed-production.raw-materials": "feed production (raw materials)",
    "feed-production.finished": "feed production (finished feed)",
    "feed.consumption": "feed consumption",
    "feed.receipt": "feed receipt into the farm",
    "feed.internal-transfer-source": "feed internal transfer",
    "soya.bean-intake": "soya bean intake",
    "soya.output": "soya processing output",
    "egg.collection": "egg collection",
    "egg.dispatch": "egg dispatch",
    "poultry.health-supplies": "medication / vaccination supplies",
};
function warehouseTypeAllowedForOperation(type, op) {
    const allowed = exports.WAREHOUSE_OPERATION_RULES[op];
    return !allowed || allowed.includes(type);
}
function allowedTypeLabelsForOperation(op) {
    return (exports.WAREHOUSE_OPERATION_RULES[op] ?? [])
        .map((t) => exports.WAREHOUSE_TYPE_LABELS[t] ?? t)
        .join(", ");
}
/**
 * The parent a purpose warehouse must be tied to. Feed/soya belong to a
 * production site (the mill / plant); egg & farm stores belong to a farm.
 */
function requiredParentForWarehouseType(type) {
    switch (type) {
        case "FEED_STORE":
            return "farmOrProductionSite";
        case "SOYA_STORE":
            return "productionSite";
        case "EGG_STORE":
        case "FARM_STORE":
            return "farm";
        default:
            return null;
    }
}
