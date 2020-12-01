const {Schema, model, Types} = require('mongoose')

const responseCompareSchema = new Schema({
    date: {type: Date, default: new Date()},
    method: String,
    request: Object,
    feResponse: Object,
    kmResponse: Object,
    isEqual: Boolean
})

const responseCompare = model('responseCompare', responseCompareSchema)

module.exports = {responseCompare}