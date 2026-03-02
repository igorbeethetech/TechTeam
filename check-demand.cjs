const { PrismaClient } = require("./node_modules/.prisma/client/default.js").PrismaClient || require("@prisma/client").PrismaClient;
const db = new PrismaClient();
(async () => {
  const demand = await db.demand.findFirst({ where: { title: { contains: "fibonacci" } }, select: { id: true, stage: true, mergeStatus: true, mergeAttempts: true, branchName: true, prUrl: true } });
  console.log("Demand:", JSON.stringify(demand, null, 2));
  const settings = await db.tenantSettings.findFirst({ select: { githubToken: true } });
  if (settings && settings.githubToken) {
    const t = settings.githubToken;
    console.log("Token length:", t.length);
    console.log("Token prefix:", t.substring(0, 10));
    console.log("Has newline:", t.includes("\n") || t.includes("\r"));
    console.log("Hex of full token:", Buffer.from(t).toString("hex"));
  }
  await db.$disconnect();
})();
