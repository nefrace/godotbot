console.log(Date.now().toLocaleString());
console.log(`==========================================
STARTING BOT
=============================================`);

const TelegramBot = require("node-telegram-bot-api");
const mongoose = require("mongoose");

const {
  userSchema,
  chatSchema,
  triggerSchema,
  warningSchema,
} = require("./schemas");

const User = mongoose.model("User", userSchema);
const Chat = mongoose.model("Chat", chatSchema);
const Trigger = mongoose.model("Trigger", triggerSchema);
const Warning = mongoose.model("Warning", warningSchema);
let me;
let update = false;

const MarkdownEscape = /_|\*|\[|\]|\(|\)|~|`|>|#|\+|-|=|\||{|}|\.|!/g;
const escapeFunc = (x) => {
  return "\\" + x;
};
const markdowned = (s) => {
  return s.toString().replace(MarkdownEscape, escapeFunc);
};

let CarmaShots = [];
const clearInterval = 1000 * 60 * 5;
setInterval(() => {
  CarmaShots = CarmaShots.filter(
    (obj) => Date.now() - obj.date < clearInterval
  );
}, clearInterval);

const mongo_uri = "mongodb://" + process.env.MONGO_HOST + "/godot";
mongoose.connect(mongo_uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;
db.on("error", console.error.bind(console, "CONNECTION ERROR: "));
db.once("open", () => console.log("DB CONNECTED SUCCESFULLY"));

const telegram_token = process.env.TOKEN;
const bot = new TelegramBot(telegram_token, { polling: true });

const commands = [
  { command: "help", description: "Показать справку по командам" },
  { command: "top", description: "Показать ТОП-10 пользователей по карме" },
  {
    command: "bottom",
    description: "Показать отрицательный ТОП-10 пользователей по карме",
  },
  { command: "stats", description: "Показать статистику пользователя" },
];

bot
  .getMe()
  .then((result) => {
    me = result;
    console.log(me);
    console.log("TLG BOT CONNECTED");
    bot.setMyCommands(commands);
  })
  .catch((error) => console.error(error.code, error.response.body));

bot.onText(/^\/update_db/, async (msg, match) => {
  if (update) return;
  const user = msg.from;
  const chatMember = await bot.getChatMember(msg.chat.id, user.id);
  if (chatMember.status == "administrator" || chatMember.status == "creator") {
    update = true;
    bot.sendMessage(
      msg.chat.id,
      "База данного чата обновляется, подождите, пожалуйста."
    );
    await updateDB(msg.chat.id);
    bot.sendMessage(
      msg.chat.id,
      "База чата успешно обновлена! Благодарю за ожидание :3"
    );
    update = false;
  }
});

bot.onText(/^\/me (.+)/, async (msg, match) => {
  if (update) return;
  const user = msg.from;
  const options = {
    parse_mode: "MarkdownV2",
  };
  if (msg.reply_to_message)
    options.reply_to_message_id = msg.reply_to_message.message_id;
  if (msg.chat) bot.deleteMessage(msg.chat.id, msg.message_id);
  bot.sendMessage(
    msg.chat.id,
    `_*${markdowned(user.first_name || user.username)}* ${markdowned(
      match[1]
    )}_`,
    options
  );
});

bot.onText(/^\/GodetteSay (.+)/, async (msg, match) => {
  if (update) return;
  const user = msg.from;
  const chatMember = await bot.getChatMember(msg.chat.id, user.id);
  if (chatMember.status == "administrator" || chatMember.status == "creator") {
    const options = {
      parse_mode: "MarkdownV2",
    };
    if (msg.reply_to_message)
      options.reply_to_message_id = msg.reply_to_message.message_id;
    if (msg.chat) bot.deleteMessage(msg.chat.id, msg.message_id);
    bot.sendMessage(msg.chat.id, `*${markdowned(match[1])}*`, options);
  }
});

bot.onText(/^\/help/, async (msg) => {
  if (update) return;
  const chat = await getChat(msg.chat);
  if (!chat) {
    return;
  }
  try {
    bot.sendMessage(
      msg.chat.id,
      `
Итак, вот на что я реагирую:

