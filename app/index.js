const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');

const {userSchema, chatSchema, triggerSchema} = require('./schemas');

const User = mongoose.model('User', userSchema)
const Chat = mongoose.model('Chat', chatSchema)
const Trigger = mongoose.model('Trigger', triggerSchema)
let me


const MarkdownEscape = /_|\*|\[|\]|\(|\)|~|`|>|#|\+|-|=|\||{|}|\.|!/g
const escapeFunc = x => {
    return "\\" + x
}
const markdowned = s => {
    return s.toString().replace(MarkdownEscape, escapeFunc)
}

const waitPort = require('wait-port')



const mongo_uri = "mongodb://"+process.env.MONGO_HOST+"/godot"
mongoose.connect(mongo_uri, {useNewUrlParser: true, useUnifiedTopology: true})
const db = mongoose.connection 
db.on('error', console.error.bind(console, 'CONNECTION ERROR: '))
db.once('open', () => console.log("DB CONNECTED SUCCESFULLY"))

const telegram_token = process.env.TOKEN
const bot = new TelegramBot(telegram_token, {polling: true})
bot.getMe().then(result => {
    me = result
    console.log(me)
    console.log("TLG BOT CONNECTED")
}).catch(error => console.error(error.code, error.response.body))


bot.onText(/^\/me (.+)/, async (msg, match) => {
    const user = msg.from 
    const options = {
        parse_mode: 'MarkdownV2',
    }
    if (msg.reply_to_message)
        options.reply_to_message_id = msg.reply_to_message.message_id
    if (msg.chat)
        bot.deleteMessage(msg.chat.id, msg.message_id)
    bot.sendMessage(msg.chat.id, `_*${markdowned(user.first_name || user.username)}* ${markdowned(match[1])}_`, options)
})

bot.onText(/^\/GodetteSay (.+)/, async (msg, match) => {
    const user = msg.from 
    const chatMember = await bot.getChatMember(msg.chat.id, user.id)
    if(chatMember.status == "administrator" || chatMember.status == "creator"){
        const options = {
            parse_mode: 'MarkdownV2',
        }
        if (msg.reply_to_message)
            options.reply_to_message_id = msg.reply_to_message.message_id
        if (msg.chat)
            bot.deleteMessage(msg.chat.id, msg.message_id)
        bot.sendMessage(msg.chat.id, `*${markdowned(match[1])}*`, options)
    }
})



bot.onText(/^\/help/, async msg => {
    const chat = await getChat(msg.chat)
    if (!chat) {
        return
    }
    try{
        bot.sendMessage(msg.chat.id, `
Итак, вот на что я реагирую:

Для изменения кармы другому человеку, ответьте на его сообщение текстом, начинающимся на:
\\- "\\+" и "\\-"
\\- 👍 и 👎
\\- "спасибо", "спс", "благодарю", регистр не важен
Между изменениями кармы от одного человека должно пройти не менее ${chat.options.karmaCooldown} секунд\\.
Если у вас отрицательная карма \\- менять другим её нельзя\\!

/my\\_stats \\- покажет вашу статистику кармы и сообщений для данного чата\\. Карма общая на все чаты\\.
/top \\- покажет ТОП\\-10 пользователей данного чата по числу кармы\\.

