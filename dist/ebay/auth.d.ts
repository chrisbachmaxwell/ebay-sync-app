type AuthResult = {
    code: string;
    redirectUri: string;
};
export declare const startEbayAuthFlow: (scopes: string[], port?: number) => Promise<AuthResult>;
export {};
