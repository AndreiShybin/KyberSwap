import React from "react"
import { connect } from "react-redux"
import {TransferBody} from "../Transfer"
import { getTranslate } from 'react-localize-redux'
import * as converter from "../../utils/converter"
import * as validators from "../../utils/validators"
import * as transferActions from "../../actions/transferActions"
import { default as _ } from 'underscore'
import { clearSession, setIsChangingPath } from "../../actions/globalActions"
import { ImportAccount } from "../ImportAccount"
import {HeaderTransaction} from "../TransactionCommon"
import * as common from "../../utils/common"

@connect((store, props) => {
  const account = store.account.account
  var translate = getTranslate(store.locale)
  const tokens = store.tokens.tokens
  const transfer = store.transfer
  const analytics = store.global.analytics

  return {
    translate, transfer, tokens, account, analytics,
    params: {...props.match.params}
  }
})

export default class Exchange extends React.Component {
  constructor(props){
    super(props)
    this.state = {
      isAnimation: false
    }
  }

  setAnimation = () => {
    this.setState({isAnimation: true})
  }


  componentDidMount = () =>{
    var sourceSymbol = this.props.params.source.toLowerCase()
    var sourceToken = common.getAddressFromSymbol(sourceSymbol, this.props.tokens)

    if (sourceToken.toLowerCase() !== this.props.transfer.token.toLowerCase()){

      sourceSymbol = this.props.params.source.toUpperCase()
      sourceToken =  common.getAddressFromSymbol(sourceSymbol, this.props.tokens)

      this.props.dispatch(transferActions.selectToken(sourceSymbol, sourceToken))
    }
  }

  validateSourceAmount = (value, gasPrice) => {
    var checkNumber
    if (isNaN(parseFloat(value))) {
    } else {
      var amountBig = converters.stringEtherToBigNumber(this.props.transfer.amount, this.props.transfer.decimals)
      if (amountBig.isGreaterThan(this.props.transfer.balance)) {
        this.props.dispatch(transferActions.thowErrorAmount("error.amount_transfer_too_hign"))
        return
      }

      var testBalanceWithFee = validators.verifyBalanceForTransaction(this.props.tokens['ETH'].balance,
        this.props.transfer.tokenSymbol, this.props.transfer.amount, this.props.transfer.gas, gasPrice)
      if (testBalanceWithFee) {
        this.props.dispatch(transferActions.thowErrorEthBalance("error.eth_balance_not_enough_for_fee"))
      }
    }
    this.props.dispatch(transferActions.seSelectedGas(level))
    this.specifyGasPrice(value)
    this.props.analytics.callTrack("trackChooseGas", "transfer", value, level);
  }

  render() {
    return (
      <div className={"exchange-container"}>
        <HeaderTransaction page="transfer"/>
        <TransferBody/>
      </div>
    )
  }
}
