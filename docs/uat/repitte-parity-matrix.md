# Repitte-class parity + WSadmin AI evidence matrix

| Capability | WSadmin Business evidence | State |
|---|---|---|
| WhatsApp booking, reschedule, cancel | deterministic WhatsApp flow + AI orchestrator | Automated PASS |
| Calendar/manual bookings | Booking Core calendar/manual batch | Automated PASS |
| Staff shifts, leave and capacity | Booking Core staff/schedule | Automated PASS |
| Services, options and resource allocation | service options/resource priority | Automated PASS |
| Booking policies, stop-sales and blocking | policy + recurring stop-sale controls | Automated PASS |
| No-preference staff auto assignment | deterministic staff allocation | Automated PASS |
| Customer CRM/history/tags/notes/custom fields | Phase 4 CRM | Automated PASS |
| Duplicate merge and blacklist | transactional merge + self-booking restriction | Automated PASS |
| Treatment records with media/sketch refs | rich treatment records + sharing audit | Automated PASS |
| Confirmation/reminders/thank-you/review | Phase 5 lifecycle automations | Automated PASS |
| Birthday/win-back | daily lifecycle planner | Automated PASS |
| Segment messaging and surveys | campaigns + opaque survey tokens | Automated PASS |
| Consent/opt-out/quiet hours | messaging policy engine | Automated PASS |
| Deposit/full payment, webhook, refund | Phase 6 payment abstraction | Automated PASS |
| Receipt/invoice artifacts | payment artifact service | Automated PASS |
| Tentative booking up to three slots | Phase 7 tentative workflow | Automated PASS |
| Membership/session balances | atomic membership consumption | Automated PASS |
| Web booking without login/name+phone match | public web booking service | Automated PASS |
| Slot/gap optimization | candidate + multi-service optimizer | Automated PASS |
| External calendar synchronization | provider adapter + external busy-window protection | Automated PASS |
| Online meeting integration | meeting provider adapter | Automated PASS |
| Smart-lock/access code integration | lock adapter, eligibility and audit lifecycle | Automated PASS |
| Property/homestay vertical | date-range exclusion + property search | Automated PASS |
| AI natural-language booking | confidence/security guarded orchestrator | Automated PASS |
| AI knowledge, memory, voice/media | grounded FAQ, bounded memory, multimodal intake | Automated PASS |
| End-to-end real WhatsApp + live AI + payment | human checklist | PENDING HUMAN UAT |

Overall parity release status remains pending until the human E2E row passes; this document must not be used to claim full production parity before that gate.
