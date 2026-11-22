import type { IncomingMessage, ServerResponse } from 'node:http';
import { createNexusApp } from '../lib/nexusApp';

const app = createNexusApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const rawUrl = req.url || '/';
    const urlObj = new URL(rawUrl, 'http://localhost');
    const rewrittenPath = urlObj.searchParams.get('__path');
    if (rewrittenPath !== null) {
      urlObj.searchParams.delete('__path');
      const qs = urlObj.searchParams.toString();
      const cleanPath = rewrittenPath.replace(/^\/+/, '');
      req.url = `/api/${cleanPath}${qs ? `?${qs}` : ''}`;
    } else if (!rawUrl.startsWith('/api/')) {
      req.url = `/api${rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`}`;
    }
  } catch {
    // keep req.url as-is
  }

  return app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
}