Для изменения кармы другому человеку, ответьте на его сообщение текстом, начинающимся на:
\\- "\\+" и "\\-"
\\- 👍 и 👎
\\- "спасибо", "спс", "благодарю", регистр не важен
Между изменениями кармы от одного человека должно пройти не менее ${chat.options.karmaCooldown} секунд\\.
Если у вас отрицательная карма \\- менять другим её нельзя\\!

/stats \\- покажет вашу статистику кармы и сообщений для данного чата\\. Карма общая на все чаты\\.
/top \\- покажет ТОП\\-10 мест по карме\\.
/bottom \\- покажет отрицательный ТОП\\-10\\.
/me \\- я напишу твоё сообщение как действие\\. Например это:
\`/me написал очень полезного бота\`
превратится в это:
_*Vlad* написал очень полезного бота_ 

Также в основном чате я на слово "оффтоп" сразу же кидаю ссылку на оффтоп\\-чат\\. Потому что не стоит засорять основу общими беседами \\(;
Сбора бота: 16 августа 2021 года
    `,
      { parse_mode: "MarkdownV2", reply_to_message_id: msg.message_id }
    );
  } catch (error) {
    console.error(error);
  }
});

bot.onText(/\/setmain/, async (msg, match) => {
  if (update) return;
  const chat = await getChat(msg.chat);
  if (!chat) {
    return;
  }
  const member = await bot.getChatMember(msg.chat.id, msg.from.id);
  if (
    member.status == "administrator" ||
    member.status == "creator" ||
    msg.chat.id > 0
  ) {
    Chat.updateOne(
      {
        uid: msg.chat.id,
      },
      {
        $set: { main: true },
      }
    ).exec();
    bot.deleteMessage(msg.chat.id, msg.message_id);
    bot.sendMessage(
      msg.chat.id,
      `Данный чат успешно установлен в качестве основного`
    );
  }
});

bot.onText(/^\/warn/, async (msg, match) => {
  if (update) return;
  const chat = await Chat.findOne({ uid: msg.chat.id });
  if (!chat || msg.chat.id > 0) return;

  const member = await bot.getChatMember(msg.chat.id, msg.from.id);
  if (member.status != "administrator" && member.status != "creator") return;

  if (msg.reply_to_message) {
    const to = msg.reply_to_message.from;
    if (to.id == me.id) {
      return;
    }
    if (to.id === msg.from.id) {
      return;
    }
    const warns = await Warning.find({
      user: to.id,
      chat: msg.chat.id,
      active: true,
    });
    console.log({ warns });
    if (warns.length >= (chat.options.maxWarnings || 3)) {
      //bot.kickChatMember(msg.chat.id, to.id)
      bot.restrictChatMember(msg.chat.id, to.id, {
        can_add_web_page_previews: false,
        can_change_info: false,
        can_invite_users: false,
        can_pin_messages: false,
        can_send_media_messages: false,
        can_send_messages: false,
        can_send_other_messages: false,
        can_send_polls: false,
      });
      bot.sendMessage(
        msg.chat.id,
        `*${markdowned(
          to.first_name
        )}* получил слишком много предупреждений и больше не будет ничего писать\\.`,
        {
          parse_mode: "MarkdownV2",
          reply_to_message_id: msg.reply_to_message.message_id,
        }
      );
    } else {
      const warning = new Warning({
        user: to.id,
        chat: msg.chat.id,
        msg: msg.reply_to_message.text || "Нет текста",
      });
      warning.save();
      let message = `*${markdowned(to.first_name)}* получил${
        warns.length === 0 ? " " : " ещё "
      }одно предупреждение\\. *Всего: ${warns.length + 1}*`;
      if (warns.length === (chat.options.maxWarnings || 3) - 1) {
        message += "\nДальше только молчанка\\.";
      }

      bot.sendMessage(msg.chat.id, message, {
        parse_mode: "MarkdownV2",
        reply_to_message_id: msg.reply_to_message.message_id,
      });
    }
  }
});

