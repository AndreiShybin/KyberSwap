import { take, put, call, fork, select, takeEvery, all, cancel } from 'redux-saga/effects'
import { delay } from 'redux-saga'
import * as actions from '../actions/accountActions'
import { clearSession, setGasPrice, setBalanceToken, updateAllRate, updateAllRateComplete, goToRoute } from "../actions/globalActions"
import * as exchangeActions from "../actions/exchangeActions"

import * as utilActions from '../actions/utilActions'
import * as common from "./common"
import * as analytics from "../utils/analytics"
import * as commonUtils from "../utils/common"
import BLOCKCHAIN_INFO from "../../../env"

// import { goToRoute, updateAllRate, updateAllRateComplete } from "../actions/globalActions"
import { randomToken, setRandomExchangeSelectedToken, setCapExchange, thowErrorNotPossessKGt, setSelectedGasPrice } from "../actions/exchangeActions"
import  * as transferActions from "../actions/transferActions"
//import { randomForExchange } from "../utils/random"

import * as service from "../services/accounts"
import constants from "../services/constants"
import { Rate, updateAllRatePromise } from "../services/rate"

import { findNetworkName } from "../utils/converter"

import { getTranslate } from 'react-localize-redux'
import { store } from '../store';

export function* updateAccount(action) {
  const { account, ethereum } = action.payload
  try {
    const newAccount = yield call(account.sync, ethereum, account)
    yield put(actions.updateAccountComplete(newAccount))
  } catch (err) {
    console.log(err)
  }

}

export function* updateTokenBalance(action) {
  try {
    const { ethereum, address, tokens } = action.payload
    const balanceTokens = yield call([ethereum, ethereum.call], "getAllBalancesTokenAtLatestBlock", address, tokens)
    yield put(setBalanceToken(balanceTokens))
  }
  catch (err) {
    console.log(err)
  }
}


function* createNewAccount(address, type, keystring, ethereum, walletType, info){
  try{
    const account = yield call(service.newAccountInstance, address, type, keystring, ethereum, walletType, info)
    return {status: "success", res: account}
  }catch(e){
    console.log(e)
    return {status: "fail"}
  }
}

export function* importNewAccount(action) {
  yield put(actions.importLoading())
  const { address, type, keystring, ethereum, tokens, metamask, walletType, info } = action.payload
  var translate = getTranslate(store.getState().locale)
  try {
    var  account
    var accountRequest = yield call(common.handleRequest, createNewAccount, address, type, keystring, ethereum, walletType, info)

    if (accountRequest.status === "timeout") {
      console.log("timeout")
      let translate = getTranslate(store.getState().locale)
      yield put(actions.closeImportLoading())
      yield put(utilActions.openInfoModal(translate("error.error_occurred") || "Error occurred", 
                                          translate("error.node_error") || "There are some problems with nodes. Please try again in a while."))
      return
    }
    if (accountRequest.status === "fail") {
      let translate = getTranslate(store.getState().locale)
      yield put(actions.closeImportLoading())
      yield put(utilActions.openInfoModal(translate("error.error_occurred") || "Error occurred", 
                                          translate("error.network_error") || "Cannot connect to node right now. Please check your network!"))
      return
    }

    if (accountRequest.status === "success") {
      account = accountRequest.data
    }    

    //update token and token balance
    var newTokens = {}
    Object.values(tokens).map(token => {
      var token = { ...token }
      newTokens[token.symbol] = token
    })

    if (type === "promo"){
      //promo token      
      var state = store.getState()
      var exchange = state.exchange
      const transfer = state.transfer;
      var sourceToken = exchange.sourceTokenSymbol.toLowerCase()
      var promoToken = BLOCKCHAIN_INFO.promo_token

      if (promoToken && newTokens[promoToken]){
        var promoAddr = newTokens[promoToken].address
        var promoDecimal = newTokens[promoToken].decimals
        yield put.sync(exchangeActions.selectTokenAsync(promoToken, promoAddr, "source", ethereum))
        sourceToken = promoToken.toLowerCase()
        //get source balance
        // try{
        //   var balanceSource = yield call([ethereum, ethereum.call], "getBalanceToken", address, promoAddr)
        //   var balance = (balanceSource/Math.pow(10, promoDecimal)).toString()
        //   yield put.sync(exchangeActions.inputChange('source', balance))
        //   yield put.sync(exchangeActions.focusInput('source'));
        // }catch(e){
        //   console.log(e)
        // }
        
      }
      var destToken = exchange.destTokenSymbol.toLowerCase()
      if (info.destToken && newTokens[info.destToken]){
        yield put.sync(exchangeActions.selectTokenAsync(info.destToken, newTokens[info.destToken].address, "des", ethereum))
        destToken = info.destToken.toLowerCase()

        //select in transfer
        yield put(transferActions.selectToken(info.destToken, newTokens[info.destToken].address))
      }
      var path = constants.BASE_HOST + "/swap/" + sourceToken + "_" + destToken
      path = commonUtils.getPath(path, constants.LIST_PARAMS_SUPPORTED)
      yield put.sync(goToRoute(path))
      

      if (promoToken && newTokens[promoToken]){
        var promoAddr = newTokens[promoToken].address
        var promoDecimal = newTokens[promoToken].decimals
        try{
          var balanceSource = yield call([ethereum, ethereum.call], "getBalanceToken", address, promoAddr)
          var balance = (balanceSource/Math.pow(10, promoDecimal)).toString()
          yield put.sync(exchangeActions.inputChange('source', balance))
          yield put.sync(exchangeActions.focusInput('source'));
        }catch(e){
          console.log(e)
        }
      }

      if (!transfer.isEditGasPrice) {
        yield put(transferActions.setSelectedGasPrice(transfer.gasPriceSuggest.standardGas, "s"));
      }

      if (!exchange.isEditGasPrice) {
        yield put(setSelectedGasPrice(exchange.gasPriceSuggest.standardGas, "s"));
      }
    } else {
      yield put(setGasPrice());
    }
    
   // const account = yield call(service.newAccountInstance, address, type, keystring, ethereum)
    yield put(actions.closeImportLoading())
    yield put(actions.importNewAccountComplete(account))


    //track login wallet
    analytics.loginWallet(type)
    

    
    

//    yield put(goToRoute(constants.BASE_HOST + '/swap'))
    if (type !== "promo"){
      yield put(exchangeActions.fetchExchangeEnable())
    }
    

    var maxCapOneExchange = "infinity"
    try {
      var result = yield call([ethereum, ethereum.call], "getUserMaxCap", address)
      if (result.success && (!result.kyc || result.kyc === "false")) {
        maxCapOneExchange = result.data
      }
    } catch(e) {
      console.log(e)
    }
    yield put(setCapExchange(maxCapOneExchange))

    if (+maxCapOneExchange == 0){
      var linkReg = 'https://kybernetwork.zendesk.com'
      yield put(thowErrorNotPossessKGt(translate("error.not_possess_kgt", {link: linkReg}) || "There seems to be a problem with your address, please contact us for more details"))
    }
    

    yield call(ethereum.fetchRateExchange)

    console.log(address)
    const balanceTokens = yield call([ethereum, ethereum.call], "getAllBalancesTokenAtLatestBlock", address, tokens)
    //map balance
    var mapBalance = {}
    balanceTokens.map(token => {
      mapBalance[token.symbol] = token.balance
    })
    
    yield put(setBalanceToken(balanceTokens))
  }
  catch (err) {
    console.log(err)
    yield put(actions.throwError(translate("error.network_error") || "Cannot connect to node right now. Please check your network!"))
    yield put(actions.closeImportLoading())
  }




  //fork for metamask
  if (type === "metamask") {
    const { web3Service, address, networkId } = { ...metamask }
    const watchCoinbaseTask = yield fork(watchCoinbase, web3Service, address, networkId)

    yield take('GLOBAL.CLEAR_SESSION')
    yield cancel(watchCoinbaseTask)
  }
}