Также в основном чате я на слово "оффтоп" сразу же кидаю ссылку на оффтоп\\-чат\\. Потому что не стоит засорять основу общими беседами \\(;
    `, {parse_mode: "MarkdownV2", reply_to_message_id: msg.message_id})
    } catch(error) {
        console.error(error)
    }
})


bot.onText(/\/setmain/, async(msg, match) => {
    const chat = await getChat(msg.chat)
    if(!chat) {
        return
    }
    const member = await bot.getChatMember(msg.chat.id, msg.from.id)
    if (member.status == "administrator" || member.status == "creator" || msg.chat.id > 0) {
        Chat.updateOne({
            uid: msg.chat.id
        },
        {
            $set: {main: true}
        }).exec()
        bot.deleteMessage(msg.chat.id, msg.message_id)
        bot.sendMessage(msg.chat.id, `Данный чат успешно установлен в качестве основного`)
    }
})


bot.onText(/^\/set ([a-zA-Z]+) (\d+)/, async(msg, match) => {
    
    const chat = await Chat.findOne({uid: msg.chat.id})
    if (!chat) {
        return
    }
    const member = await bot.getChatMember(msg.chat.id, msg.from.id)
    if (member.status == "administrator" || member.status == "creator" || msg.chat.id > 0) {
        let option = match[1]
        let value = parseInt(match[2])
        if (chat.options[option] && value) {
            let field = 'options.'+option
            let obj = {}
            obj[field] = Math.min(Math.max(60, value), 600)
            Chat.updateOne({uid: msg.chat.id}, {$set: obj}).exec()
            bot.deleteMessage(msg.chat.id, msg.message_id)
            bot.sendMessage(msg.chat.id, `Значение ${option} установлено на ${obj[field]}`)    
        }
    }
})



bot.onText(/^(\+|-|👍|👎)/, async(msg, match) => {
    processKarma(msg, match, {emoji: true})
})

bot.onText(/^(спасибо|благодарю|спс)/i, async(msg, match) => {
    processKarma(msg, match, {thanks: true})
})

bot.on('sticker', msg => {
    processKarma(msg, null, {stickers: true})
})



bot.onText(/(оффтоп|offtop)/i, async msg => {
    //const offtop = await Chat.findOne({main: true})
    const msgDate = new Date(msg.date * 1000)
    const chat = await getChat(msg.chat)
    if(!chat.main) {
        return
    }
    if((msgDate - chat.lastOfftop) / 1000 < chat.options.offtopCooldown){
        return
    }
    const messages = await Trigger.find({trigger: "offtop", show: true})
    const message = messages[getRandomInt(0, messages.length)].text
    bot.sendMessage(msg.chat.id, message, {reply_markup: {
        inline_keyboard: [[ {
            text: 'Оффтоп чат',
            url: 'http://t.me/Godot_Engine_Offtop'
        }]]},
        reply_to_message_id: msg.message_id
    })
    Chat.updateOne({uid: msg.chat.id}, {$set: {lastOfftop: msgDate}}).exec()
})

bot.onText(/док(ументац[а-я]+|[а-я])? ((п)?о )?(?<topic>@?[\w\d]{4,32})/, async(msg, match) => {
    const chat = await getChat(msg.chat)
    console.log(match.length, match, match[match.length-1])
    const topic = match[match.length-1]
    if(!chat) {
        return
    }
    const messages = await Trigger.find({trigger: "docs", show: true})
    const message = messages[getRandomInt(0, messages.length)].text
    bot.sendMessage(msg.chat.id, message, {reply_markup: {
        inline_keyboard: [[ {
            text: `Поиск по ${markdowned(topic)}`,
            url: `https://docs.godotengine.org/ru/stable/?rtd_search=${markdowned(topic)}`
        }]]},
        reply_to_message_id: msg.message_id
    })
})



bot.onText(/^\/top\+$/, async msg => {
    return
    const chat = await Chat.findOne({uid: msg.chat.id})
    const users = await User.find({uid: chat.users}).limit(10).sort({karma: -1}).select({username: 1, karma: 1, uid: 1})
    let message = "Вот наш ТОП\\-10 пользователей в данном чате:\n"
    let i = 1
    let lastKarma = users[0].karma
    for(let user of users) {
        let name = markdowned(user.username)
        if(user.uid == msg.from.id){
            name = "*" + name + "*"
        }
        if(user.karma < lastKarma)
        {
            i+=1
            lastKarma = user.karma
        }
        message += `${i}\\. ${name} \\(${markdowned(user.karma)}\\)\n`
    }
    bot.sendMessage(msg.chat.id, message, {parse_mode: "MarkdownV2", reply_to_message_id: msg.message_id})
})

