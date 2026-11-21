// Everything on the landing page that only you can supply. Fill a value in and it appears; leave it empty and that part of the
// page stays hidden, so nothing half-finished is ever shown. Reload the page to see a change (no build step).
window.FITZY_LANDING = {
  // WhatsApp number with country code and no + or spaces, e.g. '919876543210'. Shows the chat button and the footer link.
  whatsapp: '',
  // Support address shown in the footer.
  email: '',
  // Full links to your pages. Empty = that icon is hidden.
  social: {
    youtube: '',
    instagram: '',
    facebook: '',
    linkedin: '',
    x: '',
  },
  // YouTube video ids (the part after v= in the address). Empty main = the whole "See it working" section is hidden.
  videos: {
    main: '',
    more: [
      // { id: 'abc123xyz', title: 'Add your first member', length: '1:00' },
    ],
  },
  // Real quotes only. Empty = the section is hidden. Example:
  // { quote: 'Renewals went up because members get a reminder in the app.', name: 'Asha Rao', role: 'Owner', gym: 'Iron House', city: 'Bengaluru' }
  testimonials: [],
  // Real, measured numbers only (for example from the pilot). Empty = the strip is hidden. Example: { value: '3', label: 'pilot gyms' }
  stats: [],
  // Shown in the footer.
  company: { name: '', address: '' },
};
