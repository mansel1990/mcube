import { execSync } from "node:child_process";

/** Short git commit of the code that runs a backtest. The page and the engine must agree. */
export function engineSha(): string {
  const git = readGit();
  if (git) return git;
  const env = process.env.VERCEL_GIT_COMMIT_SHA || process.env.MLIVE_ENGINE_SHA || "";
  if (env.length >= 7) return env.slice(0, 7);
  return "unknown";
}

function readGit(): string | null {
  try {
    const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return sha || null;
  } catch {
    return null;
  }
}
