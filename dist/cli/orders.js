import { Command } from 'commander';
export const buildOrdersCommand = () => {
    const orders = new Command('orders').description('Order sync commands');
    orders
        .command('poll')
        .description('Poll eBay for new orders')
        .action(() => {
        console.log('Order polling not implemented yet.');
    });
    orders
        .command('sync')
        .description('Sync eBay orders → Shopify')
        .option('--dry-run', 'Preview order sync')
        .action(() => {
        console.log('Order sync not implemented yet.');
    });
    return orders;
};
