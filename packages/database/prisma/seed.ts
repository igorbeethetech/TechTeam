import { prisma } from "../src/client.js"

async function seed() {
  console.log("Seeding database...")

  // Create default tenant: Bee The Tech
  const org = await prisma.organization.upsert({
    where: { slug: "bee-the-tech" },
    update: {},
    create: {
      id: "bee-the-tech-org",
      name: "Bee The Tech",
      slug: "bee-the-tech",
    },
  })

  console.log(`Seed complete: "${org.name}" tenant created (id: ${org.id})`)
}

seed()
  .catch((error) => {
    console.error("Seed failed:", error)
    process.exit(1)
  })
  .finally(() => process.exit())
