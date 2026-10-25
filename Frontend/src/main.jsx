import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './auth/AuthProvider.jsx';
import AuthGate from './auth/AuthGate.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <AuthGate>
      <App />
    </AuthGate>
  </AuthProvider>
);
