/**
 * Wend Answer Today - Frontend JavaScript
 * Minimal JS for mobile menu toggle and archive calendar
 * The reveal mechanism is pure CSS (checkbox hack) for SEO
 */

(function() {
    'use strict';

    // Mobile menu toggle
    const menuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');

    if (menuBtn && mobileMenu) {
        menuBtn.addEventListener('click', function() {
            mobileMenu.classList.toggle('active');
            const isOpen = mobileMenu.classList.contains('active');
            menuBtn.setAttribute('aria-expanded', isOpen);
        });
    }

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    // ===== Archive Calendar Logic =====
    const calendarSection = document.querySelector('.calendar-section');
    const puzzleSection = document.querySelector('.archive-puzzle-section');
    const calendarDaysContainer = document.querySelector('.calendar-days');
    const calendarTitle = document.querySelector('.calendar-month-title');
    const prevBtn = document.querySelector('.calendar-prev');
    const nextBtn = document.querySelector('.calendar-next');

    if (calendarSection && calendarDaysContainer) {
        // Parse puzzle data from the data attribute
        const puzzlesData = JSON.parse(calendarDaysContainer.getAttribute('data-puzzles') || '[]');
        
        let currentMonth = new Date().getMonth();
        let currentYear = new Date().getFullYear();

        function renderCalendar() {
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
            
            if (calendarTitle) {
                calendarTitle.textContent = monthNames[currentMonth] + ' ' + currentYear;
            }

            // Get first day and total days of month
            const firstDay = new Date(currentYear, currentMonth, 1).getDay();
            const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
            const today = new Date();

            // Build puzzle date map
            const puzzleMap = {};
            puzzlesData.forEach(function(p) {
                const d = new Date(p.date);
                const key = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
                puzzleMap[key] = p;
            });

            let html = '';
            
            // Empty cells before first day
            for (let i = 0; i < firstDay; i++) {
                html += '<div class="calendar-day calendar-day--empty"></div>';
            }

            // Day cells
            for (let day = 1; day <= totalDays; day++) {
                const key = currentYear + '-' + currentMonth + '-' + day;
                const puzzle = puzzleMap[key];
                const isToday = today.getFullYear() === currentYear && 
                               today.getMonth() === currentMonth && 
                               today.getDate() === day;

                if (puzzle) {
                    html += '<div class="calendar-day calendar-day--has-puzzle' + 
                            (isToday ? ' calendar-day--today' : '') + 
                            '" data-puzzle-number="' + puzzle.puzzle_number + 
                            '" data-date="' + puzzle.date + '">' + day + '</div>';
                } else {
                    html += '<div class="calendar-day' + 
                            (isToday ? ' calendar-day--today' : '') + '">' + day + '</div>';
                }
            }

            calendarDaysContainer.innerHTML = html;

            // Add click handlers to puzzle days
            calendarDaysContainer.querySelectorAll('.calendar-day--has-puzzle').forEach(function(el) {
                el.addEventListener('click', function() {
                    const puzzleNum = this.getAttribute('data-puzzle-number');
                    const date = this.getAttribute('data-date');
                    showPuzzle(puzzleNum, date);
                });
            });
        }

        function showPuzzle(puzzleNum, date) {
            // Find puzzle in data
            const puzzle = puzzlesData.find(function(p) {
                return p.puzzle_number == puzzleNum;
            });

            if (!puzzle) return;

            // Hide calendar, show puzzle detail
            calendarSection.style.display = 'none';
            puzzleSection.classList.add('active');

            // Populate puzzle detail
            const detailContainer = puzzleSection.querySelector('.archive-puzzle-detail-content');
            if (detailContainer) {
                detailContainer.innerHTML = generatePuzzleDetail(puzzle);
            }
        }

        // Back to calendar
        const backBtn = document.querySelector('.back-to-calendar');
        if (backBtn) {
            backBtn.addEventListener('click', function() {
                puzzleSection.classList.remove('active');
                calendarSection.style.display = '';
            });
        }

        // Month navigation
        if (prevBtn) {
            prevBtn.addEventListener('click', function() {
                currentMonth--;
                if (currentMonth < 0) {
                    currentMonth = 11;
                    currentYear--;
                }
                renderCalendar();
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
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
