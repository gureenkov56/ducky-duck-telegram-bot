import { PrismaClient, PrismaPromise } from "@prisma/client";

export function prismaCategoryCreateOne(prisma: PrismaClient, categoryName: string, userId: number): PrismaPromise<any> {
  return prisma.category.create({data: {name: categoryName, userId}})
}
