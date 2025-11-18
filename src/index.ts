
import { message } from 'telegraf/filters'
import { config } from 'dotenv'
import { Telegraf } from 'telegraf';
import { PrismaClient } from '@prisma/client'


const BOT_TOKEN = process.env.BOT_TOKEN as string


config();

const prisma = new PrismaClient()

const bot = new Telegraf(BOT_TOKEN)

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

  return ctx.reply('Ты уже зарегистрирован! Просто пришли мне сумму, чтобы записать расход или доход.', { parse_mode: 'Markdown' })
})

bot.command('categories', async (ctx) => {
  const categories = await prisma.categories.findMany({
    where: {
      userId: ctx.message.from.id
    }
  })

  console.log('categories', categories);

  if (!categories.length) { 
    return ctx.reply('У тебя пока нет категорий. Давай добавим их! Просто пришли мне их список, по одному на строку.')
  }

  // if (!isUserExist) {
  //   await prisma.user.create({
  //     data: {
  //       id: ctx.message.from.id
  //     }
  //   })

  //   return ctx.reply(Messages.greeting, { parse_mode: 'Markdown' })
  // }

  // return ctx.reply('Ты уже зарегистрирован! Просто пришли мне сумму, чтобы записать расход или доход.', { parse_mode: 'Markdown' })
})

bot.on(message('text'), async (ctx) => {
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