// @dct/engine — public API barrel. Other packages import the engine from here.
export * from "./framework/types";
export * from "./framework/access";
export * from "./framework/version";
export * from "./framework/dq";
export { loadContract, parseContract, entityById, sourceById, pkOf, ROOT } from "./framework/load";
export * from "./generators";
export * from "./governance/checks";
export {
  buildModels,
  checkVersions,
  statusVsLock,
  writeLock,
  loadLock,
} from "./registry/registry";
export * from "./registry/surface";
export { runMedallion, type LayerStats, type DqResult } from "./medallion/run";
