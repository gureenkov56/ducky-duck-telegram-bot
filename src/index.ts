import { CURRENCY, NO_CATEGORY_ID, NO_CATEGORY_NAME, CHANGE_MAIN_CURRENCY, CurrencySymbolPlace } from './constants';

import { message } from 'telegraf/filters'
import { config } from 'dotenv'
import {Context, Markup, Telegraf} from 'telegraf';
import { Currency, PrismaClient } from '@prisma/client'
import { BotStatus } from './enums';
import { prismaCategoryCreateMany, getUserId, getUserCategories} from './utils';
import { Message, Update } from 'telegraf/types';
import { get } from 'http';


config();
const BOT_TOKEN = process.env.BOT_TOKEN as string

// userState хранит текущее состояние бота для каждого пользователя, например, когда бот ждет от пользователя список категорий
const userState = new Map<number, {status: BotStatus, data?: any}>();
const prisma = new PrismaClient()
const bot = new Telegraf(BOT_TOKEN)

const Messages = {
  chooseCurrency: 'Давай выберем основную валюту',
  greeting: '👋 Привет! Я помогу тебе вести учет расходов и доходов. Чтобы записать расход, просто пришли мне сумму. Например так:\n\n`1050`\n\nЕсли хочешь, можно добавить комментарий. Просто напиши его на следующей строке:\n\n`1050\nБилеты в кино`\n\nЧтобы записать доход, просто поставь плюс перед суммой:\n\n`+5000\nЗарплата`',
  youAreRegisteredAlready: 'Ты уже зарегистрирован! Просто пришли мне сумму, чтобы записать расход или доход',
  categoriesAreCreated: 'Категории успешно добавлены! Теперь ты можешь записывать свои расходы и доходы',
  youHaveNotCategories: 'Просто пришли мне список категорий, по одному на строку. Например:\n\n🍕 Еда\n🚗 Транспорт\n🎉 Развлечения\n\nPS: Рекомендую поставить смайлик перед каждой категорией, чтобы было веселее :)'
}



/** UTILS **/
function parseMessage(message: string) {
  // TODO: add validation
    const [sum, comment] = message.split('\n')

    const isIncome = sum.startsWith('+')
    const amount = parseFloat(sum)

    return {
      isIncome,
      amount,
      comment: comment || ''
    }
}

function createCategories(ctx: Context) {
  userState.set(ctx.from.id, {status: BotStatus.waitCategoriesList});

  return ctx.reply(Messages.youHaveNotCategories, { parse_mode: 'Markdown' })
}

// Global middleware
// bot.use(async (ctx, next) => {
//   const userId = ctx.from.id

//   const user = await prisma.user.findFirst({where: {id: userId}})

//   if (user) {
//     const currencies = [
//       Markup.button.callback('Добавить категорию', `setUserCurrency_${prisma.CURRENCY}`),
//     ]
//     // const allCurrencyKeyboard = Mar
//     return ctx.reply(Messages.chooseCurrency)
//   }
//   return next(); // Pass control to the next middleware
// });


bot.command('start', async (ctx) => {

  const isUserExist = await prisma.user.findFirst({
    where: {
      id: ctx.message.from.id
    }
  })

  if (!isUserExist) {
    await prisma.user.create({
      data: {
        id: ctx.message.from.id
      }
    })

    return ctx.reply(Messages.greeting, { parse_mode: 'Markdown' })
  }

  return ctx.reply(Messages.youAreRegisteredAlready, { parse_mode: 'Markdown' })
})

bot.command('categories', async (ctx) => {
  const categories = await getUserCategories(prisma, getUserId(ctx));
  const categoriesList = categories.length ? categories.map(({name}) => name).join('\n') : 'У вас нет категорий';

  const options = [
    Markup.button.callback('Добавить категорию', `addNewCategories`),
  ]

  return ctx.reply(
      `Ваши категории:\n${categoriesList}`,
      Markup.inlineKeyboard(options, { columns: 2 })
  );
})

