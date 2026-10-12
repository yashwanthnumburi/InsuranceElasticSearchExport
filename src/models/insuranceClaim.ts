export interface InsuranceClaim {
  claimId: string;
  policyNumber: string;
  customerName: string;
  email: string;
  policyType: string;
  insurer: string;
  claimStatus: string;
  claimType: string;
  incidentDate: string;
  reportedDate: string;
  claimAmount: number;
  approvedAmount: number;
  adjuster: string;
  state: string;
  city: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  createdAt: string;
  updatedAt: string;
}
