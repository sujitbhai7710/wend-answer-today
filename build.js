/**
 * Build script for Wend Answer Today
 * Fetches puzzle data from the Worker API and generates static HTML pages
 */

const fs = require('fs');
const path = require('path');

const WORKER_URL = process.env.WORKER_URL || 'https://wend-api-worker.wendapi.workers.dev';
const API_KEY = process.env.WORKER_API_KEY || '';

const WORD_COLORS = [
    { bg: '#4ade80', text: '#1f2937' },  // green
    { bg: '#a78bfa', text: '#ffffff' },  // purple
    { bg: '#fb923c', text: '#ffffff' },  // orange
    { bg: '#38bdf8', text: '#ffffff' },  // light blue
    { bg: '#f472b6', text: '#ffffff' },  // pink
    { bg: '#fbbf24', text: '#1f2937' },  // yellow
    { bg: '#2dd4bf', text: '#1f2937' },  // teal
    { bg: '#f87171', text: '#ffffff' },  // red
];

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatDateShort(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDirection(prevCell, currCell, nextCell) {
    const directions = [];
    if (prevCell) {
        const dr = currCell.row - prevCell.row;
        const dc = currCell.col - prevCell.col;
        if (dc > 0) directions.push('right');
        else if (dc < 0) directions.push('left');
        else if (dr > 0) directions.push('down');
        else if (dr < 0) directions.push('up');
    }
    if (nextCell) {
        const dr = nextCell.row - currCell.row;
        const dc = nextCell.col - currCell.col;
        if (dc > 0) directions.push('right');
        else if (dc < 0) directions.push('left');
        else if (dr > 0) directions.push('down');
        else if (dr < 0) directions.push('up');
    }
    // Return the direction TO the next cell (outgoing)
    if (nextCell) {
        const dr = nextCell.row - currCell.row;
        const dc = nextCell.col - currCell.col;
        if (dc > 0) return 'right';
        if (dc < 0) return 'left';
        if (dr > 0) return 'down';
        if (dr < 0) return 'up';
    }
    return '';
}

function generateGridCells(grid, rows, cols) {
    let html = '';
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = grid[r][c];
            if (cell.isBlocked) {
                html += `<div class="grid-cell blocked" data-row="${r}" data-col="${c}"></div>`;
            } else {
                html += `<div class="grid-cell active" data-row="${r}" data-col="${c}">${cell.letter}</div>`;
            }
        }
    }
    return html;
}

function generateSolvedGridCells(grid, wordCells, rows, cols) {
    // Build a map of cell positions to word index
    const cellWordMap = {};
    const cellDirectionMap = {};
    
    wordCells.forEach((word, wordIdx) => {
        word.cells.forEach((cell, cellIdx) => {
            const key = `${cell.col},${cell.row}`;
            // If a cell belongs to multiple words (intersection), keep the first assignment
            if (!(key in cellWordMap)) {
                cellWordMap[key] = wordIdx;
            }
            
            // Determine direction arrow
            const prevCell = cellIdx > 0 ? word.cells[cellIdx - 1] : null;
            const nextCell = cellIdx < word.cells.length - 1 ? word.cells[cellIdx + 1] : null;
            const dir = getDirection(prevCell, cell, nextCell);
            if (dir && !(key in cellDirectionMap)) {
                cellDirectionMap[key] = dir;
            }
        });
    });

    // Calculate animation delays
    // Each word gets a base offset, then cells within a word get sequential delays
    let totalDelay = 0;
    const cellDelayMap = {};
    
    wordCells.forEach((word, wordIdx) => {
        word.cells.forEach((cell, cellIdx) => {
            const key = `${cell.col},${cell.row}`;
            if (!(key in cellDelayMap)) {
                cellDelayMap[key] = totalDelay + cellIdx;
            }
        });
        totalDelay += word.cells.length + 2; // gap between words
    });

    let html = '';
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = grid[r][c];
            const key = `${c},${r}`;
            
            if (cell.isBlocked) {
                html += `<div class="grid-cell blocked" data-row="${r}" data-col="${c}"></div>`;
            } else if (key in cellWordMap) {
                const wordIdx = cellWordMap[key];
                const delay = cellDelayMap[key] || 0;
                const dir = cellDirectionMap[key] || '';
                const arrowHtml = dir ? `<span class="arrow arrow-${dir}">&#x25B6;</span>` : '';
                html += `<div class="grid-cell solved word-${wordIdx}" data-row="${r}" data-col="${c}" style="--cell-delay: ${delay}; animation-delay: ${delay * 0.08}s;">${cell.letter}${arrowHtml}</div>`;
            } else {
                html += `<div class="grid-cell active" data-row="${r}" data-col="${c}">${cell.letter}</div>`;
            }
        }
    }
    return html;
}