bot.command('report', async (ctx) => {
  return ctx.reply('Отчеты пока в разработке...')
})

bot.command('list', async (ctx) => {
  return ctx.reply('Списки операций пока в разработке...')
})

bot.command('help', async (ctx) => {
  // TODO: сообщение-инструкция с описанием всех команд бота
  return ctx.reply('Помощь пока в разработке...')
})

bot.command('settings', async (ctx) => {
  const options = [
    Markup.button.callback('Изменить основную валюту', CHANGE_MAIN_CURRENCY),
  ]

  return ctx.reply(
      `Настройки пользователя:`,
      Markup.inlineKeyboard(options, { columns: 1 })
  );
}) 

// Обработка сообщений в зависимости от состояния бота для пользователя
async function processMessageBasedOnState(ctx: Context) {
  const state = userState.get(ctx.from.id);
  userState.delete(ctx.from.id);

  if (state.status === BotStatus.waitCategoriesList) {
    await prismaCategoryCreateMany(prisma, ctx.message.text, getUserId(ctx));
    const userCategories = await prisma.category.findMany({where: {userId: ctx.from.id}, select: {name: true}});
    const userCategoriesList = userCategories.map(({ name }) => name).join('\n');
    return ctx.reply(Messages.categoriesAreCreated + '\n\nВаши категории:\n' + userCategoriesList);
  }

  if (state.status === BotStatus.waitNewTransactionAmount) {
    const newAmount = parseFloat(ctx.message.text);
    if (isNaN(newAmount) || newAmount <= 0) {
      return ctx.reply('Пожалуйста, введите корректную сумму.');
    }

    const transactionId = state.data;
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { amount: newAmount }
    });

    userState.delete(ctx.from.id);
    return ctx.reply('Сумма успешно обновлена!');
  }

  if (state.status === BotStatus.waitNewTransactionComment) {
    const newComment = ctx.message.text;

    const transactionId = state.data;
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { comment: newComment }
    });

    userState.delete(ctx.from.id);
    return ctx.reply('Комментарий успешно обновлен!');
  }

  if (state.status === BotStatus.waitNewTransactionCategory) {
    const transactionId = state.data;
    const userCategories = await getUserCategories(prisma, getUserId(ctx));


    const categoriesButtons = userCategories.map(category =>
      Markup.button.callback(category.name, `update_transaction_set_category_${category.id}_where_id_${transactionId}`)
    );

    categoriesButtons.push(Markup.button.callback(NO_CATEGORY_NAME, `update_transaction_set_category_${NO_CATEGORY_ID}_where_id_${transactionId}`))

    const messageText = `Выбери новую категорию:`;

    ctx.reply(messageText, Markup.inlineKeyboard(categoriesButtons, { columns: 2 }));
  }
}