bot.onText(/^\/unban/, async (msg, match) => {
  if (update) return;
  const chat = await Chat.findOne({ uid: msg.chat.id });
  if (!chat) {
    return;
  }
  const member = await bot.getChatMember(msg.chat.id, msg.from.id);
  if (member.status != "administrator" && member.status != "creator") return;

  let user = await getUserFromMessage(msg);
  if (!user) {
    bot.sendMessage(
      msg.chat.id,
      "Извините, не нашла ничего на данного пользователя"
    );
    return;
  }
  if (user.uid === msg.from.id) {
    return;
  }
  if (user.uid == me.id) {
    return;
  }
  Warning.updateMany(
    { user: user.uid, chat: msg.chat.id },
    { $set: { active: false } }
  );
  //bot.unbanChatMember(msg.chat.id, user.uid)
  bot.restrictChatMember(msg.chat.id, user.uid, {
    can_add_web_page_previews: true,
    can_change_info: true,
    can_invite_users: true,
    can_pin_messages: true,
    can_send_media_messages: true,
    can_send_messages: true,
    can_send_other_messages: true,
    can_send_polls: true,
  });
  bot.sendMessage(
    msg.chat.id,
    `*${markdowned(user.username)}* был разбанен\\.`,
    { parse_mode: "MarkdownV2" }
  );
});

bot.onText(/^\/set ([a-zA-Z]+) (\d+)/, async (msg, match) => {
  if (update) return;
  const chat = await Chat.findOne({ uid: msg.chat.id });
  if (!chat) {
    return;
  }
  const member = await bot.getChatMember(msg.chat.id, msg.from.id);
  if (
    member.status == "administrator" ||
    member.status == "creator" ||
    msg.chat.id > 0
  ) {
    let option = match[1];
    let value = parseInt(match[2]);
    if (chat.options[option] && value) {
      let field = "options." + option;
      let obj = {};
      obj[field] = Math.min(Math.max(1, value), 600);
      Chat.updateOne(
        { uid: msg.chat.id },
        { $set: obj },
        { upsert: true }
      ).exec();
      bot.deleteMessage(msg.chat.id, msg.message_id);
      bot.sendMessage(
        msg.chat.id,
        `Значение ${option} установлено на ${obj[field]}`
      );
    }
  }
});

bot.onText(/^(\+|-|👍|👎|➕|➖)/, async (msg, match) => {
  processKarma(msg, match, { emoji: true });
});

bot.onText(/^(спасибо|благодарю|спс)/i, async (msg, match) => {
  processKarma(msg, match, { thanks: true });
});

bot.on("sticker", (msg) => {
  processKarma(msg, null, { stickers: true });
});

bot.onText(/(оффтоп|offtop)/i, async (msg) => {
  if (update) return;
  //const offtop = await Chat.findOne({main: true})
  const msgDate = new Date(msg.date * 1000);
  const chat = await getChat(msg.chat);
  if (!chat.main) {
    return;
  }
  if ((msgDate - chat.lastOfftop) / 1000 < chat.options.offtopCooldown) {
    return;
  }
  const messages = await Trigger.find({ trigger: "offtop", show: true });
  const message = messages[getRandomInt(0, messages.length)].text;
  bot.sendMessage(msg.chat.id, message, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Оффтоп чат",
            url: "http://t.me/Godot_Engine_Offtop",
          },
        ],
      ],
    },
    reply_to_message_id: msg.message_id,
  });
  Chat.updateOne(
    { uid: msg.chat.id },
    { $set: { lastOfftop: msgDate } }
  ).exec();
});

bot.onText(
  /док(ументац[а-я]+|[а-я])? ((п)?о )?(?<topic>@?[\w\d\s]{1,32})/i,
  async (msg, match) => {
    if (update) return;
    const chat = await getChat(msg.chat);
    const topic = match[match.length - 1];
    if (!chat) {
      return;
    }
    console.log(topic);
    const messages = await Trigger.find({ trigger: "docs", show: true });
    const message = messages[getRandomInt(0, messages.length)].text;

    bot.sendMessage(msg.chat.id, message, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: `Поиск по ${topic}`,
              url: `https://docs.godotengine.org/ru/stable/search.html?q=${topic}`,
            },
          ],
        ],
      },
      reply_to_message_id: msg.message_id,
    });
  }
);

