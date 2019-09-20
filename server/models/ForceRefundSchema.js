const mongoose = require('mongoose');

const Schema = mongoose.Schema;
const forceRefundSchema = new Schema({
    key: {
        type: String
    },
    bookingId: {
        type: String
    },
    txid: {
        type: String
    },
    paymentTrackingId: {
        type: String
    },
    tranactionTimestamp: {
        type: String
    },
    gatewayProvider: {
        type: String
    },
    userEmail: {
        type: String
    },
    refundAmt:{
        type: String
    },
    refundStatus : {
        type: Boolean
    }
});

module.exports = mongoose.model('ForceRefundSchema', forceRefundSchema);