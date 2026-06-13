/**
 * Build script for Wend Answer Today
 * Fetches puzzle data from the Worker API and generates static HTML pages
 * matching LinkedIn Wend game layout, CSS-only reveal, and animations
 */

const fs = require('fs');
const path = require('path');

const WORKER_URL = process.env.WORKER_URL || 'https://wend-api-worker.wendapi.workers.dev';
const API_KEY = process.env.WORKER_API_KEY || '';

// Word colors — EXACT match from thewordfinder.com Wend hints page
const WORD_COLORS = [
    '#E8572A',  // Orange-red
    '#D4449A',  // Pink
    '#4DBDBA',  // Teal
    '#98C21F',  // Green
    '#5B8DD9',  // Blue
];

// Lighter tints no longer needed — using CSS color-mix() instead
// (kept for backward compat with any remaining references)
const WORD_BG_COLORS = [
    '#FDE8DF',  // orange tint
    '#FADFE8',  // pink tint
    '#D5F0EE',  // teal tint
    '#EDF5D0',  // green tint
    '#D6E8F8',  // blue tint
];

function wordColor(idx) {
    return WORD_COLORS[idx % WORD_COLORS.length];
}

function wordBgColor(idx) {
    return WORD_BG_COLORS[idx % WORD_BG_COLORS.length];
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatDateShort(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDirection(prevCell, currCell, nextCell) {
    if (nextCell) {
        const dr = nextCell.row - currCell.row;
        const dc = nextCell.col - currCell.col;
        if (dc > 0) return 'right';
        if (dc < 0) return 'left';
        if (dr > 0) return 'down';
        if (dr < 0) return 'up';
    }
    if (prevCell) {
        const dr = currCell.row - prevCell.row;
        const dc = currCell.col - prevCell.col;
        if (dc > 0) return 'right';
        if (dc < 0) return 'left';
        if (dr > 0) return 'down';
        if (dr < 0) return 'up';
    }
    return '';
}

// =========================================================
// Grid cell generation
// =========================================================

// BEFORE reveal: letter cells with white background, matching thewordfinder.com
function generateGridCells(grid, rows, cols, wordCells) {
    // Build a map of which word color each cell belongs to (for --word-color on letter cells)
    const cellColorMap = {};
    if (wordCells) {
        wordCells.forEach((word, wordIdx) => {
            const color = wordColor(wordIdx);
            word.cells.forEach((cell) => {
                const key = `${cell.row},${cell.col}`;
                if (!(key in cellColorMap)) {
                    cellColorMap[key] = color;
                }
            });
        });
    }

    let html = '';
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = grid[r][c];
            if (cell.isBlocked) {
                // Blocked cells: add 3px solid #333 borders on sides facing letter cells
                const neighbors = [
                    { dr: -1, dc: 0, side: 'top' },
                    { dr: 1, dc: 0, side: 'bottom' },
                    { dc: -1, dr: 0, side: 'left' },
                    { dc: 1, dr: 0, side: 'right' },
                ];
                const borderParts = [];
                for (const n of neighbors) {
                    const nr = r + n.dr;
                    const nc = c + n.dc;
                    let isLetterCell = false;
                    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                        if (!grid[nr][nc].isBlocked) {
                            isLetterCell = true;
                        }
                    }
                    borderParts.push(`border-${n.side}: ${isLetterCell ? '3px solid #333' : '0'}`);
                }
                const borderStyle = borderParts.join('; ');

                html += `<div class="wend-cell wend-cell--blocked" style="${borderStyle}" data-row="${r}" data-col="${c}" aria-hidden="true"></div>`;
            } else {
                const key = `${r},${c}`;
                const wordColorStyle = cellColorMap[key] ? `--word-color:${cellColorMap[key]};` : '';
                html += `<button class="wend-cell wend-cell--letter" data-row="${r}" data-col="${c}" style="${wordColorStyle}" aria-label="${cell.letter} — hidden">
                    <span class="cell-letter cell-letter--hidden"> ${cell.letter} </span>
                </button>`;
            }
        }
    }
    return html;
}

