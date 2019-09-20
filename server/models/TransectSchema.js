const mongoose = require('mongoose');

const Schema = mongoose.Schema;
const transectSchema = new Schema({
    key: {
        type: String
    },
    planNumber: {
        type: String
    },
    txid: {
        type: String
    },
    tripId: {
        type: String
    },
    pnr: {
        type: String
    },
    flightNumber: {
        type: String
    },
    airlineName: {
        type: String
    },
    departureiata: {
        type: String
    },
    arrivaliata: {
        type: String
    },
    timestamp: {
        type: String
    },
    pricePerPerson: {
        type: String
    },
    uploadTicketPath: {
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
    totalPassenger: {
        type: String
    },
    passengerId: {
        type: String
    },
    firstName: {
        type: String
    },
    lastName: {
        type: String
    },
    passengerPhoneNumber: {
        type: String
    },
    passengerEmail: {
        type: String
    },
    refundAmt:{
        type:String
    },
    handlingChargeAmt:{
        type:String
    },
    paymentStatus:{
        type:Boolean
    },
    refundStatus:{
        type:Boolean
    }, 
    requestSource: {
        type: String
    }
});

module.exports = mongoose.model('TransectSchema', transectSchema);
// export const User = mongoose.model('User', userSchema);