import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import Lookup from '../models/Lookup.js';
const L = { entityType: ['Individual', 'Proprietorship', 'Partnership', 'LLP', 'Private Limited', 'Trust/Society', 'SHG/FPO', 'Cooperative'],
  businessStage: ['Idea', 'New', 'Existing', 'Growth'], promoterCategory: ['General', 'Women', 'SC', 'ST', 'Minority', 'Artisan', 'Farmer/FPO', 'Startup Founder'],
  fundingPurpose: ['Grant', 'Subsidy', 'Loan', 'Working Capital', 'Capex', 'Export', 'Procurement', 'Certification', 'Innovation'],
  sector: ['General', 'Manufacturing', 'Services', 'Technology', 'Food Processing', 'Agri', 'Textile', 'Pharma/MedTech', 'Electronics', 'Export'], yesNo: ['Yes', 'No'],
  state: ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu','Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry'] };
await connectDB();
for (const [key, values] of Object.entries(L)) await Lookup.findOneAndUpdate({ key }, { key, label: key, values }, { upsert: true });
console.log('Lookups seeded'); await mongoose.disconnect();