bot.onText(/^\/top/, async (msg) => {
  if (update) return;
  const chat = await Chat.findOne({ uid: msg.chat.id });
  if (!chat || chat.main) {
    return;
  }
  const users = await User.find({ karma: { $gt: 0 } })
    .sort({ karma: -1 })
    .select({ full_name: 1, karma: 1, uid: 1 });
  let message = "";
  let currentPlace = 1;
  let lastPlace = 0;
  let lastKarma = users[0].karma;
  let column = 0;
  for (let user of users) {
    if (user.karma < lastKarma) {
      lastKarma = user.karma;
      currentPlace += 1;
      column = 1;
    } else {
      column += 1;
      if (column > 1) message += ", ";
    }
    if (currentPlace > 10) {
      break;
    }
    if (lastPlace < currentPlace) {
      message += `\n*${currentPlace} место* \\(${lastKarma}\\): `;
      lastPlace = currentPlace;
    }
    console.log(user);
    let name = markdowned(user.full_name);
    if (user.uid == msg.from.id) {
      name = "*" + name + "*";
    }
    message += `${name}`;
  }
  message =
    `Вот наш ТОП\\-${Math.min(
      currentPlace,
      10
    )}\nПользователи с кармой больше 0:\n` + message;
  bot.sendMessage(msg.chat.id, message, {
    parse_mode: "MarkdownV2",
    reply_to_message_id: msg.message_id,
  });
});

bot.onText(/^\/bottom/, async (msg) => {
  if (update) return;
  const chat = await Chat.findOne({ uid: msg.chat.id });
  if (!chat || chat.main) {
    return;
  }
  const users = await User.find({ karma: { $lt: 0 } })
    .sort({ karma: 1 })
    .select({ full_name: 1, karma: 1, uid: 1 });
  let message = "";
  let currentPlace = 1;
  let lastPlace = 0;
  let lastKarma = users[0].karma;
  let column = 0;
  for (let user of users) {
    if (user.karma > lastKarma) {
      lastKarma = user.karma;
      currentPlace += 1;
      column = 1;
    } else {
      column += 1;
      if (column > 1) message += ", ";
    }
    if (currentPlace > 10) {
      break;
    }
    if (lastPlace < currentPlace) {
      message += `\n*${currentPlace} место* \\(${markdowned(lastKarma)}\\): `;
      lastPlace = currentPlace;
    }
    let name = markdowned(user.full_name);
    if (user.uid == msg.from.id) {
      name = "*" + name + "*";
    }
    message += `${name}`;
  }
  message =
    `Вот наш *ОТРИЦАТЕЛЬНЫЙ* ТОП\\-${Math.min(
      currentPlace,
      10
    )}\nПользователи с кармой меньше 0:\n` + message;
  bot.sendMessage(msg.chat.id, message, {
    parse_mode: "MarkdownV2",
    reply_to_message_id: msg.message_id,
  });
});

bot.onText(/^\/my_stats/, async (msg) => {
  bot.sendMessage(msg.chat.id, `Теперь команда для показа статистики - /stats`);
});

bot.onText(/^\/stats/, async (msg) => {
  if (update) return;
  const chat = await Chat.findOne({ uid: msg.chat.id });
  if (!chat || chat.main) {
    return;
  }
  let user = await getUserFromMessage(msg, false);

  if (!user) {
    bot.sendMessage(
      msg.chat.id,
      "Извините, не нашла ничего на данного пользователя",
      { reply_to_message_id: msg.message_id }
    );
    return;
  }
  const lessKarma = await User.countDocuments({ karma: { $gt: user.karma } });
  const sameKarma = await User.find({ karma: user.karma });
  let sameMessage = "";
  if (user.karma != 0 && sameKarma.length > 1) {
    sameMessage = "\nТы делишь его с:\n";
    let i = 0;
    for (let same of sameKarma) {
      if (i < 6) {
        if (same.uid != user.uid) {
          console.log(`Same user: `, same);
          sameMessage += ` \\- *${markdowned(same.full_name)}*\n`;
          i += 1;
        }
      } else {
        sameMessage += ` и другими \\(всего ${sameKarma.length}\\)\n`;
        break;
      }
    }
  }
  let message = `
Вот информация о тебе, *${markdowned(user.full_name)}*:

Карма: *${markdowned(user.karma)}*
Место среди пользователей: *${lessKarma + 1}* ${sameMessage}
Количество сообщений: *${user.messagesCount}*
Сколько раз менял карму: *${user.karmaChanged}*
Сколько раз получал карму: *${user.karmaGot}*
`;
  bot.sendMessage(msg.chat.id, message, {
    parse_mode: "MarkdownV2",
    reply_to_message_id: msg.message_id,
  });
});

