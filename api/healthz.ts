import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * GET /api/healthz – lightweight liveness probe.
 */
export default function handler(_req: VercelRequest, res: VercelResponse): void {
  res.status(200).json({ status: "ok" });
}
