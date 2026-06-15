/**
 * Wend Puzzle Updater
 * Pulls the latest Wend puzzle from The Word Finder's upstream JSON API
 * and writes it into the Cloudflare Worker API.
 */

const WORKER_URL = process.env.WORKER_URL || 'https://wend-api-worker.wendapi.workers.dev';
const API_KEY = process.env.WORKER_API_KEY;
const SOURCE_URL = process.env.WEND_SOURCE_URL || 'https://api.thewordfinder.com/wend/latest';

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url, options = {}, config = {}) {
    const attempts = config.attempts || 3;
    const timeoutMs = config.timeoutMs || 30000;
    const label = config.label || url;
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
                headers: {
                    Accept: 'application/json',
                    ...(options.headers || {}),
                },
            });
            const text = await response.text();

            if (!response.ok) {
                throw new Error(`${label} failed with status ${response.status}: ${text.slice(0, 300)}`);
            }

            try {
                return JSON.parse(text);
            } catch (error) {
                throw new Error(`${label} returned invalid JSON: ${text.slice(0, 300)}`);
            }
        } catch (error) {
            lastError = error;
            console.warn(`Attempt ${attempt}/${attempts} failed for ${label}: ${error.message}`);
            if (attempt < attempts) {
                await delay(attempt * 2000);
            }
        } finally {
            clearTimeout(timeoutId);
        }
    }

    throw lastError;
}

function normalizePuzzleData(payload) {
    const result = payload?.result;
    const game = result?.game;

    if (!result || !game || !Array.isArray(game.words) || !Array.isArray(game.grid)) {
        throw new Error('Upstream API response is missing expected Wend puzzle data');
    }

    return {
        puzzle_number: game.puzzleNumber || result.puzzle_number,
        date: result.date,
        words: game.words.map(item => item.word),
        grid: game.grid,
        rows: game.rows,
        cols: game.cols,
        word_cells: game.words,
    };
}

async function uploadPuzzleData(puzzleData) {
    if (!API_KEY) {
        console.log('No API key provided, skipping data upload');
        console.log('Puzzle data:', JSON.stringify(puzzleData, null, 2));
        return puzzleData;
    }

    console.log('Sending puzzle data to Worker API...');
    const saveResult = await fetchJsonWithRetry(`${WORKER_URL}/api/puzzle`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY,
        },
        body: JSON.stringify(puzzleData),
    }, {
        label: 'worker upload',
        attempts: 3,
        timeoutMs: 30000,
    });

    if (!saveResult.success) {
        throw new Error(`Worker API did not accept puzzle data: ${JSON.stringify(saveResult)}`);
    }

    const latestResult = await fetchJsonWithRetry(`${WORKER_URL}/api/puzzle/latest`, {}, {
        label: 'worker latest verification',
        attempts: 3,
        timeoutMs: 15000,
    });

    if (!latestResult.success || latestResult.data?.puzzle_number !== puzzleData.puzzle_number) {
        throw new Error(
            `Worker verification failed. Expected latest puzzle #${puzzleData.puzzle_number}, got #${latestResult.data?.puzzle_number ?? 'unknown'}`,
        );
    }

    console.log(`Puzzle data saved successfully for puzzle #${puzzleData.puzzle_number}`);
    return puzzleData;
}

async function scrapeLatestPuzzle() {
    console.log('Starting Wend puzzle updater...');

    try {
        console.log(`Fetching upstream JSON from ${SOURCE_URL}...`);
        const upstreamPayload = await fetchJsonWithRetry(SOURCE_URL, {}, {
            label: 'upstream Wend API',
            attempts: 3,
            timeoutMs: 30000,
        });

        const puzzleData = normalizePuzzleData(upstreamPayload);
        console.log(`Found puzzle #${puzzleData.puzzle_number}: ${puzzleData.words.join(', ')}`);
        await uploadPuzzleData(puzzleData);
        return puzzleData;
    } catch (error) {
        console.error('Scraping failed:', error);
        throw error;
    }
}

// Run the scraper
scrapeLatestPuzzle()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
