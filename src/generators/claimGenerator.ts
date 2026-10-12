import { faker } from "@faker-js/faker";
import {
  STATUS,
  TYPES,
  POLICIES,
  INSURERS,
  STATES,
  VEHICLES,
} from "./constants.js";
export function generateClaim(id: number) {
  const [state, city] = faker.helpers.arrayElement(STATES);
  const [vehicleMake, vehicleModel] = faker.helpers.arrayElement(VEHICLES);
  const incident = faker.date.recent({ days: 365 });
  const reported = faker.date.between({ from: incident, to: new Date() });
  const amt = faker.number.float({ min: 500, max: 25000, fractionDigits: 2 });
  return {
    claimId: `CLM-${String(id).padStart(8, "0")}`,
    policyNumber: `POL-${faker.number.int({ min: 10000000, max: 99999999 })}`,
    customerName: faker.person.fullName(),
    email: faker.internet.email(),
    policyType: faker.helpers.arrayElement(POLICIES),
    insurer: faker.helpers.arrayElement(INSURERS),
    claimStatus: faker.helpers.arrayElement(STATUS),
    claimType: faker.helpers.arrayElement(TYPES),
    incidentDate: incident.toISOString(),
    reportedDate: reported.toISOString(),
    claimAmount: amt,
    approvedAmount: faker.number.float({ min: 0, max: amt, fractionDigits: 2 }),
    adjuster: faker.person.fullName(),
    state,
    city,
    vehicleMake,
    vehicleModel,
    vehicleYear: faker.number.int({ min: 2015, max: 2025 }),
    createdAt: reported.toISOString(),
    updatedAt: reported.toISOString(),
  };
}
