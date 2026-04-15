import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const checkRole = (context, role) => {
    if (!context.userId) throw new Error("Unauthenticated. Please login.");
    if (context.userRole !== role && context.userRole !== 'ADMIN') {
        throw new Error(`Unauthorized. Required role: ${role}`);
    }
};

export const resolvers = {
    Query: {
        // Appointments
        appointments: async (_, __, context) => {
            checkRole(context, 'RECEPTIONIST');
            return await prisma.rendezvous.findMany({
                include: {
                    patient: true,
                    doctor: { include: { user: true } },
                    createdBy: { include: { user: true } }
                },
                orderBy: { appointment_date: 'asc' },
            });
        },
        appointment: async (_, { id }, context) => {
            checkRole(context, 'RECEPTIONIST');
            return await prisma.rendezvous.findUnique({
                where: { id },
                include: {
                    patient: true,
                    doctor: { include: { user: true } },
                    createdBy: { include: { user: true } }
                }
            });
        },
        receptionStats: async (_, __, context) => {
            checkRole(context, 'RECEPTIONIST');

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const [newPatients, todayApps, waitingRoom] = await Promise.all([
                prisma.patient.count({
                    where: {
                        created_at: {
                            gte: today,
                            lt: tomorrow,
                        },
                    },
                }),
                prisma.rendezvous.count({
                    where: {
                        appointment_date: {
                            gte: today,
                            lt: tomorrow,
                        },
                    },
                }),
                prisma.rendezvous.count({
                    where: {
                        appointment_date: {
                            gte: today,
                            lt: tomorrow,
                        },
                        status: 'SCHEDULED', // Assuming SCHEDULED today means they are in the queue
                    },
                }),
            ]);

            return {
                newPatientsCount: newPatients,
                pendingCallsCount: 0, // LOGIC TBD - e.g. appointments without confirmation
                todayAppointmentsCount: todayApps,
                waitingRoomCount: waitingRoom,
            };
        },
    },

    Mutation: {
        // Patients
        createPatient: async (_, args, context) => {
            checkRole(context, 'RECEPTIONIST');
            if (args.date_of_birth) args.date_of_birth = new Date(args.date_of_birth);
            return await prisma.patient.create({ data: args });
        },
        updatePatient: async (_, { id, ...data }, context) => {
            checkRole(context, 'RECEPTIONIST');
            if (data.date_of_birth) data.date_of_birth = new Date(data.date_of_birth);
            return await prisma.patient.update({ where: { id }, data });
        },

        // Appointments
        createAppointment: async (_, args, context) => {
            checkRole(context, 'RECEPTIONIST');
            args.appointment_date = new Date(args.appointment_date);
            return await prisma.rendezvous.create({
                data: { ...args, status: 'SCHEDULED' },
                include: { patient: true, doctor: true, createdBy: true }
            });
        },
        updateAppointment: async (_, { id, ...data }, context) => {
            checkRole(context, 'RECEPTIONIST');
            if (data.appointment_date) data.appointment_date = new Date(data.appointment_date);
            return await prisma.rendezvous.update({
                where: { id },
                data,
                include: { patient: true, doctor: true, createdBy: true }
            });
        },
        deleteAppointment: async (_, { id }, context) => {
            checkRole(context, 'RECEPTIONIST');
            try {
                await prisma.rendezvous.delete({ where: { id } });
                return true;
            } catch (error) {
                console.error("Error deleting appointment:", error);
                return false;
            }
        },
        cancelAppointment: async (_, { id }, context) => {
            checkRole(context, 'RECEPTIONIST');
            return await prisma.rendezvous.update({
                where: { id },
                data: { status: 'CANCELLED' },
                include: { patient: true, doctor: true, createdBy: true }
            });
        },
        confirmAppointment: async (_, { id }, context) => {
            checkRole(context, 'RECEPTIONIST');
            return await prisma.rendezvous.update({
                where: { id },
                data: { status: 'COMPLETED' },
                include: { patient: true, doctor: true, createdBy: true }
            });
        }
    },

    // Custom field resolvers mappings for dates
    Appointment: {
        appointment_date: (parent) => parent.appointment_date.toISOString(),
    },
    Patient: {
        date_of_birth: (parent) => parent.date_of_birth ? parent.date_of_birth.toISOString() : null,
        created_at: (parent) => parent.created_at.toISOString(),
    }
};
