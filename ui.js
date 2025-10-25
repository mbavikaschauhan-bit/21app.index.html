// UI rendering functions extracted from index.html

// Global variables for rendering state
let calendarRenderTimeout = null;
let reportsRenderTimeout = null;
let statementRenderTimeout = null;
let aiAnalystRenderTimeout = null;
let tradeHistoryRendering = false;
let statementRendering = false;
let isRendering = false;

// Main rendering functions
const renderDashboard = async () => {
    try {
        // Check if filter is active - if so, skip this render to avoid overriding filtered data
        const dateFilter = document.getElementById('dateFilter');
        if (dateFilter && dateFilter.value !== 'all-time') {
            // Filter is active, let the filter system handle the rendering
            return;
        }
        
        // Ensure we have latest data
        if (window.dataStore) {
            if (!window.appState) {
                window.appState = {};
            }
            window.appState.trades = await window.dataStore.getTrades();
            window.appState.ledger = await window.dataStore.getLedger();
        }
        
        const { trades, ledger } = window.appState || { trades: [], ledger: [] };
        const closedTrades = trades.filter(t => t.exit_price && t.exit_date);
        let netPnl = 0, grossProfit = 0, grossLoss = 0, totalNetProfit = 0, totalNetLoss = 0, wins = 0, losses = 0;
            
        closedTrades.forEach(trade => {
            const netPnlValue = calculateNetPnl(trade);
            netPnl += netPnlValue;
            
            // Calculate gross P&L (before charges)
            const exitPrice = parseFloat(trade.exit_price);
            const entryPrice = parseFloat(trade.entry_price);
            const quantity = parseFloat(trade.quantity);
            const isShort = trade.trade_type === 'Short' || trade.direction === 'Short';
            const grossPnlValue = (exitPrice - entryPrice) * quantity * (isShort ? -1 : 1);
            
            // Use NET P&L to determine if it's a win or loss
            if (netPnlValue > 0) {
                wins++;
                grossProfit += netPnlValue;  // Use net P&L consistently
                totalNetProfit += netPnlValue;
            } else if (netPnlValue < 0) {
                losses++;
                grossLoss += Math.abs(netPnlValue);  // Use net P&L consistently
                totalNetLoss += Math.abs(netPnlValue);
            }
        });
            
            const totalTrades = closedTrades.length;
            const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
            const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? '∞' : 0);
            const avgWin = wins > 0 ? grossProfit / wins : 0;
            const avgLoss = losses > 0 ? grossLoss / losses : 0;
            const avgWinLossRatio = avgLoss > 0 ? avgWin / avgLoss : (avgWin > 0 ? '∞' : 0);
            
            // Update main metrics
            const netPnlEl = document.getElementById('db-net-pnl');
            if (netPnlEl) {
                netPnlEl.textContent = window.utils ? window.utils.formatCurrency(netPnl) : `₹${netPnl.toFixed(0)}`;
                netPnlEl.className = netPnl >= 0 ? 'text-green-500' : 'text-red-500';
            }
            
            const winRateEl = document.getElementById('db-win-rate');
            if (winRateEl) {
                winRateEl.textContent = `${winRate.toFixed(1)}%`;
            }
            
            const profitFactorEl = document.getElementById('db-profit-factor');
            if (profitFactorEl) {
                profitFactorEl.textContent = typeof profitFactor === 'number' ? profitFactor.toFixed(2) : profitFactor;
            }
            
            const avgWinLossEl = document.getElementById('db-avg-win-loss');
            if (avgWinLossEl) {
                avgWinLossEl.textContent = typeof avgWinLossRatio === 'number' ? avgWinLossRatio.toFixed(2) : avgWinLossRatio;
            }
            
            // Update trade counts
            const totalTradesEl = document.getElementById('db-total-trades');
            if (totalTradesEl) {
                totalTradesEl.textContent = totalTrades.toString();
            }
            
            const winsEl = document.getElementById('db-wins');
            if (winsEl) {
                winsEl.textContent = wins.toString();
            }
            
            const lossesEl = document.getElementById('db-losses');
            if (lossesEl) {
                lossesEl.textContent = losses.toString();
            }
            
            // Render top winners and losers
            renderDashboardTopWinners();
            renderDashboardTopLosers();
            
    } catch (error) {
        console.error('renderDashboard error:', error);
    }
};

