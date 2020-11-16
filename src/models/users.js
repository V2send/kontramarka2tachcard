const {Schema, model, Types} = require('mongoose')

const usersSchema = new Schema({
    tkSession: {type: String, required: true}, //tachcard session
    sessions: [new Schema({
        sessionid: {type: String, default: ''},
        eventId: Number,
        lastUsedDate: {type: Date, default: new Date()},
    }, {_id : false })],
    orders: [new Schema({
        eventId: Number,
        orderId: {type: Number, default: 0},
        tickets: [new Schema({
            rowNumber: Number,
            placeNumber: Number,
            placeId: Number,
            price: Number,
            barcode: String,
            isRefund: {type: Boolean, default: false},
        }, {_id : false })]
    }, {_id: false})]
})

const users = model('Users', usersSchema)

module.exports = {users}