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
            menuBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });

        // Close mobile menu when clicking a link
        mobileMenu.querySelectorAll('a').forEach(function(link) {
            link.addEventListener('click', function() {
                mobileMenu.classList.remove('active');
                menuBtn.setAttribute('aria-expanded', 'false');
            });
        });
    }

    // Puzzle Picker buttons on homepage
    const puzzlePickerBtns = document.querySelectorAll('.puzzle-picker-btn');
    puzzlePickerBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
            puzzlePickerBtns.forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
        });
    });

    // ===== Update "Words found" counter on reveal toggle =====
    const revealToggle = document.getElementById('reveal-toggle');
    if (revealToggle) {
        revealToggle.addEventListener('change', function() {
            const progressCount = document.querySelector('.progress-count');
            if (progressCount) {
                if (this.checked) {
                    progressCount.textContent = progressCount.getAttribute('data-total') + ' / ' + progressCount.getAttribute('data-total');
                } else {
                    progressCount.textContent = '0 / ' + progressCount.getAttribute('data-total');
                }
            }
        });
    }

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
                            '" data-puzzle-number="' + puzzle.puzzle_number + '">' + day + '</div>';
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
                    showPuzzle(puzzleNum);
                });
            });
        }

        function showPuzzle(puzzleNum) {
            // Instead of replacing HTML, show the pre-rendered puzzle item
            // Hide all puzzle items first
            const allItems = document.querySelectorAll('.archive-puzzle-item');
            allItems.forEach(function(item) {
                item.style.display = 'none';
            });

            // Show the selected puzzle item
            const targetItem = document.getElementById('archive-puzzle-' + puzzleNum);
            if (targetItem) {
                targetItem.style.display = 'block';
            }

            // Hide calendar, show puzzle detail
            calendarSection.style.display = 'none';
            puzzleSection.classList.add('active');

            // Also update archive reveal counter
            const archiveToggle = document.getElementById('archive-reveal-' + puzzleNum);
            if (archiveToggle) {
                archiveToggle.addEventListener('change', function() {
                    const archiveProgress = targetItem.querySelector('.progress-count');
                    if (archiveProgress) {
                        const total = archiveProgress.getAttribute('data-total');
                        if (this.checked) {
                            archiveProgress.textContent = total + ' / ' + total;
                        } else {
                            archiveProgress.textContent = '0 / ' + total;
                        }
                    }
                });
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
