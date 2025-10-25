// Chart.js setup and rendering functions extracted from index.html

// Global variables for chart management
let chartRenderTimeout = null;
const chartInstances = {};

// Theme color helper
const getThemeColors = () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const chartTextColor = getComputedStyle(document.documentElement).getPropertyValue('--chart-text').trim();
    return {
        textPrimary: isDark ? '#ffffff' : '#212529',
        textSecondary: isDark ? '#d1d5db' : '#2c333a',
        textColor: chartTextColor || (isDark ? '#ffffff' : '#212529'),
        chartText: chartTextColor || (isDark ? '#ffffff' : '#212529'),
        gridColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
        backgroundColor: isDark ? '#1f2937' : '#ffffff',
        borderColor: isDark ? '#374151' : '#e5e7eb'
    };
};

// Update all charts when theme changes
const updateChartsOnThemeChange = () => {
    const colors = getThemeColors();
    console.log('Updating charts with theme colors:', colors);
    
    // Use requestAnimationFrame for smoother theme updates
    requestAnimationFrame(() => {
        Object.values(chartInstances).forEach((chart, index) => {
            if (chart && typeof chart.update === 'function') {
                try {
                    // Update chart options with new theme colors
                    if (chart.options && chart.options.scales) {
                        // Update axis text colors
                        if (chart.options.scales.x && chart.options.scales.x.ticks) {
                            chart.options.scales.x.ticks.color = colors.chartText || colors.textColor;
                        }
                        if (chart.options.scales.y && chart.options.scales.y.ticks) {
                            chart.options.scales.y.ticks.color = colors.chartText || colors.textColor;
                        }
                    }
                    
                    // Update legend colors
                    if (chart.options && chart.options.plugins && chart.options.plugins.legend) {
                        if (chart.options.plugins.legend.labels) {
                            chart.options.plugins.legend.labels.color = colors.chartText || colors.textColor;
                        }
                    }
                    
                    // Update tooltip colors
                    if (chart.options && chart.options.plugins && chart.options.plugins.tooltip) {
                        // Force all tooltips to use dark theme regardless of page theme
                        chart.options.plugins.tooltip.backgroundColor = '#111827';
                        chart.options.plugins.tooltip.titleColor = '#ffffff';
                        chart.options.plugins.tooltip.bodyColor = '#ffffff';
                        chart.options.plugins.tooltip.borderColor = 'rgba(255, 255, 255, 0.06)';
                        
                        // Ensure continuous tooltip mode is enabled
                        chart.options.plugins.tooltip.mode = 'index';
                        chart.options.plugins.tooltip.intersect = false;
                    }
                    
                    // Update grid colors
                    if (chart.options && chart.options.scales) {
                        if (chart.options.scales.x && chart.options.scales.x.grid) {
                            chart.options.scales.x.grid.color = colors.gridColor;
                        }
                        if (chart.options.scales.y && chart.options.scales.y.grid) {
                            chart.options.scales.y.grid.color = colors.gridColor;
                        }
                    }
                    
                    // Update chart
                    chart.update('none');
                } catch (error) {
                    console.error(`Error updating chart ${index}:`, error);
                }
            }
        });
    });
};

