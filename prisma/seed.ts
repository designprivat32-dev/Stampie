import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Development seed: one organisation, one user, two locations, a handful of issued passes
 * so the publish dialog has a realistic "affected cards" number.
 */
async function main() {
  const org = await prisma.organization.upsert({
    where: { id: 'cseedorg00000000000000001' },
    update: {},
    create: { id: 'cseedorg00000000000000001', name: 'Nordstadt Betriebe GmbH' },
  })

  const user = await prisma.user.upsert({
    where: { email: 'demo@stemply.de' },
    update: {},
    create: { email: 'demo@stemply.de', name: 'Demo Nutzer' },
  })

  await prisma.membership.upsert({
    where: { userId_orgId: { userId: user.id, orgId: org.id } },
    update: {},
    create: { userId: user.id, orgId: org.id, role: 'OWNER' },
  })

  const cafe = await prisma.location.upsert({
    where: { id: 'cseedlocationcafe00000001' },
    update: {},
    create: {
      id: 'cseedlocationcafe00000001',
      orgId: org.id,
      name: 'Café Nord',
      street: 'Hauptstraße 12',
      postalCode: '20095',
      city: 'Hamburg',
      phone: '+49 40 1234567',
      website: 'https://cafe-nord.example',
      email: 'hallo@cafe-nord.example',
      imprintUrl: 'https://cafe-nord.example/impressum',
      privacyUrl: 'https://cafe-nord.example/datenschutz',
      latitude: 53.550341,
      longitude: 10.000654,
      openingHours: [
        { weekday: 1, opens: '07:30', closes: '18:00' },
        { weekday: 2, opens: '07:30', closes: '18:00' },
        { weekday: 3, opens: '07:30', closes: '18:00' },
        { weekday: 4, opens: '07:30', closes: '18:00' },
        { weekday: 5, opens: '07:30', closes: '19:00' },
        { weekday: 6, opens: '09:00', closes: '17:00' },
      ],
    },
  })

  await prisma.location.upsert({
    where: { id: 'cseedlocationbarber000001' },
    update: {},
    create: {
      id: 'cseedlocationbarber000001',
      orgId: org.id,
      name: 'Barbier Altona',
      street: 'Große Bergstraße 4',
      postalCode: '22767',
      city: 'Hamburg',
      phone: '+49 40 7654321',
      website: 'https://barbier-altona.example',
      imprintUrl: 'https://barbier-altona.example/impressum',
      privacyUrl: 'https://barbier-altona.example/datenschutz',
      latitude: 53.549,
      longitude: 9.9357,
      openingHours: [
        { weekday: 2, opens: '10:00', closes: '19:00' },
        { weekday: 3, opens: '10:00', closes: '19:00' },
        { weekday: 4, opens: '10:00', closes: '20:00' },
        { weekday: 5, opens: '10:00', closes: '20:00' },
        { weekday: 6, opens: '09:00', closes: '16:00' },
      ],
    },
  })

  // An agency account that sees every card but may not stamp, next to the shop owner.
  const agencyUser = await prisma.user.upsert({
    where: { email: 'agentur@stemply.de' },
    update: {},
    create: { email: 'agentur@stemply.de', name: 'Agentur Team' },
  })
  await prisma.membership.upsert({
    where: { userId_orgId: { userId: agencyUser.id, orgId: org.id } },
    update: { role: 'AGENCY' },
    create: { userId: agencyUser.id, orgId: org.id, role: 'AGENCY' },
  })

  const card = await prisma.card.upsert({
    where: { id: 'ccardcafenord000000000001' },
    update: {},
    create: {
      id: 'ccardcafenord000000000001',
      name: 'Kaffeekarte Café Nord',
      orgId: org.id,
      locationId: cafe.id,
      createdBy: user.id,
      designs: {
        create: {
          status: 'DRAFT',
          programName: 'Kaffeekarte',
          rewardText: 'Jeder 10. Kaffee gratis',
          backgroundColor: '#3b2418',
          foregroundColor: '#fdf6ec',
          labelColor: '#d7b899',
          stampIcon: 'coffee',
          stampLabel: 'Kaffee',
        },
      },
    },
  })

  // Earlier seeds fabricated 137 issued passes so the publish dialog had a realistic
  // "affected cards" number. That was the wrong trade: the overview then reports cards in
  // circulation for a programme nobody ever handed out, which makes every number on the
  // page untrustworthy. A count of zero is correct and says so.
  await prisma.issuedPass.deleteMany({ where: { serial: { startsWith: 'SEED-' } } })

  // eslint-disable-next-line no-console
  console.info('Seed complete. Open /dashboard/karten')
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