bot.onText(/^\/top$/, async msg => {
    const chat = await Chat.findOne({uid: msg.chat.id})
    if (!chat) {
        return
    }
    const users = await User.find({karma:{$gt:0}}).sort({karma: -1}).select({username: 1, karma: 1, uid: 1})
    let message = ""
    let currentPlace = 1
    let lastPlace = 0
    let lastKarma = users[0].karma
    let column = 0
    for(let user of users) {
        if(user.karma < lastKarma)
        {
            lastKarma = user.karma
            currentPlace += 1
            column = 1
        } else {
            column += 1
            if (column > 1)
                message += ", "
        }
        if (currentPlace > 10){
            break
        }
        if(lastPlace < currentPlace) {
            message += `\n*${currentPlace} место* \\(${lastKarma}\\): `
            lastPlace = currentPlace
        }
        let name = markdowned(user.username)
        if(user.uid == msg.from.id){
            name = "*" + name + "*"
        }
        message += `${name}`
    }
    message = `Вот наш ТОП\\-${Math.min(currentPlace, 10)}\nПользователи с кармой больше 0:\n` + message
    bot.sendMessage(msg.chat.id, message, {parse_mode: "MarkdownV2", reply_to_message_id: msg.message_id})
})

bot.onText(/^\/top\-$/, async msg => {
    const chat = await Chat.findOne({uid: msg.chat.id})
    if (!chat) {
        return
    }
    const users = await User.find({karma:{$lt:0}}).sort({karma: 1}).select({username: 1, karma: 1, uid: 1})
    let message = ""
    let currentPlace = 1
    let lastPlace = 0
    let lastKarma = users[0].karma
    let column = 0
    for(let user of users) {
        if(user.karma > lastKarma)
        {
            lastKarma = user.karma
            currentPlace += 1
            column = 1
        } else {
            column += 1
            if (column > 1)
                message += ", "
        }
        if (currentPlace > 10){
            break
        }
        if(lastPlace < currentPlace) {
            message += `\n*${currentPlace} место* \\(${markdowned(lastKarma)}\\): `
            lastPlace = currentPlace
        }
        let name = markdowned(user.username)
        if(user.uid == msg.from.id){
            name = "*" + name + "*"
        }
        message += `${name}`
    }
    message = `Вот наш *ОТРИЦАТЕЛЬНЫЙ* ТОП\\-${Math.min(currentPlace, 10)}\nПользователи с кармой меньше 0:\n` + message
    bot.sendMessage(msg.chat.id, message, {parse_mode: "MarkdownV2", reply_to_message_id: msg.message_id})
})



bot.onText(/^\/my_stats/, async msg => {
    const chat = await Chat.findOne({uid: msg.chat.id})
    if (!chat) {
        return
    }
    const me = await getUser(msg.from)
    const lessKarma = await User.countDocuments({karma: {$gt: me.karma}})
    const sameKarma = await User.find({karma: me.karma})
    console.log(sameKarma)
    let sameMessage = ""
    if(sameKarma.length > 1) {
        sameMessage = "\nТы делишь его с:\n"
        let i = 0;
        for(let same of sameKarma) {
            if (i < 6) {
                if(same.uid != me.uid) {
                    sameMessage += ` \\- *${markdowned(same.username)}*\n`
                    i += 1
                }
            } else {
                sameMessage += ` и другими \\(всего ${sameKarma.length}\\)\n`
                break
            }
        }
    }
    let message = `
Вот твоя статистика, ${markdowned(me.username)}:

Карма: *${markdowned(me.karma)}*
Место среди пользователей: *${lessKarma+1}* ${sameMessage}
Количество сообщений: *${me.messagesCount}*
Сколько раз менял карму: *${me.karmaChanged}*
Сколько раз получал карму: *${me.karmaGot}*
`
    bot.sendMessage(msg.chat.id, message, {parse_mode: "MarkdownV2", reply_to_message_id: msg.message_id})
})



bot.on('message', async msg => {
    let chat = await getChat(msg.chat)
    if (!chat) {
        return
    }
    let user = await getUser(msg.from)
    if (!chat.users.includes(user.uid)) {
        Chat.updateOne(
            {uid: msg.chat.id},
            {$push: {users: user.uid}},
            (err, result) => {}
        )
    }
    await User.updateOne(
        {uid: msg.from.id},
        {$inc: {messagesCount: 1}}
    )
})



