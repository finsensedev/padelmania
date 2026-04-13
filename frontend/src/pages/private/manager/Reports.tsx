// Manager Reports page now mirrors the Finance Officer Reports UI exactly
// to maintain a single source of truth for styling & behavior.
// If manager-specific logic is needed later (e.g., restricted actions),
// wrap the imported component with additional guards/props.
import FinanceOfficerReports from "../finance-officer/FinanceOfficerReports";

export default function ManagerReports() {
  return <FinanceOfficerReports />;
}