// AFTER reveal: cells with colored backgrounds, tube connectors, circles, check badges
// EXACT match to thewordfinder.com structure
function generateSolvedGridCells(grid, wordCells, rows, cols) {
    // Build maps for cell word assignments
    const cellWordMap = {};
    const cellIsFirst = {};  // first letter of a word
    const cellIsLast = {};   // last letter of a word
    const cellConnectH = {}; // horizontal tube connections
    const cellConnectV = {}; // vertical tube connections
    const cellArrowDir = {}; // arrow direction: direction from prev cell to this cell

    wordCells.forEach((word, wordIdx) => {
        const color = wordColor(wordIdx);
        word.cells.forEach((cell, cellIdx) => {
            const key = `${cell.row},${cell.col}`;
            if (!(key in cellWordMap)) {
                cellWordMap[key] = { wordIdx, color };
            }
            if (cellIdx === 0 && !(key in cellIsFirst)) {
                cellIsFirst[key] = true;
            }
            if (cellIdx === word.cells.length - 1 && !(key in cellIsLast)) {
                cellIsLast[key] = true;
            }

            // Determine connections for tubes
            const prevCell = cellIdx > 0 ? word.cells[cellIdx - 1] : null;
            const nextCell = cellIdx < word.cells.length - 1 ? word.cells[cellIdx + 1] : null;

            if (!(key in cellConnectH)) cellConnectH[key] = { left: false, right: false };
            if (!(key in cellConnectV)) cellConnectV[key] = { top: false, bottom: false };

            if (prevCell) {
                const dc = cell.col - prevCell.col;
                const dr = cell.row - prevCell.row;
                // Tube must extend toward the previous cell
                if (dc > 0) cellConnectH[key].left = true;   // prev is to the left
                if (dc < 0) cellConnectH[key].right = true;  // prev is to the right
                if (dr > 0) cellConnectV[key].top = true;    // prev is above
                if (dr < 0) cellConnectV[key].bottom = true; // prev is below

                // Arrow direction: direction from prev cell to this cell (matches TWF)
                // Arrow is positioned on the side where the prev cell is and points
                // in the direction of movement (prev → current)
                if (!(key in cellArrowDir)) {
                    if (dc > 0) cellArrowDir[key] = 'right';  // moved right to reach this cell
                    else if (dc < 0) cellArrowDir[key] = 'left';  // moved left to reach this cell
                    else if (dr > 0) cellArrowDir[key] = 'down';  // moved down to reach this cell
                    else if (dr < 0) cellArrowDir[key] = 'up';    // moved up to reach this cell
                }
            }
            if (nextCell) {
                const dc = nextCell.col - cell.col;
                const dr = nextCell.row - cell.row;
                // Tube must extend toward the next cell
                if (dc > 0) cellConnectH[key].right = true;  // next is to the right
                if (dc < 0) cellConnectH[key].left = true;   // next is to the left
                if (dr > 0) cellConnectV[key].bottom = true; // next is below
                if (dr < 0) cellConnectV[key].top = true;    // next is above
            }
        });
    });

    // Calculate animation delays - word by word
    let totalDelay = 0;
    const cellDelayMap = {};

    wordCells.forEach((word, wordIdx) => {
        word.cells.forEach((cell, cellIdx) => {
            const key = `${cell.row},${cell.col}`;
            if (!(key in cellDelayMap)) {
                cellDelayMap[key] = totalDelay + cellIdx;
            }
        });
        totalDelay += word.cells.length + 2;
    });

    // Helper: convert hex color to rgb() string for inline styles
    function hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgb(${r}, ${g}, ${b})`;
    }

    // Chevron SVG for arrows (EXACT match from thewordfinder.com)
    const chevronSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

    let html = '';
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = grid[r][c];
            const key = `${r},${c}`;

            if (cell.isBlocked) {
                // Blocked cells: add 3px solid #333 borders on sides facing letter cells
                let borderStyle = '';
                // Check each neighbor - add border on side facing a non-blocked cell
                const neighbors = [
                    { dr: -1, dc: 0, side: 'top' },
                    { dr: 1, dc: 0, side: 'bottom' },
                    { dc: -1, dr: 0, side: 'left' },
                    { dc: 1, dr: 0, side: 'right' },
                ];
                const borderParts = [];
                for (const n of neighbors) {
                    const nr = r + n.dr;
                    const nc = c + n.dc;
                    let isLetterCell = false;
                    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                        if (!grid[nr][nc].isBlocked) {
                            isLetterCell = true;
                        }
                    }
                    borderParts.push(`border-${n.side}: ${isLetterCell ? '3px solid #333' : '0'}`);
                }
                borderStyle = borderParts.join('; ');

                html += `<div class="wend-cell wend-cell--blocked" style="${borderStyle}" data-row="${r}" data-col="${c}" aria-hidden="true"></div>`;
            } else if (key in cellWordMap) {
                const { wordIdx, color } = cellWordMap[key];
                const delay = cellDelayMap[key] || 0;
                const rgbColor = hexToRgb(color);

                let inner = '';

                // Tube connectors (EXACT match from TWF: 22.5% positioning, border-radius)
                const hConn = cellConnectH[key];
                const vConn = cellConnectV[key];

                if (hConn && (hConn.left || hConn.right)) {
                    // left: tube extends from left edge (0px) or starts at center (22.5%)
                    // right: tube extends to right edge (0px) or ends at center (22.5%)
                    const leftVal = hConn.left ? '0px' : '22.5%';
                    const rightVal = hConn.right ? '0px' : '22.5%';

                    // Border-radius: rounded on the end that terminates at center
                    // 4 values: top-left top-right bottom-right bottom-left
                    let borderRadius;
                    if (hConn.left && hConn.right) {
                        borderRadius = '0px'; // passes through, no rounding
                    } else if (hConn.left && !hConn.right) {
                        // Tube goes from left to center: round on right side
                        borderRadius = '0px 14px 14px 0px';
                    } else if (!hConn.left && hConn.right) {
                        // Tube goes from center to right: round on left side
                        borderRadius = '14px 0px 0px 14px';
                    } else {
                        borderRadius = '0px';
                    }

                    inner += `<span class="cell-tube cell-tube-h" style="left:${leftVal};right:${rightVal};border-radius:${borderRadius};background:${rgbColor};"></span>`;
                }
                if (vConn && (vConn.top || vConn.bottom)) {
                    const topVal = vConn.top ? '0px' : '22.5%';
                    const bottomVal = vConn.bottom ? '0px' : '22.5%';

                    let borderRadius;
                    if (vConn.top && vConn.bottom) {
                        borderRadius = '0px'; // passes through, no rounding
                    } else if (vConn.top && !vConn.bottom) {
                        // Tube goes from top to center: round on bottom side
                        borderRadius = '0px 0px 14px 14px';
                    } else if (!vConn.top && vConn.bottom) {
                        // Tube goes from center to bottom: round on top side
                        borderRadius = '14px 14px 0px 0px';
                    } else {
                        borderRadius = '0px';
                    }

                    inner += `<span class="cell-tube cell-tube-v" style="top:${topVal};bottom:${bottomVal};border-radius:${borderRadius};background:${rgbColor};"></span>`;
                }

                // Circle at word START (first letter) — EXACT match from TWF
                if (cellIsFirst[key]) {
                    inner += `<span class="cell-circle" style="background:${rgbColor};"></span>`;
                }
                // Check badge at word END (last letter)
                if (cellIsLast[key]) {
                    inner += `<span class="cell-check-badge" style="background:${color};">&#10003;</span>`;
                }

                // Letter text (z-index:4, above tubes)
                inner += `<span class="cell-letter">${cell.letter}</span>`;

                // Direction arrows on non-first cells — shows direction from prev to this cell (EXACT match from TWF)
                if (cellArrowDir[key] && !cellIsFirst[key]) {
                    inner += `<span class="cell-arrow cell-arrow--${cellArrowDir[key]}">${chevronSvg}</span>`;
                }

                html += `<div class="wend-cell wend-cell--revealed wend-cell--pulse" data-row="${r}" data-col="${c}" style="--word-color:${color};--cell-delay:${delay};" aria-label="${cell.letter} — revealed">${inner}</div>`;
            } else {
                html += `<div class="wend-cell wend-cell--letter" data-row="${r}" data-col="${c}">
                    <span class="cell-letter">${cell.letter}</span>
                </div>`;
            }
        }
    }
    return html;
}