async function getChat(c) {
    let chat = await Chat.findOne({uid: c.id})
    if(process.env.NEW_CHATS) {
        if (!chat) {
            chat = new Chat({
                uid: c.id,
                title: c.title || c.username
            })
            chat.save((err, chat) => {
                if(err) return console.error(err)
                return chat
            })
        }
    }
    return chat
}

async function getUser(u) {
    let user = await User.findOne({uid: u.id})
    if (!user) {
        user = new User({uid: u.id, username: u.username || u.first_name })
        user.save((err, user) => {
            if(err) return console.error(err)
            return user
        })
    }
    return user
}


function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min; //Максимум не включается, минимум включается
  }


async function processKarma(msg, match, settings={}) {
    if(msg.reply_to_message) {
        const chat = await getChat(msg.chat)
        if (!chat) {
            return
        }
        const msgDate = new Date(msg.date*1000)
        const chat_id = msg.chat.id
        let changeMessage = `повысил`
        let updateValue = 0
        if(settings.emoji || settings.thanks) {
            if(match) {
                updateValue = 1
                if (match[0] === '-' || match[0] === "👎") {
                    changeMessage = `уменьшил`
                    updateValue = -1
                }
            }
        }  
        if(msg.sticker) {
            switch(msg.sticker.emoji) {
                case "👍":
                case "👍🏻":
                case "👍🏼":
                case "👍🏽":
                case "👍🏾":
                case "👍🏿":
                    changeMessage = `повысил`
                    updateValue = 1            
                    break
                case "👎":
                case "👎🏻":
                case "👎🏼":
                case "👎🏽":
                case "👎🏾":
                case "👎🏿":
                    changeMessage = `уменьшил`
                    updateValue = -1            
                    break
                default:
                    break
            }
        }
        if(updateValue == 0) return
        const from = msg.from
        const to = msg.reply_to_message.from 
        const fromDB = await getUser(from)
        const toDB = await getUser(to)
        const timeDiff = (msgDate - fromDB.lastKarmaShot) / 1000
        if(fromDB.karma < 0) {
            bot.sendMessage(chat_id, `Тебе с такой маленькой кармой (${fromDB.karma}) нельзя менять её другим`, {reply_to_message_id: msg.message_id})
            return
        }
        if(from.id == to.id) {
            const messages = await Trigger.find({trigger:'selfLike', show: true})
            const message = messages[getRandomInt(0, messages.length)].text
            bot.sendMessage(chat_id, message, {reply_to_message_id: msg.message_id})
            return
        }
        if(to.id === me.id) {
            let messages
            let change = true
            if (updateValue == 1){
               messages = await Trigger.find({trigger:'karmaForMe', show: true})
            } else if(updateValue == -1) {
                change = false
                messages = await Trigger.find({trigger:'minusForMe', show: true})
            }
            const message = messages[getRandomInt(0, messages.length)].text
            bot.sendMessage(chat_id, message, {reply_to_message_id: msg.message_id})
            if (!change) {
                return
            }
        }
        if (timeDiff < chat.options.karmaCooldown){
            const messages = await Trigger.find({trigger:'tooFast', show: true})
            const message = messages[getRandomInt(0, messages.length)].text
            bot.sendMessage(chat_id, message, {reply_to_message_id: msg.message_id})
            return
        }
        if (to.is_bot && to.id != me.id) {
            return
        }
        {
            result = await User.updateOne(
                {uid: to.id},
                {
                    $inc: {
                        karma: updateValue,
                        karmaGot: 1
                    },
                }
            )
            User.updateOne(
                {uid: from.id},
                {
                    lastKarmaShot: msgDate,
                    $inc: {karmaChanged: 1}
                }
            ).exec()
            const message = `*${markdowned(fromDB.username)} \\(${markdowned(fromDB.karma)}\\)* ${changeMessage} карму *${markdowned(toDB.username)} \\(${markdowned(toDB.karma + updateValue)}\\)*`
            console.log(message)
            bot.sendMessage(chat_id, message, {parse_mode: "MarkdownV2"})
        }
    }
}