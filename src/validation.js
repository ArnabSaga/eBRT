const { z } = require('zod');

// Driving Cycle validation schema
const DrivingCycle = z.object({
    Cycle_Type: z.number().int().min(0).max(6),
    ECO_Options: z.number().int().optional(),
    ECO_Threshold: z.number().optional().nullable(),
    Time_s: z.array(z.number()).optional().nullable(),
    Speed_mps: z.array(z.number()).optional().nullable(),
    Altitude_m: z.union([z.number(), z.array(z.number())]).optional().nullable(),
});

// Scenario data validation schema
const ScenarioData = z.object({
    VehicleLength: z.number().optional(),
    Return_Trip_Distance_km: z.number().optional(),
    Number_of_Buses_in_Fleet: z.number().optional(),
    Average_Velocity_of_Route_kph: z.number().optional(),
});

// Energy Storage validation schema
const EnergyStorage = z.object({
    MaximumSoC_pct: z.number().optional(),
    Initial_Battery_SoC_pct: z.number().optional(),
    // Add other energy storage fields as needed
});

// Charger data validation schema
const ChargerData = z.object({
    // Add charger fields as needed - these will be dynamically validated
}).passthrough();

// Motor data validation schema
const MotorData = z.object({
    // Add motor fields as needed
}).passthrough();

// Battery data validation schema
const BatteryData = z.object({
    // Add battery fields as needed
}).passthrough();

// Main input schema
const InputDataSchema = z.object({
    Driving_Cycle: DrivingCycle,
    Scenario_data: ScenarioData.optional(),
    Energy_Storage_data: EnergyStorage.optional(),
    Charger_data: ChargerData.optional(),
    Motor_data: MotorData.optional(),
    Battery_data: BatteryData.optional(),
    // Allow additional fields for flexibility
}).passthrough();

// Request schema
const RequestSchema = z.object({
    userId: z.string().nullable().optional(),
    inputData: InputDataSchema,
});

// Validator response schema
const ValidatorResponseSchema = z.object({
    version: z.string(),
    computed_at: z.string(),
    timeseries: z.object({
        time_s: z.array(z.number()),
        speed_ms: z.array(z.number()).optional(),
        rpm: z.array(z.number()).optional(),
        fuel_lph: z.array(z.number()).optional(),
        load_pct: z.array(z.number()).optional(),
        torque_pct: z.array(z.number()).optional(),
    }),
    metrics: z.object({
        fuel_rate_lph: z.number().optional(),
        fuel_pct: z.number().optional(),
        load_pct: z.number().optional(),
        torque_pct: z.number().optional(),
        dtc_count: z.number().optional(),
        coolant_c: z.number().optional(),
        intake_c: z.number().optional(),
        ambient_c: z.number().optional(),
        distance_km: z.number().optional(),
        speed_now: z.number().optional(),
        rpm_now: z.number().optional(),
    }),
});

module.exports = {
    RequestSchema,
    ValidatorResponseSchema,
    InputDataSchema,
    DrivingCycle,
    ScenarioData,
    EnergyStorage,
    ChargerData,
    MotorData,
    BatteryData,
};
