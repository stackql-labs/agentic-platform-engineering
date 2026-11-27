/**
 * The system's own reading of the live release state: two SELECTs through the StackQL MCP
 * server. The gate never takes the model's word for what is live.
 */
import { cfg, releasePolicy } from './config.ts';
import type { Platform } from './platform.ts';
import { CANDIDATE_PATH, lookSql, parseLive, previewPath, toParams, type Live } from './release.ts';

export async function readLive(platform: Platform): Promise<Live | { error: string }> {
  const preview = await platform.select(lookSql(cfg.region, previewPath(releasePolicy.target)));
  if (!preview.ok) return { error: preview.text };
  const candidate = await platform.select(lookSql(cfg.region, CANDIDATE_PATH));
  if (!candidate.ok) return { error: candidate.text };
  return parseLive(releasePolicy.target, toParams(preview.rows), toParams(candidate.rows));
}
