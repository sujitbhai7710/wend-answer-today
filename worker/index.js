/**
 * Wend Answer Today - Cloudflare Worker
 * Backend API for fetching/storing Wend game data
 * Protected with API key authentication
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
};

const WORD_COLORS = [
  '#4ade80', // green
  '#a78bfa', // purple
  '#fb923c', // orange
  '#38bdf8', // light blue
  '#f472b6', // pink
  '#fbbf24', // yellow
  '#2dd4bf', // teal
  '#f87171', // red
];

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function verifyApiKey(request, env) {
  const apiKey = request.headers.get('X-API-Key');
  if (!apiKey || apiKey !== env.WORKER_API_KEY) {
    return false;
  }
  return true;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Route: Health check (public)
    if (path === '/api/health' && request.method === 'GET') {
      return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() });
    }

    // Route: Get latest puzzle (public - for Pages build)
    if (path === '/api/puzzle/latest' && request.method === 'GET') {
      try {
        const result = await env.DB.prepare(
          'SELECT * FROM puzzles ORDER BY puzzle_number DESC LIMIT 1'
        ).first();
        
        if (!result) {
          return jsonResponse({ error: 'No puzzles found' }, 404);
        }

        // Parse JSON fields
        result.words = JSON.parse(result.words);
        result.grid = JSON.parse(result.grid);
        result.word_cells = JSON.parse(result.word_cells);

        return jsonResponse({ success: true, data: result });
      } catch (error) {
        return jsonResponse({ error: 'Database error', details: error.message }, 500);
      }
    }

    // Route: Get puzzle by number (public - for archives)
    if (path.match(/^\/api\/puzzle\/\d+$/) && request.method === 'GET') {
      const puzzleNumber = parseInt(path.split('/').pop());
      try {
        const result = await env.DB.prepare(
          'SELECT * FROM puzzles WHERE puzzle_number = ?'
        ).bind(puzzleNumber).first();
        
        if (!result) {
          return jsonResponse({ error: 'Puzzle not found' }, 404);
        }

        result.words = JSON.parse(result.words);
        result.grid = JSON.parse(result.grid);
        result.word_cells = JSON.parse(result.word_cells);

        return jsonResponse({ success: true, data: result });
      } catch (error) {
        return jsonResponse({ error: 'Database error', details: error.message }, 500);
      }
    }

    // Route: Get all puzzles list (public - for archive index)
    if (path === '/api/puzzles' && request.method === 'GET') {
      try {
        const { results } = await env.DB.prepare(
          'SELECT puzzle_number, date, words, rows, cols FROM puzzles ORDER BY puzzle_number DESC'
        ).all();
        
        // Parse words JSON
        results.forEach(r => r.words = JSON.parse(r.words));

        return jsonResponse({ success: true, data: results });
      } catch (error) {
        return jsonResponse({ error: 'Database error', details: error.message }, 500);
      }
    }

    // Route: Get recent puzzles (last N) (public)
    if (path === '/api/puzzles/recent' && request.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '5');
      try {
        const { results } = await env.DB.prepare(
          'SELECT * FROM puzzles ORDER BY puzzle_number DESC LIMIT ?'
        ).bind(limit).all();
        
        results.forEach(r => {
          r.words = JSON.parse(r.words);
          r.grid = JSON.parse(r.grid);
          r.word_cells = JSON.parse(r.word_cells);
        });

        return jsonResponse({ success: true, data: results });
      } catch (error) {
        return jsonResponse({ error: 'Database error', details: error.message }, 500);
      }
    }

    // ===== PROTECTED ROUTES (require API key) =====

    // Route: Add/update puzzle (protected)
    if (path === '/api/puzzle' && request.method === 'POST') {
      if (!verifyApiKey(request, env)) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }

      try {
        const body = await request.json();
        const { puzzle_number, date, words, grid, rows, cols, word_cells } = body;

        if (!puzzle_number || !date || !words || !grid || !rows || !cols || !word_cells) {
          return jsonResponse({ error: 'Missing required fields' }, 400);
        }

        await env.DB.prepare(`
          INSERT INTO puzzles (puzzle_number, date, words, grid, rows, cols, word_cells, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(puzzle_number) DO UPDATE SET
            date = excluded.date,
            words = excluded.words,
            grid = excluded.grid,
            rows = excluded.rows,
            cols = excluded.cols,
            word_cells = excluded.word_cells,
            updated_at = datetime('now')
        `).bind(
          puzzle_number,
          date,
          JSON.stringify(words),
          JSON.stringify(grid),
          rows,
          cols,
          JSON.stringify(word_cells)
        ).run();

        return jsonResponse({ success: true, message: 'Puzzle saved', puzzle_number });
      } catch (error) {
        return jsonResponse({ error: 'Database error', details: error.message }, 500);
      }
    }

    // Route: Trigger rebuild (protected - calls GitHub Actions)
    if (path === '/api/trigger-rebuild' && request.method === 'POST') {
      if (!verifyApiKey(request, env)) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }

      try {
        const response = await fetch(
          `https://api.github.com/repos/${env.GH_REPO}/actions/workflows/daily-update.yml/dispatches`,
          {
            method: 'POST',
            headers: {
              'Authorization': `token ${env.GH_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
              'User-Agent': 'wend-worker',
            },
            body: JSON.stringify({ ref: 'main' }),
          }
        );

        if (response.status === 204) {
          return jsonResponse({ success: true, message: 'Rebuild triggered' });
        } else {
          const text = await response.text();
          return jsonResponse({ error: 'Failed to trigger rebuild', details: text }, 500);
        }
      } catch (error) {
        return jsonResponse({ error: 'Rebuild trigger failed', details: error.message }, 500);
      }
    }

    // Route: Scrape and update (protected - for cron)
    if (path === '/api/scrape-and-update' && request.method === 'POST') {
      if (!verifyApiKey(request, env)) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }

      // This endpoint is called by the cron/scheduled handler
      // It triggers the GitHub Actions workflow which does the actual scraping
      try {
        const response = await fetch(
          `https://api.github.com/repos/${env.GH_REPO}/actions/workflows/daily-update.yml/dispatches`,
          {
            method: 'POST',
            headers: {
              'Authorization': `token ${env.GH_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
              'User-Agent': 'wend-worker',
            },
            body: JSON.stringify({ ref: 'main' }),
          }
        );

        if (response.status === 204) {
          return jsonResponse({ success: true, message: 'Scrape workflow triggered' });
        } else {
          return jsonResponse({ error: 'Failed to trigger workflow' }, 500);
        }
      } catch (error) {
        return jsonResponse({ error: 'Workflow trigger failed', details: error.message }, 500);
      }
    }

    // 404 for unmatched routes
    return jsonResponse({ error: 'Not found' }, 404);
  },

  async scheduled(event, env, ctx) {
    // Cron trigger: runs at 1:31 PM IST (08:01 UTC) daily
    // Triggers the GitHub Actions workflow to scrape and rebuild
    ctx.waitUntil(
      (async () => {
        try {
          await fetch(
            `https://api.github.com/repos/${env.GH_REPO}/actions/workflows/daily-update.yml/dispatches`,
            {
              method: 'POST',
              headers: {
                'Authorization': `token ${env.GH_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'wend-worker',
              },
              body: JSON.stringify({ ref: 'main' }),
            }
          );
          console.log('Scheduled: Triggered GitHub Actions workflow');
        } catch (error) {
          console.error('Scheduled: Failed to trigger workflow:', error);
        }
      })()
    );
  },
};
