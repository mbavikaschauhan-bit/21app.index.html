// CSV import functionality extracted from index.html

// Global variables for CSV upload state
let csvUploadInProgress = false;
let csvEventListenersAttached = false; // Prevent duplicate event listeners
let lastProcessedFile = null; // Track last processed file to prevent duplicates

// Date parsing utility function for CSV
function parseCSVDate(dateString) {
    if (!dateString || dateString.trim() === '') return null;
    
    try {
        const date = dateString.trim();
        
        // Handle DD-MM-YYYY format
        if (date.includes('-') && date.split('-').length === 3) {
            const parts = date.split('-');
            if (parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
                // DD-MM-YYYY format
                const [day, month, year] = parts;
                return new Date(year, month - 1, day);
            } else if (parts[0].length === 4 && parts[1].length === 2 && parts[2].length === 2) {
                // YYYY-MM-DD format
                const [year, month, day] = parts;
                return new Date(year, month - 1, day);
            }
        }
        
        // Handle DD/MM/YYYY format
        if (date.includes('/') && date.split('/').length === 3) {
            const parts = date.split('/');
            if (parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
                // DD/MM/YYYY format
                const [day, month, year] = parts;
                return new Date(year, month - 1, day);
            }
        }
        
        // Fallback to native Date parsing
        return new Date(date);
    } catch (error) {
        console.warn('Invalid date format:', dateString);
        return null;
    }
}

// CSV Processing Functions
async function handleCSVFile(event) {
    console.log('handleCSVFile called');
    const file = event.target.files[0];
    if (!file) {
        console.log('No file selected');
        return;
    }
    
    console.log('Processing file:', file.name, 'Size:', file.size, 'Type:', file.type);
    
    // Check if this is the same file we just processed
    const fileSignature = `${file.name}_${file.size}_${file.lastModified}`;
    if (lastProcessedFile === fileSignature) {
        console.log('Same file already processed, ignoring duplicate');
        if (window.utils) {
            window.utils.showToast('This file was already processed', 'warning');
        }
        return;
    }
    
    if (csvUploadInProgress) {
        console.log('Upload already in progress, ignoring');
        if (window.utils) {
            window.utils.showToast('CSV upload already in progress', 'error');
        }
        return;
    }
    
    try {
        csvUploadInProgress = true;
        lastProcessedFile = fileSignature; // Mark this file as being processed
        showCSVProgress();
        
        const csvData = await parseCSVFile(file);
        const validationResult = validateCSVData(csvData);
        
        if (!validationResult.isValid) {
            showCSVError(validationResult.errors);
            return;
        }
        
        await uploadTradesFromCSV(csvData);
        
    } catch (error) {
        console.error('CSV upload error:', error);
        showCSVError([`Failed to process CSV: ${error.message}`]);
    } finally {
        csvUploadInProgress = false;
        hideCSVProgress();
        // Clear the file input to prevent double uploads
        if (event.target) {
            event.target.value = '';
        }
        
        // Clear the processed file signature after 5 seconds to allow re-upload if needed
        setTimeout(() => {
            if (lastProcessedFile === fileSignature) {
                lastProcessedFile = null;
                console.log('Cleared processed file signature, file can be uploaded again');
            }
        }, 5000);
    }
}

function parseCSVFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const csvText = e.target.result;
                const lines = csvText.split('\n').filter(line => line.trim());
                
                if (lines.length < 2) {
                    throw new Error('CSV file must have at least a header and one data row');
                }
                
                const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
                const data = lines.slice(1).map(line => {
                    const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
                    const row = {};
                    headers.forEach((header, index) => {
                        row[header] = values[index] || '';
                    });
                    return row;
                });
                
                resolve({ headers, data });
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}

