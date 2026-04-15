import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

console.log('[DEBUG-RESOLVERS] DATABASE_URL defined:', !!process.env.DATABASE_URL);
if (!process.env.DATABASE_URL) {
    console.log('[DEBUG-RESOLVERS] CWD:', process.cwd());
}
const prisma = new PrismaClient();

const checkRole = (context, role) => {
    if (!context.userId) throw new Error("Unauthenticated. Please login.");
    if (context.userRole !== role && context.userRole !== 'ADMIN') {
        throw new Error(`Unauthorized. Required role: ${role}`);
    }
};

export const resolvers = {
    Query: {
        // Dashboard Stats
        dashboardStats: async (_, { doctor_id }, context) => {
            checkRole(context, 'DOCTOR');
            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            startOfDay.setUTCHours(0, 0, 0, 0);
            const endOfDay = new Date(startOfDay);
            endOfDay.setUTCHours(23, 59, 59, 999);

            const startOfYear = new Date(now.getFullYear(), 0, 1);

            const total_patients = await prisma.patient.count();
            const total_consultations = await prisma.consultation.count({ where: { doctor_id } });
            const appointments_today = await prisma.rendezvous.count({
                where: { doctor_id, appointment_date: { gte: startOfDay, lte: endOfDay } }
            });

            const allStock = await prisma.stockItem.findMany();
            const low_stock_items = allStock.filter(item => item.quantity <= item.min_quantity_alert).length;

            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const initializeMonths = () => monthNames.map(m => ({ month: m, count: 0 }));

            const patientsThisYear = await prisma.patient.findMany({
                where: { created_at: { gte: startOfYear } },
                select: { created_at: true }
            });
            const patients_per_month = initializeMonths();
            patientsThisYear.forEach(p => {
                patients_per_month[p.created_at.getMonth()].count++;
            });

            const consultationsThisYear = await prisma.consultation.findMany({
                where: { doctor_id, date: { gte: startOfYear } },
                select: { date: true }
            });
            const consultations_per_month = initializeMonths();
            consultationsThisYear.forEach(c => {
                consultations_per_month[c.date.getMonth()].count++;
            });

            const appointmentsThisYear = await prisma.rendezvous.findMany({
                where: { doctor_id, appointment_date: { gte: startOfYear } },
                select: { appointment_date: true }
            });
            const appointments_per_month = initializeMonths();
            appointmentsThisYear.forEach(a => {
                appointments_per_month[a.appointment_date.getMonth()].count++;
            });

            return {
                total_patients,
                total_consultations,
                appointments_today,
                low_stock_items,
                patients_per_month,
                consultations_per_month,
                appointments_per_month
            };
        },

        // Patients
        patients: async (_, __, context) => {
            checkRole(context, 'DOCTOR');
            return await prisma.patient.findMany({ include: { appointments: true, consultations: true } });
        },
        patient: async (_, { id }, context) => {
            checkRole(context, 'DOCTOR');
            return await prisma.patient.findUnique({ where: { id }, include: { appointments: true, consultations: true } });
        },

        // Appointments
        appointments: async (_, { doctor_id, date }, context) => {
            checkRole(context, 'DOCTOR');
            const where = {};
            if (doctor_id) where.doctor_id = doctor_id;
            if (date) {
                const startOfDay = new Date(date);
                startOfDay.setUTCHours(0, 0, 0, 0);
                const endOfDay = new Date(date);
                endOfDay.setUTCHours(23, 59, 59, 999);
                where.appointment_date = { gte: startOfDay, lte: endOfDay };
            }
            return await prisma.rendezvous.findMany({
                where,
                include: { patient: true, doctor: { include: { user: true } } },
                orderBy: { appointment_date: 'asc' },
            });
        },
        appointment: async (_, { id }, context) => {
            checkRole(context, 'DOCTOR');
            return await prisma.rendezvous.findUnique({
                where: { id },
                include: { patient: true, doctor: { include: { user: true } } }
            });
        },

        // Consultations
        consultations: async (_, { patient_id }, context) => {
            checkRole(context, 'DOCTOR');
            return await prisma.consultation.findMany({
                where: { patient_id },
                include: { doctor: { include: { user: true } } },
                orderBy: { date: 'desc' }
            });
        },
        consultation: async (_, { id }, context) => {
            checkRole(context, 'DOCTOR');
            return await prisma.consultation.findUnique({
                where: { id },
                include: { patient: true, doctor: { include: { user: true } } }
            });
        },

        // Stock
        stockItems: async (_, { category }, context) => {
            checkRole(context, 'DOCTOR');
            const where = category ? { category } : {};
            return await prisma.stockItem.findMany({ where, orderBy: { name: 'asc' } });
        },
        stockItem: async (_, { id }, context) => {
            checkRole(context, 'DOCTOR');
            return await prisma.stockItem.findUnique({ where: { id } });
        },

        // Doctor profile access
        doctorProfile: async (_, { userId }, context) => {
            checkRole(context, 'DOCTOR');
            return await prisma.doctor.findUnique({
                where: { userId },
                include: { user: true }
            });
        }
    },

    Mutation: {
        // Patients
        createPatient: async (_, args, context) => {
            checkRole(context, 'DOCTOR');
            if (args.date_of_birth) args.date_of_birth = new Date(args.date_of_birth);
            return await prisma.patient.create({ data: args });
        },
        updatePatientMedicalRecord: async (_, { id, ...data }, context) => {
            checkRole(context, 'DOCTOR');
            return await prisma.patient.update({ where: { id }, data });
        },

        // Appointments
        createAppointment: async (_, args, context) => {
            checkRole(context, 'DOCTOR');
            args.appointment_date = new Date(args.appointment_date);
            return await prisma.rendezvous.create({
                data: { ...args, status: 'SCHEDULED' },
                include: { patient: true, doctor: true }
            });
        },
        updateAppointmentStatus: async (_, { id, status }, context) => {
            checkRole(context, 'DOCTOR');
            return await prisma.rendezvous.update({
                where: { id },
                data: { status },
                include: { patient: true, doctor: true }
            });
        },

        // Consultations
        createConsultation: async (_, args, context) => {
            checkRole(context, 'DOCTOR');
            return await prisma.consultation.create({
                data: args,
                include: { patient: true, doctor: true }
            });
        },

        // Stock
        createStockItem: async (_, args, context) => {
            checkRole(context, 'DOCTOR');
            if (args.expiry_date) args.expiry_date = new Date(args.expiry_date);
            return await prisma.stockItem.create({ data: args });
        },
        updateStockQuantity: async (_, { id, quantity }, context) => {
            checkRole(context, 'DOCTOR');
            return await prisma.stockItem.update({
                where: { id },
                data: { quantity }
            });
        }
    },

    // Custom field resolvers mapping for dates and enums if needed
    Appointment: {
        appointment_date: (parent) => parent.appointment_date instanceof Date ? parent.appointment_date.toISOString() : parent.appointment_date,
    },
    Patient: {
        date_of_birth: (parent) => (parent.date_of_birth && parent.date_of_birth instanceof Date) ? parent.date_of_birth.toISOString() : parent.date_of_birth,
        created_at: (parent) => parent.created_at instanceof Date ? parent.created_at.toISOString() : parent.created_at,
        __resolveReference: async (reference) => {
            return await prisma.patient.findUnique({ where: { id: reference.id }, include: { appointments: true, consultations: true } });
        }
    },
    Doctor: {
        __resolveReference: async (reference) => {
            return await prisma.doctor.findUnique({ where: { id: reference.id }, include: { user: true } });
        }
    },
    User: {
        __resolveReference: async (reference) => {
            return await prisma.user.findUnique({ where: { id: reference.id } });
        }
    },
    Consultation: {
        date: (parent) => parent.date instanceof Date ? parent.date.toISOString() : parent.date,
    },
    StockItem: {
        expiry_date: (parent) => (parent.expiry_date && parent.expiry_date instanceof Date) ? parent.expiry_date.toISOString() : parent.expiry_date,
        created_at: (parent) => parent.created_at instanceof Date ? parent.created_at.toISOString() : parent.created_at,
        updated_at: (parent) => parent.updated_at instanceof Date ? parent.updated_at.toISOString() : parent.updated_at,
    }
};
