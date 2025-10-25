// Authentication UI code extracted from index.html

// Global variables for auth state
let authMode = 'signin'; // 'signin' or 'signup'
let previousSession = null;
let isInitialLoad = true;

// Initialize authentication UI
function initAuth() {
    // Get DOM elements
    const authForm = document.getElementById('auth-form');
    const authTitle = document.getElementById('auth-title');
    const authSubmitBtn = document.getElementById('auth-submit-btn').querySelector('.btn-text');
    const authToggleLink = document.getElementById('auth-toggle-link');
    const authMessage = document.getElementById('auth-message');
    const authContainer = document.getElementById('auth-container');
    const appContainer = document.getElementById('app-container');

    // Auth toggle functionality
    authToggleLink.addEventListener('click', (e) => {
        e.preventDefault();
        authMode = authMode === 'signin' ? 'signup' : 'signin';
        authMessage.textContent = '';
        if (authMode === 'signin') {
            authTitle.textContent = 'Sign In';
            authSubmitBtn.textContent = 'Sign In';
            authToggleLink.textContent = "Don't have an account? Sign up";
        } else {
            authTitle.textContent = 'Sign Up';
            authSubmitBtn.textContent = 'Create Account';
            authToggleLink.textContent = "Already have an account? Sign in";
        }
    });

    // Auth form submission
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        const button = document.getElementById('auth-submit-btn');
        
        // Use window.utils for spinner and toast
        if (window.utils) {
            window.utils.toggleSpinner(button, true);
        }
        authMessage.textContent = '';

        try {
            if (authMode === 'signin') {
                await window.auth.signIn(email, password);
            } else {
                await window.auth.signUp(email, password);
                if (window.utils) {
                    window.utils.showToast('Welcome! Please check your email to confirm your account.', 'success');
                }
            }
        } catch (error) {
            console.error('Auth form error:', error);
            authMessage.textContent = error.message || 'Authentication failed. Please try again.';
            authMessage.style.color = 'red';
        } finally {
            if (window.utils) {
                window.utils.toggleSpinner(button, false);
            }
        }
    });

    // Logout button handlers
    document.querySelectorAll('.logout-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            console.log('Logout button clicked');
            try {
                await window.auth.signOut();
                console.log('Supabase signOut completed');
            } catch (error) {
                console.error('Supabase signOut error:', error);
            }
            
            // Force UI update to ensure proper logout state
            console.log('Forcing UI logout state');
            if (window.appState) {
                window.appState.user = null;
            }
        });
    });

    // Auth state change handler
    if (window.auth && window.auth.onAuthStateChanged) {
        window.auth.onAuthStateChanged(async (user) => {
            console.log('Auth state changed:', user ? 'User logged in' : 'User logged out');
            
            if (user) {
                // Check if this is a real login or just token refresh
                const isRealLogin = !previousSession || isInitialLoad;
                
                if (isRealLogin) {
                    console.log('Real login detected - running full initialization');
                    
                    if (window.appState) {
                        window.appState.user = user;
                    }
                    
                    // Show loading state to prevent jitter - will be updated when profile data loads
                    const userDisplayName = document.getElementById('user-display-name');
                    if (userDisplayName) {
                        userDisplayName.textContent = 'Loading...';
                    }
                    console.log('User logged in - showing app container');
                    
                    // Switch containers immediately for smoother transition
                    authContainer.classList.remove('show');
                    appContainer.classList.add('show');
                    
                    if (window.appState) {
                        if (window.appState.unsubscribeTrades) window.appState.unsubscribeTrades();
                        if (window.appState.unsubscribeLedger) window.appState.unsubscribeLedger();
                        if (window.appState.unsubscribeProfile) window.appState.unsubscribeProfile();
                        if (window.appState.unsubscribeChallenge) window.appState.unsubscribeChallenge();
                        if (window.appState.unsubscribeChallengeHistory) window.appState.unsubscribeChallengeHistory();

                        if (window.appState.clockIntervalId) clearInterval(window.appState.clockIntervalId);
                    }

                    // Update live clock if function exists
                    if (typeof updateLiveClock === 'function') {
                        updateLiveClock();
                        if (window.appState) {
                            window.appState.clockIntervalId = setInterval(updateLiveClock, 1000);
                        }
                    }

                    // Setup Supabase listeners if function exists
                    if (typeof setupSupabaseListeners === 'function') {
                        setupSupabaseListeners();
                    }
                    
                    // Get the saved page first
                    const savedPage = localStorage.getItem('currentPage') || 'dashboard';
                    
                    // Set the correct page as active BEFORE loading data to prevent flicker
                    const pages = document.querySelectorAll('.page');
                    const navItems = document.querySelectorAll('.nav-item');
                    
                    // Set the correct page as active immediately
                    pages.forEach(p => p.classList.remove('active'));
                    const targetPage = document.getElementById(savedPage);
                    if (targetPage) targetPage.classList.add('active');
                    
                    // Set the correct nav item as active
                    navItems.forEach(item => item.classList.remove('active'));
                    const activeNavItem = document.querySelector(`.nav-item[data-page="${savedPage}"]`);
                    if (activeNavItem) activeNavItem.classList.add('active');
                    
                    // Load all user data including challenges (without rendering all pages)
                    if (typeof loadUserDataOnly === 'function') {
                        await loadUserDataOnly();
                    }
                    
                    // Navigate to the saved page (this will trigger page-specific logic)
                    if (typeof navigateTo === 'function') {
                        navigateTo(savedPage);
                    }
                    if (typeof applyTheme === 'function') {
                        applyTheme();
                    }
                    
                    // Load profile data immediately to update header with actual name
                    if (window.appState?.user?.id && typeof loadProfileData === 'function') {
                        loadProfileData();
                    }
                } else {
                    console.log('Token refresh detected - skipping initialization to prevent auto refresh');
                    // Silent token refresh - no visual changes, no data reloading
                    // Just update the user reference silently
                    if (window.appState) {
                        window.appState.user = user;
                    }
                }
                
                // Update session tracking
                previousSession = user;
                isInitialLoad = false;
            } else {
                if (window.appState) {
                    window.appState.user = null;
                }
                appContainer.classList.remove('show');
                authContainer.classList.add('show');
                console.log('User logged out - showing auth container');
                if (window.appState && window.appState.clockIntervalId) {
                    clearInterval(window.appState.clockIntervalId);
                    window.appState.clockIntervalId = null;
                }
                
                // Reset session tracking
                previousSession = null;
                isInitialLoad = true;
            }
        });
    }
}

// Export functions to window
window.auth = {
    initAuth: initAuth
};
