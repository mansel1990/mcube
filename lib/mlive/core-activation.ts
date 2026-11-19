export type CoreActivationPatch = {
  strategiesEnabled: string[];
  longtermCoreEnabled: true;
};

/** Preserve every current strategy and add longterm only when it is missing. Radar is not part of this patch. */
export function coreActivationPatch(current: readonly string[]): CoreActivationPatch {
  const strategiesEnabled = current.filter((name) => typeof name === "string" && name.length > 0);
  if (!strategiesEnabled.includes("longterm")) strategiesEnabled.push("longterm");
  return { strategiesEnabled, longtermCoreEnabled: true };
}