const renderTradeHistory = async (skipDelay = false, filters = {}) => {
    try {
        const tbody = document.getElementById('trade-history-tbody');
        if (!tbody) return;
        
        // Prevent multiple simultaneous renders
        if (tradeHistoryRendering && !skipDelay) return;
        tradeHistoryRendering = true;
        
        let trades = window.appState?.trades;
        if (!trades || trades.length === 0) {
            if (window.dataStore) {
                trades = await window.dataStore.getTrades();
                if (!window.appState) {
                    window.appState = {};
                }
                window.appState.trades = trades;
            }
        }
        
        // Apply filters to trades before rendering
        let filteredTrades = trades;
        if (filters && Object.keys(filters).length > 0) {
            filteredTrades = trades.filter(trade => {
                if (filters.symbol && !trade.asset?.toLowerCase().includes(filters.symbol.toLowerCase())) return false;
                if (filters.side && trade.trade_type !== filters.side && trade.direction !== filters.side) return false;
                if (filters.status) {
                    const isClosed = trade.exit_date && trade.exit_price;
                    if (filters.status === 'open' && isClosed) return false;
                    if (filters.status === 'closed' && !isClosed) return false;
                }
                return true;
            });
        }
        
        // Check if we can use cached HTML (only if no filters)
        const currentHash = performanceCache?.getTradesHash(filteredTrades);
        if (tradeHistoryCache && tradeHistoryLastHash === currentHash && Object.keys(filters).length === 0) {
            tbody.innerHTML = tradeHistoryCache;
            tradeHistoryRendering = false;
            return;
        }
        
        // Render trade history content
        renderTradeHistoryContent(filteredTrades, tbody);
        
    } catch (error) {
        console.error('renderTradeHistory error:', error);
        tradeHistoryRendering = false;
    }
};