// =========================================================
// Word cards
// =========================================================

// BEFORE reveal: gray CIRCLE bubbles — matching thewordfinder.com exactly (no arrows)
function generateWordCardsBefore(words, wordCells) {
    return words.map((word, idx) => {
        const color = wordColor(idx);
        
        let bubbles = '';
        for (let i = 0; i < word.length; i++) {
            bubbles += `<div class="letter-bubble letter-bubble--hidden"></div>`;
        }

        return `<div class="word-blank" style="--word-color:${color};">
            <div class="letter-row">${bubbles}</div>
            <div class="word-actions">
                <span class="btn-reveal-letter" style="--word-color:${color};">Reveal Letter</span>
                <span class="btn-reveal-word" style="--word-color:${color};">Reveal Word</span>
            </div>
        </div>`;
    }).join('');
}

// AFTER reveal: colored CIRCLE bubbles with dark text — matching thewordfinder.com exactly
function generateWordCardsAfter(words, wordCells) {
    return words.map((word, idx) => {
        const color = wordColor(idx);
        
        let bubbles = '';
        for (let li = 0; li < word.length; li++) {
            const letter = word[li];
            bubbles += `<div class="letter-bubble letter-bubble--revealed" style="background:${color};--bubble-delay:${li};">
                <span class="bubble-letter">${letter}</span>
            </div>`;
        }

        return `<div class="word-blank word-blank--revealed" style="--word-color:${color};--card-delay:${idx};">
            <div class="letter-row">${bubbles}</div>
            <div class="revealed-label" style="color:${color};"><strong>${word}</strong></div>
        </div>`;
    }).join('');
}