export function* importMetamask(action) {
  const { web3Service, networkId, ethereum, tokens, translate, walletType } = action.payload
  try {
    const currentId = yield call([web3Service, web3Service.getNetworkId])
    if (parseInt(currentId, 10) !== networkId) {
      var currentName = findNetworkName(parseInt(currentId, 10))
      var expectedName = findNetworkName(networkId)
      if (currentName) {
        yield put(actions.throwError(translate("error.network_not_match", { currentName: currentName, expectedName: expectedName }) || "Network is not match"))
        if (walletType !== null && walletType !== "metamask"){
          let title = translate("error.error_occurred") || "Error occurred"
          let content = translate("error.network_not_match", { currentName: currentName, expectedName: expectedName }) || "Network is not match"
          yield put(utilActions.openInfoModal(title, content))
        }
        return
      } else {
        yield put(actions.throwError(translate("error.network_not_match_unknow", { expectedName: expectedName }) || "Network is not match"))
        if (walletType !== null && walletType !== "metamask"){
          let title = translate("error.error_occurred") || "Error occurred"
          let content = translate("error.network_not_match_unknow", { expectedName: expectedName }) || "Network is not match"
          yield put(utilActions.openInfoModal(title, content))
        }
        return
      }
    }
    //get coinbase
    const address = yield call([web3Service, web3Service.getCoinbase], true)
    yield call([web3Service, web3Service.setDefaultAddress, address])

    const metamask = { web3Service, address, networkId }
    yield put(actions.importNewAccount(
      address,
      "metamask",
      web3Service,
      ethereum,
      tokens,
      walletType,
      metamask
    ))
  } catch (e) {
    console.log(e)
    yield put(actions.throwError(translate("error.cannot_connect_metamask") || "Cannot get metamask account. You probably did not login in Metamask"))
    if (walletType !== null && walletType !== "metamask"){
      let title = translate("error.error_occurred") || "Error occurred"
      let content = translate("error.cannot_connect_metamask") || "Cannot get metamask account. You probably did not login in Metamask"
      yield put(utilActions.openInfoModal(title, content))
    }
  }
}


function* watchCoinbase(web3Service, address, networkId) {
  while (true) {
    try {
      yield call(delay, 500)
      const coinbase = yield call([web3Service, web3Service.getCoinbase])
      if (coinbase !== address) {
        yield put(clearSession())
        return
      }
      const currentId = yield call([web3Service, web3Service.getNetworkId])
      if (parseInt(currentId, 10) !== networkId) {
        console.log(currentId)
        yield put(clearSession())
        return
      }
      //check 
    } catch (error) {
      console.log(error)
      yield put(clearSession())
      return;
    }
  }
}

export function* watchAccount() {
  yield takeEvery("ACCOUNT.UPDATE_ACCOUNT_PENDING", updateAccount)
  yield takeEvery("ACCOUNT.IMPORT_NEW_ACCOUNT_PENDING", importNewAccount)
  yield takeEvery("ACCOUNT.IMPORT_ACCOUNT_METAMASK", importMetamask)
  yield takeEvery("ACCOUNT.UPDATE_TOKEN_BALANCE", updateTokenBalance)

}
