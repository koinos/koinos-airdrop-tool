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

async function calculateAirdrop() {
   console.log("Parsing events to get impacted addresses...");

   let impactedAccounts = new Array();
   await erc20.getPastEvents('Transfer', {
      fromBlock: 0,
      toBlock: 'latest'
   }).then( (events) => {
      let accountSet = new Set();

      events.forEach( (event) => {
         accountSet.add(event.returnValues.to);
      });

      accountSet.forEach( (account) => {
         impactedAccounts.push(account);
      })
   });

   console.log("Getting balances at snapshot " + program.snapshot + "...");
   var balances = new Array();

   const promises = impactedAccounts.map( async (address) => {
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