bot.on(message('text'), async (ctx) => {
  ctx.deleteMessage();

  if (userState.get(ctx.from.id)) {
    processMessageBasedOnState(ctx)
    return;
  }

  const { isIncome, amount, comment } = parseMessage(ctx.message.text);
  const userId = getUserId(ctx);

  if (isNaN(amount) || amount <= 0) {
    return ctx.reply('Пожалуйста, введите корректную сумму. Например: `1050` или `+5000`.\n\nТакже сразу можно указать комментарий, тогда сообщение будет выглядеть так:\`\`\`\n550\nБилеты в кино\`\`\`', { parse_mode: 'Markdown' })
  }

  const transaction = await prisma.transaction.create({
    data: {
      type: isIncome ? 'INCOME' : 'EXPENSE',
      amount,
      comment,
      userId: ctx.message.from.id
    }
  })

  // TODO отдельные категории для INCOME
  const userCategories = await getUserCategories(prisma, userId);
  const userCurrency = CURRENCY[(await prisma.user.findUnique({where: {id: userId}}))?.currency as keyof typeof CURRENCY];

  const amountWithCurrency = userCurrency.symbolPlace === CurrencySymbolPlace.BEFORE
    ? `${userCurrency.symbol}${transaction.amount}`
    : `${transaction.amount} ${userCurrency.symbol}`;

  if (userCategories.length === 0) {
    await ctx.reply(`Записал расход\n💸 ${amountWithCurrency}\n${transaction.comment}`)
    const doYouWantToCreateCategoriesButtons =  [
      Markup.button.callback('Да', `wantToCreateCategories_yes`),
      Markup.button.callback('Нет, позже', `wantToCreateCategories_no`)
    ]
    const keyboardOptions = Markup.inlineKeyboard(doYouWantToCreateCategoriesButtons, { columns: 2 })
    return ctx.reply('🛍️ У тебя нет категорий расходов. Хочешь создать их сейчас?', keyboardOptions);
  }

  const categoriesButtons = userCategories.map(category =>
    Markup.button.callback(category.name, `update_transaction_set_category_${category.id}_where_id_${transaction.id}`)
  );

  categoriesButtons.push(Markup.button.callback(NO_CATEGORY_NAME, `update_transaction_set_category_${NO_CATEGORY_ID}_where_id_${transaction.id}`))
  // TODO добавить кнопку "Добавить категорию" сразу при выборе категории
  // categoriesButtons.push(Markup.button.callback('✍️ Добавить новую категорию', `create_category_for_transaction_${transaction.id}`))

  let messageText = `Записан расход\n🔻${amountWithCurrency}`;
  if (transaction.comment) {
    messageText += `\n💬 ${transaction.comment}`;
  }

  messageText += `\n\nВыбери категорию:`;

  ctx.reply(messageText, Markup.inlineKeyboard(categoriesButtons, { columns: 2 }));
})


// TODO сделать парсер разных update запросов
bot.action(/update_transaction_set_category_.+/, async (ctx) => {
  const data = ctx.match[0]
  const categoryId = parseInt(ctx.match[0].split('_')[4], 10);
  const transactionId = parseInt(ctx.match[0].split('_')[7], 10);

  const isCategoryNoCategory = categoryId === 0;

  const transaction = isCategoryNoCategory ? await prisma.transaction.findFirst({where: {id: transactionId}}) : await prisma.transaction.update({where: {id: transactionId}, data: {categoryId: categoryId}})
  const {name: categoryName} = isCategoryNoCategory ? {name: NO_CATEGORY_NAME} : await prisma.category.findUnique({ where: { id: transaction.categoryId }, select: {name: true} })

  await ctx.deleteMessage()
  const comment = transaction.comment.length ? `\n💬 ${transaction.comment}` : '';

  const userCurrency = CURRENCY[(await prisma.user.findUnique({where: {id: ctx.from.id}}))?.currency as keyof typeof CURRENCY];
  
  const amount = userCurrency.symbolPlace === CurrencySymbolPlace.BEFORE
    ? `💸 ${userCurrency.symbol}${transaction.amount}`
    : `💸 ${transaction.amount}${userCurrency.symbol}`;

  const editButton = Markup.inlineKeyboard([
    // добавить кнопку удалить прям здесь или внутри меню редактирования
    Markup.button.callback('Редактировать', `edit_transaction_where_id_${transaction.id}`)
  ])

  ctx.reply(`Записал\n\n${amount}\n${categoryName}${comment}`, editButton);
});

bot.action(/wantToCreateCategories_(yes|no)/, async (ctx) => {
  const data = ctx.match[0]
  const yesOrNot = data.split('_')[1];

  if (yesOrNot === 'yes') {
    return createCategories(ctx)
  } else {
    await ctx.deleteMessage();
    return ctx.reply(`Окей! Ты можешь добавить категории в любой момент, отправив команду /categories`, { parse_mode: 'Markdown' })
  }
})

bot.action('addNewCategories', createCategories)

