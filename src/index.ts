
import { message } from 'telegraf/filters'
import { config } from 'dotenv'
import { Markup, session, Telegraf } from 'telegraf';
import { PrismaClient } from '@prisma/client'
import { BotStatus } from './enums';
import { createCategories, getUserId, getUserCategories} from './utils';


const BOT_TOKEN = process.env.BOT_TOKEN as string


config();

const prisma = new PrismaClient()

const bot = new Telegraf(BOT_TOKEN)

bot.use(session())

let botStatus: BotStatus | null = null;

const Messages = {
  greeting: '👋 Привет! Чтобы записать расход, просто пришли мне сумму. Например так:\n\n`1050`\n\nЕсли хочешь, можно добавить комментарий. Просто напиши его на следующей строке:\n\n`1050\nБилеты в кино`\n\nЧтобы записать доход, просто поставь плюс перед суммой:\n\n`+5000\nЗарплата`',
  youAreRegisteredAlready: 'Ты уже зарегистрирован! Просто пришли мне сумму, чтобы записать расход или доход',
  categoriesAreCreated: 'Категории успешно добавлены! Теперь ты можешь записывать свои расходы и доходы',
  youHaveNotCategories: 'У тебя пока нет категорий. Давай добавим их! Просто пришли мне их список, по одному на строку. Например:\n\n🍕 Еда\n🚗 Транспорт\n🎉 Развлечения\n\nPS: Рекомендую поставить смайлик перед каждой категорией, чтобы было веселее :)'
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

  console.log('categories', categories);

  if (!categories.length) {
    botStatus = BotStatus.waitCategoriesList;

    return ctx.reply(Messages.youHaveNotCategories, { parse_mode: 'Markdown' })
  }
})


bot.on(message('text'), async (ctx) => {
  if (botStatus === BotStatus.waitCategoriesList) {
    await createCategories(prisma, ctx.message.text, getUserId(ctx));
    botStatus = null;
    return ctx.reply(Messages.categoriesAreCreated);
  }

  const { isIncome, amount, comment } = parseMessage(ctx.message.text);

  if (isNaN(amount) || amount <= 0) {
    return ctx.reply('Пожалуйста, введи корректную сумму. Например: `1050` или `+5000`.', { parse_mode: 'Markdown' })
  }

  const {id: transactionId} = await prisma.transactions.create({
    data: {
      type: isIncome ? 'INCOME' : 'EXPENSE',
      amount,
      comment,
      userId: ctx.message.from.id
    }
  })

  ctx.session.transactionId = transactionId;


  const userCategories = await getUserCategories(prisma, getUserId(ctx));

  if (userCategories.length === 0) {
    return ctx.reply('У тебя пока нет категорий. Пожалуйста, добавь категории с помощью команды /categories перед записью транзакций.');
  }

  const categoriesButtons = userCategories.map(category =>
    Markup.button.callback(category.name, `category_${category.id}`)
  );

  categoriesButtons.push(Markup.button.callback('🌚 Без категории', `category_0`));

  const messageText = `Записал ${isIncome ? 'доход' : 'расход'} на сумму ${amount}₽${comment ? ` с комментарием: "${comment}"` : ''}.\n\nТеперь выбери категорию для этой транзакции:`;

  return ctx.reply(messageText, Markup.inlineKeyboard(categoriesButtons, { columns: 1 }));

})

bot.action(/category_\d+/, async (ctx) => {
  // await ctx.answerCbQuery(); // Acknowledges the button press
  console.log('category_ ctx', ctx);
  await ctx.reply('You pressed Button!');
  const categoryId = parseInt(ctx.match[0].split('_')[1], 10);
  return ctx.answerCbQuery(`Oh, ${ctx.match[0]}! Great choice`)

  ctx.reply('You pressed Button 1!');
});




bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
