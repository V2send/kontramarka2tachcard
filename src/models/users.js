const {Schema, model, Types} = require('mongoose')

const usersSchema = new Schema({
    session: {type: String, required: true},
    sessionid: {type: String, default: ''},
    orderId: Number,
    lastUsedDate: {type: Date, default: new Date()}
})

const users = model('Users', usersSchema)

module.exports = {users}