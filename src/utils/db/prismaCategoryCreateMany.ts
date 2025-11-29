import { PrismaClient, PrismaPromise } from "@prisma/client";

export function prismaCategoryCreateMany(prisma: PrismaClient, text: string, userId: number): PrismaPromise<any> {
  const categories = text.split('\n').map((cat) => cat.trim()).filter((cat) => cat.length > 0);

  const data = categories.map((category) => ({name: category,userId}))

  return prisma.category.createMany({data})
}
