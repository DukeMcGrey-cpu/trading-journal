// Optional: paste your Apps Script Web app URL here to skip typing it on every device.
// If this repository is public, leave it empty and enter the URL on the login screen instead.
export const API_URL = '';

export const APP_VERSION = '0.1.0';
export const SYNC_INTERVAL_MS = 60000;      // background sync while the app is visible
export const REQUEST_TIMEOUT_MS = 30000;    // Apps Script can take a few seconds on a cold start
export const SYNC_OVERLAP_MS = 60000;       // re-read the last minute on each incremental sync
