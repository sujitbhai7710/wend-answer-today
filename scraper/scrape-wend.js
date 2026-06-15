/**
 * Wend Puzzle Updater — Puppeteer-Core Edition
 * Scrapes the latest Wend puzzle directly from LinkedIn using puppeteer-core
 * with the system Google Chrome (pre-installed on GitHub Actions runners).
 * No browser download needed — saves ~150MB and 30-90 seconds per run.
 *
 * Falls back to the third-party Word Finder API if Puppeteer fails.
 */

const WORKER_URL = process.env.WORKER_URL || 'https://wend-api-worker.wendapi.workers.dev';
const API_KEY = process.env.WORKER_API_KEY;
const FALLBACK_URL = process.env.WEND_SOURCE_URL || 'https://api.thewordfinder.com/wend/latest';
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome-stable';

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

// ─── LinkedIn Puppeteer-Core Scraper ────────────────────────────────────────

/**
 * Parse the RSC (React Server Component) response body from LinkedIn
 * and extract the Wend puzzle data.
 */
function parseLinkedInRSC(rscBody) {
    // 1. Extract puzzleLetters array
    const lettersMatch = rscBody.match(
        /"puzzleLetters"\s*:\s*\[([^\]]*)\]/
    );
    if (!lettersMatch) {
        throw new Error('Could not find puzzleLetters in RSC response');
    }
    const puzzleLetters = JSON.parse(`[${lettersMatch[1]}]`);

    // 2. Extract solutionWords with sequencingIndex arrays
    const solutionMatch = rscBody.match(
        /"solutionWords"\s*:\s*\[([\s\S]*?)\](?=\s*[,}]\s*"(?:presetWordsIndexes|gridRows|presets)")/
    );
    if (!solutionMatch) {
        throw new Error('Could not find solutionWords in RSC response');
    }

    // Parse each WendWord's sequencingIndex
    const wordRegex = /"sequencingIndex"\s*:\s*\[([^\]]*)\]/g;
    const solutionWords = [];
    let wordMatch;
    while ((wordMatch = wordRegex.exec(solutionMatch[1])) !== null) {
        solutionWords.push(JSON.parse(`[${wordMatch[1]}]`));
    }

    if (solutionWords.length === 0) {
        throw new Error('Could not parse any solutionWords from RSC response');
    }

    // 3. Extract grid dimensions
    const gridRowsMatch = rscBody.match(/"gridRows"\s*:\s*(\d+)/);
    const gridColsMatch = rscBody.match(/"gridCols"\s*:\s*(\d+)/);
    const gridRows = gridRowsMatch ? parseInt(gridRowsMatch[1]) : 5;
    const gridCols = gridColsMatch ? parseInt(gridColsMatch[1]) : 5;

    // 4. Extract puzzle number
    const editionMatch = rscBody.match(
        /"todaysGameEditionText"\s*:\s*"(\d+)"/
    );
    const puzzleNumber = editionMatch
        ? parseInt(editionMatch[1])
        : null;

    // 5. Build the date (today in UTC)
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0] + 'T00:00:00.000Z';

    // 6. Build words list from puzzleLetters + sequencingIndex
    const words = solutionWords.map(indices =>
        indices.map(idx => puzzleLetters[idx]).join('')
    );

    // 7. Build grid in the format the worker/build script expects
    const grid = [];
    for (let r = 0; r < gridRows; r++) {
        const row = [];
        for (let c = 0; c < gridCols; c++) {
            const idx = r * gridCols + c;
            const letter = puzzleLetters[idx] || '';
            row.push({
                col: c,
                row: r,
                letter: letter,
                isBlocked: letter === '',
            });
        }
        grid.push(row);
    }

    // 8. Build word_cells
    const word_cells = solutionWords.map((indices, wordIdx) => {
        const cells = indices.map(idx => ({
            col: idx % gridCols,
            row: Math.floor(idx / gridCols),
        }));
        return {
            word: words[wordIdx],
            cells: cells,
        };
    });

    return {
        puzzle_number: puzzleNumber,
        date: dateStr,
        words: words,
        grid: grid,
        rows: gridRows,
        cols: gridCols,
        word_cells: word_cells,
    };
}

