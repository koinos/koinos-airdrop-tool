'use strict';

const { program } = require('commander');

const Web3 = require('web3');
var fs = require('fs');
const abi = require('./abi.js');

program
   .version('1.0.0', '-v, --version')
   .usage('[OPTIONS]...')
   .requiredOption('-c, --contract <addr>', 'Address of the Koinos ERC20 Contract')
   .requiredOption('-e, --endpoint <endpoint>', 'An Ethereum node endpoint')
   .option('-s, --snapshot <snapshot_id>', 'The snapshot id to airdrop to', '1')
   .option('-o, --output <filename>', 'File to output the airdrop as JSON', 'airdrop.json')
   .parse(process.argv);

var web3 = new Web3(program.endpoint);
var erc20 = new web3.eth.Contract(abi, program.contract);
var startBlock = 0;
var numEvents = 0;

async function getTransfers(fromBlock, toBlock) {
   return erc20.getPastEvents('Transfer', {
      fromBlock: fromBlock,
      toBlock: toBlock
   }).then( (events) => {
      return events;
   }).catch( async (error) => {
      return await getTransfers(fromBlock, toBlock);
   });
}

async function getBalance(address) {
   return erc20.methods.balanceOfAt(
      address,
      program.snapshot
   ).call().then( (balance) => {
      return balance;
   }).catch( async (error) => {
      return await getBalance(address);
   });
}

async function calculateAirdrop() {
   var impactedAccounts = new Array();

   // This can be replaced later with our snapshot block
   var endBlock = await web3.eth.getBlock('latest').then( (block) => {
      return block.number;
   });

   var promises = new Array();
   var accountSet = new Set();
   const delta = 1000;

   console.log("Getting transfer events...\n")
   let lastProgress = parseFloat(0.0).toFixed(2);
   let progress;

   for (var i = startBlock; i <= endBlock; i += delta)
   {
      (await getTransfers(i, i + delta)).forEach( (event) => {
         accountSet.add(event.returnValues.to);
      });

      progress = parseFloat((Math.min(100, 100 * (i + delta) / endBlock))).toFixed(2);
      if (lastProgress != progress) {
         process.stdout.clearLine();
         process.stdout.cursorTo(0);
         process.stdout.write(progress + '%');
         lastProgress = progress;
      }
   }

   console.log('\nGetting balances of impacted addresses...\n');

   var balances = new Array();
   let count = 0;
   lastProgress = parseFloat(0.0).toFixed(2);

   for (let account of accountSet) {
      balances.push({"address": account, "balance": await getBalance(account)});

      progress = parseFloat((Math.min(100, 100 * (count) / accountSet.size))).toFixed(2);
      if (lastProgress != progress) {
         process.stdout.clearLine();
         process.stdout.cursorTo(0);
         process.stdout.write(progress + '%');
         lastProgress = progress;
      }
   }

   fs.writeFile(program.output, JSON.stringify(balances), function(err) {
      if(err) console.log(err);
      else console.log("Wrote snapshot to " + program.output);
   });
}

calculateAirdrop();