function validateCSVData(csvData) {
    const errors = [];
    const requiredFields = ['symbol', 'direction', 'entry_date', 'entry_quantity', 'entry_price'];
    
    // Check headers
    const missingHeaders = requiredFields.filter(field => 
        !csvData.headers.includes(field)
    );
    
    if (missingHeaders.length > 0) {
        errors.push(`Missing required columns: ${missingHeaders.join(', ')}`);
    }
    
    // Validate data rows
    csvData.data.forEach((row, index) => {
        const rowNum = index + 2; // +2 because we start from row 2 (after header)
        
        requiredFields.forEach(field => {
            if (!row[field] || row[field].trim() === '') {
                errors.push(`Row ${rowNum}: ${field} is required`);
            }
        });
        
        // Optional time fields validation (only validate format if provided)
        const optionalTimeFields = ['entry_time', 'exit_time'];
        optionalTimeFields.forEach(field => {
            if (row[field] && row[field].trim() !== '') {
                // Basic time format validation (HH:MM or HH:MM:SS)
                const timePattern = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
                if (!timePattern.test(row[field].trim())) {
                    errors.push(`Row ${rowNum}: ${field} must be in HH:MM or HH:MM:SS format`);
                }
            }
        });
        
        // Validate direction
        if (row.direction && !['Long', 'Short'].includes(row.direction)) {
            errors.push(`Row ${rowNum}: direction must be 'Long' or 'Short'`);
        }
        
        // Validate numeric fields
        const numericFields = ['entry_quantity', 'entry_price', 'exit_quantity', 'exit_price', 'stop_loss', 'target_price', 'brokerage', 'charges'];
        numericFields.forEach(field => {
            if (row[field] && row[field].trim() !== '' && isNaN(parseFloat(row[field]))) {
                errors.push(`Row ${rowNum}: ${field} must be a valid number`);
            }
        });

        // Validate date fields
        if (row.entry_date && row.entry_date.trim() !== '') {
            const entryDate = parseCSVDate(row.entry_date);
            if (!entryDate || isNaN(entryDate.getTime())) {
                errors.push(`Row ${rowNum}: entry_date must be a valid date (DD-MM-YYYY or YYYY-MM-DD format)`);
            }
        }

        if (row.exit_date && row.exit_date.trim() !== '') {
            const exitDate = parseCSVDate(row.exit_date);
            if (!exitDate || isNaN(exitDate.getTime())) {
                errors.push(`Row ${rowNum}: exit_date must be a valid date (DD-MM-YYYY or YYYY-MM-DD format)`);
            }
        }
    });
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

async function uploadTradesFromCSV(csvData) {
    const progressContainer = document.getElementById('csv-progress-container');
    const progressBar = document.getElementById('csv-progress-bar');
    const progressText = document.getElementById('csv-progress-text');
    
    const totalTrades = csvData.data.length;
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    for (let i = 0; i < csvData.data.length; i++) {
        const row = csvData.data[i];
        
        try {
            // Map CSV data to trade object
            const trade = mapCSVRowToTrade(row);
            
            // Save trade using existing dataStore function
            if (window.dataStore) {
                await window.dataStore.upsertTrade(trade);
            }
            successCount++;
            
        } catch (error) {
            errorCount++;
            errors.push(`Row ${i + 2}: ${error.message}`);
        }
        
        // Update progress
        const progress = ((i + 1) / totalTrades) * 100;
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
        }
        if (progressText) {
            progressText.textContent = `${i + 1}/${totalTrades}`;
        }
        
        // Small delay to show progress
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Show results
    if (errorCount === 0) {
        showCSVSuccess(`Successfully uploaded ${successCount} trades`);
        // Refresh the UI
        if (window.appState && window.dataStore) {
            window.appState.trades = await window.dataStore.getTrades();
            if (typeof updateTradeDependentUI === 'function') {
                updateTradeDependentUI();
            }
        }
        if (window.utils) {
            window.utils.showToast(`Successfully uploaded ${successCount} trades`, 'success');
        }
    } else {
        showCSVError(errors);
        if (successCount > 0) {
            if (window.utils) {
                window.utils.showToast(`${successCount} trades uploaded successfully, ${errorCount} failed`, 'warning');
            }
            // Refresh the UI for successful trades
            if (window.appState && window.dataStore) {
                window.appState.trades = await window.dataStore.getTrades();
                if (typeof updateTradeDependentUI === 'function') {
                    updateTradeDependentUI();
                }
            }
        }
    }
}

function mapCSVRowToTrade(row) {
    const entryDate = parseCSVDate(row.entry_date);
    const exitDate = parseCSVDate(row.exit_date);
    
    return {
        id: window.utils ? window.utils.generateUUID() : generateUUID(),
        user_id: window.appState?.user?.id || 'anonymous',
        asset: row.symbol || '',
        direction: row.direction || 'Long',
        segment: 'Equity', // Default segment
        trading_style: row.trading_style || 'Scalping',
        entry_date: entryDate ? entryDate.toISOString() : null,
        entry_time: row.entry_time || '',
        entry_price: parseFloat(row.entry_price) || 0,
        quantity: parseFloat(row.entry_quantity) || 0,
        stop_loss: parseFloat(row.stop_loss) || null,
        target: parseFloat(row.target_price) || null,
        exit_date: exitDate ? exitDate.toISOString() : null,
        exit_time: row.exit_time || '',
        exit_price: parseFloat(row.exit_price) || null,
        exit_quantity: parseFloat(row.exit_quantity) || null,
        brokerage: parseFloat(row.brokerage) || 0,
        other_fees: parseFloat(row.charges) || 0,
        strategy: row.strategy_tag || 'Price Action',
        outcomeSummary: row.outcome_summary || '',
        reasons: row.notes || '',
        emotionalState: row.emotional_state || '',
        mistakes: []
    };
}

// UI Helper Functions
function showCSVProgress() {
    const progressContainer = document.getElementById('csv-progress-container');
    const resultsDiv = document.getElementById('csv-results');
    if (progressContainer) {
        progressContainer.classList.remove('hidden');
    }
    if (resultsDiv) {
        resultsDiv.classList.add('hidden');
    }
}

function hideCSVProgress() {
    const progressContainer = document.getElementById('csv-progress-container');
    if (progressContainer) {
        progressContainer.classList.add('hidden');
    }
}

function showCSVSuccess(message) {
    const resultsDiv = document.getElementById('csv-results');
    const successDiv = document.getElementById('csv-success-message');
    const errorDiv = document.getElementById('csv-error-message');
    
    if (resultsDiv) {
        resultsDiv.classList.remove('hidden');
    }
    if (successDiv) {
        successDiv.classList.remove('hidden');
    }
    if (errorDiv) {
        errorDiv.classList.add('hidden');
    }
    if (successDiv) {
        successDiv.textContent = message;
    }
}

function showCSVError(errors) {
    const resultsDiv = document.getElementById('csv-results');
    const successDiv = document.getElementById('csv-success-message');
    const errorDiv = document.getElementById('csv-error-message');
    
    if (resultsDiv) {
        resultsDiv.classList.remove('hidden');
    }
    if (successDiv) {
        successDiv.classList.add('hidden');
    }
    if (errorDiv) {
        errorDiv.classList.remove('hidden');
        errorDiv.innerHTML = errors.map(error => `<div>${error}</div>`).join('');
    }
}

// Sample CSV Download Function
function downloadSampleCSV() {
    const sampleData = [
        // Header row
        'symbol,direction,entry_date,entry_time,entry_quantity,entry_price,exit_date,exit_time,exit_price,exit_quantity,stop_loss,target_price,brokerage,charges,trading_style,strategy_tag,emotional_state,outcome_summary,notes',
        // Sample trade 1 - Complete trade (DD-MM-YYYY format)
        'AAPL,Long,15-01-2024,09:30,100,150.25,15-01-2024,15:45,152.80,100,148.00,155.00,2.50,1.25,Scalping,Price Action,Confident,Good trade - hit target,Strong momentum breakout',
        // Sample trade 2 - Open position without times (DD-MM-YYYY format)
        'TSLA,Short,16-01-2024,,50,245.30,,,,,240.00,250.00,1.25,0.75,Day Trading,Momentum,Neutral,,Short on resistance level',
        // Sample trade 3 - Partial exit (YYYY-MM-DD format - shows both formats work)
        'MSFT,Long,2024-01-17,11:00,200,380.50,2024-01-17,14:30,385.20,100,375.00,390.00,5.00,2.50,Swing Trading,Technical Analysis,Confident,Partial profit taken,Strong earnings play'
    ];

    const csvContent = sampleData.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'tradlyst_sample_trades.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}

// Initialize CSV upload functionality
function initCSVUpload() {
    // Prevent attaching event listeners multiple times
    if (csvEventListenersAttached) {
        console.log('CSV event listeners already attached, skipping');
        return;
    }
    
    const csvBrowseBtn = document.getElementById('csv-browse-btn');
    const csvFileInput = document.getElementById('csv-file-input');
    const dropZone = document.getElementById('csv-drop-zone');
    const downloadSampleBtn = document.getElementById('download-sample-csv');
    
    // Check if elements exist before attaching listeners
    if (!csvBrowseBtn || !csvFileInput || !dropZone) {
        console.log('CSV elements not found, skipping event listener setup');
        return;
    }

    // Browse button click handler
    csvBrowseBtn?.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent event bubbling to parent drop zone
        console.log('Browse button clicked');
        csvFileInput?.click();
    });

    // File input change handler
    csvFileInput?.addEventListener('change', (e) => {
        console.log('File input changed, files:', e.target.files.length);
        if (e.target.files.length > 0) {
            console.log('Selected file:', e.target.files[0].name);
        }
        handleCSVFile(e);
    });

    // Sample CSV download handler
    downloadSampleBtn?.addEventListener('click', downloadSampleCSV);

    // Drag and Drop functionality
    dropZone?.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone?.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone?.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type === 'text/csv') {
            handleCSVFile({ target: { files: [files[0]] } });
        } else {
            if (window.utils) {
                window.utils.showToast('Please select a CSV file', 'error');
            }
        }
    });

    // Click to browse (but not when clicking the browse button itself)
    dropZone?.addEventListener('click', (e) => {
        // Prevent triggering file input if user clicked the browse button
        if (e.target.id !== 'csv-browse-btn' && !e.target.closest('#csv-browse-btn')) {
            csvFileInput?.click();
        }
    });
    
    // Mark that event listeners have been attached
    csvEventListenersAttached = true;
    console.log('CSV event listeners attached successfully');
}

// Initialize on DOM content loaded
document.addEventListener('DOMContentLoaded', initCSVUpload);

// Export functions to window
window.csvImporter = {
    parseCSVFile,
    handleCSVUpload: handleCSVFile,
    downloadSampleCSV,
    initCSVUpload,
    parseCSVDate,
    validateCSVData,
    uploadTradesFromCSV,
    mapCSVRowToTrade,
    showCSVProgress,
    hideCSVProgress,
    showCSVSuccess,
    showCSVError
};