const renderTradeHistoryContent = (trades, tbody) => {
    const rowsHtml = trades.map(t => {
        const isClosed = t.exit_date && t.exit_price && (!t.exit_quantity || t.exit_quantity >= t.quantity);
        const isPartialExit = t.exit_date && t.exit_price && t.exit_quantity && t.exit_quantity < t.quantity;
        const pnl = (isClosed || isPartialExit) ? calculateNetPnl(t) : 0;
        const netProfitPercentage = (isClosed || isPartialExit) && t.entry_price ? ((pnl / (t.entry_price * (t.quantity || 0))) * 100) : 0;
        
        return `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-800" style="border-bottom: 1px solid var(--border-color);">
                <td class="px-3 py-2 border-r" style="border-color: var(--border-color);">${t.asset || '—'}</td>
                <td class="px-3 py-2 border-r" style="border-color: var(--border-color);">${t.trade_type || t.direction || '—'}</td>
                <td class="px-3 py-2 border-r" style="border-color: var(--border-color);">${t.quantity || '—'}</td>
                <td class="px-3 py-2 border-r" style="border-color: var(--border-color);">${t.entry_price || '—'}</td>
                <td class="px-3 py-2 border-r" style="border-color: var(--border-color);">${t.exit_price || '—'}</td>
                <td class="px-3 py-2 border-r" style="border-color: var(--border-color);">
                    <span class="${pnl >= 0 ? 'text-green-500' : 'text-red-500'}">
                        ${window.utils ? window.utils.formatCurrency(pnl) : `₹${pnl.toFixed(0)}`}
                    </span>
                </td>
                <td class="px-3 py-2 border-r" style="border-color: var(--border-color);">${t.segment || '—'}</td>
                <td class="px-3 py-2 border-r" style="border-color: var(--border-color);">${window.utils ? window.utils.formatDateForDisplay(t.entry_date) || '—' : '—'}</td>
                <td class="px-3 py-2 border-r" style="border-color: var(--border-color);">${t.stop_loss ?? '—'}</td>
                <td class="px-3 py-2 border-r" style="border-color: var(--border-color);">${t.target_price ?? t.target ?? '—'}</td>
                <td class="px-3 py-2 border-r" style="border-color: var(--border-color);">${t.exit_price ?? '—'}</td>
                <td class="px-3 py-2 border-r" style="border-color: var(--border-color);">${t.exit_quantity ?? '—'}</td>
                <td class="px-3 py-2 border-r" style="border-color: var(--border-color);">${window.utils ? window.utils.formatDateForDisplay(t.exit_date) || '—' : '—'}</td>
                <td class="px-3 py-2 actions-cell" style="border-color: var(--border-color);">
                    ${isClosed ? 
                        // Closed trades: Show Edit and Delete icons only
                        `<button class="action-icon" data-action="edit" data-id="${t.id}" title="Edit Trade">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="action-icon" data-action="delete" data-id="${t.id}" title="Delete Trade">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3,6 5,6 21,6"></polyline>
                                <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                            </svg>
                        </button>` :
                        // Open trades: Show Exit, Edit, and Delete icons
                        `<button class="exit-btn" data-action="exit" data-id="${t.id}" title="Exit Trade">
                            Exit
                        </button>
                        <button class="action-icon" data-action="edit" data-id="${t.id}" title="Edit Trade">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="action-icon" data-action="delete" data-id="${t.id}" title="Delete Trade">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3,6 5,6 21,6"></polyline>
                                <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                            </svg>
                        </button>`
                    }
                </td>
            </tr>
        `;
    }).join('');
    
    // Cache the generated HTML
    tradeHistoryCache = rowsHtml;
    tradeHistoryLastHash = performanceCache?.getTradesHash(trades);
    
    tbody.innerHTML = rowsHtml;
    tradeHistoryRendering = false;
};

