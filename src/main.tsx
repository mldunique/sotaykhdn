import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'; // Xóa đoạn .tsx đi
import './index.css'
import axios from 'axios';
import { AUTH_SERVICE_LOGIN_URL } from './config/apiConfig';

// Configure Axios globally to send HttpOnly cookies in cross-origin requests
axios.defaults.withCredentials = true;

// Intercept native fetch to send cookies and handle 401 redirects
const originalFetch = window.fetch;
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const newInit = { ...init };
  if (newInit.credentials === undefined) {
    newInit.credentials = 'include';
  }
  
  let request: RequestInfo | URL = input;
  if (input instanceof Request) {
    request = new Request(input, newInit);
  }
  
  try {
    const response = await originalFetch(request, newInit);
    if (response.status === 401 || response.status === 403) {
      const redirectUri = window.location.href;
      window.location.href = `${AUTH_SERVICE_LOGIN_URL}?redirect_uri=${encodeURIComponent(redirectUri)}`;
      return new Promise<Response>(() => {});
    }
    return response;
  } catch (error) {
    throw error;
  }
};

// Intercept 401 & 403 responses to automatically redirect the browser to the SSO Login portal
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      const redirectUri = window.location.href;
      window.location.href = `${AUTH_SERVICE_LOGIN_URL}?redirect_uri=${encodeURIComponent(redirectUri)}`;
      return new Promise(() => {}); // Return a pending promise to cancel further processing
    }
    return Promise.reject(error);
  }
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)