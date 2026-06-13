/**
 * Wend Puzzle Scraper
 * Uses Playwright to scrape the latest Wend puzzle from thewordfinder.com
 * and sends the data to the Cloudflare Worker API
 */

const { chromium } = require('playwright');

const WORKER_URL = process.env.WORKER_URL || 'https://wend-api-worker.wendapi.workers.dev';
const API_KEY = process.env.WORKER_API_KEY;

async function scrapeLatestPuzzle() {
    console.log('Starting Wend puzzle scraper...');
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    const page = await context.newPage();
    
    try {
        // Navigate to the wordfinder Wend hints page
        console.log('Navigating to thewordfinder.com...');
        await page.goto('https://www.thewordfinder.com/linkedin-games-hub/wend-hints', {
            waitUntil: 'networkidle',
            timeout: 45000
        });
        
        await page.waitForTimeout(3000);
        
        // Extract game data from the page's embedded JSON
        console.log('Extracting puzzle data...');
        const gameDataText = await page.evaluate(() => {
            const scripts = document.querySelectorAll('script');
            for (const s of scripts) {
                const text = s.textContent;
                if (text && text.includes('firstGameDate') && text.includes('wend')) {
                    return text;
                }
            }
            return null;
        });
        
        if (!gameDataText) {
            throw new Error('No game data found on the page');
        }
        
        // Parse the JSON data
        const startIndex = gameDataText.indexOf('{');
        let jsonStr = gameDataText.substring(startIndex);
        
        // Find matching closing brace
        let depth = 0;
        let endIndex = 0;
        for (let i = 0; i < jsonStr.length; i++) {
            if (jsonStr[i] === '{') depth++;
            else if (jsonStr[i] === '}') {
                depth--;
                if (depth === 0) {
                    endIndex = i + 1;
                    break;
                }
            }
        }
        
        const parsed = JSON.parse(jsonStr.substring(0, endIndex));
        
        // Navigate to the game data
        let result = null;
        for (const key of Object.keys(parsed)) {
            if (parsed[key]?.b?.result) {
                result = parsed[key].b.result;
                break;
            }
        }
        
        if (!result) {
            throw new Error('Could not find puzzle result in the data');
        }
        
        const game = result.game;
        const puzzleData = {
            puzzle_number: game.puzzleNumber || result.puzzle_number,
            date: result.date,
            words: game.words.map(w => w.word),
            grid: game.grid,
            rows: game.rows,
            cols: game.cols,
            word_cells: game.words
        };
        
        console.log(`Found puzzle #${puzzleData.puzzle_number}: ${puzzleData.words.join(', ')}`);
        
        // Send to Worker API
        if (API_KEY) {
            console.log('Sending puzzle data to Worker API...');
            const response = await fetch(`${WORKER_URL}/api/puzzle`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': API_KEY
                },
                body: JSON.stringify(puzzleData)
            });
            
            const result = await response.json();
            if (result.success) {
                console.log('Puzzle data saved successfully!');
            } else {
                console.error('Failed to save puzzle data:', result);
            }
        } else {
            console.log('No API key provided, skipping data upload');
            console.log('Puzzle data:', JSON.stringify(puzzleData, null, 2));
        }
        
        return puzzleData;
        
    } catch (error) {
        console.error('Scraping failed:', error);
        throw error;
    } finally {
        await browser.close();
    }
}

// Run the scraper
scrapeLatestPuzzle()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