async function scrapeFromLinkedIn() {
    console.log('Scraping Wend puzzle directly from LinkedIn via puppeteer-core...');
    console.log(`Using Chrome at: ${CHROME_PATH}`);

    const puppeteer = require('puppeteer-core');

    const browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-extensions',
            '--no-first-run',
            '--no-default-browser-check',
        ],
    });

    let puzzleData = null;

    try {
        const page = await browser.newPage();

        // Set viewport and user agent
        await page.setViewport({ width: 1280, height: 900 });
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
        );

        // Capture the RSC response when "Start game" is clicked
        let rscResponseBody = null;

        page.on('response', async (response) => {
            const url = response.url();
            if (
                url.includes('games/wend') &&
                url.includes('skipStartScreen')
            ) {
                try {
                    rscResponseBody = await response.text();
                    console.log(
                        `Captured RSC response (${rscResponseBody.length} chars) from ${url}`
                    );
                } catch (e) {
                    console.warn('Could not read RSC response body:', e.message);
                }
            }
        });

        // Navigate to LinkedIn Wend start screen
        console.log('Navigating to LinkedIn Wend...');
        await page.goto('https://www.linkedin.com/games/wend/', {
            waitUntil: 'networkidle2',
            timeout: 30000,
        });
        await delay(3000);

        // Click "Start game"
        console.log('Clicking "Start game"...');
        const startBtn = await page.waitForSelector('text/Start game', { timeout: 10000 });
        if (startBtn) {
            await startBtn.click();
            console.log('Clicked Start game button');
        } else {
            throw new Error('Could not find "Start game" button on the page');
        }

        // Wait for the game board to load and RSC response to arrive
        await delay(10000);

        if (!rscResponseBody) {
            throw new Error(
                'Did not capture the RSC response with puzzle data from LinkedIn'
            );
        }

        // Parse the RSC response
        puzzleData = parseLinkedInRSC(rscResponseBody);
        console.log(
            `Successfully parsed LinkedIn puzzle #${puzzleData.puzzle_number}: ${puzzleData.words.join(', ')}`
        );
    } catch (error) {
        console.error('LinkedIn Puppeteer scraping failed:', error.message);
        throw error;
    } finally {
        await browser.close();
    }

    return puzzleData;
}

// ─── Fallback: Third-party Word Finder API ──────────────────────────────────

function normalizeFallbackData(payload) {
    const result = payload?.result;
    const game = result?.game;

    if (!result || !game || !Array.isArray(game.words) || !Array.isArray(game.grid)) {
        throw new Error('Fallback API response is missing expected Wend puzzle data');
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

async function scrapeFromFallback() {
    console.log(`Falling back to third-party API: ${FALLBACK_URL}`);
    const upstreamPayload = await fetchJsonWithRetry(FALLBACK_URL, {}, {
        label: 'fallback Wend API',
        attempts: 3,
        timeoutMs: 30000,
    });
    return normalizeFallbackData(upstreamPayload);
}

// ─── Upload to Worker API ───────────────────────────────────────────────────

async function uploadPuzzleData(puzzleData) {
    if (!API_KEY) {
        console.log('No API key provided, skipping data upload');
        console.log('Puzzle data:', JSON.stringify(puzzleData, null, 2));
        return puzzleData;
    }

    console.log('Sending puzzle data to Worker API...');
    const saveResult = await fetchJsonWithRetry(
        `${WORKER_URL}/api/puzzle`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': API_KEY,
            },
            body: JSON.stringify(puzzleData),
        },
        {
            label: 'worker upload',
            attempts: 3,
            timeoutMs: 30000,
        }
    );

    if (!saveResult.success) {
        throw new Error(
            `Worker API did not accept puzzle data: ${JSON.stringify(saveResult)}`
        );
    }

    // Verify the upload
    const latestResult = await fetchJsonWithRetry(
        `${WORKER_URL}/api/puzzle/latest`,
        {},
        {
            label: 'worker latest verification',
            attempts: 3,
            timeoutMs: 15000,
        }
    );

    if (
        !latestResult.success ||
        latestResult.data?.puzzle_number !== puzzleData.puzzle_number
    ) {
        throw new Error(
            `Worker verification failed. Expected latest puzzle #${puzzleData.puzzle_number}, got #${latestResult.data?.puzzle_number ?? 'unknown'}`
        );
    }

    console.log(
        `Puzzle data saved successfully for puzzle #${puzzleData.puzzle_number}`
    );
    return puzzleData;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
    console.log('Starting Wend puzzle updater (puppeteer-core + LinkedIn direct)...');
    console.log(`Chrome path: ${CHROME_PATH}`);

    let puzzleData;

    try {
        // Primary: Scrape directly from LinkedIn
        puzzleData = await scrapeFromLinkedIn();
    } catch (linkedinError) {
        console.warn(
            `\nLinkedIn scraping failed: ${linkedinError.message}`
        );
        console.warn('Attempting fallback to third-party API...');

        try {
            // Fallback: Use the third-party Word Finder API
            puzzleData = await scrapeFromFallback();
        } catch (fallbackError) {
            console.error('Fallback scraping also failed:', fallbackError.message);
            throw new Error(
                `Both LinkedIn and fallback scrapers failed. LinkedIn: ${linkedinError.message} | Fallback: ${fallbackError.message}`
            );
        }
    }

    console.log(
        `Puzzle #${puzzleData.puzzle_number}: ${puzzleData.words.join(', ')}`
    );
    await uploadPuzzleData(puzzleData);
    return puzzleData;
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
