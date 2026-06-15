import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './Comparison/App.jsx'
import './styles/global.css'

// Centralized API Prefix
const API_PREFIX = "/analytics";

// Configure Axios globally if loaded or present
try {
  const axPkg = ["a", "x", "i", "o", "s"].join("");
  import(/* @vite-ignore */ axPkg).then((m) => {
    const ax = m.default || m;
    if (ax && ax.defaults) ax.defaults.baseURL = API_PREFIX;
  }).catch(() => { });
} catch (e) { }

if (typeof window !== "undefined") {
  let _axios = window.axios;
  Object.defineProperty(window, 'axios', {
    get() { return _axios; },
    set(val) {
      _axios = val;
      if (_axios && _axios.defaults) {
        _axios.defaults.baseURL = API_PREFIX;
      }
    },
    configurable: true,
    enumerable: true
  });
}

// Intercept window.fetch using a non-recursive originalFetch wrapper
const originalFetch = window.fetch;
window.fetch = function (input, init) {
  if (typeof input === 'string') {
    if (input.startsWith('/api/') || input.startsWith('/login') || input.startsWith('/signup') || input.startsWith('/register')) {
      input = API_PREFIX + input;
    }
  } else if (input instanceof URL) {
    if (input.pathname.startsWith('/api/') || input.pathname.startsWith('/login') || input.pathname.startsWith('/signup') || input.pathname.startsWith('/register')) {
      input.pathname = API_PREFIX + input.pathname;
    }
  }
  return originalFetch(input, init);
};

// Render React app into DOM
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
