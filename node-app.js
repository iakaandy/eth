#!/usr/bin/env node

var Web3 = require('web3');
var http = require('http');

var settings = require('./settings');


const web3 = new Web3(new Web3.providers.HttpProvider(settings.ethnet));

var wallets = settings.wallets;
var mainWallet = undefined;

wallets.forEach((wallet) => {
    wallet.keystore = require('./keystore/' + wallet.address + ".json");
    wallet.decryptedAccount = web3.eth.accounts.decrypt(wallet.keystore, wallet.password);
    wallet.free = true;
    if (wallet.main === true) {
        mainWallet = wallet;
    }
});

wallets.getAllBalance = function () {
//    console.log("Run getAllBalance");
    this.forEach((wallet) => {
        wallets.redistribute(wallet);
    });
}

wallets.redistribute = function (wallet, delay = 2000) {
    web3.eth.getBalance(wallet.address, (error, result) => {
        if (!error) {
            wallet.balance = web3.utils.fromWei(result);
            log(`$ ${wallet.name} = ${wallet.balance}`);
            if (wallet.balance < parseFloat(settings.payment) * settings.minPaymentCount && wallet.main !== true) {
                if (mainWallet.free === true) {
                    this.makeTransfer(mainWallet, wallet, (parseFloat(settings.payment) * settings.minPaymentCount) + '');
                    log(`!!! Redistribute to ${wallet.name} from MainWallet`);
                }
                else {
                    //log("Main wallet is busy.");
                    setTimeout(() => {
                        wallets.redistribute(wallet)
                    }, delay);
                }
            }
        }
    });
}

wallets.transaction = function (callback) {

    this.sort((a, b) => {
        if (a.free === true && b.free === false) return -1;
        if (a.free === false && b.free === true) return 1;
        if (a.free === true && b.free === true) {
            return a.balance > b.balance ? -1 : 1
        }
        return 0;
    });

    log("* Select wallet")
    this.forEach((wallet) => {
        log(`* ${wallet.name} : ${wallet.balance} : ${wallet.free}`);
    });

    if (wallets[0].free === false) {
        log('request denied, all wallets are busy.');
        throw new Error('All wallets are busy');
    }

    log(`# ${wallets[0].name} will be use`);
    this.makeTransfer(wallets[0], settings.receiver, settings.payment, callback);
};

wallets.makeTransfer = function (wallet, reciver, value, callback = () => {
}) {
    var rawTransaction = {
        "from": wallet.address,
        "to": reciver.address,
        "value": web3.utils.toHex(web3.utils.toWei(value, "ether")),
        "gas": 200000,
        "chainId": 3
    };

    wallet.free = false;
    wallet.decryptedAccount.signTransaction(rawTransaction)
        .then(signedTx => web3.eth.sendSignedTransaction(signedTx.rawTransaction))
        .then(receipt => {
            // console.log("Transaction receipt: ", receipt);
            wallet.free = true;
            log("---");
            log(`> ${wallet.name} -> ${reciver.name} - ${value}`);
            callback(wallet);
        })
        .catch(err => console.error(err));
}

wallets.getAllBalance();

http.createServer(function (req, res) {
    log("-------------");
    log("+ Transfer request received");
    try {
        wallets.transaction((wallet) => {
            res.writeHead(200, "OK");
            res.write("Transfered");
            res.end();
            wallets.getAllBalance();
        });
    }
    catch (e) {
        res.writeHead(429, "Error");
        res.write(e.message);
        res.end();
    }
}).listen(5454);
console.log("Ready on port 5454");

function log(message) {
    console.log((new Date()).toISOString() + '    ' + message);
}

