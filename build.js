/**
 * Build script for Wend Answer Today
 * Fetches puzzle data from the Worker API and generates static HTML pages
 * matching LinkedIn Wend game layout, CSS-only reveal, and animations
 */

const fs = require("fs");
const path = require("path");

const WORKER_URL =
  process.env.WORKER_URL || "https://wend-api-worker.wendapi.workers.dev";
const API_KEY = process.env.WORKER_API_KEY || "";

// Word colors — EXACT match from thewordfinder.com Wend hints page
const WORD_COLORS = [
  "#E8572A", // Orange-red
  "#D4449A", // Pink
  "#4DBDBA", // Teal
  "#98C21F", // Green
  "#5B8DD9", // Blue
];

// Lighter tints no longer needed — using CSS color-mix() instead
// (kept for backward compat with any remaining references)
const WORD_BG_COLORS = [
  "#FDE8DF", // orange tint
  "#FADFE8", // pink tint
  "#D5F0EE", // teal tint
  "#EDF5D0", // green tint
  "#D6E8F8", // blue tint
];

function wordColor(idx) {
  return WORD_COLORS[idx % WORD_COLORS.length];
}

function wordBgColor(idx) {
  return WORD_BG_COLORS[idx % WORD_BG_COLORS.length];
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateShort(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getDirection(prevCell, currCell, nextCell) {
  if (nextCell) {
    const dr = nextCell.row - currCell.row;
    const dc = nextCell.col - currCell.col;
    if (dc > 0) return "right";
    if (dc < 0) return "left";
    if (dr > 0) return "down";
    if (dr < 0) return "up";
  }
  if (prevCell) {
    const dr = currCell.row - prevCell.row;
    const dc = currCell.col - prevCell.col;
    if (dc > 0) return "right";
    if (dc < 0) return "left";
    if (dr > 0) return "down";
    if (dr < 0) return "up";
  }
  return "";
}

// =========================================================
// Grid cell generation
// =========================================================

// BEFORE reveal: letter cells with white background, matching thewordfinder.com
function generateGridCells(grid, rows, cols, wordCells) {
  // Build maps for interactive per-letter reveals in the unsolved board.
  const cellColorMap = {};
  const cellRevealMap = {};
  if (wordCells) {
    wordCells.forEach((word, wordIdx) => {
      const color = wordColor(wordIdx);
      word.cells.forEach((cell, letterIdx) => {
        const key = `${cell.row},${cell.col}`;
        if (!(key in cellColorMap)) {
          cellColorMap[key] = color;
        }
        if (!(key in cellRevealMap)) {
          cellRevealMap[key] = [];
        }
        cellRevealMap[key].push({
          wordIdx,
          letterIdx,
          letter: grid[cell.row][cell.col].letter,
        });
      });
    });
  }

  let html = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (cell.isBlocked) {
        // Blocked cells: add 3px solid #333 borders on sides facing letter cells
        const neighbors = [
          { dr: -1, dc: 0, side: "top" },
          { dr: 1, dc: 0, side: "bottom" },
          { dc: -1, dr: 0, side: "left" },
          { dc: 1, dr: 0, side: "right" },
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
          borderParts.push(
            `border-${n.side}: ${isLetterCell ? "3px solid #333" : "0"}`,
          );
        }
        const borderStyle = borderParts.join("; ");

        html += `<div class="wend-cell wend-cell--blocked" style="${borderStyle}" data-row="${r}" data-col="${c}" aria-hidden="true"></div>`;
      } else {
        const key = `${r},${c}`;
        const wordColorStyle = cellColorMap[key]
          ? `--word-color:${cellColorMap[key]};`
          : "";
        const revealData = cellRevealMap[key] || [];
        const primaryReveal = revealData[0];
        const revealAttrs = primaryReveal
          ? `data-reveal='${JSON.stringify(revealData)}' data-word-index="${primaryReveal.wordIdx}" data-letter-index="${primaryReveal.letterIdx}"`
          : "";
        html += `<button type="button" class="wend-cell wend-cell--letter" data-row="${r}" data-col="${c}" ${revealAttrs} style="${wordColorStyle}" aria-label="${cell.letter} — click to reveal this letter in the word list">
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
  const cellIsFirst = {}; // first letter of a word
  const cellIsLast = {}; // last letter of a word
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
      const nextCell =
        cellIdx < word.cells.length - 1 ? word.cells[cellIdx + 1] : null;

      if (!(key in cellConnectH))
        cellConnectH[key] = { left: false, right: false };
      if (!(key in cellConnectV))
        cellConnectV[key] = { top: false, bottom: false };

      if (prevCell) {
        const dc = cell.col - prevCell.col;
        const dr = cell.row - prevCell.row;
        // Tube must extend toward the previous cell
        if (dc > 0) cellConnectH[key].left = true; // prev is to the left
        if (dc < 0) cellConnectH[key].right = true; // prev is to the right
        if (dr > 0) cellConnectV[key].top = true; // prev is above
        if (dr < 0) cellConnectV[key].bottom = true; // prev is below

        // Arrow direction: direction from prev cell to this cell (matches TWF)
        // Arrow is positioned on the side where the prev cell is and points
        // in the direction of movement (prev → current)
        if (!(key in cellArrowDir)) {
          if (dc > 0)
            cellArrowDir[key] = "right"; // moved right to reach this cell
          else if (dc < 0)
            cellArrowDir[key] = "left"; // moved left to reach this cell
          else if (dr > 0)
            cellArrowDir[key] = "down"; // moved down to reach this cell
          else if (dr < 0) cellArrowDir[key] = "up"; // moved up to reach this cell
        }
      }
      if (nextCell) {
        const dc = nextCell.col - cell.col;
        const dr = nextCell.row - cell.row;
        // Tube must extend toward the next cell
        if (dc > 0) cellConnectH[key].right = true; // next is to the right
        if (dc < 0) cellConnectH[key].left = true; // next is to the left
        if (dr > 0) cellConnectV[key].bottom = true; // next is below
        if (dr < 0) cellConnectV[key].top = true; // next is above
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

  let html = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      const key = `${r},${c}`;

      if (cell.isBlocked) {
        // Blocked cells: add 3px solid #333 borders on sides facing letter cells
        let borderStyle = "";
        // Check each neighbor - add border on side facing a non-blocked cell
        const neighbors = [
          { dr: -1, dc: 0, side: "top" },
          { dr: 1, dc: 0, side: "bottom" },
          { dc: -1, dr: 0, side: "left" },
          { dc: 1, dr: 0, side: "right" },
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
          borderParts.push(
            `border-${n.side}: ${isLetterCell ? "3px solid #333" : "0"}`,
          );
        }
        borderStyle = borderParts.join("; ");

        html += `<div class="wend-cell wend-cell--blocked" style="${borderStyle}" data-row="${r}" data-col="${c}" aria-hidden="true"></div>`;
      } else if (key in cellWordMap) {
        const { wordIdx, color } = cellWordMap[key];
        const delay = cellDelayMap[key] || 0;
        const rgbColor = hexToRgb(color);

        let inner = "";

        // Tube connectors (EXACT match from TWF: 22.5% positioning, border-radius)
        const hConn = cellConnectH[key];
        const vConn = cellConnectV[key];

        if (hConn && (hConn.left || hConn.right)) {
          // left: tube extends from left edge (0px) or starts at center (22.5%)
          // right: tube extends to right edge (0px) or ends at center (22.5%)
          const leftVal = hConn.left ? "0px" : "22.5%";
          const rightVal = hConn.right ? "0px" : "22.5%";

          // Border-radius: rounded on the end that terminates at center
          // 4 values: top-left top-right bottom-right bottom-left
          let borderRadius;
          if (hConn.left && hConn.right) {
            borderRadius = "0px"; // passes through, no rounding
          } else if (hConn.left && !hConn.right) {
            // Tube goes from left to center: round on right side
            borderRadius = "0px 14px 14px 0px";
          } else if (!hConn.left && hConn.right) {
            // Tube goes from center to right: round on left side
            borderRadius = "14px 0px 0px 14px";
          } else {
            borderRadius = "0px";
          }

          inner += `<span class="cell-tube cell-tube-h" style="left:${leftVal};right:${rightVal};border-radius:${borderRadius};background:${rgbColor};"></span>`;
        }
        if (vConn && (vConn.top || vConn.bottom)) {
          const topVal = vConn.top ? "0px" : "22.5%";
          const bottomVal = vConn.bottom ? "0px" : "22.5%";

          let borderRadius;
          if (vConn.top && vConn.bottom) {
            borderRadius = "0px"; // passes through, no rounding
          } else if (vConn.top && !vConn.bottom) {
            // Tube goes from top to center: round on bottom side
            borderRadius = "0px 0px 14px 14px";
          } else if (!vConn.top && vConn.bottom) {
            // Tube goes from center to bottom: round on top side
            borderRadius = "14px 14px 0px 0px";
          } else {
            borderRadius = "0px";
          }

          inner += `<span class="cell-tube cell-tube-v" style="top:${topVal};bottom:${bottomVal};border-radius:${borderRadius};background:${rgbColor};"></span>`;
        }

        // Circle at word START (first letter) — EXACT match from TWF
        if (cellIsFirst[key]) {
          inner += `<span class="cell-circle" style="background:${rgbColor};"></span>`;
        }
        // Check badge belongs on the word START cell, matching LinkedIn's solved path UI.
        if (cellIsFirst[key]) {
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

// BEFORE reveal: gray CIRCLE bubbles with working Reveal Letter / Reveal Word controls.
function generateWordCardsBefore(words, wordCells) {
  return words
    .map((word, idx) => {
      const color = wordColor(idx);

      let bubbles = "";
      for (let i = 0; i < word.length; i++) {
        bubbles += `<div class="letter-bubble letter-bubble--hidden" data-word-index="${idx}" data-letter-index="${i}" data-letter="${word[i]}" style="--word-color:${color};" aria-label="Hidden letter ${i + 1} of word ${idx + 1}"><span class="bubble-letter" aria-hidden="true"></span></div>`;
      }

      return `<div class="word-blank" data-word-index="${idx}" style="--word-color:${color};">
            <div class="letter-row">${bubbles}</div>
            <div class="word-actions">
                <button type="button" class="btn-reveal-letter" data-word-index="${idx}" style="--word-color:${color};">Reveal Letter</button>
                <button type="button" class="btn-reveal-word" data-word-index="${idx}" style="--word-color:${color};">Reveal Word</button>
            </div>
        </div>`;
    })
    .join("");
}

// AFTER reveal: colored CIRCLE bubbles with dark text — matching thewordfinder.com exactly
function generateWordCardsAfter(words, wordCells) {
  return words
    .map((word, idx) => {
      const color = wordColor(idx);

      let bubbles = "";
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
    })
    .join("");
}

// Word chips for the "Wend #N Words" section
function generateWordChips(words) {
  return words
    .map((word, idx) => {
      const color = wordColor(idx);
      return `<span class="word-chip" style="background:${color};color:#fff;--chip-delay:${(idx + 1) * 0.15}s;">
            <span class="chip-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></span>
            ${word}
        </span>`;
    })
    .join("");
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
  return recentPuzzles
    .map((p, idx) => {
      const isActive = p.puzzle_number === puzzleNumber;
      return `<button class="puzzle-picker-btn${isActive ? " active" : ""}" data-puzzle-id="puzzle-${p.puzzle_number}">#${p.puzzle_number}</button>`;
    })
    .join("");
}

// =========================================================
// Hints
// =========================================================

function generateHints(words, puzzleNumber) {
  const hints = [
    {
      num: 1,
      title: "Start with Short Words",
      text: `Begin by scanning the grid for the shortest word (${words[0].length} letters). Short words are typically easier to spot and give you anchor points for finding longer words.`,
    },
    {
      num: 2,
      title: "Follow the Path",
      text: `Each word in Wend changes direction as it winds through the grid. Once you find the first letter of a word, trace adjacent cells to find the complete path. The longest word has ${words[words.length - 1].length} letters — save it for last.`,
    },
    {
      num: 3,
      title: "Look for Intersections",
      text: `Words in Wend often share cells at intersection points. Finding one word can reveal letters that help you discover adjacent words. Use the already-revealed letters as stepping stones.`,
    },
    {
      num: 4,
      title: "Check Uncommon Letters",
      text: `Letters like Z, Q, X, and J are rare and can help you quickly identify where certain words begin or end. Scan the grid for these distinctive letters first.`,
    },
  ];

  return hints
    .map(
      (h) => `
        <div class="hint-card">
            <div class="hint-number">${h.num}</div>
            <div>
                <h3>${h.title}</h3>
                <p>${h.text}</p>
            </div>
        </div>
    `,
    )
    .join("");
}

// =========================================================
// Recent puzzles
// =========================================================

function generateRecentPuzzles(puzzles) {
  // Skip the first (latest) puzzle to avoid spoiling today's answer on the homepage
  // Show puzzles #2 onwards (older puzzles only)
  return puzzles
    .slice(1, 7)
    .map((p) => {
      const dateShort = formatDateShort(p.date);
      const wordsArr = Array.isArray(p.words) ? p.words : JSON.parse(p.words);
      const wordsHtml = wordsArr
        .slice(0, 3)
        .map((w) => `<span class="card-word">${w}</span>`)
        .join("");

      return `
            <a href="/archive.html#puzzle-${p.puzzle_number}" class="recent-card">
                <div class="card-header">
                    <span class="card-number">Puzzle #${p.puzzle_number}</span>
                    <span class="card-date">${dateShort}</span>
                </div>
                <div class="card-words">${wordsHtml}</div>
            </a>
        `;
    })
    .join("");
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
      name: "Wend Answer Today",
      url: "https://wendanswertoday.online",
      description:
        "Daily answers, explanations, and a full puzzle archive for the LinkedIn Wend word search game.",
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Wend Answer Today",
      url: "https://wendanswertoday.online",
      description:
        "Daily answers and hints for LinkedIn Wend. Updated every day with solutions and a full puzzle archive.",
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What is LinkedIn Wend?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "LinkedIn Wend is a free daily word search game from LinkedIn. Each day, a new puzzle invites you to connect letters in a grid and uncover hidden words.",
          },
        },
        {
          "@type": "Question",
          name: "What are today's Wend answers?",
          acceptedAnswer: {
            "@type": "Answer",
            text: `Today's Wend puzzle #${puzzleData.puzzle_number} answers are: ${words.join(", ")}.`,
          },
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      numberOfItems: allPuzzles.length,
      itemListElement: allPuzzles.slice(0, 5).map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: `LinkedIn Wend #${p.puzzle_number} — ${formatDateShort(p.date)}`,
        url: `https://wendanswertoday.online/archive.html#puzzle-${p.puzzle_number}`,
      })),
    },
  ];

  return JSON.stringify(schema);
}

