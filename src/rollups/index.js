import {createApp} from "@deroll/app"
import {createWallet} from "@deroll/wallet"
import {getAddress, hexToString, stringToHex} from "viem"

const app = createApp({url:process.env.ROLLUP_HTTP_SERVER_URL|| "http://127.0.0.1:5000"})

const wallet = createWallet();
app.addAdvanceHandler(wallet.handler);

app.addAdvanceHandler(async ({metadat, payload}) => {
    console.log("input: ", metadata, payload);
    const sender = getAddress(metadata, msg_sender);
    try{
        const jsonpayload = JSON.parse(hexToString(payload));
        if(jsonpayload.method === "ether_withdraw")
        {
            console.log("withdrawing ether");
            const amountTowithdraw = BigInt[jsonpayload.amount]
            const voucher = wallet.withdrawEther(sender, amountTowithdraw)
            app.createVoucher(voucher)
            return "accept"
        }
    } catch(e){
        app.createReport({payload: stringToHex(String(e))})
        return "reject"
    }
    return "accept"
})

app.addInspectHandler(async (payload)=>{
    const url = hexToString(payload).split('/')
    console.log('inspect call', url)
    const eth_balance = wallet.etherBalanceOf(url[1])
    await app.createReport({payload:stringToHex(string(eth_balance))})
})
app.start().catch((e) =>{
    console.error(e);
    process.exit(1)
})