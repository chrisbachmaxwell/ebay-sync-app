import { Command } from 'commander';

export const buildInventoryCommand = () => {
  const inventory = new Command('inventory').description('Inventory commands');

  inventory
    .command('sync')
    .description('Sync inventory levels bidirectionally')
    .action(() => {
      console.log('Inventory sync not implemented yet.');
    });

  inventory
    .command('check')
    .description('Compare inventory across platforms')
    .action(() => {
      console.log('Inventory check not implemented yet.');
    });

  return inventory;
};