bot.on("message", async (msg) => {
  if (update) return;
  let chat = await getChat(msg.chat);
  if (!chat || msg.chat.id > 0) {
    return;
  }
  let user = await getUser(msg.from);
  if (!chat.users.includes(user.uid)) {
    Chat.updateOne(
      { uid: msg.chat.id },
      { $push: { users: user.uid } },
      (err, result) => {}
    );
  }
  await User.updateOne({ uid: msg.from.id }, { $inc: { messagesCount: 1 } });
});

async function addPhrase(trigger, text) {}

async function getChat(c) {
  let chat = await Chat.findOne({ uid: c.id });
  if (process.env.NEW_CHATS) {
    if (!chat) {
      chat = new Chat({
        uid: c.id,
        title: c.title || c.username,
      });
      chat.save((err, chat) => {
        if (err) return console.error(err);
        return chat;
      });
    }
  }
  return chat;
}

async function getUser(u) {
  let full_name = u.first_name + (u.last_name ? " " + u.last_name : "");
  let user = await User.findOne({ uid: u.id });
  if (!user) {
    user = new User({ uid: u.id, full_name: full_name, username: u.username });
    user.save((err, user) => {
      if (err) return console.error(err);
      return user;
    });
  } else {
    user.full_name = full_name;
    user.username = u.username;
    await user.save();
  }
  return user;
}

async function getUserFromMessage(msg, check_reply = true) {
  let user;
  if (!check_reply) {
    user = await getUser(msg.from);
    return user;
  }
  if (msg.reply_to_message) {
    user = await getUser(msg.reply_to_message.from); // Get user from reply
  } else if (msg.entities.length > 1) {
    for (entity of msg.entities) {
      if (entity.type == "mention") {
        const username = msg.text.slice(
          entity.offset + 1,
          entity.offset + entity.length
        ); // Get user from @Mention
        user = await User.findOne({ username: username });
        break;
      } else if (entity.type == "text_mention") {
        user = await getUser(entity.user); // Get user from @Mention without username.
        break; // Strange that this is easier than regular mentions.
      }
    }
  } else {
    user = await getUser(msg.from); // Just get user that sent this message
  }
  return user;
}

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min)) + min; //Максимум не включается, минимум включается
}

