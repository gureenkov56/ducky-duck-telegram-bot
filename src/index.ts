
import { message } from 'telegraf/filters'
import { config } from 'dotenv'
import { Telegraf } from 'telegraf';
import { PrismaClient } from '@prisma/client'
import { BotStatus } from './enums';
import { createCategories, getUserId, getUserCategories} from './utils';


const BOT_TOKEN = process.env.BOT_TOKEN as string


config();

const prisma = new PrismaClient()

const bot = new Telegraf(BOT_TOKEN)

let botStatus: BotStatus | null = null;

const Messages = {
  greeting: '👋 Привет! Чтобы записать расход, просто пришли мне сумму. Например так:\n\n`1050`\n\nЕсли хочешь, можно добавить комментарий. Просто напиши его на следующей строке:\n\n`1050\nБилеты в кино`\n\nЧтобы записать доход, просто поставь плюс перед суммой:\n\n`+5000\nЗарплата`',
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

  return ctx.reply('Ты уже зарегистрирован! Просто пришли мне сумму, чтобы записать расход или доход.' + TEST, { parse_mode: 'Markdown' })
})

bot.command('categories', async (ctx) => {
  const categories = await getUserCategories(prisma, getUserId(ctx));

  console.log('categories', categories);

  if (!categories.length) { 
    botStatus = BotStatus.waitCategoriesList;

    return ctx.reply('У тебя пока нет категорий. Давай добавим их! Просто пришли мне их список, по одному на строку. Например:\n\n🍕 Еда\n🚗 Транспорт\n🎉 Развлечения\n\nPS: Рекомендую поставить смайлик перед каждой категорией, чтобы было веселее :)', { parse_mode: 'Markdown' })
  }
})


bot.on(message('text'), async (ctx) => {
  if (botStatus === BotStatus.waitCategoriesList) {
    console.log('🚀 Adding categories...');
    await createCategories(prisma, ctx.message.text, getUserId(ctx));
    console.log(' ✅ Categories added.');
    botStatus = null;
    return ctx.reply('Категории успешно добавлены! Теперь ты можешь записывать свои расходы и доходы.');
  }

  const { isIncome, amount, comment } = parseMessage(ctx.message.text);

  if (isNaN(amount) || amount <= 0) {
    return ctx.reply('Пожалуйста, введи корректную сумму. Например: `1050` или `+5000`.', { parse_mode: 'Markdown' })
  }

  const createdtransactions = await prisma.transactions.create({
    data: {
      type: isIncome ? 'INCOME' : 'EXPENSE',
      amount,
      comment,
      userId: ctx.message.from.id
    }
  })

  console.log('createdtransactions', createdtransactions);
  return ctx.reply(`Записал ${isIncome ? 'доход' : 'расход'} на сумму ${amount}₽${comment ? ` с комментарием: "${comment}"` : ''}.`)
})


bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))