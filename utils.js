// Utility functions extracted from index.html

const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

const showToast = (message, type = 'info') => {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let icon = '';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'alert-circle';
    if (type === 'info') icon = 'info';
    toast.innerHTML = `<i data-feather="${icon}" class="h-5 w-5"></i><span>${message}</span>`;
    container.appendChild(toast);
    feather.replace();
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
    }, 4000);
};

const toggleSpinner = (button, show) => {
    const spinner = button.querySelector('.spinner');
    const btnText = button.querySelector('.btn-text');
    if (spinner && btnText) {
        spinner.classList.toggle('hidden', !show);
        btnText.classList.toggle('hidden', show);
    }
    button.disabled = show;
};

const formatCurrency = (value) => {
     return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value || 0);
};

const formatDate = (dateString, includeTime = false) => {
    if (!dateString) return '-';
    const d = new Date(dateString); // Supabase returns ISO strings
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    if (includeTime) {
        options.hour = '2-digit';
        options.minute = '2-digit';
    }
    return d.toLocaleDateString('en-GB', options);
};

// Helper function to format date as DD-MM-YYYY
const formatDateDDMMYYYY = (dateString) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    // Check if date is valid
    if (isNaN(d.getTime())) return dateString; // Return original string if invalid date
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
};

// Helper function to format date as DD-MM-YYYY for display (handles both YYYY-MM-DD and YYYY-MM-DDTHH:MM:SS formats)
const formatDateForDisplay = (dateString) => {
    if (!dateString) return '';
    
    // Handle both date-only and datetime formats
    let datePart;
    if (dateString.includes('T')) {
        // ISO datetime format: 2024-01-15T10:30:00
        datePart = dateString.split('T')[0];
    } else {
        // Date-only format: 2024-01-15
        datePart = dateString;
    }
    
    // Validate the date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        return dateString; // Return original if invalid format
    }
    
    // Convert YYYY-MM-DD to DD-MM-YYYY
    const [year, month, day] = datePart.split('-');
    return `${day}-${month}-${year}`;
};

// Helper function to format date in compact format for trade statement (DD/MM/YY)
const formatDateCompact = (dateString) => {
    if (!dateString) return '';
    
    // Handle both date-only and datetime formats
    let datePart;
    if (dateString.includes('T')) {
        // ISO datetime format: 2024-01-15T10:30:00
        datePart = dateString.split('T')[0];
    } else {
        // Date-only format: 2024-01-15
        datePart = dateString;
    }
    
    // Validate the date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        return dateString; // Return original if invalid format
    }
    
    // Convert YYYY-MM-DD to DD/MM/YY (compact format)
    const [year, month, day] = datePart.split('-');
    const shortYear = year.slice(-2); // Get last 2 digits of year
    return `${day}/${month}/${shortYear}`;
};

// Helper functions for bulk delete
const getSelectedTradeIds = () => {
    const checkboxes = document.querySelectorAll('.trade-checkbox:checked');
    return Array.from(checkboxes).map(cb => cb.getAttribute('data-trade-id'));
};

const updateBulkActionsUI = () => {
    const selectedIds = getSelectedTradeIds();
    const toolbar = document.getElementById('bulk-actions-toolbar');
    const selectedCount = document.getElementById('selected-count');
    const selectAllCheckbox = document.getElementById('select-all-trades');

    if (selectedIds.length > 0) {
        toolbar.classList.remove('hidden');
        selectedCount.textContent = `${selectedIds.length} trade${selectedIds.length > 1 ? 's' : ''} selected`;
    } else {
        toolbar.classList.add('hidden');
    }

    // Update select all checkbox state
    if (selectAllCheckbox) {
        const totalCheckboxes = document.querySelectorAll('.trade-checkbox').length;
        if (selectedIds.length === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (selectedIds.length === totalCheckboxes) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        }
    }
};

const clearSelection = () => {
    const checkboxes = document.querySelectorAll('.trade-checkbox');
    checkboxes.forEach(cb => cb.checked = false);
    const selectAllCheckbox = document.getElementById('select-all-trades');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }
    updateBulkActionsUI();
};

const setBulkDeleteButtonsState = (isLoading) => {
    const deleteSelectedBtn = document.getElementById('delete-selected-btn');
    const deleteAllBtn = document.getElementById('delete-all-btn');
    const clearSelectionBtn = document.getElementById('clear-selection-btn');
    
    if (deleteSelectedBtn) {
        deleteSelectedBtn.disabled = isLoading;
        deleteSelectedBtn.textContent = isLoading ? 'Deleting...' : 'Delete Selected';
    }
    
    if (deleteAllBtn) {
        deleteAllBtn.disabled = isLoading;
        deleteAllBtn.textContent = isLoading ? 'Deleting...' : 'Delete All Trades';
    }
    
    if (clearSelectionBtn) {
        clearSelectionBtn.disabled = isLoading;
    }
};

// Export functions to window.utils
window.utils = { 
    showToast, 
    toggleSpinner, 
    formatDate, 
    formatCurrency,
    formatDateDDMMYYYY,
    formatDateForDisplay,
    formatDateCompact,
    generateUUID,
    getSelectedTradeIds,
    updateBulkActionsUI,
    clearSelection,
    setBulkDeleteButtonsState
};