// Main chart rendering function
const renderAllCharts = (forceRender = false) => {
    // Clear existing timeout
    if (chartRenderTimeout && !forceRender) {
        clearTimeout(chartRenderTimeout);
    }
    
    // Debounce chart rendering by 50ms to prevent excessive re-renders
    chartRenderTimeout = setTimeout(() => {
        try {
            console.log('renderAllCharts called - Starting chart rendering');
            if (typeof Chart === 'undefined') {
                console.warn('Chart.js not loaded');
                return;
            }
            console.log('Chart.js is loaded, proceeding with chart rendering');
            
            // Register zoom plugin if available
            if (typeof Chart !== 'undefined' && Chart.register) {
                try {
                    if (typeof ChartZoom !== 'undefined') {
                        Chart.register(ChartZoom);
                        console.log('Chart.js zoom plugin registered successfully');
                    } else {
                        console.warn('ChartZoom plugin not found - keyboard navigation may not work');
                    }
                } catch (e) {
                    console.warn('Failed to register zoom plugin:', e);
                }
            } else {
                console.warn('Chart.register not available - using older Chart.js version?');
            }

            // Get theme colors once for all charts
            const themeColors = getThemeColors();
            console.log('Theme colors for charts:', themeColors);

            const trades = Array.isArray(window.appState.trades) ? window.appState.trades : [];
            const ledger = Array.isArray(window.appState.ledger) ? window.appState.ledger : [];
            
            // Performance optimization: Cache filtered trades
            const closedTrades = trades.filter(t => t.exit_date && t.exit_price);
            
            console.log('Data available:', {
                trades: trades.length,
                closedTrades: closedTrades.length,
                ledger: ledger.length
            });
            
            // Calculate daily P&L from closed trades
            const byDay = {};
            closedTrades.forEach(t => {
                if (!(t.exit_date && t.exit_price)) return;
                
                // Validate the exit_date before converting
                const exitDate = new Date(t.exit_date);
                if (isNaN(exitDate.getTime())) {
                    return; // Skip this trade
                }
                
                const d = exitDate.toISOString().slice(0,10);
                const pnl = calculateNetPnl(t);
                if (isFinite(pnl)) {
                    byDay[d] = (byDay[d] || 0) + pnl;
                }
            });
            
            // Calculate cumulative equity curve
            const sortedDays = Object.keys(byDay).sort();
            let cumulativePnl = 0;
            const equityData = sortedDays.map(day => {
                cumulativePnl += byDay[day];
                return cumulativePnl;
            });
            
            // Calculate account balance including deposits/withdrawals
            const deposits = ledger.filter(l => l.type === 'Deposit').reduce((s, l) => s + (l.amount || 0), 0);
            const withdrawals = ledger.filter(l => l.type === 'Withdrawal').reduce((s, l) => s + (l.amount || 0), 0);
            const baseBalance = deposits - withdrawals;
            
            const balanceData = sortedDays.map(day => {
                const dayPnl = byDay[day];
                const dayIndex = sortedDays.indexOf(day);
                const cumulativeToDay = equityData[dayIndex];
                return baseBalance + cumulativeToDay;
            });
            
            // Use real data only
            const labels = sortedDays.length > 0 ? sortedDays : [];
            let data = sortedDays.length > 0 ? sortedDays.map(d => byDay[d]) : [];

            const colorUp = 'rgba(34,197,94,0.7)';
            const colorDown = 'rgba(239,68,68,0.7)';

            // Render Daily P&L Chart
            const dailyPnlCtx = document.getElementById('daily-pnl-chart');
            if (dailyPnlCtx) {
                // Clean up existing chart
                if (chartInstances['dailyPnlChart']) {
                    const oldChart = chartInstances['dailyPnlChart'];
                    if (oldChart._keyboardNavHandler) {
                        document.removeEventListener('keydown', oldChart._keyboardNavHandler);
                    }
                    if (oldChart._mouseEnterHandler) {
                        oldChart.canvas.removeEventListener('mouseenter', oldChart._mouseEnterHandler);
                    }
                    if (oldChart._mouseLeaveHandler) {
                        oldChart.canvas.removeEventListener('mouseleave', oldChart._mouseLeaveHandler);
                    }
                    if (oldChart._doubleClickHandler) {
                        oldChart.canvas.removeEventListener('dblclick', oldChart._doubleClickHandler);
                    }
                    oldChart.destroy();
                }

                // Use real data only - no sample data
                const dailyPnlChart = new Chart(dailyPnlCtx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Daily P&L',
                            data: data,
                            backgroundColor: data.map(value => value >= 0 ? 'rgba(34, 197, 94, 0.7)' : 'rgba(239, 68, 68, 0.7)'),
                            borderColor: data.map(value => value >= 0 ? 'rgba(34, 197, 94, 1)' : 'rgba(239, 68, 68, 1)'),
                            borderWidth: 1,
                            borderRadius: 4,
                            borderSkipped: false,
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: true,
                                labels: {
                                    color: themeColors.chartText,
                                    font: {
                                        size: 12
                                    }
                                }
                            },
                            tooltip: {
                                backgroundColor: '#111827',
                                titleColor: '#ffffff',
                                bodyColor: '#ffffff',
                                borderColor: 'rgba(255, 255, 255, 0.06)',
                                borderWidth: 1,
                                mode: 'index',
                                intersect: false,
                                callbacks: {
                                    label: function(context) {
                                        const value = context.parsed.y;
                                        return `P&L: ${window.utils ? window.utils.formatCurrency(value) : `₹${value.toFixed(0)}`}`;
                                    }
                                }
                            },
                            zoom: {
                                pan: {
                                    enabled: true,
                                    mode: 'x',
                                },
                                zoom: {
                                    wheel: {
                                        enabled: true,
                                    },
                                    pinch: {
                                        enabled: true
                                    },
                                    mode: 'x',
                                }
                            }
                        },
                        scales: {
                            x: {
                                grid: {
                                    color: themeColors.gridColor,
                                    drawBorder: false,
                                },
                                ticks: {
                                    color: themeColors.chartText,
                                    maxRotation: 45,
                                    minRotation: 0
                                }
                            },
                            y: {
                                grid: {
                                    color: themeColors.gridColor,
                                    drawBorder: false,
                                },
                                ticks: {
                                    color: themeColors.chartText,
                                    callback: function(value) {
                                        return window.utils ? window.utils.formatCurrency(value) : `₹${value.toFixed(0)}`;
                                    }
                                }
                            }
                        },
                        interaction: {
                            intersect: false,
                            mode: 'index'
                        }
                    }
                });
                
                chartInstances['dailyPnlChart'] = dailyPnlChart;
            }

            // Render Equity Curve Chart
            const equityCtx = document.getElementById('equity-curve-chart');
            if (equityCtx) {
                // Clean up existing chart
                if (chartInstances['equityCurveChart']) {
                    const oldChart = chartInstances['equityCurveChart'];
                    if (oldChart._keyboardNavHandler) {
                        document.removeEventListener('keydown', oldChart._keyboardNavHandler);
                    }
                    if (oldChart._mouseEnterHandler) {
                        oldChart.canvas.removeEventListener('mouseenter', oldChart._mouseEnterHandler);
                    }
                    if (oldChart._mouseLeaveHandler) {
                        oldChart.canvas.removeEventListener('mouseleave', oldChart._mouseLeaveHandler);
                    }
                    if (oldChart._doubleClickHandler) {
                        oldChart.canvas.removeEventListener('dblclick', oldChart._doubleClickHandler);
                    }
                    oldChart.destroy();
                }

                const chartLabels = sortedDays.length > 0 ? sortedDays : [];
                const equityChart = new Chart(equityCtx, {
                    type: 'line',
                    data: {
                        labels: chartLabels,
                        datasets: [
                            {
                                label: 'Equity Curve',
                                data: equityData,
                                borderColor: function(context) {
                                    const value = context.parsed?.y;
                                    if (value === undefined || value === null) {
                                        return '#3b82f6';
                                    }
                                    return value >= 0 ? '#22c55e' : '#ef4444';
                                },
                                backgroundColor: function(context) {
                                    const value = context.parsed?.y;
                                    if (value === undefined || value === null) {
                                        return 'rgba(59, 130, 246, 0.1)';
                                    }
                                    return value >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)';
                                },
                                borderWidth: 2,
                                fill: true,
                                tension: 0.4,
                                pointRadius: 3,
                                pointHoverRadius: 6,
                                pointBackgroundColor: function(context) {
                                    const value = context.parsed?.y;
                                    if (value === undefined || value === null) {
                                        return '#3b82f6';
                                    }
                                    return value >= 0 ? '#22c55e' : '#ef4444';
                                },
                                pointBorderColor: function(context) {
                                    const value = context.parsed?.y;
                                    if (value === undefined || value === null) {
                                        return '#3b82f6';
                                    }
                                    return value >= 0 ? '#22c55e' : '#ef4444';
                                }
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: true,
                                labels: {
                                    color: themeColors.chartText,
                                    font: {
                                        size: 12
                                    }
                                }
                            },
                            tooltip: {
                                backgroundColor: '#111827',
                                titleColor: '#ffffff',
                                bodyColor: '#ffffff',
                                borderColor: 'rgba(255, 255, 255, 0.06)',
                                borderWidth: 1,
                                mode: 'index',
                                intersect: false,
                                callbacks: {
                                    label: function(context) {
                                        const value = context.parsed.y;
                                        return `Cumulative P&L: ${window.utils ? window.utils.formatCurrency(value) : `₹${value.toFixed(0)}`}`;
                                    }
                                }
                            },
                            zoom: {
                                pan: {
                                    enabled: true,
                                    mode: 'x',
                                },
                                zoom: {
                                    wheel: {
                                        enabled: true,
                                    },
                                    pinch: {
                                        enabled: true
                                    },
                                    mode: 'x',
                                }
                            }
                        },
                        scales: {
                            x: {
                                grid: {
                                    color: themeColors.gridColor,
                                    drawBorder: false,
                                },
                                ticks: {
                                    color: themeColors.chartText,
                                    maxRotation: 45,
                                    minRotation: 0
                                }
                            },
                            y: {
                                grid: {
                                    color: themeColors.gridColor,
                                    drawBorder: false,
                                },
                                ticks: {
                                    color: themeColors.chartText,
                                    callback: function(value) {
                                        return window.utils ? window.utils.formatCurrency(value) : `₹${value.toFixed(0)}`;
                                    }
                                }
                            }
                        },
                        interaction: {
                            intersect: false,
                            mode: 'index'
                        }
                    }
                });
                
                chartInstances['equityCurveChart'] = equityChart;
            }

            // Render Account Balance Chart
            const balanceCtx = document.getElementById('account-balance-chart');
            if (balanceCtx) {
                // Clean up existing chart
                if (chartInstances['accountBalanceChart']) {
                    const oldChart = chartInstances['accountBalanceChart'];
                    if (oldChart._keyboardNavHandler) {
                        document.removeEventListener('keydown', oldChart._keyboardNavHandler);
                    }
                    if (oldChart._mouseEnterHandler) {
                        oldChart.canvas.removeEventListener('mouseenter', oldChart._mouseEnterHandler);
                    }
                    if (oldChart._mouseLeaveHandler) {
                        oldChart.canvas.removeEventListener('mouseleave', oldChart._mouseLeaveHandler);
                    }
                    if (oldChart._doubleClickHandler) {
                        oldChart.canvas.removeEventListener('dblclick', oldChart._doubleClickHandler);
                    }
                    oldChart.destroy();
                }

                const balanceChart = new Chart(balanceCtx, {
                    type: 'line',
                    data: {
                        labels: chartLabels,
                        datasets: [{
                            label: 'Account Balance',
                            data: balanceData,
                            borderColor: '#3b82f6',
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.4,
                            pointRadius: 3,
                            pointHoverRadius: 6,
                            pointBackgroundColor: '#3b82f6',
                            pointBorderColor: '#3b82f6'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: true,
                                labels: {
                                    color: themeColors.chartText,
                                    font: {
                                        size: 12
                                    }
                                }
                            },
                            tooltip: {
                                backgroundColor: '#111827',
                                titleColor: '#ffffff',
                                bodyColor: '#ffffff',
                                borderColor: 'rgba(255, 255, 255, 0.06)',
                                borderWidth: 1,
                                mode: 'index',
                                intersect: false,
                                callbacks: {
                                    label: function(context) {
                                        const value = context.parsed.y;
                                        return `Balance: ${window.utils ? window.utils.formatCurrency(value) : `₹${value.toFixed(0)}`}`;
                                    }
                                }
                            },
                            zoom: {
                                pan: {
                                    enabled: true,
                                    mode: 'x',
                                },
                                zoom: {
                                    wheel: {
                                        enabled: true,
                                    },
                                    pinch: {
                                        enabled: true
                                    },
                                    mode: 'x',
                                }
                            }
                        },
                        scales: {
                            x: {
                                grid: {
                                    color: themeColors.gridColor,
                                    drawBorder: false,
                                },
                                ticks: {
                                    color: themeColors.chartText,
                                    maxRotation: 45,
                                    minRotation: 0
                                }
                            },
                            y: {
                                grid: {
                                    color: themeColors.gridColor,
                                    drawBorder: false,
                                },
                                ticks: {
                                    color: themeColors.chartText,
                                    callback: function(value) {
                                        return window.utils ? window.utils.formatCurrency(value) : `₹${value.toFixed(0)}`;
                                    }
                                }
                            }
                        },
                        interaction: {
                            intersect: false,
                            mode: 'index'
                        }
                    }
                });
                
                chartInstances['accountBalanceChart'] = balanceChart;
            }

            // Render Challenge Progress Chart
            const progressCtx = document.getElementById('challenge-progress-chart');
            if (progressCtx && window.appState.challenge) {
                const challenge = window.appState.challenge;
                const currentCapital = challenge.startingCapital + (equityData[equityData.length - 1] || 0);
                const progressPercent = Math.min((currentCapital / challenge.targetCapital) * 100, 100);
                
                if (chartInstances['challengeProgressChart']) {
                    // Just update the data without recreating the chart
                    chartInstances['challengeProgressChart'].data.datasets[0].data = [progressPercent, 100 - progressPercent];
                    chartInstances['challengeProgressChart'].update('none'); // No animation for smoother updates
                } else {
                    const progressChart = new Chart(progressCtx, {
                        type: 'doughnut',
                        data: {
                            datasets: [{
                                data: [progressPercent, 100 - progressPercent],
                                backgroundColor: ['#22c55e', '#e5e7eb'],
                                borderWidth: 0
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: {
                                    display: false
                                },
                                tooltip: {
                                    backgroundColor: '#111827',
                                    titleColor: '#ffffff',
                                    bodyColor: '#ffffff',
                                    borderColor: 'rgba(255, 255, 255, 0.06)',
                                    borderWidth: 1,
                                    callbacks: {
                                        label: function(context) {
                                            const value = context.parsed;
                                            return `${value.toFixed(1)}%`;
                                        }
                                    }
                                }
                            }
                        }
                    });
                    chartInstances['challengeProgressChart'] = progressChart;
                }
            }

        } catch (e) {
            console.error('renderAllCharts error', e);
        }
    }, forceRender ? 0 : 50); // 50ms debounce, or immediate if forced
};

// Draw equity chart (alias for renderAllCharts)
const drawEquityChart = () => {
    renderAllCharts(true);
};

// Update PNL chart (alias for renderAllCharts)
const updatePNLChart = () => {
    renderAllCharts(true);
};

// Create chart (alias for renderAllCharts)
const createChart = () => {
    renderAllCharts(true);
};

// Export functions to window
window.charts = {
    renderAllCharts,
    drawEquityChart,
    updatePNLChart,
    createChart,
    updateChartsOnThemeChange,
    getThemeColors,
    chartInstances
};
