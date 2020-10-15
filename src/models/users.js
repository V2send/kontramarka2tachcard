const {Schema, model, Types} = require('mongoose')

const usersSchema = new Schema({
    session: String,
    sessionid: String
})

const users = model('Users', usersSchema)

module.exports = users