import http from 'node:http';
import { randomBytes } from 'node:crypto';
import open from 'open';
import { loadCredentials } from '../config/credentials.js';
const EBAY_AUTH_BASE = 'https://auth.ebay.com/oauth2/authorize';
export const startEbayAuthFlow = async (scopes, port = 36823) => {
    const { ebay } = await loadCredentials();
    const state = randomBytes(16).toString('hex');
    const redirectUri = ebay.ruName || `http://localhost:${port}/callback`;
    const url = new URL(EBAY_AUTH_BASE);
    url.searchParams.set('client_id', ebay.appId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', scopes.join(' '));
    url.searchParams.set('state', state);
    const authCode = await new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const requestUrl = new URL(req.url ?? '/', `http://localhost:${port}`);
            const returnedState = requestUrl.searchParams.get('state');
            const code = requestUrl.searchParams.get('code');
            const error = requestUrl.searchParams.get('error');
            if (error) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end(`Authorization failed: ${error}`);
                server.close();
                reject(new Error(`eBay auth error: ${error}`));
                return;
            }
            if (returnedState !== state) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('Invalid state parameter.');
                server.close();
                reject(new Error('eBay auth state mismatch'));
                return;
            }
            if (!code) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('Missing authorization code.');
                server.close();
                reject(new Error('Missing authorization code'));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Authorization complete. You can close this window.');
            server.close();
            resolve(code);
        });
        server.listen(port, () => {
            void open(url.toString());
        });
        const timeout = setTimeout(() => {
            server.close();
            reject(new Error('Timed out waiting for eBay authorization'));
        }, 5 * 60 * 1000);
        server.on('close', () => clearTimeout(timeout));
    });
    return { code: authCode, redirectUri };
};