async function processKarma(msg, match, settings = {}) {
  if (process.env.DEBUG || update) {
    return;
  }
  if (msg.reply_to_message) {
    const chat = await getChat(msg.chat);
    if (!chat) {
      return;
    }
    // console.log(msg);
    // console.log(msg.reply_to_message.forum_topic_created);
    if (msg.reply_to_message.forum_topic_created != undefined) {
      return;
    }
    const msgDate = new Date(msg.date * 1000);
    const chat_id = msg.chat.id;
    let changeMessage = `повысил`;
    let updateValue = 0;
    if (settings.emoji || settings.thanks) {
      if (match) {
        updateValue = 1;
        if (match[0] === "-" || match[0] === "👎") {
          changeMessage = `уменьшил`;
          updateValue = -1;
        }
      }
    }
    if (msg.sticker) {
      if (["👍", "➕"].includes(msg.sticker.emoji)) {
        changeMessage = `повысил`;
        updateValue = 1;
      } else if (["👎", "➖"].includes(msg.sticker.emoji)) {
        changeMessage = `уменьшил`;
        updateValue = -1;
      }
    }
    if (updateValue == 0) return;
    const from = msg.from;
    const to = msg.reply_to_message.from;
    const fromDB = await getUser(from);
    const toDB = await getUser(to);
    const timeDiff = (msgDate - fromDB.lastKarmaShot) / 1000;

    // Дальше страшная строка для поиска недавних карма-выстрелов одного юзера другому
    console.log("OLD CARMA SHOTS: ");
    console.log({ CarmaShots });
    const carmaShot = CarmaShots.find(
      (val, id) =>
        val.from === from.id &&
        val.to === to.id &&
        Date.now() - val.date < chat.options.karmaCooldown * 1000
    );
    console.log("FOUND SHOT: ");
    console.log({ carmaShot });
    if (carmaShot) {
      const trigger = `tooFast${updateValue > 0 ? "Plus" : "Minus"}`;
      const messages = await Trigger.find({ trigger: trigger, show: true });
      console.log({ messages });
      const message = messages[getRandomInt(0, messages.length)].text;
      bot.sendMessage(chat_id, message, {
        reply_to_message_id: msg.message_id,
      });
      return;
    }
    if (fromDB.karma < 0) {
      bot.sendMessage(
        chat_id,
        `Тебе с такой маленькой кармой (${fromDB.karma}) нельзя менять её другим`,
        { reply_to_message_id: msg.message_id }
      );
      return;
    }
    if (from.id == to.id) {
      const trigger = `self${updateValue > 0 ? "Like" : "Dislike"}`;
      const messages = await Trigger.find({ trigger: trigger, show: true });
      const message = messages[getRandomInt(0, messages.length)].text;
      bot.sendMessage(chat_id, message, {
        reply_to_message_id: msg.message_id,
      });
      return;
    }
    /// TODO: Пока просто закомментим, потом если всё ок, надо удалить.
    // if (timeDiff < chat.options.karmaCooldown){
    //     const messages = await Trigger.find({trigger:'tooFast', show: true})
    //     const message = messages[getRandomInt(0, messages.length)].text
    //     bot.sendMessage(chat_id, message, {reply_to_message_id: msg.message_id})
    //     return
    // }
    if (to.id === me.id) {
      let messages;
      let change = true;
      if (updateValue == 1) {
        messages = await Trigger.find({ trigger: "karmaForMe", show: true });
      } else if (updateValue == -1) {
        change = false;
        messages = await Trigger.find({ trigger: "minusForMe", show: true });
      }
      const message = messages[getRandomInt(0, messages.length)].text;
      bot.sendMessage(chat_id, message, {
        reply_to_message_id: msg.message_id,
      });
      if (!change) {
        return;
      }
    }
    if (to.is_bot && to.id != me.id) {
      return;
    }
    {
      result = await User.updateOne(
        { uid: to.id },
        {
          $inc: {
            karma: updateValue,
            karmaGot: 1,
          },
        }
      );
      User.updateOne(
        { uid: from.id },
        {
          lastKarmaShot: msgDate,
          $inc: { karmaChanged: 1 },
        }
      ).exec();
      if (toDB.karma + updateValue == 69) {
        bot.sendMessage(chat_id, "Nice.");
      }
      const message = `*${markdowned(fromDB.full_name)} \\(${markdowned(
        fromDB.karma
      )}\\)* ${changeMessage} карму *${markdowned(
        toDB.full_name
      )} \\(${markdowned(toDB.karma + updateValue)}\\)*`;
      console.log(message);
      CarmaShots.push({ from: from.id, to: to.id, date: Date.now() });
      console.log("NEW CarmaShots: ");
      console.log({ CarmaShots });
      bot.sendMessage(chat_id, message, {
        reply_to_message_id: msg.message_id,
        parse_mode: "MarkdownV2",
      });
    }
  }
}

async function updateDB(id) {
  console.log(`UPDATING DB FOR ${id}`);
  const chat = await Chat.findOne({ uid: id });
  const users = await User.find({ uid: chat.users });
  console.log({ users });
  for (let user of users) {
    const chatMember = await bot.getChatMember(id, user.uid).catch((e) => {
      return null;
    });
    if (!chatMember) {
      continue;
    }
    const u = chatMember.user;
    user.name = undefined;
    user.full_name = u.first_name + (u.last_name ? " " + u.last_name : "");
    user.username = u.username || null;
    await user.save();
    console.log(`USER ${user.uid} SAVED`);
    await sleep(100);
  }
  console.log("WE ARE DONE");
  return true;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