function generateWordChips(words) {
    return words.map((word, idx) => {
        const color = WORD_COLORS[idx % WORD_COLORS.length];
        return `<span class="word-chip" style="background: ${color.bg}; color: ${color.text};">
            <span class="check-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></span>
            ${word}
        </span>`;
    }).join('');
}

function generateWordListPlain(words) {
    return words.map(w => `<li>${w}</li>`).join('');
}

function generateWordListSolved(words) {
    return words.map((word, idx) => {
        const color = WORD_COLORS[idx % WORD_COLORS.length];
        return `<li class="word-color-${idx}" style="background: ${color.bg}; color: ${color.text}; animation-delay: ${(idx + 1) * 0.3}s;">
            <span class="check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="10" height="10"><polyline points="20 6 9 17 4 12"/></svg></span>
            ${word}
        </li>`;
    }).join('');
}

function generateHints(words, puzzleNumber) {
    const hints = [
        {
            num: 1,
            title: 'Start with Short Words',
            text: `Begin by scanning the grid for the shortest word (${words[0]}, ${words[0].length} letters). Short words are typically easier to spot and give you anchor points for finding longer words.`
        },
        {
            num: 2,
            title: 'Follow the Path',
            text: `Each word in Wend changes direction as it winds through the grid. Once you find the first letter of a word, trace adjacent cells to find the complete path. The word "${words[words.length - 1]}" (${words[words.length - 1].length} letters) is the longest — save it for last.`
        },
        {
            num: 3,
            title: 'Look for Intersections',
            text: `Words in Wend often share cells at intersection points. Finding one word can reveal letters that help you discover adjacent words. Use the already-revealed letters as stepping stones.`
        },
        {
            num: 4,
            title: 'Check Uncommon Letters',
            text: `Letters like Z, Q, X, and J are rare and can help you quickly identify where certain words begin or end. Scan the grid for these distinctive letters first.`
        }
    ];
    
    return hints.map(h => `
        <div class="hint-card">
            <div class="hint-number">${h.num}</div>
            <h3>${h.title}</h3>
            <p>${h.text}</p>
        </div>
    `).join('');
}

function generateRecentPuzzles(puzzles) {
    return puzzles.slice(0, 5).map(p => {
        const date = formatDate(p.date);
        const dateShort = formatDateShort(p.date);
        const wordsHtml = (Array.isArray(p.words) ? p.words : JSON.parse(p.words)).slice(0, 3).map(w => 
            `<span class="card-word">${w}</span>`
        ).join('');
        
        return `
            <a href="/archive.html#puzzle-${p.puzzle_number}" class="recent-card">
                <div class="card-header">
                    <span class="card-number">Puzzle #${p.puzzle_number}</span>
                    <span class="card-date">${dateShort}</span>
                </div>
                <div class="card-words">${wordsHtml}</div>
            </a>
        `;
    }).join('');
}

