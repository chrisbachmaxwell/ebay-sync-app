import { Command } from 'commander';
import { buildAuthCommand } from './auth.js';
import { buildProductsCommand } from './products.js';
import { buildOrdersCommand } from './orders.js';
import { buildInventoryCommand } from './inventory.js';
import { buildStatusCommand } from './status.js';
import { setVerbose } from '../utils/logger.js';
const program = new Command();
program
    .name('ebaysync')
    .description('Shopify ↔ eBay sync tool for UsedCameraGear.com')
    .version('0.1.0')
    .option('--json', 'JSON output')
    .option('--dry-run', 'Preview changes without applying')
    .option('--verbose', 'Detailed logging');
program.hook('preAction', (command) => {
    const options = command.opts();
    setVerbose(Boolean(options.verbose));
});
program.addCommand(buildAuthCommand());
program.addCommand(buildProductsCommand());
program.addCommand(buildOrdersCommand());
program.addCommand(buildInventoryCommand());
program.addCommand(buildStatusCommand());
program.parseAsync().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
