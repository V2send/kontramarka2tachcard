const {Schema, model, Types} = require('mongoose')

const timersSchema = new Schema({
    tkSession: {type: String, required: true},
    sessionid: String,
    timeout: Date
})

const timers = model('Timers', timersSchema)

module.exports = {timers}