export const typeDefs = `#graphql
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0",
          import: ["@key", "@shareable"])

  enum AppointmentStatus {
    SCHEDULED
    COMPLETED
    CANCELLED
  }

  enum StockCategory {
    MEDICINE
    EQUIPMENT
    OTHER
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
    appointments: [Appointment!] @shareable
    consultations: [Consultation!] @shareable
  }

  type Doctor @key(fields: "id") {
    id: Int!
    specialty: String @shareable
    license_num: String @shareable
    userId: Int! @shareable
    user: User @shareable
    appointments: [Appointment!] @shareable
  }

  type User @key(fields: "id") {
    id: Int!
    name: String! @shareable
    email: String! @shareable
    phone: String @shareable
    role: String! @shareable
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
  }

  type Consultation @key(fields: "id") {
    id: Int!
    patient_id: Int!
    doctor_id: Int!
    date: String!
    symptoms: String
    diagnosis: String
    prescription: String
    observations: String
    weight: Float
    blood_pressure: String
    patient: Patient!
    doctor: Doctor!
  }

  type StockItem @key(fields: "id") {
    id: Int!
    name: String!
    category: StockCategory!
    quantity: Int!
    min_quantity_alert: Int!
    price: Float
    expiry_date: String
    updated_at: String!
    created_at: String!
  }

  type MonthlyStat @shareable {
    month: String!
    count: Int!
  }

  type DashboardStats @shareable {
    total_patients: Int!
    total_consultations: Int!
    appointments_today: Int!
    low_stock_items: Int!
    patients_per_month: [MonthlyStat!]!
    consultations_per_month: [MonthlyStat!]!
    appointments_per_month: [MonthlyStat!]!
  }

  type Query {
    dashboardStats(doctor_id: Int!): DashboardStats! @shareable
    patients: [Patient!]! @shareable
    patient(id: Int!): Patient @shareable
    appointments(doctor_id: Int, date: String): [Appointment!]! @shareable
    appointment(id: Int!): Appointment @shareable
    consultations(patient_id: Int!): [Consultation!]! @shareable
    consultation(id: Int!): Consultation @shareable
    stockItems(category: StockCategory): [StockItem!]! @shareable
    stockItem(id: Int!): StockItem @shareable
    doctorProfile(userId: Int!): Doctor @shareable
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

    updatePatientMedicalRecord(
      id: Int!
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

    updateAppointmentStatus(id: Int!, status: AppointmentStatus!): Appointment!

    createConsultation(
      patient_id: Int!
      doctor_id: Int!
      symptoms: String
      diagnosis: String
      prescription: String
      observations: String
      weight: Float
      blood_pressure: String
    ): Consultation!

    createStockItem(
      name: String!
      category: StockCategory!
      quantity: Int
      min_quantity_alert: Int
      price: Float
      expiry_date: String
    ): StockItem!

    updateStockQuantity(id: Int!, quantity: Int!): StockItem!
  }
`;
