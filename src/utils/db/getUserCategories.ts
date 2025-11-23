import { PrismaClient, PrismaPromise } from "@prisma/client";

export function getUserCategories(prisma: PrismaClient, userId: number): PrismaPromise<any> {
    return prisma.categories.findMany({where: {userId}})
}