// Word chips for the "Wend #N Words" section
function generateWordChips(words) {
    return words.map((word, idx) => {
        const color = wordColor(idx);
        return `<span class="word-chip" style="background:${color};color:#fff;--chip-delay:${(idx + 1) * 0.15}s;">
            <span class="chip-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></span>
            ${word}
        </span>`;
    }).join('');
}

// Simple lightness check for text color on chips
function isLightColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5;
}

// =========================================================
// Puzzle picker buttons
// =========================================================

function generatePuzzlePickerButtons(puzzleNumber, allPuzzles) {
    // Show buttons for the latest 4 puzzles, with the current one active
    const recentPuzzles = allPuzzles.slice(0, 4);
    return recentPuzzles.map((p, idx) => {
        const isActive = p.puzzle_number === puzzleNumber;
        return `<button class="puzzle-picker-btn${isActive ? ' active' : ''}" data-puzzle-id="puzzle-${p.puzzle_number}">#${p.puzzle_number}</button>`;
    }).join('');
}

// =========================================================
// Hints
// =========================================================

function generateHints(words, puzzleNumber) {
    const hints = [
        {
            num: 1,
            title: 'Start with Short Words',
            text: `Begin by scanning the grid for the shortest word (${words[0].length} letters). Short words are typically easier to spot and give you anchor points for finding longer words.`
        },
        {
            num: 2,
            title: 'Follow the Path',
            text: `Each word in Wend changes direction as it winds through the grid. Once you find the first letter of a word, trace adjacent cells to find the complete path. The longest word has ${words[words.length - 1].length} letters — save it for last.`
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
            <div>
                <h3>${h.title}</h3>
                <p>${h.text}</p>
            </div>
        </div>
    `).join('');
}

// =========================================================
// Recent puzzles
// =========================================================

function generateRecentPuzzles(puzzles) {
    // Skip the first (latest) puzzle to avoid spoiling today's answer on the homepage
    // Show puzzles #2 onwards (older puzzles only)
    return puzzles.slice(1, 7).map(p => {
        const dateShort = formatDateShort(p.date);
        const wordsArr = Array.isArray(p.words) ? p.words : JSON.parse(p.words);
        const wordsHtml = wordsArr.slice(0, 3).map(w =>
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

// =========================================================
// Schema
// =========================================================

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

// =========================================================
// Main Build
// =========================================================

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
        '{{GRID_COLS}}': puzzle.cols,
        '{{GRID_ROWS}}': puzzle.rows,
        '{{WORD_CHIPS}}': generateWordChips(puzzle.words),
        '{{GRID_CELLS}}': generateGridCells(puzzle.grid, puzzle.rows, puzzle.cols, puzzle.word_cells),
        '{{GRID_CELLS_SOLVED}}': generateSolvedGridCells(puzzle.grid, puzzle.word_cells, puzzle.rows, puzzle.cols),
        '{{WORD_CARDS_BEFORE}}': generateWordCardsBefore(puzzle.words, puzzle.word_cells),
        '{{WORD_CARDS_AFTER}}': generateWordCardsAfter(puzzle.words, puzzle.word_cells),
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

// =========================================================
// Archive Page
// =========================================================

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

    // Build puzzle data for calendar JS
    const calendarPuzzles = fullPuzzles.map(p => ({
        puzzle_number: p.puzzle_number,
        date: p.date,
        words: p.words,
        rows: p.rows,
        cols: p.cols,
        grid: p.grid,
        word_cells: p.word_cells
    }));

    // Generate puzzle detail HTML for each puzzle (shown by default, with reveal toggle)
    const puzzleDetailsHtml = fullPuzzles.map(p => {
        const gridBefore = generateGridCells(p.grid, p.rows, p.cols, p.word_cells);
        const gridAfter = generateSolvedGridCells(p.grid, p.word_cells, p.rows, p.cols);
        const wordsBefore = generateWordCardsBefore(p.words, p.word_cells);
        const wordsAfter = generateWordCardsAfter(p.words, p.word_cells);
        const wordChips = generateWordChips(p.words);
        const dateDisplay = formatDate(p.date);

        return `
        <div class="archive-puzzle-item" id="archive-puzzle-${p.puzzle_number}" data-puzzle-number="${p.puzzle_number}" style="display:none;">
            <input type="checkbox" id="archive-reveal-${p.puzzle_number}" class="archive-reveal-checkbox">
            <div class="archive-puzzle-header">
                <h2>Wend #${p.puzzle_number}</h2>
                <span class="puzzle-date">${dateDisplay}</span>
            </div>
            <div class="archive-layout">
                <div class="game-board-col">
                    <div class="archive-grid-before">
                        <div class="wend-board-wrapper" style="grid-template-columns: repeat(${p.cols}, 1fr); grid-template-rows: repeat(${p.rows}, 1fr);">
                            ${gridBefore}
                        </div>
                    </div>
                    <div class="archive-grid-after">
                        <div class="wend-board-wrapper wend-board-solved" style="grid-template-columns: repeat(${p.cols}, 1fr); grid-template-rows: repeat(${p.rows}, 1fr);">
                            ${gridAfter}
                        </div>
                    </div>
                    <p class="board-instruction archive-instruction-before"><b>Click any letter</b> to reveal where it belongs within its word.</p>
                    <p class="board-instruction revealed-text archive-instruction-after">All words revealed!</p>
                </div>
                <div class="game-words-col">
                    <div class="progress-section">
                        <div class="progress-label">Words found: <span class="progress-count" data-total="${p.words.length}">0 / ${p.words.length}</span></div>
                        <div class="progress-bar"><div class="progress-fill" style="width:0%;"></div></div>
                    </div>
                    <div class="archive-words-before">
                        <div class="words-list">${wordsBefore}</div>
                    </div>
                    <div class="archive-words-after">
                        <div class="words-list words-list-revealed">${wordsAfter}</div>
                        <div class="wend-words-label">
                            <h3>Wend #${p.puzzle_number} Words</h3>
                            <div class="wend-words-summary">${wordChips}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="archive-reveal-container">
                <label for="archive-reveal-${p.puzzle_number}" class="archive-reveal-btn">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    <span class="archive-reveal-show">Reveal all</span>
                    <span class="archive-reveal-hide">Clear all</span>
                </label>
            </div>
        </div>`;
    }).join('');

    // Archive reveal CSS (per puzzle)
    const archiveRevealCSS = fullPuzzles.map(p => {
        return `
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-layout .archive-grid-before { display: none; }
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-layout .archive-grid-after { display: block; animation: revealPuzzle 0.6s ease-out; }
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-layout .archive-grid-after .wend-cell--revealed { animation: cellPop 0.28s ease backwards; animation-delay: calc(var(--cell-delay, 0) * 0.06s); }
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-layout .archive-words-before { display: none; }
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-layout .archive-words-after { display: block; }
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-layout .wend-words-label { display: block; }
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-layout .progress-fill { width: 100% !important; }
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-layout .archive-instruction-before { display: none; }
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-layout .archive-instruction-after { display: block; }
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-layout .word-blank--revealed { animation: wordSlideDown 0.4s ease backwards; animation-delay: calc(var(--card-delay, 0) * 0.12s); }
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-layout .letter-bubble--revealed { animation: bubbleBounce 0.3s ease backwards; animation-delay: calc(var(--bubble-delay, 0) * 0.08s); }
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-reveal-container .archive-reveal-btn { background: #fff; border-color: var(--clr-grey-900); color: var(--clr-grey-900); }
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-reveal-container .archive-reveal-show { display: none; }
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-reveal-container .archive-reveal-hide { display: inline; }`;
    }).join('\n');

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
    <style>
        ${archiveRevealCSS}
    </style>
</head>
<body>
    <div class="page-wrapper">
        <header class="site-header">
            <div class="container header-inner">
                <a href="/" class="site-logo">
                    <span class="logo-icon">W</span>
                    <span class="logo-text">Wend Answers</span>
                </a>
                <nav class="nav-links">
                    <a href="/">Home</a>
                    <a href="/archive.html" class="active">Archive</a>
                    <a href="/how-to-play.html">How to Play</a>
                </nav>
                <button class="mobile-menu-btn" id="mobile-menu-btn" aria-label="Toggle menu" aria-expanded="false">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
                </button>
            </div>
            <div class="mobile-menu" id="mobile-menu" role="navigation" aria-label="Mobile navigation">
                <a href="/">Home</a>
                <a href="/archive.html" class="active">Archive</a>
                <a href="/how-to-play.html">How to Play</a>
            </div>
        </header>

        <main class="page-content">
            <div class="archive-header">
                <div class="container">
                    <h1>Wend Puzzle Archive</h1>
                    <p>Browse all past LinkedIn Wend puzzles with complete answers and word lists.</p>
                </div>
            </div>

            <!-- Calendar Section -->
            <section class="calendar-section">
                <div class="container">
                    <div class="calendar-wrapper">
                        <div class="calendar-nav">
                            <button class="calendar-prev" aria-label="Previous month">&#8592;</button>
                            <h3 class="calendar-month-title"></h3>
                            <button class="calendar-next" aria-label="Next month">&#8594;</button>
                        </div>
                        <div class="calendar-weekdays">
                            <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
                        </div>
                        <div class="calendar-days" data-puzzles='${JSON.stringify(calendarPuzzles).replace(/'/g, "&#39;")}'>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Puzzle Detail Section (shown when calendar date clicked) -->
            <section class="archive-puzzle-section">
                <div class="container">
                    <span class="back-to-calendar">&#8592; Back to Calendar</span>
                    <div class="archive-puzzle-detail">
                        <div class="archive-puzzle-detail-content">
                            ${puzzleDetailsHtml}
                        </div>
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

// =========================================================
// How to Play Page
// =========================================================

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
            <div class="container header-inner">
                <a href="/" class="site-logo">
                    <span class="logo-icon">W</span>
                    <span class="logo-text">Wend Answers</span>
                </a>
                <nav class="nav-links">
                    <a href="/">Home</a>
                    <a href="/archive.html">Archive</a>
                    <a href="/how-to-play.html" class="active">How to Play</a>
                </nav>
                <button class="mobile-menu-btn" id="mobile-menu-btn" aria-label="Toggle menu" aria-expanded="false">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
                </button>
            </div>
            <div class="mobile-menu" id="mobile-menu" role="navigation" aria-label="Mobile navigation">
                <a href="/">Home</a>
                <a href="/archive.html">Archive</a>
                <a href="/how-to-play.html" class="active">How to Play</a>
            </div>
        </header>

        <main class="page-content">
            <section style="padding: 32px 0 48px;">
                <div class="container">
                    <h1 class="section-title">How to Play LinkedIn Wend</h1>
                    <p style="color:#666;font-size:0.9375rem;margin-bottom:24px;">Wend is a word search puzzle where words wind through a letter grid. Here's everything you need to know to start solving puzzles like a pro.</p>

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

                    <div style="margin-top: 2.5rem; text-align: center;">
                        <a href="/" style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.875rem 2rem;background:linear-gradient(135deg,#14b8a6,#22c55e);color:white;font-weight:700;font-size:1.0625rem;border-radius:12px;text-decoration:none;box-shadow:0 4px 14px rgba(20,184,166,0.35);transition:all 0.2s;">View Today's Answer</a>
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

// =========================================================
// Utility
// =========================================================

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
