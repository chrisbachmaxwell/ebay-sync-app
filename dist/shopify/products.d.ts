export type ShopifyProduct = {
    id: string;
    title: string;
    handle: string;
    status: string;
};
export declare const fetchShopifyProducts: (accessToken: string, first?: number) => Promise<ShopifyProduct[]>;
