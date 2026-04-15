import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const patientsCount = await prisma.patient.count();
    console.log('Patients count:', patientsCount);
    const patients = await prisma.patient.findMany({
        take: 5,
        include: { appointments: true, consultations: true }
    });
    console.log('Sample patients:', JSON.stringify(patients, null, 2));
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
