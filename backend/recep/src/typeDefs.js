export const typeDefs = `#graphql
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0",
          import: ["@key", "@shareable"])

  enum AppointmentStatus {
    SCHEDULED
    COMPLETED
    CANCELLED
  }

  type Patient @key(fields: "id") {
    id: Int!
    first_name: String! @shareable
    last_name: String! @shareable
    cin: String! @shareable
    phone: String! @shareable
    email: String! @shareable
    date_of_birth: String @shareable
    gender: String @shareable
    blood_group: String @shareable
    current_medication: String @shareable
    allergies: String @shareable
    medical_history: String @shareable
    created_at: String @shareable
  }

  type Doctor @key(fields: "id") {
    id: Int!
    specialty: String @shareable
    license_num: String @shareable
    userId: Int! @shareable
    user: User @shareable
  }

  type User @key(fields: "id") {
    id: Int!
    name: String! @shareable
    email: String! @shareable
    phone: String @shareable
    role: String! @shareable
  }

  type Receptionist @key(fields: "id") {
    id: Int!
    employee_id: String
    userId: Int!
    user: User
  }

  type Appointment @key(fields: "id") {
    id: Int!
    patient_id: Int! @shareable
    doctor_id: Int! @shareable
    created_by_id: Int @shareable
    appointment_date: String! @shareable
    start_time: String! @shareable
    end_time: String! @shareable
    status: AppointmentStatus! @shareable
    notes: String @shareable
    patient: Patient! @shareable
    doctor: Doctor! @shareable
    createdBy: Receptionist
  }

  type ReceptionStats {
    newPatientsCount: Int!
    pendingCallsCount: Int!
    todayAppointmentsCount: Int!
    waitingRoomCount: Int!
  }

  type Query {
    appointments(doctor_id: Int, date: String): [Appointment!]! @shareable
    appointment(id: Int!): Appointment @shareable
    receptionStats: ReceptionStats! @shareable
  }

  type Mutation {
    createPatient(
      first_name: String!
      last_name: String!
      cin: String!
      phone: String!
      email: String!
      date_of_birth: String
      gender: String
      blood_group: String
      current_medication: String
      allergies: String
      medical_history: String
    ): Patient! @shareable

    updatePatient(
      id: Int!
      first_name: String
      last_name: String
      cin: String
      phone: String
      email: String
      date_of_birth: String
      gender: String
      blood_group: String
      current_medication: String
      allergies: String
      medical_history: String
    ): Patient!

    createAppointment(
      patient_id: Int!
      doctor_id: Int!
      created_by_id: Int
      appointment_date: String!
      start_time: String!
      end_time: String!
      notes: String
    ): Appointment! @shareable

    updateAppointment(
      id: Int!
      doctor_id: Int
      appointment_date: String
      start_time: String
      end_time: String
      notes: String
    ): Appointment!

    deleteAppointment(id: Int!): Boolean!

    cancelAppointment(id: Int!): Appointment!
    
    confirmAppointment(id: Int!): Appointment!
  }
`;
