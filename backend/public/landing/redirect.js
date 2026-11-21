// Runs before the page paints. Someone already signed in (the app leaves a flag in this browser) goes straight to their dashboard.
// Add ?home to the address to look at this page anyway.
try {
  if (localStorage.getItem('fitzy_signed_in') === '1' && !/[?&]home\b/.test(location.search)) location.replace('/dashboard');
} catch (e) { /* storage blocked: show the page */ }
