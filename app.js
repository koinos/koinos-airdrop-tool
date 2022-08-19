//'use strict';

const { program } = require('commander');

const Web3 = require('web3');
var fs = require('fs');
const abi = require('./abi.js');
const { koinos } = require('koinos-proto-js');

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
var startBlock = 10999669;

async function getTransfers(fromBlock, toBlock) {
   return erc20.getPastEvents('Transfer', {
      fromBlock: fromBlock,
      toBlock: toBlock
   }).then( (events) => {
      return events;
   }).catch( async (error) => {
      console.log(error);
      return await getTransfers(fromBlock, toBlock);
   });
}

async function getBalance(address) {
   return erc20.methods.balanceOfAt(
      address,
      program.snapshot
   //return erc20.methods.balanceOf(
   //   address
   ).call().then( (balance) => {
      return balance;
   }).catch( async (error) => {
      console.log(error);
      return await getBalance(address);
   });
}

async function calculateAirdrop() {
   // This can be replaced later with our snapshot block
   var endBlock = await web3.eth.getBlock('latest').then( (block) => {
      return block.number;
   });

   var accountSet = new Set();
   const delta = 1000;

   console.log("Getting transfer events...")
   let lastProgress = parseFloat(0.0).toFixed(2);
   let progress;

   //endBlock = startBlock + 48 * delta;

   for (var i = startBlock; i <= endBlock; i += delta)
   {
      (await getTransfers(i, i + delta)).forEach( (event) => {
         accountSet.add(event.returnValues.to);
      });

      progress = parseFloat((Math.min(100, 100 * (i - startBlock + delta) / (endBlock - startBlock)))).toFixed(2);
      if (lastProgress != progress) {
         process.stdout.clearLine();
         process.stdout.cursorTo(0);
         process.stdout.write(progress + '%');
         lastProgress = progress;
      }
   }

   console.log('\n\nFound ' + accountSet.size + ' impacted accounts\n');
   console.log('Getting balances of impacted addresses...');

   let claimZone = new Uint8Array(1);
   claimZone[0] = 1;

   const infoSpace = {system: true, zone: claimZone, id: 0}
   const balanceSpace = {system: true, zone: claimZone, id: 1}
   var genesisData = new koinos.chain.genesis_data();
   genesisData.entries = new Array();

   let supply = BigInt(0);
   let count = 0;
   lastProgress = parseFloat(0.0).toFixed(2);

   for (let account of accountSet) {
      var balance = await getBalance(account);

      if (balance > 0) {
         supply += BigInt(balance);
         var encodedClaim = koinos.contracts.claim.claim_status.encode({token_amount:balance, claimed: false }).finish();
         genesisData.entries.push({space: balanceSpace, key: web3.utils.hexToBytes(account), value: encodedClaim});
      }

      count += 1;
      progress = parseFloat((Math.min(100, 100 * (count) / accountSet.size))).toFixed(2);

      if (lastProgress != progress) {
         process.stdout.clearLine();
         process.stdout.cursorTo(0);
         process.stdout.write(progress + '%');
         lastProgress = progress;
      }
   }

   console.log('\n\n' + genesisData.entries.length + ' accounts captured in snapshot');
   console.log('Total supply: ' + (supply / BigInt(100000000)).toString()  + '.' + String(supply % BigInt(100000000)).padStart(8, '0') + " KOIN");

   var encodedInfo = koinos.contracts.claim.claim_info.encode({total_eth_accounts: genesisData.entries.length, eth_accounts_claimed: 0, total_koin: supply.toString(), koin_claimed: 0}).finish();
   genesisData.entries.unshift({space: infoSpace, key: "", value: encodedInfo});

   fs.writeFile(program.output, JSON.stringify(genesisData), function(err) {
      if(err) console.log(err);
      else console.log('\nWrote snapshot to ' + program.output);
   });
}

calculateAirdrop();
