const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    uid: Number,
    username: String,
    messagesCount: {type: Number, default: 0},
    karma: {type: Number, default: 0},
    karmaChanged: {type: Number, default: 0},
    karmaGot: {type: Number, default: 0},
    lastKarmaShot: {type: Date, default: 0},
})


const chatSchema = new mongoose.Schema({
    uid: Number,
    title: String,
    main: Boolean,
    users: [Number],
    currentState: {type: Number, default: 0},
    lastOfftop: {type: Date, default: 0},
    options:
        {
            offtopCooldown: {type: Number, default: 60},
            karmaCooldown: {type: Number, default: 60},
        }
})

const triggerSchema = new mongoose.Schema({
    trigger: String,
    text: String,
    show: {type: Boolean, default: false}
})


module.exports = {userSchema, chatSchema, triggerSchema}