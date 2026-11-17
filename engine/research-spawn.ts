/**
 * Argv for a research child process. The parent is often `tsx`, whose loader
 * lives in `execArgv` (`--import`) and is not part of `argv`.
 */
export function researchRespawnArgv(execArgv: readonly string[], argv: readonly string[]): string[] {
  const kept: string[] = [];
  for (let i = 0; i < execArgv.length; i++) {
    const arg = execArgv[i];
    if (arg === "--max-old-space-size") {
      i += 1;
      continue;
    }
    if (arg.startsWith("--max-old-space-size=")) continue;
    kept.push(arg);
  }
  return [...kept, ...argv.slice(1)];
}
