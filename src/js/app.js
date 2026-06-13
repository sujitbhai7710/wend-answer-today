/**
 * Wend Answer Today — Frontend JavaScript
 * - Header scroll shadow
 * - FAQ accordion
 * - Interactive letter/word reveal for home + archive puzzles
 * - Mobile menu and archive calendar
 */

(function () {
  "use strict";

  const header = document.querySelector(".site-header");
  if (header) {
    const onScroll = () =>
      header.classList.toggle("scrolled", window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  const menuBtn = document.getElementById("mobile-menu-btn");
  const mobileMenu = document.getElementById("mobile-menu");

  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener("click", function () {
      const isOpen = mobileMenu.classList.toggle("active");
      menuBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    mobileMenu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        mobileMenu.classList.remove("active");
        menuBtn.setAttribute("aria-expanded", "false");
      });
    });
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(String(value));
    }
    return String(value).replace(/"/g, '\\"');
  }

  function puzzleScopeFrom(el) {
    return el.closest(".game-layout, .archive-layout") || document;
  }

  function revealBubble(scope, wordIdx, letterIdx) {
    const selector = `.letter-bubble[data-word-index="${cssEscape(wordIdx)}"][data-letter-index="${cssEscape(letterIdx)}"]`;
    const bubble = scope.querySelector(selector);
    if (!bubble || bubble.classList.contains("letter-bubble--hinted"))
      return false;

    const letter = bubble.getAttribute("data-letter") || "";
    const text = bubble.querySelector(".bubble-letter") || bubble;
    text.textContent = letter;
    bubble.classList.add("letter-bubble--hinted");
    bubble.setAttribute("aria-label", `Revealed letter ${letter}`);
    bubble.setAttribute("aria-hidden", "false");
    return true;
  }

  function markBoardCell(scope, wordIdx, letterIdx) {
    scope
      .querySelectorAll(".wend-cell--letter[data-reveal]")
      .forEach(function (cell) {
        let reveals = [];
        try {
          reveals = JSON.parse(cell.getAttribute("data-reveal") || "[]");
        } catch (error) {
          reveals = [];
        }

        const isMatch = reveals.some(function (item) {
          return (
            String(item.wordIdx) === String(wordIdx) &&
            String(item.letterIdx) === String(letterIdx)
          );
        });

        if (isMatch) {
          cell.classList.add("cell-revealed-hint");
        }
      });
  }

  function updateWordState(scope, wordIdx) {
    const card = scope.querySelector(
      `.word-blank[data-word-index="${cssEscape(wordIdx)}"]`,
    );
    if (!card) return;

    const bubbles = Array.from(
      card.querySelectorAll(".letter-bubble[data-word-index]"),
    );
    const complete =
      bubbles.length > 0 &&
      bubbles.every(function (bubble) {
        return bubble.classList.contains("letter-bubble--hinted");
      });

    card.classList.toggle("word-complete", complete);

    const nextHidden = card.querySelector(
      ".letter-bubble[data-word-index]:not(.letter-bubble--hinted)",
    );
    const revealLetterBtn = card.querySelector(".btn-reveal-letter");
    const revealWordBtn = card.querySelector(".btn-reveal-word");
    if (revealLetterBtn) revealLetterBtn.disabled = !nextHidden;
    if (revealWordBtn) revealWordBtn.disabled = complete;
  }

  function updateProgress(scope) {
    const cards = Array.from(
      scope.querySelectorAll(".word-blank[data-word-index]"),
    );
    if (!cards.length) return;

    const completeCount = cards.filter(function (card) {
      const bubbles = Array.from(
        card.querySelectorAll(".letter-bubble[data-word-index]"),
      );
      return (
        bubbles.length > 0 &&
        bubbles.every(function (bubble) {
          return bubble.classList.contains("letter-bubble--hinted");
        })
      );
    }).length;

    const count = scope.querySelector(".progress-count");
    const fill = scope.querySelector(".progress-fill");
    if (count) count.textContent = `${completeCount} / ${cards.length}`;
    if (fill)
      fill.style.width = `${Math.round((completeCount / cards.length) * 100)}%`;
  }

  function revealLetter(scope, wordIdx, letterIdx) {
    revealBubble(scope, wordIdx, letterIdx);
    markBoardCell(scope, wordIdx, letterIdx);
    updateWordState(scope, wordIdx);
    updateProgress(scope);
  }

  function revealNextLetter(button) {
    const scope = puzzleScopeFrom(button);
    const wordIdx = button.getAttribute("data-word-index");
    const card = scope.querySelector(
      `.word-blank[data-word-index="${cssEscape(wordIdx)}"]`,
    );
    if (!card) return;

    const next = card.querySelector(
      ".letter-bubble[data-word-index]:not(.letter-bubble--hinted)",
    );
    if (next)
      revealLetter(scope, wordIdx, next.getAttribute("data-letter-index"));
  }

  function revealWholeWord(button) {
    const scope = puzzleScopeFrom(button);
    const wordIdx = button.getAttribute("data-word-index");
    scope
      .querySelectorAll(
        `.letter-bubble[data-word-index="${cssEscape(wordIdx)}"]`,
      )
      .forEach(function (bubble) {
        revealLetter(scope, wordIdx, bubble.getAttribute("data-letter-index"));
      });
  }

  function clearInteractiveHints(scope) {
    scope.querySelectorAll(".letter-bubble--hinted").forEach(function (bubble) {
      bubble.classList.remove("letter-bubble--hinted");
      const text = bubble.querySelector(".bubble-letter");
      if (text) text.textContent = "";
      bubble.setAttribute("aria-hidden", "true");
    });
    scope.querySelectorAll(".cell-revealed-hint").forEach(function (cell) {
      cell.classList.remove("cell-revealed-hint");
    });
    scope.querySelectorAll(".word-complete").forEach(function (card) {
      card.classList.remove("word-complete");
    });
    scope
      .querySelectorAll(".btn-reveal-letter, .btn-reveal-word")
      .forEach(function (button) {
        button.disabled = false;
      });
    updateProgress(scope);
  }

  function scopeFromRevealToggle(input) {
    if (
      input.nextElementSibling &&
      input.nextElementSibling.classList.contains("game-layout")
    ) {
      return input.nextElementSibling;
    }
    const archiveItem = input.closest(".archive-puzzle-item");
    return archiveItem
      ? archiveItem.querySelector(".archive-layout")
      : document;
  }

  document.addEventListener("change", function (event) {
    const input = event.target.closest(
      ".reveal-checkbox, .archive-reveal-checkbox",
    );
    if (!input) return;

    const scope = scopeFromRevealToggle(input);
    const cards = Array.from(
      scope.querySelectorAll(".word-blank[data-word-index]"),
    );
    const count = scope.querySelector(".progress-count");
    const fill = scope.querySelector(".progress-fill");

    if (input.checked) {
      if (count) count.textContent = `${cards.length} / ${cards.length}`;
      if (fill) fill.style.width = "100%";
    } else {
      clearInteractiveHints(scope);
      if (count) count.textContent = `0 / ${cards.length}`;
      if (fill) fill.style.width = "0%";
    }
  });

  document.addEventListener("click", function (event) {
    const gridCell = event.target.closest(".wend-cell--letter[data-reveal]");
    if (gridCell) {
      const scope = puzzleScopeFrom(gridCell);
      let reveals = [];
      try {
        reveals = JSON.parse(gridCell.getAttribute("data-reveal") || "[]");
      } catch (error) {
        reveals = [];
      }
      reveals.forEach(function (item) {
        revealLetter(scope, item.wordIdx, item.letterIdx);
      });
      return;
    }

    const revealLetterButton = event.target.closest(".btn-reveal-letter");
    if (revealLetterButton) {
      revealNextLetter(revealLetterButton);
      return;
    }

    const revealWordButton = event.target.closest(".btn-reveal-word");
    if (revealWordButton) revealWholeWord(revealWordButton);
  });

  document.querySelectorAll(".faq-item").forEach(function (item) {
    const question = item.querySelector(".faq-question");
    const answer = item.querySelector(".faq-answer");
    if (!question || !answer) return;

    question.setAttribute("role", "button");
    question.setAttribute("tabindex", "0");

    function toggle() {
      const isOpen = item.classList.toggle("faq-open");
      question.setAttribute("aria-expanded", isOpen ? "true" : "false");
      answer.style.maxHeight = isOpen ? `${answer.scrollHeight}px` : "0";
    }

    question.addEventListener("click", toggle);
    question.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
  });

  const firstFaq = document.querySelector(".faq-item");
  if (firstFaq) {
    const q = firstFaq.querySelector(".faq-question");
    const a = firstFaq.querySelector(".faq-answer");
    if (q && a) {
      firstFaq.classList.add("faq-open");
      q.setAttribute("aria-expanded", "true");
      a.style.maxHeight = `${a.scrollHeight || 400}px`;
    }
  }

  const calendarSection = document.querySelector(".calendar-section");
  const puzzleSection = document.querySelector(".archive-puzzle-section");
  const calendarDaysContainer = document.querySelector(".calendar-days");
  const calendarTitle = document.querySelector(".calendar-month-title");
  const prevBtn = document.querySelector(".calendar-prev");
  const nextBtn = document.querySelector(".calendar-next");

  if (calendarSection && calendarDaysContainer) {
    const puzzlesData = JSON.parse(
      calendarDaysContainer.getAttribute("data-puzzles") || "[]",
    );
    let currentMonth = new Date().getMonth();
    let currentYear = new Date().getFullYear();

    function renderCalendar() {
      const monthNames = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];

      if (calendarTitle)
        calendarTitle.textContent = `${monthNames[currentMonth]} ${currentYear}`;

      const firstDay = new Date(currentYear, currentMonth, 1).getDay();
      const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
      const today = new Date();
      const puzzleMap = {};

      puzzlesData.forEach(function (p) {
        const d = new Date(p.date);
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        puzzleMap[key] = p;
      });

      let html = "";
      for (let i = 0; i < firstDay; i++)
        html += '<div class="calendar-day calendar-day--empty"></div>';

      for (let day = 1; day <= totalDays; day++) {
        const key = `${currentYear}-${currentMonth}-${day}`;
        const puzzle = puzzleMap[key];
        const isToday =
          today.getFullYear() === currentYear &&
          today.getMonth() === currentMonth &&
          today.getDate() === day;

        if (puzzle) {
          html += `<div class="calendar-day calendar-day--has-puzzle${isToday ? " calendar-day--today" : ""}" data-puzzle-number="${puzzle.puzzle_number}">${day}</div>`;
        } else {
          html += `<div class="calendar-day${isToday ? " calendar-day--today" : ""}">${day}</div>`;
        }
      }

      calendarDaysContainer.innerHTML = html;
      calendarDaysContainer
        .querySelectorAll(".calendar-day--has-puzzle")
        .forEach(function (el) {
          el.addEventListener("click", function () {
            showPuzzle(this.getAttribute("data-puzzle-number"));
          });
        });
    }

    function showPuzzle(puzzleNum) {
      document
        .querySelectorAll(".archive-puzzle-item")
        .forEach(function (item) {
          item.style.display = "none";
        });

      const targetItem = document.getElementById(`archive-puzzle-${puzzleNum}`);
      if (targetItem) targetItem.style.display = "block";

      calendarSection.style.display = "none";
      if (puzzleSection) puzzleSection.classList.add("active");
    }

    const backBtn = document.querySelector(".back-to-calendar");
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        if (puzzleSection) puzzleSection.classList.remove("active");
        calendarSection.style.display = "";
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        currentMonth--;
        if (currentMonth < 0) {
          currentMonth = 11;
          currentYear--;
        }
        renderCalendar();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        currentMonth++;
        if (currentMonth > 11) {
          currentMonth = 0;
          currentYear++;
        }
        renderCalendar();
      });
    }

    renderCalendar();
  }
})();
