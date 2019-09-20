const mongoose= require('mongoose');
const refundGenerator = mongoose.Schema({
    _id: mongoose.Schema.Types.ObjectId,
    credit: String,
    limit: String,
    handlingCharge: String,
    updatedbyCategory: String
});
module.exports= mongoose.model('RefundGenerator',refundGenerator);