function generateSchema(puzzleData, allPuzzles) {
    const words = puzzleData.words;
    const date = formatDate(puzzleData.date);
    
    const schema = [
        {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "Wend Answer Today",
            "url": "https://wendanswertoday.online",
            "description": "Daily answers, explanations, and a full puzzle archive for the LinkedIn Wend word search game."
        },
        {
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "Wend Answer Today",
            "url": "https://wendanswertoday.online",
            "description": "Daily answers and hints for LinkedIn Wend. Updated every day with solutions and a full puzzle archive."
        },
        {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
                {
                    "@type": "Question",
                    "name": "What is LinkedIn Wend?",
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text": "LinkedIn Wend is a free daily word search game from LinkedIn. Each day, a new puzzle invites you to connect letters in a grid and uncover hidden words."
                    }
                },
                {
                    "@type": "Question",
                    "name": "What are today's Wend answers?",
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text": `Today's Wend puzzle #${puzzleData.puzzle_number} answers are: ${words.join(', ')}.`
                    }
                }
            ]
        },
        {
            "@context": "https://schema.org",
            "@type": "ItemList",
            "numberOfItems": allPuzzles.length,
            "itemListElement": allPuzzles.slice(0, 5).map((p, i) => ({
                "@type": "ListItem",
                "position": i + 1,
                "name": `LinkedIn Wend #${p.puzzle_number} — ${formatDateShort(p.date)}`,
                "url": `https://wendanswertoday.online/archive.html#puzzle-${p.puzzle_number}`
            }))
        }
    ];
    
    return JSON.stringify(schema);
}

async function buildSite() {
    console.log('Fetching puzzle data from Worker API...');
    
    // Fetch latest puzzle
    const latestResp = await fetch(`${WORKER_URL}/api/puzzle/latest`);
    const latestData = await latestResp.json();
    
    if (!latestData.success) {
        throw new Error('Failed to fetch latest puzzle: ' + JSON.stringify(latestData));
    }
    
    const puzzle = latestData.data;
    console.log(`Latest puzzle: #${puzzle.puzzle_number}, Date: ${puzzle.date}, Words: ${puzzle.words.join(', ')}`);
    
    // Fetch all puzzles for recent/archives
    const allResp = await fetch(`${WORKER_URL}/api/puzzles`);
    const allData = await allResp.json();
    const allPuzzles = allData.success ? allData.data : [puzzle];
    
    // Read template
    const templatePath = path.join(__dirname, 'src', 'index.html');
    let template = fs.readFileSync(templatePath, 'utf8');
    
    // Generate all replacement values
    const dateDisplay = formatDate(puzzle.date);
    const dateShort = formatDateShort(puzzle.date);
    const metaDescription = `LinkedIn Wend answer today - Updated with ${dateDisplay} answers, full word list, grid walkthrough, and archive access for puzzle #${puzzle.puzzle_number}.`;
    
    const replacements = {
        '{{META_DESCRIPTION}}': metaDescription,
        '{{SCHEMA_JSON}}': generateSchema(puzzle, allPuzzles),
        '{{PUZZLE_NUMBER}}': puzzle.puzzle_number,
        '{{DATE_DISPLAY}}': dateDisplay,
        '{{DATE_SHORT}}': dateShort,
        '{{WORD_COUNT}}': puzzle.words.length,
        '{{GRID_SIZE}}': `${puzzle.rows}x${puzzle.cols}`,
        '{{GRID_COLS}}': puzzle.cols,
        '{{GRID_ROWS}}': puzzle.rows,
        '{{WORD_CHIPS}}': generateWordChips(puzzle.words),
        '{{GRID_CELLS}}': generateGridCells(puzzle.grid, puzzle.rows, puzzle.cols),
        '{{GRID_CELLS_SOLVED}}': generateSolvedGridCells(puzzle.grid, puzzle.word_cells, puzzle.rows, puzzle.cols),
        '{{WORD_LIST_PLAIN}}': generateWordListPlain(puzzle.words),
        '{{WORD_LIST_SOLVED}}': generateWordListSolved(puzzle.words),
        '{{HINTS_CONTENT}}': generateHints(puzzle.words, puzzle.puzzle_number),
        '{{RECENT_PUZZLES}}': generateRecentPuzzles(allPuzzles),
    };
    
    // Apply replacements
    for (const [key, value] of Object.entries(replacements)) {
        template = template.split(key).join(value);
    }
    
    // Write the built index.html
    const outputDir = path.join(__dirname, 'dist');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(path.join(outputDir, 'index.html'), template);
    console.log('Built index.html');
    
    // Copy static assets
    copyDir(path.join(__dirname, 'src', 'css'), path.join(outputDir, 'css'));
    copyDir(path.join(__dirname, 'src', 'js'), path.join(outputDir, 'js'));
    copyDir(path.join(__dirname, 'src', 'images'), path.join(outputDir, 'images'));
    
    // Generate archive page
    await buildArchivePage(allPuzzles, outputDir);
    
    // Generate how-to-play page
    buildHowToPlayPage(outputDir);
    
    console.log('Build complete!');
}

