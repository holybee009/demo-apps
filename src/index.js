const { ethers } = require("ethers");
const moment = require('moment'); // Import moment.js for date handling

const rollup_server = process.env.ROLLUP_HTTP_SERVER_URL;
console.log("HTTP rollup_server url is " + rollup_server);

// In-memory database for auctions and bids
let auctions = [];

// Function to start a new auction
function startAuction(itemId, startingBid, duration) {
    const endTime = moment().add(duration, 'minutes').toISOString(); // Set auction end time
    const auction = {
        itemId,
        startingBid,
        highestBid: startingBid,
        highestBidder: null,
        endTime,
        bids: []
    };
    auctions.push(auction);
    return `Auction for item ${itemId} started with starting bid of ${startingBid}. Auction ends at ${endTime}.`;
}

// Function to place a bid
function placeBid(auctionId, bidder, amount) {
    const auction = auctions.find(auc => auc.itemId === auctionId);

    if (!auction) {
        return 'Auction not found';
    }

    const currentTime = moment();
    if (currentTime.isAfter(moment(auction.endTime))) {
        return 'Auction has already ended.';
    }

    if (amount <= auction.highestBid) {
        return `Bid amount must be higher than the current highest bid of ${auction.highestBid}.`;
    }

    auction.highestBid = amount;
    auction.highestBidder = bidder;
    auction.bids.push({ bidder, amount, time: currentTime.toISOString() });
    return `Bid of ${amount} placed by ${bidder} on item ${auction.itemId}. Current highest bid is ${auction.highestBid}.`;
}

// Function to end an auction and declare the winner
function endAuction(auctionId) {
    const auction = auctions.find(auc => auc.itemId === auctionId);

    if (!auction) {
        return 'Auction not found';
    }

    const currentTime = moment();
    if (currentTime.isBefore(moment(auction.endTime))) {
        return 'Auction cannot be ended before the scheduled time.';
    }

    const winner = auction.highestBidder ? `Winner is ${auction.highestBidder} with a bid of ${auction.highestBid}.` : 'No bids were placed.';
    auctions = auctions.filter(auc => auc.itemId !== auctionId); // Remove the auction after it ends
    return `Auction for item ${auction.itemId} ended. ${winner}`;
}

// Rollup input handler
async function handleAuction (input) {
    const [command, itemId, param1, param2] = input.payload.split(':');

    let response;
    switch (command) {
        case 'start':
            const startingBid = parseFloat(param1);
            const duration = parseInt(param2);
            if (isNaN(startingBid) || isNaN(duration)) {
                response = 'Invalid starting bid or duration.';
            } else {
                response = startAuction(itemId, startingBid, duration);
            }
            break;
        case 'bid':
            const bidder = param1;
            const amount = parseFloat(param2);
            if (isNaN(amount)) {
                response = 'Invalid bid amount.';
            } else {
                response = placeBid(itemId, bidder, amount);
            }
            break;
        case 'end':
            response = endAuction(itemId);
            break;
        default:
            response = 'Unknown command. Use "start", "bid", or "end".';
    }

    await input.sendResponse(response);
};

// Rollup advance state handler
async function handle_advance(data) {
    console.log("Received advance request data " + JSON.stringify(data));

    const metadata = data['metadata'];
    const sender = metadata['msg_sender'];
    const payload = data['payload'];

    let auction_input = hex2Object(payload);

    const auction_output = handleAuction(auction_input);

    const notice_req = await fetch(rollup_server + "/notice", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ payload: obj2Hex(auction_output) }),
    });
    return "accept";
}

// Rollup inspect state handler
async function handle_inspect(data) {
    console.log("Received inspect request data " + JSON.stringify(data));

    const payload = data['payload'];
    const route = hex2str(payload);

    let responseObject = {};
    if (route === 'auctions') {
        responseObject = JSON.stringify({ auctions });
    } else {
        responseObject = 'Route not implemented';
    }

    const report_req = await fetch(rollup_server + "/report", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ payload: str2hex(responseObject) }),
    });

    return "accept";
}

var handlers = {
    advance_state: handle_advance,
    inspect_state: handle_inspect,
};

var finish = { status: "accept" };

(async () => {
    while (true) {
        const finish_req = await fetch(rollup_server + "/finish", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ status: "accept" }),
        });

        console.log("Received finish status " + finish_req.status);

        if (finish_req.status == 202) {
            console.log("No pending rollup request, trying again");
        } else {
            const rollup_req = await finish_req.json();
            var handler = handlers[rollup_req["request_type"]];
            finish["status"] = await handler(rollup_req["data"]);
        }
    }
})();