bot.action(CHANGE_MAIN_CURRENCY, async (ctx) => {
  ctx.deleteMessage();
  // TODO: Implement change main currency logic
  const currentUser = await prisma.user.findFirst({where: {id: ctx.from.id}})
  if (!currentUser) {
    return ctx.reply('Ошибка: пользователь не найден.')
  }

  const currentCurrencyObj = CURRENCY[currentUser.currency as keyof typeof CURRENCY];

  const text = `Ваша основная валюта: ${currentCurrencyObj.emoji} ${currentUser.currency} (${currentCurrencyObj.symbol})\n\nВыберите новую основную валюту:`;
  const currencyButtons = Object.values(CURRENCY).map(currency =>
    Markup.button.callback(`${currency.emoji} ${currency.name} (${currency.symbol})`, `setUserCurrency_${currency.name}`)
  );

  return ctx.reply(
      text,
      Markup.inlineKeyboard(currencyButtons, { columns: 2 })
  );
});

bot.action(/setUserCurrency_\w+/, async (ctx) => {
  const selectedCurrency = ctx.match[0].split('_')[1];
  const currencyObject = CURRENCY[selectedCurrency as keyof typeof CURRENCY];

  if (!currencyObject) {
    return ctx.reply('Ошибка: выбранная валюта не найдена.')
  }

  await prisma.user.update({
    where: { id: ctx.from.id },
    data: { currency: selectedCurrency as Currency }
  });

  await ctx.deleteMessage();
  await ctx.reply(`Ваша основная валюта изменена на:\n${currencyObject.emoji} ${currencyObject.name} (${currencyObject.symbol})`);
});

bot.action(/edit_transaction_where_id_\d+/, async (ctx) => {
  const transactionId = parseInt(ctx.match[0].split('_')[4], 10);

  const transaction = await prisma.transaction.findFirst({where: {id: transactionId}});
  if (!transaction) {
    return ctx.reply('Ошибка: запись не найдена.')
  }

  // await ctx.deleteMessage();
  const transactionData = (ctx.update.callback_query.message as Message.TextMessage).text.split('\n\n')[1];
  const text = `Что изменить в записи:\n${transactionData}`;

  const buttons = [
    Markup.button.callback('Сумму', `edit_transaction_${transactionId}_field_amount`),
    Markup.button.callback('Комментарий', `edit_transaction_${transactionId}_field_comment`),
    Markup.button.callback('Категорию', `edit_transaction_${transactionId}_field_category`),
  ]

  await ctx.reply(text, Markup.inlineKeyboard(buttons, { columns: 1 }))
})

bot.action(/edit_transaction_.+/, async (ctx) => {
  const data = ctx.match[0];
  const parts = data.split('_');
  const transactionId = parseInt(parts[2], 10);
  const fieldToEdit = parts[4];

  if (fieldToEdit === 'amount') {
    userState.set(ctx.from.id, {status: BotStatus.waitNewTransactionAmount, data: transactionId});
    return ctx.reply('Пожалуйста, отправьте новую сумму для этой записи:');
  }

  if (fieldToEdit === 'comment') {
    userState.set(ctx.from.id, {status: BotStatus.waitNewTransactionComment, data: transactionId});
    return ctx.reply('Пожалуйста, отправьте новый комментарий для этой записи:');
  }

  if (fieldToEdit === 'category') {
    const userCategories = await getUserCategories(prisma, ctx.from.id);

    const categoriesButtons = userCategories.map(category =>
      Markup.button.callback(category.name, `update_transaction_set_category_${category.id}_where_id_${transactionId}`)
    );

    categoriesButtons.push(Markup.button.callback(NO_CATEGORY_NAME, `update_transaction_set_category_${NO_CATEGORY_ID}_where_id_${transactionId}`))

    const messageText = `Выбери новую категорию:`;

    ctx.reply(messageText, Markup.inlineKeyboard(categoriesButtons, { columns: 2 }));
  }
})


bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
