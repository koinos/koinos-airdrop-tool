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

var web3 = new Web3( program.endpoint );
var erc20 = new web3.eth.Contract( abi, program.contract );
var startBlock = 0;

async function calculateAirdrop() {
   console.log("Parsing events to get impacted addresses...");

   var impactedAccounts = new Array();

   // This can be replaced later with our snapshot block
   var endBlock = await web3.eth.getBlock('latest').then( (block) => {
      return block.number;
   });

   var promises = new Array();
   var accountSet = new Set();

   for( var i = startBlock; i < endBlock; ++i )
   {
      promises.push(erc20.getPastEvents('Transfer', {
         fromBlock: i,
         toBlock: i
      }).then( (events) => {
         events.forEach( (event) => {
            accountSet.add(event.returnValues.to);
         });
      }));
   }

   await Promise.all(promises);
   promises = new Array();

   accountSet.forEach( (account) => {
      impactedAccounts.push(account);
   })

   console.log("Getting balances at snapshot " + program.snapshot + "...");
   var balances = new Array();

   promises = impactedAccounts.map( async (address) => {
      await erc20.methods.balanceOfAt(address, program.snapshot).call().then( (balance)=> {
         balances.push( {"address": address, "balance": balance } );
      });
   });
   await Promise.all(promises);

   fs.writeFile(program.output, JSON.stringify(balances), function(err) {
      if(err) console.log(err);
      else console.log("Wrote snapshot to " + program.output);
   });
}

calculateAirdrop();
