// Main initialization code extracted from index.html

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing Tradlyst application...');
    
    // Initialize appState if it doesn't exist
    if (!window.appState) {
        window.appState = {
            user: null,
            trades: [],
            ledger: [],
            challenge: null,
            theme: localStorage.getItem('theme') || 'light'
        };
    }
    
    try {
        // Apply theme first
        if (typeof applyTheme === 'function') {
            applyTheme();
        }
        
        // Replace feather icons
        if (typeof feather !== 'undefined') {
            feather.replace();
        }
        
        // Initialize CSV functionality
        if (window.csvImporter && window.csvImporter.initCSVUpload) {
            window.csvImporter.initCSVUpload();
        }
        
        // Initialize authentication
        if (window.auth && window.auth.initAuth) {
            window.auth.initAuth();
        }
        
        // Setup global event listeners
        if (typeof setupGlobalEventListeners === 'function') {
            setupGlobalEventListeners();
        }
        
        // Setup trade table event listeners
        if (typeof setupTradeTableEventListeners === 'function') {
            setupTradeTableEventListeners();
        }
        
        // Setup bulk delete event listeners
        if (typeof setupBulkDeleteListeners === 'function') {
            setupBulkDeleteListeners();
        }
        
        // Wire CSV buttons
        if (typeof wireCsvButtons === 'function') {
            wireCsvButtons();
        }
        
        // Wait for Chart.js to load, then render charts
        setTimeout(() => {
            if (typeof Chart !== 'undefined') {
                if (window.charts && window.charts.renderAllCharts) {
                    window.charts.renderAllCharts();
                } else if (typeof renderAllCharts === 'function') {
                    renderAllCharts();
                }
            } else {
                console.warn('Chart.js not loaded, retrying...');
                setTimeout(() => {
                    if (window.charts && window.charts.renderAllCharts) {
                        window.charts.renderAllCharts();
                    } else if (typeof renderAllCharts === 'function') {
                        renderAllCharts();
                    }
                }, 200);
            }
        }, 100);
        
        console.log('Tradlyst application initialized successfully');
        
    } catch (error) {
        console.error('Error during application initialization:', error);
    }
});
