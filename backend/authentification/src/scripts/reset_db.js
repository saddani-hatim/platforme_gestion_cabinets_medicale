import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning database...');

  // Delete in order to satisfy FK constraints
  // Note: Model names in Prisma are usually camelCase (e.g. rendezvous, consultation)
  // but let's check exact names from schema.

  await prisma.rendezvous.deleteMany({});
  await prisma.consultation.deleteMany({});
  await prisma.doctor.deleteMany({});
  await prisma.receptionist.deleteMany({});
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('Database cleaned.');

  console.log('Adding doctor user...');

  const hashedPassword = await bcrypt.hash('password123', 10);

  const doctorUser = await prisma.user.create({
    data: {
      name: 'Dr. Saddani Hatim',
      email: 'doctor@example.com',
      phone: '0600000000',
      password: hashedPassword,
      role: 'DOCTOR',
      is_active: true,
      doctorProfile: {
        create: {
          specialty: 'Cardiology',
          license_num: 'LIC-12345',
        }
      }
    }
  });

  console.log(`Doctor user created with ID: ${doctorUser.id}`);

  console.log('\n--- Listing all users ---');
  const allUsers = await prisma.user.findMany({
    include: {
      doctorProfile: true,
      receptionProfile: true
    }
  });

  console.table(allUsers.map(user => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    hasDoctorProfile: !!user.doctorProfile,
    specialty: user.doctorProfile?.specialty || 'N/A'
  })));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