async function buildArchivePage(allPuzzles, outputDir) {
    // Fetch full data for each puzzle
    const fullPuzzles = [];
    for (const p of allPuzzles) {
        try {
            const resp = await fetch(`${WORKER_URL}/api/puzzle/${p.puzzle_number}`);
            const data = await resp.json();
            if (data.success) fullPuzzles.push(data.data);
        } catch (e) {
            console.error(`Failed to fetch puzzle ${p.puzzle_number}:`, e);
        }
    }
    
    const archiveHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" type="image/svg+xml" href="/images/favicon.svg">
    <title>Wend Puzzle Archive - All Past Answers</title>
    <meta name="description" content="Complete archive of LinkedIn Wend puzzle answers. Browse all past puzzles with full solutions and word lists.">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/css/styles.css">
</head>
<body>
    <div class="page-wrapper">
        <header class="site-header">
            <div class="container">
                <a href="/" class="site-logo">
                    <span class="logo-icon">W</span>
                    <span class="logo-text">Wend Answers</span>
                </a>
                <nav class="nav-links">
                    <a href="/">Home</a>
                    <a href="/archive.html" class="active">Archive</a>
                    <a href="/how-to-play.html">How to Play</a>
                </nav>
                <button class="mobile-menu-btn" id="mobile-menu-btn" aria-label="Toggle menu">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                </button>
            </div>
        </header>
        
        <main class="page-content">
            <section style="padding: 3rem 0;">
                <div class="container">
                    <h1 class="section-title">Wend Puzzle Archive</h1>
                    <p class="section-desc">Browse all past LinkedIn Wend puzzles with complete answers and word lists.</p>
                    
                    <div class="archive-grid">
                        ${fullPuzzles.reverse().map(p => {
                            const gridCells = generateSolvedGridCells(p.grid, p.word_cells, p.rows, p.cols);
                            const wordList = p.words.map((w, i) => {
                                const color = WORD_COLORS[i % WORD_COLORS.length];
                                return `<span style="background:${color.bg};color:${color.text};padding:0.25rem 0.5rem;border-radius:9999px;font-size:0.75rem;font-weight:600;">${w}</span>`;
                            }).join(' ');
                            
                            return `
                                <div class="archive-card" id="puzzle-${p.puzzle_number}">
                                    <div class="card-title">
                                        <h3>Puzzle #${p.puzzle_number}</h3>
                                        <span class="puzzle-num">${formatDate(p.date)}</span>
                                    </div>
                                    <div class="mini-grid" style="grid-template-columns: repeat(${p.cols}, 1fr);">
                                        ${generateMiniGrid(p.grid, p.word_cells, p.rows, p.cols)}
                                    </div>
                                    <div class="words-preview">${wordList}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </section>
        </main>
        
        <footer class="site-footer">
            <div class="container">
                <div class="footer-bottom">
                    <p>&copy; 2026 Wend Answer Today. Not affiliated with LinkedIn.</p>
                </div>
            </div>
        </footer>
    </div>
    <script src="/js/app.js" defer></script>
</body>
</html>`;
    
    fs.writeFileSync(path.join(outputDir, 'archive.html'), archiveHtml);
    console.log('Built archive.html');
}

function generateMiniGrid(grid, wordCells, rows, cols) {
    const cellWordMap = {};
    wordCells.forEach((word, wordIdx) => {
        word.cells.forEach(cell => {
            const key = `${cell.col},${cell.row}`;
            if (!(key in cellWordMap)) cellWordMap[key] = wordIdx;
        });
    });
    
    let html = '';
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = grid[r][c];
            const key = `${c},${r}`;
            if (cell.isBlocked) {
                html += `<div class="mini-cell blocked"></div>`;
            } else if (key in cellWordMap) {
                const color = WORD_COLORS[cellWordMap[key] % WORD_COLORS.length];
                html += `<div class="mini-cell" style="background:${color.bg};color:${color.text};font-size:0.5rem;">${cell.letter}</div>`;
            } else {
                html += `<div class="mini-cell active">${cell.letter}</div>`;
            }
        }
    }
    return html;
}

function buildHowToPlayPage(outputDir) {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" type="image/svg+xml" href="/images/favicon.svg">
    <title>How to Play LinkedIn Wend - Rules & Tips</title>
    <meta name="description" content="Learn how to play LinkedIn Wend, the daily word search game. Complete rules, strategies, and tips to solve puzzles faster.">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/css/styles.css">
</head>
<body>
    <div class="page-wrapper">
        <header class="site-header">
            <div class="container">
                <a href="/" class="site-logo">
                    <span class="logo-icon">W</span>
                    <span class="logo-text">Wend Answers</span>
                </a>
                <nav class="nav-links">
                    <a href="/">Home</a>
                    <a href="/archive.html">Archive</a>
                    <a href="/how-to-play.html" class="active">How to Play</a>
                </nav>
                <button class="mobile-menu-btn" id="mobile-menu-btn" aria-label="Toggle menu">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                </button>
            </div>
        </header>
        
        <main class="page-content">
            <section style="padding: 3rem 0;">
                <div class="container">
                    <h1 class="section-title">How to Play LinkedIn Wend</h1>
                    <p class="section-desc">Wend is a word search puzzle where words wind through a letter grid. Here's everything you need to know to start solving puzzles like a pro.</p>
                    
                    <div class="steps-grid">
                        <div class="step-card">
                            <div class="step-num">1</div>
                            <h3>Understand the Grid</h3>
                            <p>Each Wend puzzle presents a grid of letters. Some cells may be blocked (grayed out). Your goal is to find all the hidden words that wind through the grid, changing direction as they go.</p>
                        </div>
                        <div class="step-card">
                            <div class="step-num">2</div>
                            <h3>Find the Words</h3>
                            <p>Words in Wend are connected paths of letters. Each word starts at one cell and moves to adjacent cells (horizontally or vertically). Unlike traditional word searches, words in Wend can turn corners mid-word.</p>
                        </div>
                        <div class="step-card">
                            <div class="step-num">3</div>
                            <h3>Follow the Winding Path</h3>
                            <p>The key challenge is that words change direction. A word might go right for two letters, then turn down for three more. The name "Wend" itself means to travel along a winding course — which is exactly what each word does.</p>
                        </div>
                        <div class="step-card">
                            <div class="step-num">4</div>
                            <h3>Use Intersections</h3>
                            <p>Words often share cells where they cross. Finding one word reveals letters at intersection points, making it easier to discover adjacent words. Start with short words and work your way up to the longer ones.</p>
                        </div>
                        <div class="step-card">
                            <div class="step-num">5</div>
                            <h3>Check Your Progress</h3>
                            <p>LinkedIn Wend shows you which words you've found and highlights the cells you've selected. If you're stuck, use the hint feature in the game — or check our daily answer page for the complete solution.</p>
                        </div>
                        <div class="step-card">
                            <div class="step-num">6</div>
                            <h3>Practice Daily</h3>
                            <p>Wend puzzles get easier with practice. Play every day to develop pattern recognition skills. Over time, you'll learn to spot word paths more quickly and solve puzzles in fewer moves.</p>
                        </div>
                    </div>
                    
                    <div style="margin-top: 3rem; text-align: center;">
                        <a href="/" style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.875rem 2rem;background:linear-gradient(135deg,#7c3aed,#8b5cf6);color:white;font-weight:700;font-size:1.0625rem;border-radius:9999px;text-decoration:none;box-shadow:0 4px 14px rgba(124,58,237,0.4);">View Today's Answer</a>
                    </div>
                </div>
            </section>
        </main>
        
        <footer class="site-footer">
            <div class="container">
                <div class="footer-bottom">
                    <p>&copy; 2026 Wend Answer Today. Not affiliated with LinkedIn.</p>
                </div>
            </div>
        </footer>
    </div>
    <script src="/js/app.js" defer></script>
</body>
</html>`;
    
    fs.writeFileSync(path.join(outputDir, 'how-to-play.html'), html);
    console.log('Built how-to-play.html');
}

function copyDir(src, dest) {
    if (!fs.existsSync(src)) return;
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// Run build
buildSite().catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
});