// =========================================================
// Main Build
// =========================================================

async function buildSite() {
  console.log("Fetching puzzle data from Worker API...");

  // Fetch latest puzzle
  const latestResp = await fetch(`${WORKER_URL}/api/puzzle/latest`);
  const latestData = await latestResp.json();

  if (!latestData.success) {
    throw new Error(
      "Failed to fetch latest puzzle: " + JSON.stringify(latestData),
    );
  }

  const puzzle = latestData.data;
  console.log(
    `Latest puzzle: #${puzzle.puzzle_number}, Date: ${puzzle.date}, Words: ${puzzle.words.join(", ")}`,
  );

  // Fetch all puzzles for recent/archives
  const allResp = await fetch(`${WORKER_URL}/api/puzzles`);
  const allData = await allResp.json();
  const allPuzzles = allData.success ? allData.data : [puzzle];

  // Read template
  const templatePath = path.join(__dirname, "src", "index.html");
  let template = fs.readFileSync(templatePath, "utf8");

  // Generate all replacement values
  const dateDisplay = formatDate(puzzle.date);
  const dateShort = formatDateShort(puzzle.date);
  const metaDescription = `LinkedIn Wend answer today - Updated with ${dateDisplay} answers, full word list, grid walkthrough, and archive access for puzzle #${puzzle.puzzle_number}.`;

  const replacements = {
    "{{META_DESCRIPTION}}": metaDescription,
    "{{SCHEMA_JSON}}": generateSchema(puzzle, allPuzzles),
    "{{PUZZLE_NUMBER}}": puzzle.puzzle_number,
    "{{DATE_DISPLAY}}": dateDisplay,
    "{{DATE_SHORT}}": dateShort,
    "{{WORD_COUNT}}": puzzle.words.length,
    "{{GRID_COLS}}": puzzle.cols,
    "{{GRID_ROWS}}": puzzle.rows,
    "{{WORD_CHIPS}}": generateWordChips(puzzle.words),
    "{{GRID_CELLS}}": generateGridCells(
      puzzle.grid,
      puzzle.rows,
      puzzle.cols,
      puzzle.word_cells,
    ),
    "{{GRID_CELLS_SOLVED}}": generateSolvedGridCells(
      puzzle.grid,
      puzzle.word_cells,
      puzzle.rows,
      puzzle.cols,
    ),
    "{{WORD_CARDS_BEFORE}}": generateWordCardsBefore(
      puzzle.words,
      puzzle.word_cells,
    ),
    "{{WORD_CARDS_AFTER}}": generateWordCardsAfter(
      puzzle.words,
      puzzle.word_cells,
    ),
    "{{HINTS_CONTENT}}": generateHints(puzzle.words, puzzle.puzzle_number),
    "{{RECENT_PUZZLES}}": generateRecentPuzzles(allPuzzles),
  };

  // Apply replacements
  for (const [key, value] of Object.entries(replacements)) {
    template = template.split(key).join(value);
  }

  // Write the built index.html
  const outputDir = path.join(__dirname, "dist");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(path.join(outputDir, "index.html"), template);
  console.log("Built index.html");

  // Copy static assets
  copyDir(path.join(__dirname, "src", "css"), path.join(outputDir, "css"));
  copyDir(path.join(__dirname, "src", "js"), path.join(outputDir, "js"));
  copyDir(
    path.join(__dirname, "src", "images"),
    path.join(outputDir, "images"),
  );
  copyDir(path.join(__dirname, "src", "fonts"), path.join(outputDir, "fonts"));

  // Generate archive page
  await buildArchivePage(allPuzzles, outputDir);

  // Generate how-to-play page
  buildHowToPlayPage(outputDir);

  console.log("Build complete!");
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
  const calendarPuzzles = fullPuzzles.map((p) => ({
    puzzle_number: p.puzzle_number,
    date: p.date,
    words: p.words,
    rows: p.rows,
    cols: p.cols,
    grid: p.grid,
    word_cells: p.word_cells,
  }));

  // Generate puzzle detail HTML for each puzzle (shown by default, with reveal toggle)
  const puzzleDetailsHtml = fullPuzzles
    .map((p) => {
      const gridBefore = generateGridCells(
        p.grid,
        p.rows,
        p.cols,
        p.word_cells,
      );
      const gridAfter = generateSolvedGridCells(
        p.grid,
        p.word_cells,
        p.rows,
        p.cols,
      );
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
    })
    .join("");

  // Archive reveal CSS (per puzzle)
  const archiveRevealCSS = fullPuzzles
    .map((p) => {
      return `
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-layout .archive-grid-before { display: none; }
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-layout .archive-grid-after { display: flex; justify-content: center; animation: boardReveal 0.5s ease-out; }
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-layout .archive-grid-after .wend-cell--revealed { animation: cellPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) backwards; animation-delay: calc(var(--cell-delay, 0) * 0.06s); }
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-layout .archive-words-before { display: none; }
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-layout .archive-words-after { display: block; }
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-layout .archive-words-after .words-list-revealed { display: flex; }
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-layout .wend-words-label { display: block; }
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-layout .progress-fill { width: 100% !important; }
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-layout .archive-instruction-before { display: none; }
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-layout .archive-instruction-after { display: block; }
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-layout .word-blank--revealed { animation: wordReveal 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) backwards; animation-delay: calc(var(--card-delay, 0) * 0.12s); }
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-layout .letter-bubble--revealed { animation: bubblePop 0.38s cubic-bezier(0.34, 1.56, 0.64, 1) backwards; animation-delay: calc(var(--bubble-delay, 0) * 0.08s); }
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-reveal-container .archive-reveal-btn { background: #fff; border-color: var(--clr-border-strong); color: var(--clr-text-secondary); box-shadow: none; }
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-reveal-container .archive-reveal-show { display: none; }
        #archive-reveal-${p.puzzle_number}:checked ~ .archive-reveal-container .archive-reveal-hide { display: inline; }`;
    })
    .join("\n");

  const archiveHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" type="image/svg+xml" href="/images/favicon.svg">
    <title>LinkedIn Wend Archive — Past Answers, Hints and Solved Boards</title>
    <meta name="description" content="Browse the full LinkedIn Wend archive with past answers, solved boards, word routes, daily puzzle dates, and hint controls for older Wend puzzles.">
    <link rel="canonical" href="https://wendanswertoday.online/archive.html">
    <link rel="preload" href="/fonts/inter-700.ttf" as="font" type="font/ttf" crossorigin>
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

            <section class="content-section">
                <div class="container">
                    <article class="content-card">
                        <h2>LinkedIn Wend archive: past answers without the guessing game</h2>
                        <p>The archive is for the days you do not solve Wend at the exact moment it drops. Maybe you missed yesterday&rsquo;s puzzle. Maybe a friend mentioned a route that looked strange. Maybe Google sent you here because you searched for a specific puzzle number. Whatever the reason, this page keeps older Wend puzzles in one place with the same solved-board view as the daily answer page.</p>
                        <p>Use the calendar first. Dates with saved puzzles are highlighted. Tap one, and the puzzle opens with the grid, hidden word bubbles, reveal controls, and a full solved-board option. You can treat an older puzzle like a fresh one: click letters, reveal one word, or reveal everything only when you are ready to check the path.</p>
                        <div class="content-highlight"><p><strong>Archive tip:</strong> if you are comparing two puzzles, open one date, reveal the solved board, then go back to the calendar and open the next date. The grid shapes often explain why one day felt easy and another felt weirdly stubborn.</p></div>
                        <h3>Why a real archive matters</h3>
                        <p>A simple table of old answers is not enough for Wend. The answer words are only half the puzzle. The route is the part people usually need help with. A word can be obvious, but the path can still be hard to trace because it turns around a blocked cell or passes through a shared intersection. That is why each archived puzzle uses the same visual board: start marker, check mark at the start, direction arrows, and colored route segments.</p>
                        <p>Older Wend puzzles are also useful practice. If today&rsquo;s puzzle is too frustrating, solve a few archive entries first. You will start noticing patterns: short words often unlock a corner, longer words tend to snake around grey cells, and repeated letters can make a route look possible when it is not. Playing past puzzles builds that pattern recognition faster than reading tips alone.</p>
                        <h3>How to browse past Wend puzzles</h3>
                        <ol>
                            <li>Use the calendar to pick a date with a saved puzzle.</li>
                            <li>Try the puzzle in hidden mode first, just like the daily page.</li>
                            <li>Click a grid letter if you want a small hint.</li>
                            <li>Use Reveal Letter or Reveal Word when one row is blocking you.</li>
                            <li>Use Reveal all to compare your answer with the solved route.</li>
                        </ol>
                        <p>The controls are intentionally the same across the site. You should not need to learn one interaction for today&rsquo;s puzzle and another for the archive. If a letter click works on the home page, it works here too. If a word reveal helps you on an older puzzle, it will work the same way tomorrow.</p>
                        <h3>What to look for in older boards</h3>
                        <p>Pay attention to blocked cells. They are the puzzle&rsquo;s quiet instructions. A block forces turns, removes false routes, and creates narrow corridors where a word has only one realistic path. When a puzzle feels impossible, the blocked cells usually tell you what direction is still legal. Trace around them instead of staring at the answer list.</p>
                        <p>Also watch for intersections. Wend often lets one discovered route explain another. If two words share a cell, that shared letter can anchor the second word. In the archive, revealing one word at a time makes those intersections easier to study. It is a better practice method than revealing the entire board immediately.</p>
                        <p>Finally, remember that color is only a readability layer. The important information is order. The start marker and direction arrows show how the route moves. If the same word appeared tomorrow, it could use a different color and still be the same kind of path. That is why this archive focuses on solved routes rather than only listing words.</p>
                        <h3>SEO note, but written for players first</h3>
                        <p>This archive is structured so search engines can understand what it contains: past Wend answers, puzzle numbers, dates, solved boards, and internal links back to today&rsquo;s answer. But the page still needs to be readable for humans. Nobody wants an archive stuffed with repeated phrases. The useful part is being able to open a date, inspect the route, and leave with the answer you came for.</p>
                        <p>If you are here from search, start with the calendar. If you are here to practice, pick any older puzzle and solve it without revealing all. If you are stuck on today&rsquo;s game, go back to the <a href="/">latest Wend answer</a> page and use the smallest hint that gets you moving again.</p>
                    </article>
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

  fs.writeFileSync(path.join(outputDir, "archive.html"), archiveHtml);
  console.log("Built archive.html");
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
    <title>How to Play LinkedIn Wend — Rules, Routes and Solving Tips</title>
    <meta name="description" content="Learn how to play LinkedIn Wend with clear rules, route examples, solving tips, and strategy for the daily winding word puzzle.">
    <link rel="canonical" href="https://wendanswertoday.online/how-to-play.html">
    <link rel="preload" href="/fonts/inter-700.ttf" as="font" type="font/ttf" crossorigin>
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

                    <article class="content-card" style="margin-top: 2rem;">
                        <h2>How Wend actually works once you stop treating it like a normal word search</h2>
                        <p>The fastest way to get better at Wend is to forget the word searches you played as a kid. Those puzzles trained you to look for straight lines: left to right, top to bottom, diagonal if the puzzle is feeling fancy. Wend asks for something different. The answer is still made from adjacent letters, but the route can turn. A word can start in one corner, bend around a blocked cell, cross another route, and finish somewhere you did not expect.</p>
                        <p>That winding movement is the whole point of the game. The title is not just branding. To wend means to travel along a twisting course. The puzzle uses that idea literally. Each answer travels through the board, and your job is to trace the path without getting tricked by nearby letters that look right but lead nowhere.</p>
                        <h3>Start with word length, not the first letter</h3>
                        <p>Most players scan for the first letter of a word. That can work, but it also creates false starts. If the list says a word has five letters, first count whether the surrounding open cells could even support a five-letter route. A promising starting letter is useless if the path runs into a blocked cell after three moves. Word length is a filter. Use it before you commit to a route.</p>
                        <p>Short words are usually the best opening move. They have fewer possible paths, and once you solve one, the revealed cells often sit near another answer. If you find a three-, four-, or five-letter word early, do not rush past it. Look at the cells around it. Wend puzzles often place related routes close together, not by theme, but by board geometry.</p>
                        <h3>Use blocked cells as instructions</h3>
                        <p>Grey cells look like dead space, but they tell you a lot. They force turns. They remove possible branches. They make narrow lanes where a route can only move in one or two directions. When you are stuck, stop staring at the word list and look at the blocks. Ask what path the board is allowing. In many puzzles, the right answer becomes obvious once you treat blocked cells as walls instead of background.</p>
                        <p>One useful habit is to trace the perimeter of a block. If a route runs beside a blocked cell, it often turns at the next open spot. This is not a rule, but it is a common pattern because blocked cells create the winding shape that makes the puzzle interesting.</p>
                        <h3>Do not trust repeated letters too quickly</h3>
                        <p>Repeated letters are where Wend gets sneaky. If a word has two of the same letter, your eye may pick the wrong one first. The route can look almost correct for several moves before it breaks. When that happens, do not assume the whole idea is wrong. Try the other copy of the repeated letter. A single swapped position can turn a dead route into the correct path.</p>
                        <p>The same applies to common vowels. A, E, I, O, and U appear often enough that they can create noise. Consonants usually make better anchors. If you see a rare letter or a tight consonant cluster, test that area first. It gives you more information than another open vowel in the middle of the board.</p>
                        <h3>How to use hints without spoiling the puzzle</h3>
                        <p>If you are using this site while still trying to solve, start small. The daily answer page and archive both let you click a letter on the grid. That reveals where the letter belongs in the hidden word bubbles, but it does not automatically show the entire solution. This is the least destructive hint because it gives you a point of contact without removing the puzzle.</p>
                        <p>Reveal Letter is the next step. It fills one missing bubble in a single word row. Use it when you know the area of the board but cannot decide between two paths. Reveal Word is stronger. It gives you one complete answer while leaving the rest hidden. Reveal all should be saved for checking your work or when you are done trying.</p>
                        <h3>Why practice on old puzzles helps</h3>
                        <p>Wend gets easier when you build a feel for routes. You start noticing when a word is likely to turn, when a blocked cell is forcing a path, and when a starting letter is a trap. The archive is useful because it gives you more boards to study. Pick an older puzzle, solve it slowly, then reveal the board and compare your path with the official route-style solution shown here.</p>
                        <p>After a few archive puzzles, you will stop searching randomly. You will scan regions, count route length, test constraints, and use intersections. That is the difference between guessing and solving. Wend is still a quick daily game, but it rewards the same habits that help with better logic puzzles: patience, pattern recognition, and knowing when to back up one move.</p>
                        <h3>A simple solving routine</h3>
                        <ol>
                            <li>Read the word lengths before touching the grid.</li>
                            <li>Find the shortest word and test only routes that match its length.</li>
                            <li>Use blocked cells to rule out impossible turns.</li>
                            <li>Watch for intersections after solving the first word.</li>
                            <li>If stuck, reveal one letter instead of the whole board.</li>
                            <li>Check the solved path at the end and learn from the turns you missed.</li>
                        </ol>
                        <p>That routine will not make every puzzle instant, but it cuts down the noise. You spend less time chasing routes that cannot work and more time following the paths the board is actually offering.</p>
                    </article>

                    <div style="margin-top: 2.5rem; text-align: center;">
                        <a href="/" style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.875rem 2rem;background:linear-gradient(135deg,#0A66C2,#38bdf8);color:white;font-weight:700;font-size:1.0625rem;border-radius:999px;text-decoration:none;box-shadow:0 4px 14px rgba(10,102,194,0.35);transition:all 0.2s;">View Today's Answer</a>
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

  fs.writeFileSync(path.join(outputDir, "how-to-play.html"), html);
  console.log("Built how-to-play.html");
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
buildSite().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
