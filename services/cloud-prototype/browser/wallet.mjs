import {createEVMClient} from '@metamask/connect-evm'
let clientPromise
export function prepare(){
 if(window.ethereum)return Promise.resolve()
 if(!clientPromise)clientPromise=createEVMClient({
  dapp:{name:'JPKI Wallet Prototype',url:window.location.origin+window.location.pathname},
  api:{supportedNetworks:{'0x1':'https://ethereum-rpc.publicnode.com'}},
  analytics:{enabled:false},debug:false,skipAutoAnnounce:true
 }).catch(error=>{clientPromise=undefined;throw error})
 return clientPromise
}
export async function connect(){
 if(window.ethereum){const provider=window.ethereum;return {provider,accounts:await provider.request({method:'eth_requestAccounts'}),chainId:await provider.request({method:'eth_chainId'})}}
 const client=await prepare();const result=await client.connect({chainIds:['0x1']})
 return {...result,provider:client.getProvider()}
}
