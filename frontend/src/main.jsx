import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import PwaStatus from './components/PwaStatus.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <App />
      {/* Sits outside App so the offline banner and update prompt survive route changes
          and render above the login screen too. */}
      <PwaStatus />
    </ThemeProvider>
  </StrictMode>,
);
