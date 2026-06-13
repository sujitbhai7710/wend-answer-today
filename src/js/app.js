/**
 * Wend Answer Today — Frontend JavaScript
 * - Header scroll shadow
 * - FAQ accordion
 * - Mobile menu
 */

(function () {
  "use strict";

  // ── Header scroll shadow ──────────────────────────────────────
  const header = document.querySelector(".site-header");
  if (header) {
    const onScroll = () => {
      header.classList.toggle("scrolled", window.scrollY > 8);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll(); // run once on load
  }

  // ── Mobile menu toggle ────────────────────────────────────────
  const menuBtn = document.getElementById("mobile-menu-btn");
  const mobileMenu = document.getElementById("mobile-menu");

  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener("click", function () {
      const isOpen = mobileMenu.classList.toggle("active");
      menuBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    // Close when a link is tapped
    mobileMenu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        mobileMenu.classList.remove("active");
        menuBtn.setAttribute("aria-expanded", "false");
      });
    });
  }

  // ── FAQ Accordion ─────────────────────────────────────────────
  document.querySelectorAll(".faq-item").forEach(function (item) {
    const question = item.querySelector(".faq-question");
    const answer = item.querySelector(".faq-answer");

    if (!question || !answer) return;

    question.setAttribute("role", "button");
    question.setAttribute("tabindex", "0");

    function toggle() {
      const isOpen = item.classList.toggle("faq-open");
      question.setAttribute("aria-expanded", isOpen ? "true" : "false");

      // Smooth height transition: set exact height for animation
      if (isOpen) {
        answer.style.maxHeight = answer.scrollHeight + "px";
      } else {
        // Collapse: briefly set explicit height then animate to 0
        answer.style.maxHeight = answer.scrollHeight + "px";
        // Force reflow
        answer.offsetHeight; // eslint-disable-line no-unused-expressions
        answer.style.maxHeight = "0";
      }
    }

    question.addEventListener("click", toggle);
    question.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
  });

  // Open first FAQ item by default for better UX
  const firstFaq = document.querySelector(".faq-item");
  if (firstFaq) {
    const q = firstFaq.querySelector(".faq-question");
    const a = firstFaq.querySelector(".faq-answer");
    if (q && a) {
      firstFaq.classList.add("faq-open");
      q.setAttribute("aria-expanded", "true");
      // Use CSS max-height from stylesheet; just add class
      a.style.maxHeight = "400px";
    }
  }

  // ── Archive Calendar ──────────────────────────────────────────
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

      if (calendarTitle) {
        calendarTitle.textContent =
          monthNames[currentMonth] + " " + currentYear;
      }

      const firstDay = new Date(currentYear, currentMonth, 1).getDay();
      const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
      const today = new Date();

      // Build puzzle date map
      const puzzleMap = {};
      puzzlesData.forEach(function (p) {
        const d = new Date(p.date);
        const key = d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate();
        puzzleMap[key] = p;
      });

      let html = "";

      // Empty cells before first day
      for (let i = 0; i < firstDay; i++) {
        html += '<div class="calendar-day calendar-day--empty"></div>';
      }

      // Day cells
      for (let day = 1; day <= totalDays; day++) {
        const key = currentYear + "-" + currentMonth + "-" + day;
        const puzzle = puzzleMap[key];
        const isToday =
          today.getFullYear() === currentYear &&
          today.getMonth() === currentMonth &&
          today.getDate() === day;

        if (puzzle) {
          html +=
            '<div class="calendar-day calendar-day--has-puzzle' +
            (isToday ? " calendar-day--today" : "") +
            '" data-puzzle-number="' +
            puzzle.puzzle_number +
            '">' +
            day +
            "</div>";
        } else {
          html +=
            '<div class="calendar-day' +
            (isToday ? " calendar-day--today" : "") +
            '">' +
            day +
            "</div>";
        }
      }

      calendarDaysContainer.innerHTML = html;

      // Add click handlers
      calendarDaysContainer
        .querySelectorAll(".calendar-day--has-puzzle")
        .forEach(function (el) {
          el.addEventListener("click", function () {
            showPuzzle(this.getAttribute("data-puzzle-number"));
          });
        });
    }

    function showPuzzle(puzzleNum) {
      // Hide all puzzle items
      document
        .querySelectorAll(".archive-puzzle-item")
        .forEach(function (item) {
          item.style.display = "none";
        });

      const targetItem = document.getElementById("archive-puzzle-" + puzzleNum);
      if (targetItem) targetItem.style.display = "block";

      calendarSection.style.display = "none";
      if (puzzleSection) puzzleSection.classList.add("active");
    }

    // Back to calendar
    const backBtn = document.querySelector(".back-to-calendar");
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        if (puzzleSection) puzzleSection.classList.remove("active");
        calendarSection.style.display = "";
      });
    }

    // Month navigation
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
