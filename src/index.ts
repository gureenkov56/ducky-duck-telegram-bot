
import { message } from 'telegraf/filters'
import { config } from 'dotenv'
import {Context, Markup, Telegraf} from 'telegraf';
import { PrismaClient } from '@prisma/client'
import { BotStatus } from './enums';
import { prismaCategoryCreateMany, getUserId, getUserCategories} from './utils';


const BOT_TOKEN = process.env.BOT_TOKEN as string


config();

const userState = new Map<number, number>();

const prisma = new PrismaClient()

const bot = new Telegraf(BOT_TOKEN)




const Messages = {
  greeting: '👋 Привет! Чтобы записать расход, просто пришли мне сумму. Например так:\n\n`1050`\n\nЕсли хочешь, можно добавить комментарий. Просто напиши его на следующей строке:\n\n`1050\nБилеты в кино`\n\nЧтобы записать доход, просто поставь плюс перед суммой:\n\n`+5000\nЗарплата`',
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
  userState.set(ctx.from.id, BotStatus.waitCategoriesList);

  return ctx.reply(Messages.youHaveNotCategories, { parse_mode: 'Markdown' })
}


bot.command('start', async (ctx) => {
  console.log('STaRT');
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

  return ctx.reply(categoriesList, Markup.inlineKeyboard(options, { columns: 2 }));
})


bot.on(message('text'), async (ctx) => {
  if (userState.get(ctx.from.id) === BotStatus.waitCategoriesList) {
    await prismaCategoryCreateMany(prisma, ctx.message.text, getUserId(ctx));
    userState.delete(ctx.from.id);
    return ctx.reply(Messages.categoriesAreCreated);
  }

  const { isIncome, amount, comment } = parseMessage(ctx.message.text);

  if (isNaN(amount) || amount <= 0) {
    return ctx.reply('Пожалуйста, введи корректную сумму. Например: `1050` или `+5000`.', { parse_mode: 'Markdown' })
  }

  const transaction = await prisma.transaction.create({
    data: {
      type: isIncome ? 'INCOME' : 'EXPENSE',
      amount,
      comment,
      userId: ctx.message.from.id
    }
  })

  const userCategories = await getUserCategories(prisma, getUserId(ctx));

  if (userCategories.length === 0) {
    await ctx.reply(`Записал расход\n💸 ${transaction.amount}\n${transaction.comment}`)
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

  const messageText = `Записал ${isIncome ? 'доход' : 'расход'} на сумму ${amount}₽${comment ? ` с комментарием: "${comment}"` : ''}.\n\nТеперь выбери категорию для этой транзакции:`;

  return ctx.reply(messageText, Markup.inlineKeyboard(categoriesButtons, { columns: 2 }));
})

// TODO сделать парсер разных update запросов
bot.action(/update_transaction_set_category_.+/, async (ctx) => {
  const data = ctx.match[0]
  // await ctx.answerCbQuery(); // Acknowledges the button press
  console.log('category_ ctx', ctx);
  // await ctx.reply('You pressed Button!');
  const categoryId = parseInt(ctx.match[0].split('_')[4], 10);
  const transactionId = parseInt(ctx.match[0].split('_')[7], 10);


  const transaction = await prisma.transaction.update({where: {id: transactionId}, data: {categoryId: categoryId}})
  const {name: categoryName} = await prisma.category.findUnique({ where: { id: transaction.categoryId }, select: {name: true} })

  ctx.reply(`✍️ Записал\n\n💸 ${transaction.amount}\n${categoryName}\n${transaction.comment}`);
});

bot.action(/wantToCreateCategories_(yes|no)/, async (ctx) => {
  const data = ctx.match[0]
  const yesOrNot = data.split('_')[1];

  if (yesOrNot === 'yes') {
    createCategories(ctx)
  } else {
    await ctx.deleteMessage();
    return ctx.reply(`Окей! Ты можешь добавить категории в любой момент, отправив команду /categories`, { parse_mode: 'Markdown' })
  }
})

bot.action('addNewCategories', createCategories)

bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