const renderCalendar = () => {
    // Clear previous timeout to prevent multiple rapid renders
    if (calendarRenderTimeout) {
        clearTimeout(calendarRenderTimeout);
    }
    
    calendarRenderTimeout = setTimeout(() => {
        try {
            console.log('renderCalendar called - trades count:', window.appState?.trades?.length || 0);
            const monthYearEl = document.getElementById('calendar-month-year');
            const daysContainer = document.getElementById('calendar-grid-days');
            const weeklySummaries = document.getElementById('calendar-grid-summaries');
            
            if (!monthYearEl || !daysContainer || !weeklySummaries) return;
            
            const currentDate = window.appState.calendarDate || new Date();
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth() + 1;
            
            // Update month/year display
            monthYearEl.textContent = `${new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
            
            // Get trades for the current month
            const trades = window.appState?.trades || [];
            const monthTrades = trades.filter(trade => {
                if (!trade.exit_date) return false;
                const tradeDate = new Date(trade.exit_date);
                return tradeDate.getFullYear() === year && tradeDate.getMonth() === month - 1;
            });
            
            // Generate calendar grid
            const firstDay = new Date(year, month - 1, 1);
            const lastDay = new Date(year, month, 0);
            const startDate = new Date(firstDay);
            startDate.setDate(startDate.getDate() - firstDay.getDay());
            
            let calendarHtml = '';
            let calendarDate = new Date(startDate);
            
            // Generate 6 weeks (42 days)
            for (let week = 0; week < 6; week++) {
                let weekHtml = '';
                let weekPnl = 0;
                
                for (let day = 0; day < 7; day++) {
                    const dayTrades = monthTrades.filter(trade => {
                        const tradeDate = new Date(trade.exit_date);
                        return tradeDate.toDateString() === calendarDate.toDateString();
                    });
                    
                    const dayPnl = dayTrades.reduce((sum, trade) => sum + calculateNetPnl(trade), 0);
                    weekPnl += dayPnl;
                    
                    const isCurrentMonth = calendarDate.getMonth() === month - 1;
                    const isToday = calendarDate.toDateString() === new Date().toDateString();
                    const hasTrades = dayTrades.length > 0;
                    
                    weekHtml += `
                        <div class="date-box ${hasTrades ? 'has-trades' : ''} ${isToday ? 'ring-2 ring-blue-500' : ''}" 
                             style="background-color: ${isCurrentMonth ? 'var(--bg-primary)' : 'var(--bg-secondary)'}; 
                                    color: ${isCurrentMonth ? 'var(--text-primary)' : 'var(--text-muted)'};">
                            <div class="date-number">${calendarDate.getDate()}</div>
                            ${dayPnl !== 0 ? `<div class="pl-amount ${dayPnl >= 0 ? 'profit' : 'loss'}">${window.utils ? window.utils.formatCurrency(dayPnl) : `₹${dayPnl.toFixed(0)}`}</div>` : ''}
                        </div>
                    `;
                    
                    calendarDate.setDate(calendarDate.getDate() + 1);
                }
                
                calendarHtml += `<div class="grid grid-cols-7 gap-1 mb-1">${weekHtml}</div>`;
                
                // Add weekly summary
                const weekSummary = `
                    <div class="week-summary" style="background-color: var(--bg-primary); color: var(--text-primary);">
                        <div class="week-label">Week ${week + 1}</div>
                        <div class="amount-text ${weekPnl >= 0 ? 'profit' : 'loss'}">${window.utils ? window.utils.formatCurrency(weekPnl) : `₹${weekPnl.toFixed(0)}`}</div>
                    </div>
                `;
                
                weeklySummaries.innerHTML += weekSummary;
            }
            
            daysContainer.innerHTML = calendarHtml;
            
            // Add event listeners for navigation
            const prevBtn = document.getElementById('calendar-prev');
            const nextBtn = document.getElementById('calendar-next');
            
            prevBtn?.addEventListener('click', () => {
                window.appState.calendarDate = new Date(year, month - 1, 1);
                renderCalendar();
            });
            nextBtn?.addEventListener('click', () => {
                window.appState.calendarDate = new Date(year, month + 1, 1);
                renderCalendar();
            });
            
            // Replace feather icons
            if (typeof feather !== 'undefined') {
                feather.replace();
            }
            
        } catch (e) {
            console.error('renderCalendar error', e);
        }
    }, 50); // 50ms debounce delay
};

const renderReports = () => {
    // Clear previous timeout to prevent multiple rapid renders
    if (reportsRenderTimeout) {
        clearTimeout(reportsRenderTimeout);
    }
    
    reportsRenderTimeout = setTimeout(() => {
        try {
            console.log('renderReports called - trades count:', window.appState?.trades?.length || 0);
            // Render original Performance Metrics
            const container = document.getElementById('reports-metrics-grid');
            if (!container) {
                console.log('Reports container not found');
                return;
            }
            
            const trades = window.appState?.trades || [];
            const closedTrades = trades.filter(t => t.exit_price && t.exit_date);
            
            // Calculate metrics
            let totalPnl = 0;
            let wins = 0;
            let losses = 0;
            let grossProfit = 0;
            let grossLoss = 0;
            
            closedTrades.forEach(trade => {
                const pnl = calculateNetPnl(trade);
                totalPnl += pnl;
                
                if (pnl > 0) {
                    wins++;
                    grossProfit += pnl;
                } else if (pnl < 0) {
                    losses++;
                    grossLoss += Math.abs(pnl);
                }
            });
            
            const winRate = closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0;
            const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? '∞' : 0);
            const avgWin = wins > 0 ? grossProfit / wins : 0;
            const avgLoss = losses > 0 ? grossLoss / losses : 0;
            const avgWinLossRatio = avgLoss > 0 ? avgWin / avgLoss : (avgWin > 0 ? '∞' : 0);
            
            // Render metrics
            container.innerHTML = `
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h3 class="text-lg font-semibold mb-4">Performance Metrics</h3>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <div class="text-sm text-gray-600 dark:text-gray-400">Total P&L</div>
                            <div class="text-2xl font-bold ${totalPnl >= 0 ? 'text-green-500' : 'text-red-500'}">
                                ${window.utils ? window.utils.formatCurrency(totalPnl) : `₹${totalPnl.toFixed(0)}`}
                            </div>
                        </div>
                        <div>
                            <div class="text-sm text-gray-600 dark:text-gray-400">Win Rate</div>
                            <div class="text-2xl font-bold">${winRate.toFixed(1)}%</div>
                        </div>
                        <div>
                            <div class="text-sm text-gray-600 dark:text-gray-400">Profit Factor</div>
                            <div class="text-2xl font-bold">${typeof profitFactor === 'number' ? profitFactor.toFixed(2) : profitFactor}</div>
                        </div>
                        <div>
                            <div class="text-sm text-gray-600 dark:text-gray-400">Avg Win/Loss</div>
                            <div class="text-2xl font-bold">${typeof avgWinLossRatio === 'number' ? avgWinLossRatio.toFixed(2) : avgWinLossRatio}</div>
                        </div>
                    </div>
                </div>
            `;
            
        } catch (e) {
            console.error('renderReports error', e);
        }
    }, 50); // 50ms debounce delay
};

const renderStatement = (filters = {}, skipDelay = false) => {
    // Clear previous timeout to prevent multiple rapid renders
    if (statementRenderTimeout) {
        clearTimeout(statementRenderTimeout);
    }
    
    if (skipDelay) {
        try {
            console.log('renderStatement called (skipDelay) - trades count:', window.appState?.trades?.length || 0, 'ledger count:', window.appState?.ledger?.length || 0);
            const statementBody = document.getElementById('statement-tbody');
            if (!statementBody) {
                console.log('Statement body not found');
                return;
            }
            
            const trades = window.appState?.trades || [];
            const ledger = window.appState?.ledger || [];
            
            // Render immediately for theme changes
            renderStatementContent(trades, ledger, statementBody, filters);
        } catch (e) {
            console.error('renderStatement error', e);
        }
        return;
    }
    
    statementRenderTimeout = setTimeout(async () => {
        try {
            if (statementRendering) return;
            statementRendering = true;
            
            console.log('renderStatement called - trades count:', window.appState?.trades?.length || 0, 'ledger count:', window.appState?.ledger?.length || 0);
            const statementBody = document.getElementById('statement-tbody');
            if (!statementBody) {
                console.log('Statement body not found');
                statementRendering = false;
                return;
            }
            
            const trades = window.appState?.trades || [];
            const ledger = window.appState?.ledger || [];
            
            if (trades.length === 0 && ledger.length === 0) {
                statementBody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-500">No data available</td></tr>';
                statementRendering = false;
                return;
            }
            
            // Use requestAnimationFrame for better performance
            if (window.requestAnimationFrame) {
                requestAnimationFrame(() => {
                    renderStatementContent(trades, ledger, statementBody, filters);
                    statementRendering = false;
                });
            } else {
                renderStatementContent(trades, ledger, statementBody, filters);
                statementRendering = false;
            }
            
        } catch (e) {
            console.error('renderStatement error', e);
            statementRendering = false;
        }
    }, 5); // Reduced debounce delay from 10ms to 5ms
};

const renderStatementContent = async (trades, ledger, statementBody, filters) => {
    try {
        const tradeRows = await Promise.all(trades.map(async t => {
            const closed = t.exit_date && t.exit_price;
            
            // Get charges from partial exit data
            let charges = 0;
            try {
                if (window.dataStore) {
                    const partialExits = await window.dataStore.getPartialExits(t.id);
                    if (partialExits.length > 0) {
                        charges = partialExits.reduce((sum, exit) => sum + (exit.brokerage || 0) + (exit.charges || 0), 0);
                    } else {
                        // Fallback to main trade data
                        charges = (t.brokerage || 0) + (t.other_fees || 0);
                    }
                }
            } catch (err) {
                console.warn('Failed to get partial exits for trade', t.id, err);
                charges = (t.brokerage || 0) + (t.other_fees || 0);
            }
            
            const netPnl = closed ? calculateNetPnl(t) : 0;
            const grossPnl = closed ? (parseFloat(t.exit_price) - parseFloat(t.entry_price)) * parseFloat(t.quantity) * (t.trade_type === 'Short' || t.direction === 'Short' ? -1 : 1) : 0;
            
            return `
                <tr class="hover:bg-gray-50 dark:hover:bg-gray-800" style="border-bottom: 1px solid var(--border-color);">
                    <td class="px-3 py-2 border-r" style="border-color: var(--border-color);">${t.asset || '—'}</td>
                    <td class="px-3 py-2 border-r" style="border-color: var(--border-color);">${t.trade_type || t.direction || '—'}</td>
                    <td class="px-3 py-2 border-r" style="border-color: var(--border-color);">${t.quantity || '—'}</td>
                    <td class="px-3 py-2 border-r" style="border-color: var(--border-color);">${t.entry_price || '—'}</td>
                    <td class="px-3 py-2 border-r" style="border-color: var(--border-color);">${t.exit_price || '—'}</td>
                    <td class="px-3 py-2 border-r" style="border-color: var(--border-color);">
                        <span class="${netPnl >= 0 ? 'text-green-500' : 'text-red-500'}">
                            ${window.utils ? window.utils.formatCurrency(netPnl) : `₹${netPnl.toFixed(0)}`}
                        </span>
                    </td>
                    <td class="px-3 py-2 border-r" style="border-color: var(--border-color);">${window.utils ? window.utils.formatCurrency(charges) : `₹${charges.toFixed(0)}`}</td>
                    <td class="px-3 py-2" style="border-color: var(--border-color);">${window.utils ? window.utils.formatDateForDisplay(t.exit_date) || '—' : '—'}</td>
                </tr>
            `;
        }));
        
        const ledgerRows = ledger.map(l => `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-800" style="border-bottom: 1px solid var(--border-color);">
                <td class="px-3 py-2 border-r" style="border-color: var(--border-color);">${l.type || '—'}</td>
                <td class="px-3 py-2 border-r" style="border-color: var(--border-color);">—</td>
                <td class="px-3 py-2 border-r" style="border-color: var(--border-color);">—</td>
                <td class="px-3 py-2 border-r" style="border-color: var(--border-color);">—</td>
                <td class="px-3 py-2 border-r" style="border-color: var(--border-color);">—</td>
                <td class="px-3 py-2 border-r" style="border-color: var(--border-color);">
                    <span class="${l.amount >= 0 ? 'text-green-500' : 'text-red-500'}">
                        ${window.utils ? window.utils.formatCurrency(l.amount) : `₹${l.amount.toFixed(0)}`}
                    </span>
                </td>
                <td class="px-3 py-2 border-r" style="border-color: var(--border-color);">—</td>
                <td class="px-3 py-2" style="border-color: var(--border-color);">${window.utils ? window.utils.formatDateForDisplay(l.date) || '—' : '—'}</td>
            </tr>
        `);
        
        statementBody.innerHTML = [...tradeRows, ...ledgerRows].join('');
        
    } catch (error) {
        console.error('renderStatementContent error:', error);
    }
};

const renderFundManagement = async () => {
    try {
        // Load ledger
        if (window.dataStore) {
            if (!window.appState) {
                window.appState = {};
            }
            window.appState.ledger = await window.dataStore.getLedger();
        }
        console.log('renderFundManagement: ledger data:', window.appState?.ledger);

        // Calculate all financial metrics with validation
        const deposits = (window.appState?.ledger || [])
            .filter(l => l.type === 'Deposit')
            .reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
        
        const withdrawals = (window.appState?.ledger || [])
            .filter(l => l.type === 'Withdrawal')
            .reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
        
        const currentBalance = deposits - withdrawals;
        
        // Update UI elements
        const balanceEl = document.getElementById('current-balance');
        if (balanceEl) {
            balanceEl.textContent = window.utils ? window.utils.formatCurrency(currentBalance) : `₹${currentBalance.toFixed(0)}`;
        }
        
        const depositsEl = document.getElementById('total-deposits');
        if (depositsEl) {
            depositsEl.textContent = window.utils ? window.utils.formatCurrency(deposits) : `₹${deposits.toFixed(0)}`;
        }
        
        const withdrawalsEl = document.getElementById('total-withdrawals');
        if (withdrawalsEl) {
            withdrawalsEl.textContent = window.utils ? window.utils.formatCurrency(withdrawals) : `₹${withdrawals.toFixed(0)}`;
        }
        
    } catch (error) {
        console.error('renderFundManagement error:', error);
    }
};

const renderProfile = (profileData) => {
    try {
        console.log('Rendering profile page with data:', profileData);
        
        if (!profileData) {
            console.log('No profile data provided');
            return;
        }
        
        // Update profile form fields
        const nameInput = document.getElementById('profile-name');
        if (nameInput) {
            nameInput.value = profileData.name || '';
        }
        
        const emailInput = document.getElementById('profile-email');
        if (emailInput) {
            emailInput.value = profileData.email || '';
        }
        
    } catch (error) {
        console.error('renderProfile error:', error);
    }
};

const renderChallenge = async () => {
    // Prevent multiple simultaneous renders
    if (isRendering) return;
    isRendering = true;
    
    try {
        const challenge = window.appState?.challenge;
        if (!challenge) {
            // Show challenge creation form
            const container = document.getElementById('challenge-container');
            if (container) {
                container.innerHTML = `
                    <div class="text-center py-8">
                        <h3 class="text-lg font-semibold mb-4">No Active Challenge</h3>
                        <p class="text-gray-600 dark:text-gray-400 mb-6">Create a new trading challenge to track your progress.</p>
                        <button id="create-challenge-btn" class="btn-primary px-6 py-2 rounded-md">
                            Create Challenge
                        </button>
                    </div>
                `;
            }
        } else {
            // Show active challenge
            const container = document.getElementById('challenge-container');
            if (container) {
                container.innerHTML = `
                    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                        <h3 class="text-lg font-semibold mb-4">${challenge.title}</h3>
                        <p class="text-gray-600 dark:text-gray-400 mb-4">${challenge.description}</p>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <div class="text-sm text-gray-600 dark:text-gray-400">Starting Capital</div>
                                <div class="text-xl font-bold">${window.utils ? window.utils.formatCurrency(challenge.startingCapital) : `₹${challenge.startingCapital.toFixed(0)}`}</div>
                            </div>
                            <div>
                                <div class="text-sm text-gray-600 dark:text-gray-400">Target Capital</div>
                                <div class="text-xl font-bold">${window.utils ? window.utils.formatCurrency(challenge.targetCapital) : `₹${challenge.targetCapital.toFixed(0)}`}</div>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('renderChallenge error:', error);
    } finally {
        isRendering = false;
    }
};

const renderAIAnalyst = async () => {
    // Clear previous timeout to prevent multiple rapid renders
    if (aiAnalystRenderTimeout) {
        clearTimeout(aiAnalystRenderTimeout);
    }
    
    aiAnalystRenderTimeout = setTimeout(() => {
        try {
            console.log('renderAIAnalyst called - trades count:', window.appState?.trades?.length || 0);
            
            const container = document.getElementById('ai-analyst-content');
            if (!container) {
                console.log('AI Analyst container not found');
                return;
            }
            
            const trades = window.appState?.trades || [];
            const closedTrades = trades.filter(t => t.exit_price && t.exit_date);
            
            if (closedTrades.length === 0) {
                container.innerHTML = `
                    <div class="text-center py-8">
                        <h3 class="text-lg font-semibold mb-4">No Data Available</h3>
                        <p class="text-gray-600 dark:text-gray-400">Complete some trades to see AI analysis.</p>
                    </div>
                `;
                return;
            }
            
            // Calculate basic metrics for AI analysis
            const totalPnl = closedTrades.reduce((sum, trade) => sum + calculateNetPnl(trade), 0);
            const winRate = closedTrades.filter(trade => calculateNetPnl(trade) > 0).length / closedTrades.length * 100;
            
            container.innerHTML = `
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h3 class="text-lg font-semibold mb-4">AI Trading Analysis</h3>
                    <div class="space-y-4">
                        <div>
                            <div class="text-sm text-gray-600 dark:text-gray-400">Total P&L</div>
                            <div class="text-2xl font-bold ${totalPnl >= 0 ? 'text-green-500' : 'text-red-500'}">
                                ${window.utils ? window.utils.formatCurrency(totalPnl) : `₹${totalPnl.toFixed(0)}`}
                            </div>
                        </div>
                        <div>
                            <div class="text-sm text-gray-600 dark:text-gray-400">Win Rate</div>
                            <div class="text-2xl font-bold">${winRate.toFixed(1)}%</div>
                        </div>
                        <div>
                            <div class="text-sm text-gray-600 dark:text-gray-400">Total Trades</div>
                            <div class="text-2xl font-bold">${closedTrades.length}</div>
                        </div>
                    </div>
                </div>
            `;
            
        } catch (error) {
            console.error('renderAIAnalyst error:', error);
        }
    }, 50); // 50ms debounce delay
};

// Helper functions for dashboard
const renderDashboardTopWinners = () => {
    try {
        const trades = window.appState?.trades || [];
        const closedTrades = trades.filter(t => t.exit_price && t.exit_date);
        
        // Filter winners (positive P&L) and sort by P&L (best first)
        const winners = closedTrades
            .map(trade => ({ ...trade, pnl: calculateNetPnl(trade) }))
            .filter(trade => trade.pnl > 0)
            .sort((a, b) => b.pnl - a.pnl)
            .slice(0, 5);
        
        const container = document.getElementById('top-winners');
        if (container) {
            container.innerHTML = winners.map(trade => `
                <div class="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <div class="font-medium">${trade.asset || 'Unknown'}</div>
                        <div class="text-sm text-gray-500">${window.utils ? window.utils.formatDateForDisplay(trade.exit_date) : trade.exit_date}</div>
                    </div>
                    <div class="text-green-500 font-semibold">
                        ${window.utils ? window.utils.formatCurrency(trade.pnl) : `₹${trade.pnl.toFixed(0)}`}
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('renderDashboardTopWinners error:', error);
    }
};

const renderDashboardTopLosers = () => {
    try {
        const trades = window.appState?.trades || [];
        const closedTrades = trades.filter(t => t.exit_price && t.exit_date);
        
        // Filter losers (negative P&L) and sort by P&L (worst first)
        const losers = closedTrades
            .map(trade => ({ ...trade, pnl: calculateNetPnl(trade) }))
            .filter(trade => trade.pnl < 0)
            .sort((a, b) => a.pnl - b.pnl)
            .slice(0, 5);
        
        const container = document.getElementById('top-losers');
        if (container) {
            container.innerHTML = losers.map(trade => `
                <div class="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <div class="font-medium">${trade.asset || 'Unknown'}</div>
                        <div class="text-sm text-gray-500">${window.utils ? window.utils.formatDateForDisplay(trade.exit_date) : trade.exit_date}</div>
                    </div>
                    <div class="text-red-500 font-semibold">
                        ${window.utils ? window.utils.formatCurrency(trade.pnl) : `₹${trade.pnl.toFixed(0)}`}
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('renderDashboardTopLosers error:', error);
    }
};

// Export functions to window
window.ui = {
    renderDashboard,
    renderTradeHistory,
    renderCalendar,
    renderReports,
    renderStatement,
    renderFundManagement,
    renderProfile,
    renderChallenge,
    renderAIAnalyst,
    renderTradeHistoryContent,
    renderStatementContent,
    renderDashboardTopWinners,
    renderDashboardTopLosers
};
